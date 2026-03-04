import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
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
    .optional(),
  marketLandscape: z
    .unknown()
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
    const updatePayload: {
      nextStep?: string | null;
      ventureLikelihoodPercent?: number | null;
      ventureExpectedCloseDate?: Date | null;
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
      updatePayload.ventureStudioCriteria = (input.ventureStudioCriteria || []).map((entry) => ({
        category: entry.category.trim(),
        assessment: entry.assessment,
        rationale: toNullableString(entry.rationale) || ""
      }));
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
        marketLandscape: marketLandscapePayloadFromRecord(
          savedMarketLandscape || company.marketLandscape,
          company.name
        ),
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
