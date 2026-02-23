import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
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
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = intakeCardUpdateSchema.parse(body);

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
            intakeDecision: "DECLINE"
          },
          update: {
            phase: "DECLINED",
            intakeDecision: "DECLINE"
          }
        });
      } else if (company.pipeline?.phase === "DECLINED") {
        await tx.companyPipeline.update({
          where: { companyId: id },
          data: {
            phase: "INTAKE",
            intakeDecision: "PENDING"
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

    if (!updated) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const phase = (updated.pipeline?.phase || inferDefaultPhaseFromCompany(updated)) as PipelinePhase;

    return NextResponse.json({
      item: {
        id: updated.id,
        intakeScheduledAt: updated.intakeScheduledAt,
        declineReason: updated.declineReason,
        leadSource:
          updated.leadSourceType === "HEALTH_SYSTEM"
            ? updated.leadSourceHealthSystem?.name || ""
            : updated.leadSourceOther || "",
        phase,
        phaseLabel: phaseLabel(phase),
        column: mapPhaseToBoardColumn(phase)
      }
    });
  } catch (error) {
    console.error("update_pipeline_intake_card_error", error);
    return NextResponse.json({ error: "Failed to update intake card" }, { status: 400 });
  }
}
