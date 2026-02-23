import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { z } from "zod";

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
  type: z.enum(["VENTURE_STUDIO_SERVICES", "S1_TERM_SHEET", "COMMERCIAL_CONTRACT", "PROSPECT_PURSUIT"]),
  title: z.string().min(1),
  healthSystemId: z.string().optional().nullable(),
  stage: z
    .enum(["IDENTIFIED", "QUALIFICATION", "PROPOSAL", "NEGOTIATION", "LEGAL", "CLOSED_WON", "CLOSED_LOST", "ON_HOLD"])
    .default("IDENTIFIED"),
  likelihoodPercent: z.number().int().min(0).max(100).optional().nullable(),
  amountUsd: z.number().nonnegative().optional().nullable(),
  notes: z.string().optional().nullable(),
  nextSteps: z.string().optional().nullable(),
  estimatedCloseDate: z.string().optional().nullable(),
  closedAt: z.string().optional().nullable()
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
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed || null;
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
      targetLoiCount: 3,
      s1Invested: false,
      s1InvestmentAt: null,
      s1InvestmentAmountUsd: null,
      portfolioAddedAt: null,
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
    targetLoiCount: company.pipeline.targetLoiCount,
    s1Invested: company.pipeline.s1Invested,
    s1InvestmentAt: company.pipeline.s1InvestmentAt,
    s1InvestmentAmountUsd: company.pipeline.s1InvestmentAmountUsd,
    portfolioAddedAt: company.pipeline.portfolioAddedAt,
    documents: company.documents,
    opportunities: company.opportunities,
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

    const companyExists = await prisma.company.findUnique({ where: { id }, select: { id: true } });
    if (!companyExists) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const pipeline = await prisma.$transaction(async (tx) => {
      await tx.companyPipeline.upsert({
        where: { companyId: id },
        create: {
          companyId: id,
          phase: input.phase,
          intakeDecision: input.intakeDecision,
          intakeDecisionAt: toNullableDate(input.intakeDecisionAt),
          intakeDecisionNotes: toNullableString(input.intakeDecisionNotes),
          ventureStudioContractExecutedAt: toNullableDate(input.ventureStudioContractExecutedAt),
          targetLoiCount: input.targetLoiCount,
          s1Invested: input.s1Invested,
          s1InvestmentAt: toNullableDate(input.s1InvestmentAt),
          s1InvestmentAmountUsd: input.s1InvestmentAmountUsd ?? null,
          portfolioAddedAt: toNullableDate(input.portfolioAddedAt)
        },
        update: {
          phase: input.phase,
          intakeDecision: input.intakeDecision,
          intakeDecisionAt: toNullableDate(input.intakeDecisionAt),
          intakeDecisionNotes: toNullableString(input.intakeDecisionNotes),
          ventureStudioContractExecutedAt: toNullableDate(input.ventureStudioContractExecutedAt),
          targetLoiCount: input.targetLoiCount,
          s1Invested: input.s1Invested,
          s1InvestmentAt: toNullableDate(input.s1InvestmentAt),
          s1InvestmentAmountUsd: input.s1InvestmentAmountUsd ?? null,
          portfolioAddedAt: toNullableDate(input.portfolioAddedAt)
        }
      });

      await tx.companyDocument.deleteMany({ where: { companyId: id } });
      if (input.documents.length > 0) {
        const documentsToCreate = input.documents
          .map((document) => ({
            companyId: id,
            type: document.type,
            title: document.title.trim(),
            url: document.url.trim(),
            uploadedAt: toNullableDate(document.uploadedAt) || new Date(),
            notes: toNullableString(document.notes)
          }))
          .filter((document) => document.title && document.url);

        if (documentsToCreate.length > 0) {
          await tx.companyDocument.createMany({
            data: documentsToCreate
          });
        }
      }

      await tx.companyOpportunity.deleteMany({ where: { companyId: id } });
      if (input.opportunities.length > 0) {
        const opportunitiesToCreate = input.opportunities
          .map((opportunity) => ({
            companyId: id,
            healthSystemId: toNullableString(opportunity.healthSystemId),
            type: opportunity.type,
            title: opportunity.title.trim(),
            stage: opportunity.stage,
            likelihoodPercent: opportunity.likelihoodPercent ?? null,
            amountUsd: opportunity.amountUsd ?? null,
            notes: toNullableString(opportunity.notes),
            nextSteps: toNullableString(opportunity.nextSteps),
            estimatedCloseDate: toNullableDate(opportunity.estimatedCloseDate),
            closedAt: toNullableDate(opportunity.closedAt)
          }))
          .filter((opportunity) => opportunity.title);

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

      return tx.company.findUnique({
        where: { id },
        include: companyPipelineInclude
      });
    });

    if (!pipeline) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ pipeline: buildPipelinePayload(pipeline) });
  } catch (error) {
    console.error("update_company_pipeline_error", error);
    return NextResponse.json({ error: "Failed to save pipeline" }, { status: 400 });
  }
}
