import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { normalizeCompanyDocumentUrl } from "@/lib/company-document-links";
import { parseDateInput } from "@/lib/date-parse";
import { getDateDebugContextFromRequest, shouldLogDateRequest } from "@/lib/date-debug";
import { generateOpportunityTitle } from "@/lib/opportunity-title";

const pipelinePhaseSchema = z.enum([
  "INTAKE",
  "DECLINED",
  "VENTURE_STUDIO_NEGOTIATION",
  "SCREENING",
  "LOI_COLLECTION",
  "COMMERCIAL_NEGOTIATION",
  "PORTFOLIO_GROWTH"
]);

const intakeDecisionSchema = z.enum(["PENDING", "ADVANCE_TO_NEGOTIATION", "DECLINE"]);

const documentSchema = z.object({
  type: z
    .enum([
      "INTAKE_REPORT",
      "SCREENING_REPORT",
      "OPPORTUNITY_REPORT",
      "TERM_SHEET",
      "VENTURE_STUDIO_CONTRACT",
      "LOI",
      "COMMERCIAL_CONTRACT",
      "OTHER"
    ])
    .default("OTHER"),
  title: z.string().min(1),
  url: z.string().min(1),
  uploadedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const opportunitySchema = z.object({
  type: z.enum([
    "SCREENING_LOI",
    "VENTURE_STUDIO_SERVICES",
    "S1_TERM_SHEET",
    "COMMERCIAL_CONTRACT",
    "PROSPECT_PURSUIT"
  ]),
  title: z.string().optional().nullable(),
  healthSystemId: z.string().optional().nullable(),
  stage: z
    .enum(["IDENTIFIED", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "LEGAL", "CLOSED_WON", "CLOSED_LOST", "ON_HOLD"])
    .default("IDENTIFIED"),
  likelihoodPercent: z.number().int().min(0).max(100).optional().nullable(),
  contractPriceUsd: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextSteps: z.string().optional().nullable(),
  closeReason: z.string().max(1000).optional().nullable(),
  estimatedCloseDate: z.string().optional().nullable(),
  closedAt: z.string().optional().nullable()
}).superRefine((value, ctx) => {
  const closeReason = (value.closeReason || "").trim();
  if ((value.stage === "CLOSED_WON" || value.stage === "CLOSED_LOST") && !closeReason) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["closeReason"],
      message: "Close reason is required when marking an opportunity won or lost."
    });
  }
});

const screeningParticipantSchema = z.object({
  healthSystemId: z.string().min(1),
  contactId: z.string().optional().nullable(),
  attendanceStatus: z.enum(["INVITED", "ATTENDED", "DECLINED", "NO_SHOW"]).default("INVITED"),
  notes: z.string().optional().nullable()
});

const screeningEventSchema = z.object({
  type: z.enum(["WEBINAR", "INDIVIDUAL_SESSION", "OTHER"]).default("OTHER"),
  title: z.string().min(1),
  scheduledAt: z.string().optional().nullable(),
  completedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  participants: z.array(screeningParticipantSchema).default([])
});

const loiSchema = z.object({
  healthSystemId: z.string().min(1),
  status: z.enum(["NOT_STARTED", "PENDING", "NEGOTIATING", "SIGNED", "DECLINED"]).default("NOT_STARTED"),
  signedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const fundraiseInvestorSchema = z.object({
  coInvestorId: z.string().optional().nullable(),
  investorName: z.string().min(1),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  isLeadInvestor: z.boolean().default(false),
  notes: z.string().optional().nullable()
});

const fundraiseSchema = z.object({
  roundLabel: z.string().min(1),
  status: z.enum(["PLANNED", "OPEN", "CLOSED", "CANCELLED"]).default("PLANNED"),
  totalAmountUsd: z.number().nonnegative().optional().nullable(),
  s1InvestmentUsd: z.number().nonnegative().optional().nullable(),
  announcedAt: z.string().optional().nullable(),
  closedAt: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  investors: z.array(fundraiseInvestorSchema).default([])
});

const pipelineUpdateSchema = z.object({
  phase: pipelinePhaseSchema.default("INTAKE"),
  intakeDecision: intakeDecisionSchema.default("PENDING"),
  intakeDecisionAt: z.string().optional().nullable(),
  intakeDecisionNotes: z.string().optional().nullable(),
  ventureStudioContractExecutedAt: z.string().optional().nullable(),
  screeningWebinarDate1At: z.string().optional().nullable(),
  screeningWebinarDate2At: z.string().optional().nullable(),
  targetLoiCount: z.number().int().min(1).max(50).default(3),
  s1Invested: z.boolean().default(false),
  s1InvestmentAt: z.string().optional().nullable(),
  s1InvestmentAmountUsd: z.number().nonnegative().optional().nullable(),
  portfolioAddedAt: z.string().optional().nullable(),
  documents: z.array(documentSchema).default([]),
  opportunities: z.array(opportunitySchema).default([]),
  screeningEvents: z.array(screeningEventSchema).default([]),
  lois: z.array(loiSchema).default([]),
  fundraises: z.array(fundraiseSchema).default([])
});

function toNullableDate(value?: string | null) {
  return parseDateInput(value);
}

function computeDurationDays(createdAt: Date, closedAt: Date | null) {
  const startMs = createdAt.getTime();
  const endMs = (closedAt || new Date()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
}

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function hasDateField(input: unknown, field: string) {
  if (!input || typeof input !== "object") return false;
  return Object.prototype.hasOwnProperty.call(input, field);
}

function debugDateValueRaw(value: Date | null | undefined) {
  if (!value) return null;
  return {
    iso: value.toISOString(),
    date: value.toISOString().slice(0, 10),
    tzOffsetMinutes: value.getTimezoneOffset()
  };
}

function parseWarningCandidates(raw: string | null | undefined, parsed: Date | null | undefined) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  return {
    raw: trimmed,
    parsed: debugDateValueRaw(parsed)
  };
}

function debugClientUpdatedAtComparison(
  clientUpdatedAt: string | null | undefined,
  serverUpdatedAt: Date | null | undefined
) {
  if (!clientUpdatedAt) {
    return {
      clientUpdatedAt: null,
      parsedClientUpdatedAt: null,
      serverUpdatedAt: serverUpdatedAt?.toISOString() || null,
      isClientBehindServer: null,
      serverAheadMs: null
    };
  }

  const parsedClientUpdatedAt = new Date(clientUpdatedAt);
  const validParsed = Number.isNaN(parsedClientUpdatedAt.getTime()) ? null : parsedClientUpdatedAt;
  return {
    clientUpdatedAt,
    parsedClientUpdatedAt: validParsed ? validParsed.toISOString() : null,
    serverUpdatedAt: serverUpdatedAt?.toISOString() || null,
    isClientBehindServer: validParsed && serverUpdatedAt ? validParsed.getTime() < serverUpdatedAt.getTime() : null,
    serverAheadMs:
      validParsed && serverUpdatedAt ? serverUpdatedAt.getTime() - parsedClientUpdatedAt.getTime() : null
  };
}

function debugDateValue(value: Date | null | undefined) {
  if (!value) return null;
  return {
    iso: value.toISOString(),
    date: value.toISOString().slice(0, 10),
    tzOffsetMinutes: value.getTimezoneOffset()
  };
}

function formatDateForDebug(value: Date | null | undefined) {
  if (!value) return null;
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const date = `${value.getDate()}`.padStart(2, "0");
  return `${value.getFullYear()}-${month}-${date}`;
}

function inferDefaultPhaseFromCompany(company: {
  intakeStatus: "NOT_SCHEDULED" | "SCHEDULED" | "COMPLETED" | "SCREENING_EVALUATION";
  declineReason: string | null;
}) {
  if (company.declineReason) return "DECLINED" as const;
  if (company.intakeStatus === "SCREENING_EVALUATION") return "SCREENING" as const;
  if (company.intakeStatus === "COMPLETED") return "VENTURE_STUDIO_NEGOTIATION" as const;
  return "INTAKE" as const;
}

function inferDefaultDecisionFromCompany(company: {
  intakeStatus: "NOT_SCHEDULED" | "SCHEDULED" | "COMPLETED" | "SCREENING_EVALUATION";
  declineReason: string | null;
}) {
  if (company.declineReason) return "DECLINE" as const;
  if (company.intakeStatus === "COMPLETED" || company.intakeStatus === "SCREENING_EVALUATION") {
    return "ADVANCE_TO_NEGOTIATION" as const;
  }
  return "PENDING" as const;
}

const companyPipelineInclude = {
  pipeline: true,
  documents: {
    orderBy: [{ uploadedAt: "desc" }, { createdAt: "desc" }]
  },
  opportunities: {
    orderBy: [{ createdAt: "desc" }],
    include: {
      healthSystem: { select: { id: true, name: true } }
    }
  },
  screeningEvents: {
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    include: {
      participants: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          healthSystem: { select: { id: true, name: true } },
          contact: { select: { id: true, name: true, title: true } }
        }
      }
    }
  },
  lois: {
    orderBy: [{ createdAt: "asc" }],
    include: {
      healthSystem: { select: { id: true, name: true } }
    }
  },
  fundraises: {
    orderBy: [{ createdAt: "desc" }],
    include: {
      investors: {
        orderBy: [{ createdAt: "asc" }],
        include: {
          coInvestor: { select: { id: true, name: true } }
        }
      }
    }
  }
} satisfies Prisma.CompanyInclude;

type CompanyPipelineView = Prisma.CompanyGetPayload<{ include: typeof companyPipelineInclude }>;

function buildPipelinePayload(company: CompanyPipelineView) {
  if (!company.pipeline) {
    return {
      phase: inferDefaultPhaseFromCompany(company),
      intakeDecision: inferDefaultDecisionFromCompany(company),
      intakeDecisionAt: company.intakeScheduledAt,
      intakeDecisionNotes: null,
      ventureStudioContractExecutedAt: null,
      screeningWebinarDate1At: null,
      screeningWebinarDate2At: null,
      targetLoiCount: 3,
      s1Invested: false,
      s1InvestmentAt: null,
      s1InvestmentAmountUsd: null,
      portfolioAddedAt: null,
      updatedAt: null,
      documents: [],
      opportunities: [],
      screeningEvents: [],
      lois: [],
      fundraises: []
    };
  }

  return {
    id: company.pipeline.id,
    companyId: company.id,
    phase: company.pipeline.phase,
    intakeDecision: company.pipeline.intakeDecision,
    intakeDecisionAt: company.pipeline.intakeDecisionAt,
    intakeDecisionNotes: company.pipeline.intakeDecisionNotes,
    ventureStudioContractExecutedAt: company.pipeline.ventureStudioContractExecutedAt,
    screeningWebinarDate1At: company.pipeline.screeningWebinarDate1At,
    screeningWebinarDate2At: company.pipeline.screeningWebinarDate2At,
    targetLoiCount: company.pipeline.targetLoiCount,
    s1Invested: company.pipeline.s1Invested,
    s1InvestmentAt: company.pipeline.s1InvestmentAt,
    s1InvestmentAmountUsd: company.pipeline.s1InvestmentAmountUsd,
    portfolioAddedAt: company.pipeline.portfolioAddedAt,
    updatedAt: company.pipeline.updatedAt.toISOString(),
    documents: company.documents,
    opportunities: company.opportunities.map((opportunity) => ({
      ...opportunity,
      durationDays: computeDurationDays(opportunity.createdAt, opportunity.closedAt)
    })),
    screeningEvents: company.screeningEvents,
    lois: company.lois,
    fundraises: company.fundraises
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const company = await prisma.company.findUnique({
      where: { id },
      include: companyPipelineInclude
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ pipeline: buildPipelinePayload(company) });
  } catch (error) {
    console.error("get_company_pipeline_error", error);
    return NextResponse.json({ error: "Failed to load pipeline" }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = pipelineUpdateSchema.parse(body);
    const shouldDebug = shouldLogDateRequest(request);
    const debugContext = getDateDebugContextFromRequest(request);
    const dateFieldPresence = {
      intakeDecisionAt: hasDateField(body, "intakeDecisionAt"),
      ventureStudioContractExecutedAt: hasDateField(body, "ventureStudioContractExecutedAt"),
      screeningWebinarDate1At: hasDateField(body, "screeningWebinarDate1At"),
      screeningWebinarDate2At: hasDateField(body, "screeningWebinarDate2At"),
      s1InvestmentAt: hasDateField(body, "s1InvestmentAt"),
      portfolioAddedAt: hasDateField(body, "portfolioAddedAt")
    };

    const intakeDecisionAt = toNullableDate(input.intakeDecisionAt);
    const ventureStudioContractExecutedAt = toNullableDate(input.ventureStudioContractExecutedAt);
    const screeningWebinarDate1At = toNullableDate(input.screeningWebinarDate1At);
    const screeningWebinarDate2At = toNullableDate(input.screeningWebinarDate2At);
    const s1InvestmentAt = toNullableDate(input.s1InvestmentAt);
    const portfolioAddedAt = toNullableDate(input.portfolioAddedAt);

    const pipelineCreatePayload = {
      phase: input.phase,
      intakeDecision: input.intakeDecision,
      intakeDecisionAt,
      intakeDecisionNotes: toNullableString(input.intakeDecisionNotes),
      ventureStudioContractExecutedAt,
      screeningWebinarDate1At,
      screeningWebinarDate2At,
      targetLoiCount: input.targetLoiCount,
      s1Invested: input.s1Invested,
      s1InvestmentAt,
      s1InvestmentAmountUsd: input.s1InvestmentAmountUsd ?? null,
      portfolioAddedAt
    };

    const pipelineUpdatePayload = {
      phase: input.phase,
      intakeDecision: input.intakeDecision,
      intakeDecisionAt,
      intakeDecisionNotes: toNullableString(input.intakeDecisionNotes),
      ventureStudioContractExecutedAt,
      screeningWebinarDate1At,
      screeningWebinarDate2At,
      targetLoiCount: input.targetLoiCount,
      s1Invested: input.s1Invested,
      s1InvestmentAt,
      s1InvestmentAmountUsd: input.s1InvestmentAmountUsd ?? null,
      portfolioAddedAt
    };

    if (shouldDebug) {
      const parseWarnings = {
        intakeDecisionAt: parseWarningCandidates(input.intakeDecisionAt, intakeDecisionAt),
        ventureStudioContractExecutedAt: parseWarningCandidates(
          input.ventureStudioContractExecutedAt,
          ventureStudioContractExecutedAt
        ),
        screeningWebinarDate1At: parseWarningCandidates(input.screeningWebinarDate1At, screeningWebinarDate1At),
        screeningWebinarDate2At: parseWarningCandidates(input.screeningWebinarDate2At, screeningWebinarDate2At),
        s1InvestmentAt: parseWarningCandidates(input.s1InvestmentAt, s1InvestmentAt),
        portfolioAddedAt: parseWarningCandidates(input.portfolioAddedAt, portfolioAddedAt)
      };

      console.log("[date-debug] api.company.pipeline.update.input", {
        ...debugContext,
        id,
        dateFieldPresence,
        parseWarnings,
        body,
        parsed: {
          intakeDecisionAt: dateFieldPresence.intakeDecisionAt ? input.intakeDecisionAt : undefined,
          ventureStudioContractExecutedAt: dateFieldPresence.ventureStudioContractExecutedAt
            ? input.ventureStudioContractExecutedAt
            : undefined,
          screeningWebinarDate1At: dateFieldPresence.screeningWebinarDate1At ? input.screeningWebinarDate1At : undefined,
          screeningWebinarDate2At: dateFieldPresence.screeningWebinarDate2At ? input.screeningWebinarDate2At : undefined,
          s1InvestmentAt: dateFieldPresence.s1InvestmentAt ? input.s1InvestmentAt : undefined,
          portfolioAddedAt: dateFieldPresence.portfolioAddedAt ? input.portfolioAddedAt : undefined
        }
      });

      if (
        Object.values(parseWarnings).some(
          (warning): warning is { raw: string; parsed: { iso: string; date: string; tzOffsetMinutes: number } | null } =>
            !!warning && warning.raw.length > 0 && warning.parsed === null
        )
      ) {
        console.log("[date-debug] api.company.pipeline.update.parse-warning", {
          ...debugContext,
          id,
          parseWarnings
        });
      }
    }

    const company = await prisma.company.findUnique({ where: { id }, include: { pipeline: true } });
    if (!company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    if (shouldDebug) {
      const preUpdateClientState = debugClientUpdatedAtComparison(
        debugContext?.clientUpdatedAt || null,
        company.pipeline?.updatedAt || null
      );

      console.log("[date-debug] api.company.pipeline.update.before-transaction", {
        ...debugContext,
        id,
        clientUpdatedAtComparison: preUpdateClientState,
        existingPipeline: company.pipeline
            ? {
              updatedAt: company.pipeline.updatedAt.toISOString(),
              intakeDecisionAt: formatDateForDebug(company.pipeline.intakeDecisionAt),
              ventureStudioContractExecutedAt: formatDateForDebug(company.pipeline.ventureStudioContractExecutedAt),
              screeningWebinarDate1At: formatDateForDebug(company.pipeline.screeningWebinarDate1At),
              screeningWebinarDate2At: formatDateForDebug(company.pipeline.screeningWebinarDate2At),
              s1InvestmentAt: formatDateForDebug(company.pipeline.s1InvestmentAt),
              portfolioAddedAt: formatDateForDebug(company.pipeline.portfolioAddedAt)
            }
          : null
      });
    }

    const pipeline = await prisma.$transaction(async (tx) => {
      await tx.companyPipeline.upsert({
        where: { companyId: id },
        create: { companyId: id, ...pipelineCreatePayload },
        update: pipelineUpdatePayload
      });

      await tx.companyDocument.deleteMany({ where: { companyId: id } });
      if (input.documents.length > 0) {
        const documentsToCreate = input.documents
          .map((document) => {
            const normalizedUrl = normalizeCompanyDocumentUrl(document.url) || "";
            return {
              companyId: id,
              type: document.type,
              title: document.title.trim(),
              url: normalizedUrl,
              uploadedAt: toNullableDate(document.uploadedAt) || new Date(),
              notes: toNullableString(document.notes)
            };
          })
          .filter((document) => document.title && document.url);

        if (documentsToCreate.length > 0) {
          await tx.companyDocument.createMany({
            data: documentsToCreate
          });
        }
      }

      await tx.companyOpportunity.deleteMany({ where: { companyId: id } });
      if (input.opportunities.length > 0) {
        const healthSystemIds = Array.from(
          new Set(
            input.opportunities
              .map((opportunity) => toNullableString(opportunity.healthSystemId))
              .filter((healthSystemId): healthSystemId is string => Boolean(healthSystemId))
          )
        );
        const healthSystemNameById = new Map<string, string>();
        if (healthSystemIds.length > 0) {
          const healthSystems = await tx.healthSystem.findMany({
            where: {
              id: { in: healthSystemIds }
            },
            select: {
              id: true,
              name: true
            }
          });
          for (const healthSystem of healthSystems) {
            healthSystemNameById.set(healthSystem.id, healthSystem.name);
          }
        }

        const opportunitiesToCreate = input.opportunities
          .map((opportunity) => {
            const healthSystemId = toNullableString(opportunity.healthSystemId);
            return {
              companyId: id,
              healthSystemId,
              type: opportunity.type,
              title: generateOpportunityTitle({
                companyName: company.name,
                healthSystemName: healthSystemId ? healthSystemNameById.get(healthSystemId) || null : null,
                type: opportunity.type
              }),
              stage: opportunity.stage,
              likelihoodPercent: opportunity.likelihoodPercent ?? null,
              contractPriceUsd: opportunity.contractPriceUsd ?? null,
              notes: toNullableString(opportunity.notes),
              nextSteps: toNullableString(opportunity.nextSteps),
              closeReason: toNullableString(opportunity.closeReason),
              estimatedCloseDate: toNullableDate(opportunity.estimatedCloseDate),
              closedAt:
                opportunity.stage === "CLOSED_WON" || opportunity.stage === "CLOSED_LOST"
                  ? toNullableDate(opportunity.closedAt) || new Date()
                  : toNullableDate(opportunity.closedAt)
            };
          });

        if (opportunitiesToCreate.length > 0) {
          await tx.companyOpportunity.createMany({
            data: opportunitiesToCreate
          });
        }
      }

      await tx.companyScreeningEvent.deleteMany({ where: { companyId: id } });
      for (const event of input.screeningEvents) {
        const title = event.title.trim();
        if (!title) continue;

        await tx.companyScreeningEvent.create({
          data: {
            companyId: id,
            type: event.type,
            title,
            scheduledAt: toNullableDate(event.scheduledAt),
            completedAt: toNullableDate(event.completedAt),
            notes: toNullableString(event.notes),
            participants: {
              create: event.participants
                .map((participant) => ({
                  healthSystemId: participant.healthSystemId,
                  contactId: toNullableString(participant.contactId),
                  attendanceStatus: participant.attendanceStatus,
                  notes: toNullableString(participant.notes)
                }))
                .filter((participant) => participant.healthSystemId)
            }
          }
        });
      }

      await tx.companyLoi.deleteMany({ where: { companyId: id } });
      if (input.lois.length > 0) {
        const loisToCreate = input.lois
          .map((loi) => ({
            companyId: id,
            healthSystemId: loi.healthSystemId,
            status: loi.status,
            signedAt: toNullableDate(loi.signedAt),
            notes: toNullableString(loi.notes),
            statusUpdatedAt: new Date()
          }))
          .filter((loi) => loi.healthSystemId);

        if (loisToCreate.length > 0) {
          await tx.companyLoi.createMany({
            data: loisToCreate
          });
        }
      }

      await tx.companyFundraise.deleteMany({ where: { companyId: id } });
      for (const fundraise of input.fundraises) {
        const roundLabel = fundraise.roundLabel.trim();
        if (!roundLabel) continue;

        await tx.companyFundraise.create({
          data: {
            companyId: id,
            roundLabel,
            status: fundraise.status,
            totalAmountUsd: fundraise.totalAmountUsd ?? null,
            s1InvestmentUsd: fundraise.s1InvestmentUsd ?? null,
            announcedAt: toNullableDate(fundraise.announcedAt),
            closedAt: toNullableDate(fundraise.closedAt),
            notes: toNullableString(fundraise.notes),
            investors: {
              create: fundraise.investors
                .map((investor) => ({
                  coInvestorId: toNullableString(investor.coInvestorId),
                  investorName: investor.investorName.trim(),
                  investmentAmountUsd: investor.investmentAmountUsd ?? null,
                  isLeadInvestor: investor.isLeadInvestor,
                  notes: toNullableString(investor.notes)
                }))
                .filter((investor) => investor.investorName)
            }
          }
        });
      }

      return tx.company.findUniqueOrThrow({
        where: { id },
        include: companyPipelineInclude
      });
    });

    if (shouldDebug) {
      const savedPipeline = pipeline?.pipeline;
      const postUpdateClientState = debugClientUpdatedAtComparison(
        debugContext?.clientUpdatedAt || null,
        savedPipeline?.updatedAt || null
      );
      console.log("[date-debug] api.company.pipeline.update.after-transaction", {
        ...debugContext,
        id,
        postUpdateClientState,
        requestPresence: dateFieldPresence,
        payload: {
          intakeDecisionAt: debugDateValue(intakeDecisionAt),
          ventureStudioContractExecutedAt: debugDateValue(ventureStudioContractExecutedAt),
          screeningWebinarDate1At: debugDateValue(screeningWebinarDate1At),
          screeningWebinarDate2At: debugDateValue(screeningWebinarDate2At),
          s1InvestmentAt: debugDateValue(s1InvestmentAt),
          portfolioAddedAt: debugDateValue(portfolioAddedAt)
        },
        before: {
          intakeDecisionAt: formatDateForDebug(company.pipeline?.intakeDecisionAt || null),
          ventureStudioContractExecutedAt: formatDateForDebug(company.pipeline?.ventureStudioContractExecutedAt || null),
          screeningWebinarDate1At: formatDateForDebug(company.pipeline?.screeningWebinarDate1At || null),
          screeningWebinarDate2At: formatDateForDebug(company.pipeline?.screeningWebinarDate2At || null),
          s1InvestmentAt: formatDateForDebug(company.pipeline?.s1InvestmentAt || null),
          portfolioAddedAt: formatDateForDebug(company.pipeline?.portfolioAddedAt || null)
        },
          after: {
            updatedAt: savedPipeline?.updatedAt?.toISOString() ?? null,
            intakeDecisionAt: formatDateForDebug(savedPipeline?.intakeDecisionAt || null),
            ventureStudioContractExecutedAt: formatDateForDebug(savedPipeline?.ventureStudioContractExecutedAt || null),
            screeningWebinarDate1At: formatDateForDebug(savedPipeline?.screeningWebinarDate1At || null),
            screeningWebinarDate2At: formatDateForDebug(savedPipeline?.screeningWebinarDate2At || null),
            s1InvestmentAt: formatDateForDebug(savedPipeline?.s1InvestmentAt || null),
            portfolioAddedAt: formatDateForDebug(savedPipeline?.portfolioAddedAt || null)
        },
        delta: {
          intakeDecisionAt: {
            requested: dateFieldPresence.intakeDecisionAt ? input.intakeDecisionAt : undefined,
            persisted: formatDateForDebug(savedPipeline?.intakeDecisionAt || null)
          },
          ventureStudioContractExecutedAt: {
            requested: dateFieldPresence.ventureStudioContractExecutedAt ? input.ventureStudioContractExecutedAt : undefined,
            persisted: formatDateForDebug(savedPipeline?.ventureStudioContractExecutedAt || null),
            matched:
              !dateFieldPresence.ventureStudioContractExecutedAt ||
              formatDateForDebug(toNullableDate(input.ventureStudioContractExecutedAt)) ===
                formatDateForDebug(savedPipeline?.ventureStudioContractExecutedAt || null)
          },
          screeningWebinarDate1At: {
            requested: dateFieldPresence.screeningWebinarDate1At ? input.screeningWebinarDate1At : undefined,
            persisted: formatDateForDebug(savedPipeline?.screeningWebinarDate1At || null),
            matched:
              !dateFieldPresence.screeningWebinarDate1At ||
              formatDateForDebug(toNullableDate(input.screeningWebinarDate1At)) ===
                formatDateForDebug(savedPipeline?.screeningWebinarDate1At || null)
          },
          screeningWebinarDate2At: {
            requested: dateFieldPresence.screeningWebinarDate2At ? input.screeningWebinarDate2At : undefined,
            persisted: formatDateForDebug(savedPipeline?.screeningWebinarDate2At || null),
            matched:
              !dateFieldPresence.screeningWebinarDate2At ||
              formatDateForDebug(toNullableDate(input.screeningWebinarDate2At)) ===
                formatDateForDebug(savedPipeline?.screeningWebinarDate2At || null)
          },
          s1InvestmentAt: {
            requested: dateFieldPresence.s1InvestmentAt ? input.s1InvestmentAt : undefined,
            persisted: formatDateForDebug(savedPipeline?.s1InvestmentAt || null),
            matched:
              !dateFieldPresence.s1InvestmentAt ||
              formatDateForDebug(toNullableDate(input.s1InvestmentAt)) ===
                formatDateForDebug(savedPipeline?.s1InvestmentAt || null)
          },
          portfolioAddedAt: {
            requested: dateFieldPresence.portfolioAddedAt ? input.portfolioAddedAt : undefined,
            persisted: formatDateForDebug(savedPipeline?.portfolioAddedAt || null),
            matched:
              !dateFieldPresence.portfolioAddedAt ||
              formatDateForDebug(toNullableDate(input.portfolioAddedAt)) ===
                formatDateForDebug(savedPipeline?.portfolioAddedAt || null)
          }
        }
      });
    }

    if (!pipeline) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const response = {
      pipeline: buildPipelinePayload(pipeline),
      _dateDebug: debugContext
        ? {
            requestId: debugContext.requestId,
            requestSequence: debugContext.requestSequence ?? null,
            clientUpdatedAt: debugContext.clientUpdatedAt,
            clientUpdatedAtParsed: debugClientUpdatedAtComparison(
              debugContext.clientUpdatedAt || null,
              pipeline.pipeline?.updatedAt || null
            ).parsedClientUpdatedAt,
            serverUpdatedAt: pipeline.pipeline?.updatedAt ? pipeline.pipeline.updatedAt.toISOString() : null,
            scope: debugContext.scope,
            sessionId: debugContext.sessionId,
            itemId: debugContext.itemId
          }
        : undefined
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("update_company_pipeline_error", error);
    return NextResponse.json({ error: "Failed to save pipeline" }, { status: 400 });
  }
}
