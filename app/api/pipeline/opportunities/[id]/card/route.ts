import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  inferDefaultDecisionFromCompany,
  inferDefaultPhaseFromCompany,
  mapPhaseToBoardColumn,
  phaseLabel,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

const cardUpdateSchema = z.object({
  nextStep: z.string().optional().nullable(),
  ventureLikelihoodPercent: z.number().int().min(0).max(100).optional().nullable(),
  ventureExpectedCloseDate: z.string().optional().nullable()
});

function toNullableDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = cardUpdateSchema.parse(body);
    const updatePayload: {
      nextStep?: string | null;
      ventureLikelihoodPercent?: number | null;
      ventureExpectedCloseDate?: Date | null;
    } = {};
    if (Object.prototype.hasOwnProperty.call(body, "nextStep")) {
      updatePayload.nextStep = toNullableString(input.nextStep);
    }
    if (Object.prototype.hasOwnProperty.call(body, "ventureLikelihoodPercent")) {
      updatePayload.ventureLikelihoodPercent = input.ventureLikelihoodPercent ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "ventureExpectedCloseDate")) {
      updatePayload.ventureExpectedCloseDate = toNullableDate(input.ventureExpectedCloseDate);
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

    const pipeline = await prisma.companyPipeline.upsert({
      where: { companyId: id },
      create: {
        companyId: id,
        phase: inferDefaultPhaseFromCompany(company),
        intakeDecision: inferDefaultDecisionFromCompany(company),
        ...updatePayload
      },
      update: updatePayload
    });

    const phase = pipeline.phase as PipelinePhase;

    return NextResponse.json({
      item: {
        id,
        nextStep: pipeline.nextStep || "",
        ventureLikelihoodPercent: pipeline.ventureLikelihoodPercent,
        ventureExpectedCloseDate: pipeline.ventureExpectedCloseDate,
        phase,
        phaseLabel: phaseLabel(phase),
        column: mapPhaseToBoardColumn(phase)
      }
    });
  } catch (error) {
    console.error("update_pipeline_card_error", error);
    return NextResponse.json({ error: "Failed to update pipeline card" }, { status: 400 });
  }
}
