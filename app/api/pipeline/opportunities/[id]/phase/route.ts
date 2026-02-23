import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  inferDefaultDecisionFromCompany,
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
    "PORTFOLIO_GROWTH"
  ])
});

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
        intakeStatus: true,
        declineReason: true
      }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const pipeline = await prisma.companyPipeline.upsert({
      where: { companyId: id },
      create: {
        companyId: id,
        phase: input.phase,
        intakeDecision: inferDefaultDecisionFromCompany(company)
      },
      update: {
        phase: input.phase
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
