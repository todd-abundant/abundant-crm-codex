import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseDateInput } from "@/lib/date-parse";
import { getDateDebugContextFromRequest, shouldLogDateRequest } from "@/lib/date-debug";
import {
  inferDefaultDecisionFromCompany,
  inferDefaultPhaseFromCompany,
  mapPhaseToBoardColumn,
  phaseLabel,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

const intakeCardUpdateSchema = z.object({
  intakeScheduledAt: z.string().optional().nullable(),
  declineReason: z
    .enum([
      "PRODUCT",
      "INSUFFICIENT_ROI",
      "HIGHLY_COMPETITIVE_LANDSCAPE",
      "OUT_OF_INVESTMENT_THESIS_SCOPE",
      "TOO_EARLY",
      "TOO_MATURE_FOR_SEED_INVESTMENT",
      "LACKS_PROOF_POINTS",
      "INSUFFICIENT_TAM",
      "TEAM",
      "HEALTH_SYSTEM_BUYING_PROCESS",
      "WORKFLOW_FRICTION",
      "OTHER"
    ])
    .optional()
    .nullable(),
  leadSource: z.string().optional().nullable()
});

function toNullableDate(value?: string | null) {
  return parseDateInput(value);
}

function hasDateField(input: unknown, field: string) {
  if (!input || typeof input !== "object") return false;
  return Object.prototype.hasOwnProperty.call(input, field);
}

function debugDateValue(value: Date | null | undefined) {
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = intakeCardUpdateSchema.parse(body);
    const shouldDebug = shouldLogDateRequest(request);
    const debugContext = getDateDebugContextFromRequest(request);
    const requestHas = {
      intakeScheduledAt: hasDateField(body, "intakeScheduledAt"),
      declineReason: hasDateField(body, "declineReason"),
      leadSource: hasDateField(body, "leadSource")
    };

    if (shouldDebug) {
      console.log("[date-debug] api.intake.update.input", {
        ...debugContext,
        id,
        requestHas,
        body
      });
    }

    const company = await prisma.company.findUnique({
      where: { id },
      include: {
        pipeline: true
      }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const intakeScheduledAt = toNullableDate(input.intakeScheduledAt);
    const declineReason = input.declineReason ?? null;
    const leadSourceText = (input.leadSource || "").trim();
    const parseWarnings = {
      intakeScheduledAt: parseWarningCandidates(input.intakeScheduledAt, intakeScheduledAt)
    };

    if (shouldDebug) {
      console.log("[date-debug] api.intake.update.parsed", {
        ...debugContext,
        id,
        requestHas,
        parseWarnings,
        intakeScheduledAt: intakeScheduledAt ? intakeScheduledAt.toISOString() : null,
        declineReason,
        leadSourceText: leadSourceText || null
      });

      if (parseWarnings.intakeScheduledAt?.raw && !parseWarnings.intakeScheduledAt.parsed) {
        console.log("[date-debug] api.intake.update.parse-warning", {
          ...debugContext,
          id,
          parseWarnings
        });
      }
    }

    const matchedHealthSystem = leadSourceText
      ? await prisma.healthSystem.findFirst({
          where: {
            name: {
              equals: leadSourceText,
              mode: "insensitive"
            }
          },
          select: {
            id: true,
            name: true
          }
        })
      : null;

    const intakeStatus =
      company.intakeStatus === "COMPLETED" || company.intakeStatus === "SCREENING_EVALUATION"
        ? company.intakeStatus
        : intakeScheduledAt
          ? "SCHEDULED"
          : "NOT_SCHEDULED";

    const updated = await prisma.$transaction(async (tx) => {
      await tx.company.update({
        where: { id },
        data: {
          intakeScheduledAt,
          intakeStatus,
          declineReason,
          leadSourceType: matchedHealthSystem ? "HEALTH_SYSTEM" : "OTHER",
          leadSourceHealthSystemId: matchedHealthSystem ? matchedHealthSystem.id : null,
          leadSourceOther: matchedHealthSystem ? null : leadSourceText || null,
          researchUpdatedAt: new Date()
        }
      });

      if (declineReason) {
        await tx.companyPipeline.upsert({
          where: { companyId: id },
          create: {
            companyId: id,
            phase: "DECLINED",
            stageChangedAt: new Date(),
            intakeDecision: "DECLINE",
            intakeDecisionAt: intakeScheduledAt,
            lastMeaningfulActivityAt: new Date()
          },
          update: {
            phase: "DECLINED",
            stageChangedAt: company.pipeline?.phase === "DECLINED" ? undefined : new Date(),
            intakeDecision: "DECLINE",
            intakeDecisionAt: intakeScheduledAt,
            lastMeaningfulActivityAt: new Date()
          }
        });
      } else if (company.pipeline?.phase === "DECLINED") {
        await tx.companyPipeline.upsert({
          where: { companyId: id },
          create: {
            companyId: id,
            phase: "INTAKE",
            stageChangedAt: new Date(),
            intakeDecision: "PENDING",
            intakeDecisionAt: intakeScheduledAt,
            lastMeaningfulActivityAt: new Date()
          },
          update: {
            phase: "INTAKE",
            stageChangedAt: new Date(),
            intakeDecision: "PENDING",
            intakeDecisionAt: intakeScheduledAt,
            lastMeaningfulActivityAt: new Date()
          }
        });
      } else {
        await tx.companyPipeline.upsert({
          where: { companyId: id },
          create: {
            companyId: id,
            phase: inferDefaultPhaseFromCompany(company),
            stageChangedAt: new Date(),
            intakeDecision: inferDefaultDecisionFromCompany(company),
            intakeDecisionAt: intakeScheduledAt,
            lastMeaningfulActivityAt: new Date()
          },
          update: {
            intakeDecisionAt: intakeScheduledAt,
            lastMeaningfulActivityAt: new Date()
          }
        });
      }

      return tx.company.findUnique({
        where: { id },
        include: {
          leadSourceHealthSystem: {
            select: {
              id: true,
              name: true
            }
          },
          pipeline: true
        }
      });
    });

    if (shouldDebug) {
      const updatedPipeline = updated?.pipeline;
      console.log("[date-debug] api.intake.update.after-transaction", {
        ...debugContext,
        id,
        clientUpdatedAtComparison: debugClientUpdatedAtComparison(
          debugContext?.clientUpdatedAt || null,
          updatedPipeline?.updatedAt || null
        ),
        persisted: {
          intakeScheduledAt: updated?.intakeScheduledAt
            ? updated.intakeScheduledAt.toISOString()
            : null,
          intakeStatus: updated?.intakeStatus,
          declineReason: updated?.declineReason,
          intakeDecisionAt: updatedPipeline?.intakeDecisionAt
            ? updatedPipeline.intakeDecisionAt.toISOString()
            : null,
          phase: updatedPipeline?.phase || null,
          updatedAt: updatedPipeline?.updatedAt ? updatedPipeline.updatedAt.toISOString() : null
        }
      });
    }

    if (!updated) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const phase = (updated.pipeline?.phase || inferDefaultPhaseFromCompany(updated)) as PipelinePhase;

    const response = {
      item: {
        id: updated.id,
        intakeScheduledAt: updated.pipeline?.intakeDecisionAt ?? updated.intakeScheduledAt,
        intakeDecisionAt: updated.pipeline?.intakeDecisionAt ?? updated.intakeScheduledAt,
        declineReason: updated.declineReason,
        leadSource:
          updated.leadSourceType === "HEALTH_SYSTEM"
            ? updated.leadSourceHealthSystem?.name || ""
            : updated.leadSourceOther || "",
        phase,
        phaseLabel: phaseLabel(phase),
        column: mapPhaseToBoardColumn(phase),
        updatedAt: updated.pipeline?.updatedAt.toISOString() || null
      },
      _dateDebug: debugContext
        ? {
            requestId: debugContext.requestId,
            requestSequence: debugContext.requestSequence ?? null,
            clientUpdatedAt: debugContext.clientUpdatedAt,
            clientUpdatedAtParsed: debugClientUpdatedAtComparison(
              debugContext.clientUpdatedAt || null,
              updated?.pipeline?.updatedAt || null
            ).parsedClientUpdatedAt,
            scope: debugContext.scope,
            sessionId: debugContext.sessionId,
            itemId: debugContext.itemId,
            serverUpdatedAt: updated?.pipeline?.updatedAt ? updated.pipeline.updatedAt.toISOString() : null
          }
        : undefined
    };

    if (shouldDebug) {
      console.log("[date-debug] api.intake.update.response", response._dateDebug);
    }

    return NextResponse.json(response);
  } catch (error) {
    console.error("update_pipeline_intake_card_error", error);
    return NextResponse.json({ error: "Failed to update intake card" }, { status: 400 });
  }
}
