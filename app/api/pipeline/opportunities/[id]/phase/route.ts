import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  mapPhaseToBoardColumn,
  phaseLabel,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

const phaseUpdateSchema = z.object({
  phase: z.enum([
    "INTAKE",
    "DECLINED",
    "VENTURE_STUDIO_NEGOTIATION",
    "SCREENING",
    "LOI_COLLECTION",
    "COMMERCIAL_NEGOTIATION",
    "PORTFOLIO_GROWTH",
    "CLOSED"
  ])
});

function normalizePipelinePhase(phase: PipelinePhase) {
  return phase === "CLOSED" ? "DECLINED" : phase;
}

function intakeDecisionForPhase(phase: PipelinePhase) {
  if (phase === "INTAKE") return "PENDING" as const;
  if (phase === "DECLINED") return "DECLINE" as const;
  return "ADVANCE_TO_NEGOTIATION" as const;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = phaseUpdateSchema.parse(body);

    const company = await prisma.company.findUnique({
      where: { id },
      select: {
        id: true,
        pipeline: {
          select: {
            phase: true,
            intakeDecisionAt: true
          }
        }
      }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const normalizedPhase = normalizePipelinePhase(input.phase);
    const nextIntakeDecision = intakeDecisionForPhase(normalizedPhase);
    const nextIntakeDecisionAt =
      nextIntakeDecision === "PENDING" ? null : (company.pipeline?.intakeDecisionAt ?? new Date());

    const pipeline = await prisma.companyPipeline.upsert({
      where: { companyId: id },
      create: {
        companyId: id,
        phase: normalizedPhase,
        stageChangedAt: new Date(),
        intakeDecision: nextIntakeDecision,
        intakeDecisionAt: nextIntakeDecisionAt
      },
      update: {
        phase: normalizedPhase,
        stageChangedAt: company.pipeline?.phase === normalizedPhase ? undefined : new Date(),
        intakeDecision: nextIntakeDecision,
        intakeDecisionAt: nextIntakeDecisionAt
      }
    });

    const phase = pipeline.phase as PipelinePhase;

    return NextResponse.json({
      phase,
      phaseLabel: phaseLabel(phase),
      column: mapPhaseToBoardColumn(phase)
    });
  } catch (error) {
    console.error("update_pipeline_phase_error", error);
    return NextResponse.json({ error: "Failed to update pipeline phase" }, { status: 400 });
  }
}
