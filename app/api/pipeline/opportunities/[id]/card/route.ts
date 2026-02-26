import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
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
    .optional()
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
      ventureStudioCriteria?: Prisma.JsonValue;
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
    if (Object.prototype.hasOwnProperty.call(body, "ventureStudioCriteria")) {
      updatePayload.ventureStudioCriteria = input.ventureStudioCriteria
        ? input.ventureStudioCriteria.map((entry) => ({
            category: entry.category.trim(),
            assessment: entry.assessment,
            rationale: toNullableString(entry.rationale) || ""
          }))
        : null;
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

    if (Object.keys(companyUpdatePayload).length > 0) {
      await prisma.company.update({
        where: { id },
        data: companyUpdatePayload
      });
    }

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

    return NextResponse.json({
      item: {
        id,
        nextStep: pipeline.nextStep || "",
        ventureLikelihoodPercent: pipeline.ventureLikelihoodPercent,
        ventureExpectedCloseDate: pipeline.ventureExpectedCloseDate,
        atAGlanceProblem: nextAtAGlanceProblem ?? "",
        atAGlanceSolution: nextAtAGlanceSolution ?? "",
        atAGlanceImpact: nextAtAGlanceImpact ?? "",
        atAGlanceKeyStrengths: nextAtAGlanceKeyStrengths ?? "",
        atAGlanceKeyConsiderations: nextAtAGlanceKeyConsiderations ?? "",
        ventureStudioCriteria: pipeline.ventureStudioCriteria || [],
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
