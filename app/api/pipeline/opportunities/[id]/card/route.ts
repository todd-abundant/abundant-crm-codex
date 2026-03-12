import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseDateInput } from "@/lib/date-parse";
import { getDateDebugContextFromRequest, shouldLogDateRequest } from "@/lib/date-debug";
import {
  marketLandscapePayloadFromRecord,
  normalizeMarketLandscapePayload,
  type MarketLandscapePayload
} from "@/lib/market-landscape";
import {
  inferDefaultDecisionFromCompany,
  inferDefaultPhaseFromCompany,
  mapPhaseToBoardColumn,
  phaseLabel,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

const pipelinePhaseSchema = z.enum([
  "INTAKE",
  "DECLINED",
  "VENTURE_STUDIO_NEGOTIATION",
  "SCREENING",
  "LOI_COLLECTION",
  "COMMERCIAL_NEGOTIATION",
  "PORTFOLIO_GROWTH",
  "CLOSED"
]);

const closedOutcomeSchema = z.enum(["INVESTED", "PASSED", "LOST", "WITHDREW", "OTHER"]);
const intakeDecisionSchema = z.enum(["PENDING", "ADVANCE_TO_NEGOTIATION", "DECLINE", "REVISIT_LATER"]);

function normalizePipelinePhase(phase: PipelinePhase | undefined) {
  if (!phase) return phase;
  return phase === "CLOSED" ? "DECLINED" : phase;
}

const cardUpdateSchema = z.object({
  phase: pipelinePhaseSchema.optional(),
  closedOutcome: closedOutcomeSchema.optional().nullable(),
  declineReasonNotes: z.string().optional().nullable(),
  nextStep: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  intakeDecision: intakeDecisionSchema.optional(),
  createdAt: z.string().optional().nullable(),
  intakeDecisionAt: z.string().optional().nullable(),
  ventureStudioContractExecutedAt: z.string().optional().nullable(),
  screeningWebinarDate1At: z.string().optional().nullable(),
  screeningWebinarDate2At: z.string().optional().nullable(),
  ventureLikelihoodPercent: z.number().int().min(0).max(100).optional().nullable(),
  ventureExpectedCloseDate: z.string().optional().nullable(),
  atAGlanceProblem: z.string().optional().nullable(),
  atAGlanceSolution: z.string().optional().nullable(),
  atAGlanceImpact: z.string().optional().nullable(),
  atAGlanceKeyStrengths: z.string().optional().nullable(),
  atAGlanceKeyConsiderations: z.string().optional().nullable(),
  ventureStudioCriteria: z
    .array(
      z.object({
        category: z.string(),
        assessment: z.enum(["red", "yellow", "green", "grey"]),
        rationale: z.string()
      })
    )
    .optional(),
  marketLandscape: z
    .unknown()
    .optional()
});

function toNullableDate(value?: string | null) {
  return parseDateInput(value);
}

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function intakeDecisionForPhase(phase: PipelinePhase) {
  if (phase === "INTAKE") return "PENDING" as const;
  if (phase === "DECLINED") return "DECLINE" as const;
  return "ADVANCE_TO_NEGOTIATION" as const;
}

function hasDateField(input: unknown, field: string) {
  if (!input || typeof input !== "object") return false;
  return Object.prototype.hasOwnProperty.call(input, field);
}

function formatDateForDebug(value: Date | null | undefined) {
  if (!value) return null;
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const date = `${value.getDate()}`.padStart(2, "0");
  return `${value.getFullYear()}-${month}-${date}`;
}

function parseWarningCandidates(raw: string | null | undefined, parsed: Date | null | undefined) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return null;
  return {
    raw: trimmed,
    parsed: debugDateValue(parsed)
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

function debugDatePayloadField(
  fieldRequest: Date | null | undefined,
  persisted: Date | null | undefined,
  shouldCompare: boolean
) {
  if (!shouldCompare) {
    return {
      requested: null,
      persisted: debugDateValue(persisted),
      matched: null
    };
  }
  return {
    requested: debugDateValue(fieldRequest),
    persisted: debugDateValue(persisted),
    matched: formatDateForDebug(fieldRequest) === formatDateForDebug(persisted)
  };
}

function debugDateValue(value: Date | null | undefined) {
  if (!value) return null;
  return {
    iso: value.toISOString(),
    date: formatDateForDebug(value),
    tzOffsetMinutes: value.getTimezoneOffset()
  };
}

async function upsertMarketLandscape(
  tx: Prisma.TransactionClient,
  companyId: string,
  payload: MarketLandscapePayload
) {
  const landscape = await tx.companyMarketLandscape.upsert({
    where: { companyId },
    create: {
      companyId,
      sectionLabel: payload.sectionLabel,
      headline: payload.headline,
      subheadline: payload.subheadline,
      template: payload.template,
      xAxisLabel: payload.xAxisLabel,
      yAxisLabel: payload.yAxisLabel,
      columnLabel1: payload.columnLabels[0],
      columnLabel2: payload.columnLabels[1],
      rowLabel1: payload.rowLabels[0],
      rowLabel2: payload.rowLabels[1],
      primaryFocusCellKey: payload.primaryFocusCellKey || null
    },
    update: {
      sectionLabel: payload.sectionLabel,
      headline: payload.headline,
      subheadline: payload.subheadline,
      template: payload.template,
      xAxisLabel: payload.xAxisLabel,
      yAxisLabel: payload.yAxisLabel,
      columnLabel1: payload.columnLabels[0],
      columnLabel2: payload.columnLabels[1],
      rowLabel1: payload.rowLabels[0],
      rowLabel2: payload.rowLabels[1],
      primaryFocusCellKey: payload.primaryFocusCellKey || null
    },
    include: {
      cards: {
        orderBy: [{ sortOrder: "asc" }, { cellKey: "asc" }]
      }
    }
  });

  const existingById = new Map(landscape.cards.map((card) => [card.id, card] as const));
  const existingByCellKey = new Map(landscape.cards.map((card) => [card.cellKey, card] as const));
  const keepIds = new Set<string>();

  for (let index = 0; index < payload.cards.length; index += 1) {
    const card = payload.cards[index];
    const existing = (card.id ? existingById.get(card.id) : undefined) || existingByCellKey.get(card.key);
    if (existing) {
      keepIds.add(existing.id);
      await tx.companyMarketLandscapeCard.update({
        where: { id: existing.id },
        data: {
          cellKey: card.key,
          sortOrder: index,
          title: card.title,
          overview: card.overview,
          businessModel: card.businessModel,
          strengths: card.strengths,
          gaps: card.gaps,
          vendors: card.vendors
        }
      });
      continue;
    }

    const created = await tx.companyMarketLandscapeCard.create({
      data: {
        marketLandscapeId: landscape.id,
        cellKey: card.key,
        sortOrder: index,
        title: card.title,
        overview: card.overview,
        businessModel: card.businessModel,
        strengths: card.strengths,
        gaps: card.gaps,
        vendors: card.vendors
      }
    });
    keepIds.add(created.id);
  }

  if (keepIds.size > 0) {
    await tx.companyMarketLandscapeCard.deleteMany({
      where: {
        marketLandscapeId: landscape.id,
        id: {
          notIn: Array.from(keepIds)
        }
      }
    });
  } else {
    await tx.companyMarketLandscapeCard.deleteMany({
      where: {
        marketLandscapeId: landscape.id
      }
    });
  }

  return tx.companyMarketLandscape.findUnique({
    where: { companyId },
    include: {
      cards: {
        orderBy: [{ sortOrder: "asc" }, { cellKey: "asc" }]
      }
    }
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = cardUpdateSchema.parse(body);
    const shouldDebug = shouldLogDateRequest(request);
    const debugContext = getDateDebugContextFromRequest(request);
    const dateFieldPresence = {
      nextStep: hasDateField(body, "nextStep"),
      createdAt: hasDateField(body, "createdAt"),
      intakeDecisionAt: hasDateField(body, "intakeDecisionAt"),
      ventureStudioContractExecutedAt: hasDateField(body, "ventureStudioContractExecutedAt"),
      screeningWebinarDate1At: hasDateField(body, "screeningWebinarDate1At"),
      screeningWebinarDate2At: hasDateField(body, "screeningWebinarDate2At"),
      ventureLikelihoodPercent: hasDateField(body, "ventureLikelihoodPercent"),
      ventureExpectedCloseDate: hasDateField(body, "ventureExpectedCloseDate")
    };
    const updatePayload: {
      phase?: PipelinePhase;
      stageChangedAt?: Date;
      closedOutcome?: "INVESTED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
      declineReasonNotes?: string | null;
      nextStep?: string | null;
      ownerName?: string | null;
      intakeDecision?: "PENDING" | "ADVANCE_TO_NEGOTIATION" | "DECLINE" | "REVISIT_LATER";
      createdAt?: Date;
      intakeDecisionAt?: Date | null;
      ventureStudioContractExecutedAt?: Date | null;
      screeningWebinarDate1At?: Date | null;
      screeningWebinarDate2At?: Date | null;
      ventureLikelihoodPercent?: number | null;
      ventureExpectedCloseDate?: Date | null;
      lastMeaningfulActivityAt?: Date | null;
      ventureStudioCriteria?: Prisma.InputJsonValue;
    } = {};
    const companyUpdatePayload: {
      atAGlanceProblem?: string | null;
      atAGlanceSolution?: string | null;
      atAGlanceImpact?: string | null;
      atAGlanceKeyStrengths?: string | null;
      atAGlanceKeyConsiderations?: string | null;
    } = {};
    if (Object.prototype.hasOwnProperty.call(body, "nextStep")) {
      updatePayload.nextStep = toNullableString(input.nextStep);
    }
    if (Object.prototype.hasOwnProperty.call(body, "ownerName")) {
      updatePayload.ownerName = toNullableString(input.ownerName);
    }
    if (Object.prototype.hasOwnProperty.call(body, "closedOutcome")) {
      updatePayload.closedOutcome = input.closedOutcome ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "declineReasonNotes")) {
      updatePayload.declineReasonNotes = toNullableString(input.declineReasonNotes);
    }
    if (Object.prototype.hasOwnProperty.call(body, "intakeDecision")) {
      updatePayload.intakeDecision = input.intakeDecision;
    }
    if (Object.prototype.hasOwnProperty.call(body, "createdAt")) {
      const parsedCreatedAt = toNullableDate(input.createdAt);
      if (parsedCreatedAt) {
        updatePayload.createdAt = parsedCreatedAt;
      }
    }
    if (Object.prototype.hasOwnProperty.call(body, "intakeDecisionAt")) {
      updatePayload.intakeDecisionAt = toNullableDate(input.intakeDecisionAt);
    }
    if (Object.prototype.hasOwnProperty.call(body, "ventureStudioContractExecutedAt")) {
      updatePayload.ventureStudioContractExecutedAt = toNullableDate(input.ventureStudioContractExecutedAt);
    }
    if (Object.prototype.hasOwnProperty.call(body, "screeningWebinarDate1At")) {
      updatePayload.screeningWebinarDate1At = toNullableDate(input.screeningWebinarDate1At);
    }
    if (Object.prototype.hasOwnProperty.call(body, "screeningWebinarDate2At")) {
      updatePayload.screeningWebinarDate2At = toNullableDate(input.screeningWebinarDate2At);
    }
    if (Object.prototype.hasOwnProperty.call(body, "ventureLikelihoodPercent")) {
      updatePayload.ventureLikelihoodPercent = input.ventureLikelihoodPercent ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "ventureExpectedCloseDate")) {
      updatePayload.ventureExpectedCloseDate = toNullableDate(input.ventureExpectedCloseDate);
    }
    if (Object.prototype.hasOwnProperty.call(body, "atAGlanceProblem")) {
      companyUpdatePayload.atAGlanceProblem = toNullableString(input.atAGlanceProblem);
    }
    if (Object.prototype.hasOwnProperty.call(body, "atAGlanceSolution")) {
      companyUpdatePayload.atAGlanceSolution = toNullableString(input.atAGlanceSolution);
    }
    if (Object.prototype.hasOwnProperty.call(body, "atAGlanceImpact")) {
      companyUpdatePayload.atAGlanceImpact = toNullableString(input.atAGlanceImpact);
    }
    if (Object.prototype.hasOwnProperty.call(body, "atAGlanceKeyStrengths")) {
      companyUpdatePayload.atAGlanceKeyStrengths = toNullableString(input.atAGlanceKeyStrengths);
    }
    if (Object.prototype.hasOwnProperty.call(body, "atAGlanceKeyConsiderations")) {
      companyUpdatePayload.atAGlanceKeyConsiderations = toNullableString(input.atAGlanceKeyConsiderations);
    }
    updatePayload.lastMeaningfulActivityAt = new Date();

    if (Object.prototype.hasOwnProperty.call(body, "ventureStudioCriteria")) {
      updatePayload.ventureStudioCriteria = (input.ventureStudioCriteria || []).map((entry) => ({
        category: entry.category.trim(),
        assessment: entry.assessment,
        rationale: toNullableString(entry.rationale) || ""
      }));
    }
    if (shouldDebug) {
      const parseWarnings = {
        createdAt: parseWarningCandidates(input.createdAt, updatePayload.createdAt || null),
        intakeDecisionAt: parseWarningCandidates(input.intakeDecisionAt, updatePayload.intakeDecisionAt),
        ventureStudioContractExecutedAt: parseWarningCandidates(
          input.ventureStudioContractExecutedAt,
          updatePayload.ventureStudioContractExecutedAt
        ),
        screeningWebinarDate1At: parseWarningCandidates(
          input.screeningWebinarDate1At,
          updatePayload.screeningWebinarDate1At
        ),
        screeningWebinarDate2At: parseWarningCandidates(
          input.screeningWebinarDate2At,
          updatePayload.screeningWebinarDate2At
        ),
        ventureExpectedCloseDate: parseWarningCandidates(
          input.ventureExpectedCloseDate,
          updatePayload.ventureExpectedCloseDate
        )
      };

      console.log("[date-debug] api.card.update.input", {
        ...debugContext,
        id,
        dateFieldPresence,
        body,
        parsed: {
          nextStep: input.nextStep,
          createdAt: dateFieldPresence.createdAt ? input.createdAt : undefined,
          intakeDecisionAt: dateFieldPresence.intakeDecisionAt ? input.intakeDecisionAt : undefined,
          ventureStudioContractExecutedAt: input.ventureStudioContractExecutedAt,
          screeningWebinarDate1At: input.screeningWebinarDate1At,
          screeningWebinarDate2At: input.screeningWebinarDate2At,
          ventureExpectedCloseDate: input.ventureExpectedCloseDate
        }
      });

      if (
        Object.values(parseWarnings).some(
          (candidate): candidate is { raw: string; parsed: { iso: string; date: string; tzOffsetMinutes: number } | null } => {
            if (!candidate) return false;
            return candidate.raw.length > 0 && candidate.parsed === null;
          }
        )
      ) {
        console.log("[date-debug] api.card.update.parse-warning", {
          ...debugContext,
          id,
          parseWarnings
        });
      }

      console.log("[date-debug] api.card.update.parsed", {
        ...debugContext,
        id,
        parsed: {
          nextStep: updatePayload.nextStep,
          createdAt: debugDateValue(updatePayload.createdAt || null),
          intakeDecisionAt: debugDateValue(updatePayload.intakeDecisionAt),
          ventureStudioContractExecutedAt: debugDateValue(updatePayload.ventureStudioContractExecutedAt),
          screeningWebinarDate1At: debugDateValue(updatePayload.screeningWebinarDate1At),
          screeningWebinarDate2At: debugDateValue(updatePayload.screeningWebinarDate2At),
          ventureExpectedCloseDate: debugDateValue(updatePayload.ventureExpectedCloseDate),
          ventureLikelihoodPercent: updatePayload.ventureLikelihoodPercent
        },
        updatePayloadKeys: Object.keys(updatePayload),
        companyUpdatePayloadKeys: Object.keys(companyUpdatePayload)
      });
    }
    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        pipeline: true,
        marketLandscape: {
          include: {
            cards: {
              orderBy: [{ sortOrder: "asc" }, { cellKey: "asc" }]
            }
          }
        }
      }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const requestedPhase = Object.prototype.hasOwnProperty.call(body, "phase")
      ? normalizePipelinePhase(input.phase)
      : undefined;
    const hasExplicitIntakeDecision = Object.prototype.hasOwnProperty.call(body, "intakeDecision");
    if (requestedPhase) {
      const currentPhase = (company.pipeline?.phase || inferDefaultPhaseFromCompany(company)) as PipelinePhase;
      const nextIntakeDecision = hasExplicitIntakeDecision
        ? (input.intakeDecision ?? intakeDecisionForPhase(requestedPhase))
        : intakeDecisionForPhase(requestedPhase);
      updatePayload.phase = requestedPhase;
      if (requestedPhase !== currentPhase) {
        updatePayload.stageChangedAt = new Date();
      }
      updatePayload.intakeDecision = nextIntakeDecision;
      if (nextIntakeDecision === "PENDING") {
        updatePayload.intakeDecisionAt = null;
      } else if (!Object.prototype.hasOwnProperty.call(body, "intakeDecisionAt")) {
        updatePayload.intakeDecisionAt = company.pipeline?.intakeDecisionAt ?? new Date();
      }
      if (requestedPhase !== "DECLINED" && !Object.prototype.hasOwnProperty.call(body, "closedOutcome")) {
        updatePayload.closedOutcome = null;
      }
    } else if (hasExplicitIntakeDecision && input.intakeDecision) {
      if (input.intakeDecision === "PENDING") {
        if (!Object.prototype.hasOwnProperty.call(body, "intakeDecisionAt")) {
          updatePayload.intakeDecisionAt = null;
        }
      } else if (!Object.prototype.hasOwnProperty.call(body, "intakeDecisionAt")) {
        updatePayload.intakeDecisionAt = company.pipeline?.intakeDecisionAt ?? new Date();
      }
    }

    if (shouldDebug) {
      console.log("[date-debug] api.card.update.before-transaction", {
        ...debugContext,
        id,
        clientUpdatedAtComparison: debugClientUpdatedAtComparison(
          debugContext?.clientUpdatedAt || null,
          company.pipeline?.updatedAt || null
        ),
        existingPipeline: company.pipeline
          ? {
            nextStep: company.pipeline.nextStep,
            intakeDecision: company.pipeline.intakeDecision,
            intakeDecisionAt: company.pipeline.intakeDecisionAt
              ? formatDateForDebug(company.pipeline.intakeDecisionAt)
              : null,
            createdAt: company.pipeline.createdAt ? formatDateForDebug(company.pipeline.createdAt) : null,
            updatedAt: company.pipeline.updatedAt.toISOString(),
            ventureStudioContractExecutedAt: company.pipeline.ventureStudioContractExecutedAt
              ? formatDateForDebug(company.pipeline.ventureStudioContractExecutedAt)
              : null,
            screeningWebinarDate1At: company.pipeline.screeningWebinarDate1At
              ? formatDateForDebug(company.pipeline.screeningWebinarDate1At)
              : null,
            screeningWebinarDate2At: company.pipeline.screeningWebinarDate2At
              ? formatDateForDebug(company.pipeline.screeningWebinarDate2At)
              : null,
            ventureExpectedCloseDate: company.pipeline.ventureExpectedCloseDate
              ? formatDateForDebug(company.pipeline.ventureExpectedCloseDate)
              : null
          }
          : null
      });
    }

    const shouldUpdateMarketLandscape = Object.prototype.hasOwnProperty.call(body, "marketLandscape");
    const marketLandscapePayload = shouldUpdateMarketLandscape
      ? normalizeMarketLandscapePayload(input.marketLandscape, company.name)
      : null;

    const { pipeline, savedMarketLandscape } = await prisma.$transaction(async (tx) => {
      const nextPipeline = await tx.companyPipeline.upsert({
        where: { companyId: id },
        create: {
          companyId: id,
          phase: inferDefaultPhaseFromCompany(company),
          intakeDecision: inferDefaultDecisionFromCompany(company),
          ...updatePayload
        },
        update: updatePayload
      });

      if (Object.keys(companyUpdatePayload).length > 0) {
        await tx.company.update({
          where: { id },
          data: companyUpdatePayload
        });
      }

      const nextMarketLandscape = marketLandscapePayload
        ? await upsertMarketLandscape(tx, id, marketLandscapePayload)
        : null;

      return {
        pipeline: nextPipeline,
        savedMarketLandscape: nextMarketLandscape
      };
    });

    const phase = pipeline.phase as PipelinePhase;
    const nextAtAGlanceProblem = Object.prototype.hasOwnProperty.call(companyUpdatePayload, "atAGlanceProblem")
      ? companyUpdatePayload.atAGlanceProblem
      : company.atAGlanceProblem;
    const nextAtAGlanceSolution = Object.prototype.hasOwnProperty.call(companyUpdatePayload, "atAGlanceSolution")
      ? companyUpdatePayload.atAGlanceSolution
      : company.atAGlanceSolution;
    const nextAtAGlanceImpact = Object.prototype.hasOwnProperty.call(companyUpdatePayload, "atAGlanceImpact")
      ? companyUpdatePayload.atAGlanceImpact
      : company.atAGlanceImpact;
    const nextAtAGlanceKeyStrengths = Object.prototype.hasOwnProperty.call(
      companyUpdatePayload,
      "atAGlanceKeyStrengths"
    )
      ? companyUpdatePayload.atAGlanceKeyStrengths
      : company.atAGlanceKeyStrengths;
    const nextAtAGlanceKeyConsiderations = Object.prototype.hasOwnProperty.call(
      companyUpdatePayload,
      "atAGlanceKeyConsiderations"
    )
      ? companyUpdatePayload.atAGlanceKeyConsiderations
      : company.atAGlanceKeyConsiderations;

    if (shouldDebug) {
      const beforePipeline = company.pipeline;
      const postUpdateClientState = debugClientUpdatedAtComparison(
        debugContext?.clientUpdatedAt || null,
        beforePipeline?.updatedAt || null
      );
      console.log("[date-debug] api.card.update.after-transaction", {
        ...debugContext,
        id,
        requestPresence: dateFieldPresence,
        payloadHas: Object.keys(updatePayload),
        postUpdateClientState,
        delta: {
        nextStep: {
            requested: dateFieldPresence.nextStep ? input.nextStep : undefined,
            previous: beforePipeline?.nextStep || null,
            persisted: pipeline.nextStep || null
          },
          ownerName: {
            requested: Object.prototype.hasOwnProperty.call(body, "ownerName") ? toNullableString(input.ownerName) : null,
            previous: beforePipeline?.ownerName || null,
            persisted: pipeline.ownerName || null,
            matched: Object.prototype.hasOwnProperty.call(body, "ownerName")
              ? pipeline.ownerName === toNullableString(input.ownerName)
              : null
          },
          intakeDecision: {
            requested: hasExplicitIntakeDecision ? input.intakeDecision : null,
            previous: beforePipeline?.intakeDecision || null,
            persisted: pipeline.intakeDecision,
            matched: hasExplicitIntakeDecision ? pipeline.intakeDecision === input.intakeDecision : null
          },
          createdAt: debugDatePayloadField(
            dateFieldPresence.createdAt ? updatePayload.createdAt || null : null,
            pipeline.createdAt || null,
            dateFieldPresence.createdAt
          ),
          intakeDecisionAt: debugDatePayloadField(
            dateFieldPresence.intakeDecisionAt ? updatePayload.intakeDecisionAt : null,
            pipeline.intakeDecisionAt || null,
            dateFieldPresence.intakeDecisionAt
          ),
          ventureStudioContractExecutedAt: debugDatePayloadField(
            dateFieldPresence.ventureStudioContractExecutedAt ? updatePayload.ventureStudioContractExecutedAt : null,
            pipeline.ventureStudioContractExecutedAt || null,
            dateFieldPresence.ventureStudioContractExecutedAt
          ),
          screeningWebinarDate1At: debugDatePayloadField(
            dateFieldPresence.screeningWebinarDate1At ? updatePayload.screeningWebinarDate1At : null,
            pipeline.screeningWebinarDate1At || null,
            dateFieldPresence.screeningWebinarDate1At
          ),
          screeningWebinarDate2At: debugDatePayloadField(
            dateFieldPresence.screeningWebinarDate2At ? updatePayload.screeningWebinarDate2At : null,
            pipeline.screeningWebinarDate2At || null,
            dateFieldPresence.screeningWebinarDate2At
          ),
          ventureExpectedCloseDate: debugDatePayloadField(
            dateFieldPresence.ventureExpectedCloseDate ? updatePayload.ventureExpectedCloseDate : null,
            pipeline.ventureExpectedCloseDate || null,
            dateFieldPresence.ventureExpectedCloseDate
          ),
          ventureLikelihoodPercent: {
            requested: dateFieldPresence.ventureLikelihoodPercent
              ? updatePayload.ventureLikelihoodPercent ?? null
              : null,
            persisted: pipeline.ventureLikelihoodPercent ?? null,
            matched: dateFieldPresence.ventureLikelihoodPercent
              ? pipeline.ventureLikelihoodPercent === updatePayload.ventureLikelihoodPercent
              : null
          }
        },
        saved: {
          updatedAt: pipeline.updatedAt.toISOString(),
          nextStep: pipeline.nextStep,
          intakeDecision: pipeline.intakeDecision,
          createdAt: pipeline.createdAt ? formatDateForDebug(pipeline.createdAt) : null,
          intakeDecisionAt: formatDateForDebug(pipeline.intakeDecisionAt),
          ventureStudioContractExecutedAt: pipeline.ventureStudioContractExecutedAt
            ? formatDateForDebug(pipeline.ventureStudioContractExecutedAt)
            : null,
          screeningWebinarDate1At: pipeline.screeningWebinarDate1At
            ? formatDateForDebug(pipeline.screeningWebinarDate1At)
            : null,
          screeningWebinarDate2At: pipeline.screeningWebinarDate2At
            ? formatDateForDebug(pipeline.screeningWebinarDate2At)
            : null,
          ventureExpectedCloseDate: pipeline.ventureExpectedCloseDate
            ? formatDateForDebug(pipeline.ventureExpectedCloseDate)
            : null,
          phase: pipeline.phase
        }
      });
    }

    const response = {
      item: {
        id,
        nextStep: pipeline.nextStep || "",
        ownerName: pipeline.ownerName,
        intakeDecision: pipeline.intakeDecision,
        createdAt: pipeline.createdAt,
        intakeDecisionAt: pipeline.intakeDecisionAt,
        ventureStudioContractExecutedAt: pipeline.ventureStudioContractExecutedAt,
        screeningWebinarDate1At: pipeline.screeningWebinarDate1At,
        screeningWebinarDate2At: pipeline.screeningWebinarDate2At,
        ventureLikelihoodPercent: pipeline.ventureLikelihoodPercent,
        ventureExpectedCloseDate: pipeline.ventureExpectedCloseDate,
        atAGlanceProblem: nextAtAGlanceProblem ?? "",
        atAGlanceSolution: nextAtAGlanceSolution ?? "",
        atAGlanceImpact: nextAtAGlanceImpact ?? "",
        atAGlanceKeyStrengths: nextAtAGlanceKeyStrengths ?? "",
        atAGlanceKeyConsiderations: nextAtAGlanceKeyConsiderations ?? "",
        ventureStudioCriteria: pipeline.ventureStudioCriteria || [],
        marketLandscape: marketLandscapePayloadFromRecord(
          savedMarketLandscape || company.marketLandscape,
          company.name
        ),
        phase,
        phaseLabel: phaseLabel(phase),
        column: mapPhaseToBoardColumn(phase),
        closedOutcome: pipeline.closedOutcome,
        declineReasonNotes: pipeline.declineReasonNotes,
        updatedAt: pipeline.updatedAt.toISOString()
      },
      _dateDebug: debugContext
        ? {
            requestId: debugContext.requestId,
            requestSequence: debugContext.requestSequence ?? null,
            clientUpdatedAt: debugContext.clientUpdatedAt,
            clientUpdatedAtParsed:
              debugClientUpdatedAtComparison(debugContext.clientUpdatedAt || null, pipeline.updatedAt).parsedClientUpdatedAt,
            scope: debugContext.scope,
            sessionId: debugContext.sessionId,
            itemId: debugContext.itemId,
            serverUpdatedAt: pipeline.updatedAt.toISOString()
          }
        : undefined
    };

    if (shouldDebug && debugContext?.requestId) {
      console.log("[date-debug] api.card.update.response", response._dateDebug);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("update_pipeline_card_error", error);
    return NextResponse.json({ error: "Failed to update pipeline card" }, { status: 400 });
  }
}
