import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  allianceMemberStateFromPipeline,
  closedOutcomeLabel,
  stageLabel,
  statusLabel
} from "@/lib/alliance-pipeline";
import { parseDateInput } from "@/lib/date-parse";

const updateSchema = z.object({
  stage: z.enum(["PROSPECTING", "QUALIFYING", "PROPOSAL", "CONTRACTING"]).optional(),
  status: z.enum(["ACTIVE", "CLOSED", "REVISIT"]).optional(),
  closedOutcome: z.enum(["JOINED", "PASSED", "LOST", "WITHDREW", "OTHER"]).optional().nullable(),
  closeReason: z.string().optional().nullable(),
  ownerName: z.string().optional().nullable(),
  nextStep: z.string().optional().nullable(),
  nextStepDueAt: z.string().optional().nullable(),
  contractPriceUsd: z.number().nonnegative().optional().nullable(),
  likelihoodPercent: z.number().int().min(0).max(100).optional().nullable(),
  estimatedCloseDate: z.string().optional().nullable()
});

function formatLocation(healthSystem: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  return [healthSystem.headquartersCity, healthSystem.headquartersState, healthSystem.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function toNumber(value: { toString(): string } | null | undefined) {
  if (!value) return null;
  const numeric = Number(value.toString());
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeString(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function serializeItem(payload: {
  healthSystem: {
    id: string;
    name: string;
    legalName: string | null;
    website: string | null;
    headquartersCity: string | null;
    headquartersState: string | null;
    headquartersCountry: string | null;
    allianceMemberStatus: string;
    isAllianceMember: boolean;
  };
  pipeline: {
    stage: "PROSPECTING" | "QUALIFYING" | "PROPOSAL" | "CONTRACTING";
    status: "ACTIVE" | "CLOSED" | "REVISIT";
    closedOutcome: "JOINED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
    closeReason: string | null;
    ownerName: string | null;
    nextStep: string | null;
    nextStepDueAt: Date | null;
    contractPriceUsd: { toString(): string } | null;
    likelihoodPercent: number | null;
    estimatedCloseDate: Date | null;
    closedAt: Date | null;
    stageChangedAt: Date;
    createdAt: Date;
    updatedAt: Date;
  };
  counts: {
    contacts: number;
    documents: number;
    notes: number;
  };
}) {
  return {
    id: payload.healthSystem.id,
    name: payload.healthSystem.name,
    legalName: payload.healthSystem.legalName,
    website: payload.healthSystem.website,
    location: formatLocation(payload.healthSystem),
    allianceMemberStatus: payload.healthSystem.allianceMemberStatus,
    isAllianceMember: payload.healthSystem.isAllianceMember,
    stage: payload.pipeline.stage,
    stageLabel: stageLabel(payload.pipeline.stage),
    status: payload.pipeline.status,
    statusLabel: statusLabel(payload.pipeline.status),
    closedOutcome: payload.pipeline.closedOutcome,
    closedOutcomeLabel: closedOutcomeLabel(payload.pipeline.closedOutcome),
    closeReason: payload.pipeline.closeReason,
    ownerName: payload.pipeline.ownerName,
    nextStep: payload.pipeline.nextStep,
    nextStepDueAt: payload.pipeline.nextStepDueAt?.toISOString() || null,
    contractPriceUsd: toNumber(payload.pipeline.contractPriceUsd),
    likelihoodPercent: payload.pipeline.likelihoodPercent,
    estimatedCloseDate: payload.pipeline.estimatedCloseDate?.toISOString() || null,
    closedAt: payload.pipeline.closedAt?.toISOString() || null,
    stageChangedAt: payload.pipeline.stageChangedAt.toISOString(),
    createdAt: payload.pipeline.createdAt.toISOString(),
    updatedAt: payload.pipeline.updatedAt.toISOString(),
    counts: payload.counts
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    const [healthSystem, pipeline, contactCount, documentCount, noteCount] = await Promise.all([
      prisma.healthSystem.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          legalName: true,
          website: true,
          headquartersCity: true,
          headquartersState: true,
          headquartersCountry: true,
          allianceMemberStatus: true,
          isAllianceMember: true
        }
      }),
      prisma.healthSystemAlliancePipeline.findUnique({
        where: { healthSystemId: id }
      }),
      prisma.contactHealthSystem.count({
        where: { healthSystemId: id }
      }),
      prisma.entityDocument.count({
        where: {
          entityKind: "HEALTH_SYSTEM",
          entityId: id
        }
      }),
      prisma.entityNote.count({
        where: {
          entityKind: "HEALTH_SYSTEM",
          entityId: id
        }
      })
    ]);

    if (!healthSystem || !pipeline) {
      return NextResponse.json({ error: "Alliance pipeline item not found." }, { status: 404 });
    }

    return NextResponse.json({
      item: serializeItem({
        healthSystem,
        pipeline,
        counts: {
          contacts: contactCount,
          documents: documentCount,
          notes: noteCount
        }
      })
    });
  } catch (error) {
    console.error("get_alliance_pipeline_item_error", error);
    return NextResponse.json({ error: "Failed to load alliance pipeline item." }, { status: 400 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = updateSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.healthSystemAlliancePipeline.findUnique({
        where: { healthSystemId: id }
      });

      if (!existing) {
        throw new Error("Alliance pipeline item not found.");
      }

      const nextStage = input.stage ?? existing.stage;
      const nextStatus = input.status ?? existing.status;
      const stageChangedAt =
        nextStage !== existing.stage || (nextStatus === "ACTIVE" && existing.status !== "ACTIVE")
          ? new Date()
          : undefined;

      const data: Prisma.HealthSystemAlliancePipelineUpdateInput = {};

      if (input.stage) data.stage = input.stage;
      if (stageChangedAt) data.stageChangedAt = stageChangedAt;
      if (input.status) data.status = input.status;
      if (input.ownerName !== undefined) data.ownerName = normalizeString(input.ownerName);
      if (input.nextStep !== undefined) data.nextStep = normalizeString(input.nextStep);
      if (input.nextStepDueAt !== undefined) data.nextStepDueAt = parseDateInput(input.nextStepDueAt);
      if (input.contractPriceUsd !== undefined) data.contractPriceUsd = input.contractPriceUsd;
      if (input.likelihoodPercent !== undefined) data.likelihoodPercent = input.likelihoodPercent;
      if (input.estimatedCloseDate !== undefined) data.estimatedCloseDate = parseDateInput(input.estimatedCloseDate);

      if (nextStatus === "CLOSED") {
        if (input.closedOutcome !== undefined) data.closedOutcome = input.closedOutcome;
        if (input.closeReason !== undefined) data.closeReason = normalizeString(input.closeReason);
        if (existing.status !== "CLOSED" || existing.closedAt === null) {
          data.closedAt = new Date();
        }
      } else {
        data.closedOutcome = null;
        data.closedAt = null;
        data.closeReason = null;
      }

      const pipeline = await tx.healthSystemAlliancePipeline.update({
        where: { healthSystemId: id },
        data
      });

      const memberState = allianceMemberStateFromPipeline(
        pipeline.status,
        pipeline.closedOutcome
      );

      const healthSystem = await tx.healthSystem.update({
        where: { id },
        data: {
          isAllianceMember: memberState.isAllianceMember,
          allianceMemberStatus: memberState.allianceMemberStatus
        },
        select: {
          id: true,
          name: true,
          legalName: true,
          website: true,
          headquartersCity: true,
          headquartersState: true,
          headquartersCountry: true,
          allianceMemberStatus: true,
          isAllianceMember: true
        }
      });

      const [contactCount, documentCount, noteCount] = await Promise.all([
        tx.contactHealthSystem.count({
          where: { healthSystemId: id }
        }),
        tx.entityDocument.count({
          where: {
            entityKind: "HEALTH_SYSTEM",
            entityId: id
          }
        }),
        tx.entityNote.count({
          where: {
            entityKind: "HEALTH_SYSTEM",
            entityId: id
          }
        })
      ]);

      return {
        healthSystem,
        pipeline,
        counts: {
          contacts: contactCount,
          documents: documentCount,
          notes: noteCount
        }
      };
    });

    return NextResponse.json({
      item: serializeItem(updated)
    });
  } catch (error) {
    console.error("update_alliance_pipeline_item_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update alliance pipeline item." },
      { status: 400 }
    );
  }
}
