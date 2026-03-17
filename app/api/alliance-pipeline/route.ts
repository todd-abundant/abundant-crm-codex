import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { allianceMemberStateFromPipeline, closedOutcomeLabel, stageLabel, statusLabel } from "@/lib/alliance-pipeline";

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

export async function GET() {
  try {
    const pipelines = await prisma.healthSystemAlliancePipeline.findMany({
      include: {
        healthSystem: {
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
        }
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    const healthSystemIds = pipelines.map((entry) => entry.healthSystemId);
    const notes =
      healthSystemIds.length === 0
        ? []
        : await prisma.entityNote.findMany({
            where: {
              entityKind: "HEALTH_SYSTEM",
              entityId: { in: healthSystemIds }
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: {
              id: true,
              entityId: true,
              note: true,
              createdAt: true,
              createdByName: true,
              createdByUser: {
                select: {
                  name: true,
                  email: true
                }
              }
            }
          });

    const notesByHealthSystemId = new Map<string, typeof notes>();
    for (const note of notes) {
      const list = notesByHealthSystemId.get(note.entityId);
      if (list) {
        list.push(note);
      } else {
        notesByHealthSystemId.set(note.entityId, [note]);
      }
    }

    const items = pipelines.map((entry) => {
      const pipelineNotes = notesByHealthSystemId.get(entry.healthSystemId) || [];
      const latestNote = pipelineNotes[0] || null;
      return {
        id: entry.healthSystem.id,
        name: entry.healthSystem.name,
        legalName: entry.healthSystem.legalName,
        website: entry.healthSystem.website,
        location: formatLocation(entry.healthSystem),
        stage: entry.stage,
        stageLabel: stageLabel(entry.stage),
        status: entry.status,
        statusLabel: statusLabel(entry.status),
        closedOutcome: entry.closedOutcome,
        closedOutcomeLabel: closedOutcomeLabel(entry.closedOutcome),
        ownerName: entry.ownerName,
        nextStep: entry.nextStep,
        nextStepDueAt: entry.nextStepDueAt?.toISOString() || null,
        contractPriceUsd: toNumber(entry.contractPriceUsd),
        likelihoodPercent: entry.likelihoodPercent,
        estimatedCloseDate: entry.estimatedCloseDate?.toISOString() || null,
        closedAt: entry.closedAt?.toISOString() || null,
        stageChangedAt: entry.stageChangedAt.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString(),
        allianceMemberStatus: entry.healthSystem.allianceMemberStatus,
        isAllianceMember: entry.healthSystem.isAllianceMember,
        noteCount: pipelineNotes.length,
        latestNote: latestNote
          ? {
              id: latestNote.id,
              note: latestNote.note,
              createdAt: latestNote.createdAt.toISOString(),
              createdByName:
                latestNote.createdByName ||
                latestNote.createdByUser?.name ||
                latestNote.createdByUser?.email ||
                "Unknown user"
            }
          : null
      };
    });

    const revisitItems = items.filter(
      (item) => item.allianceMemberStatus === "REVISIT_LATER" || item.status === "REVISIT"
    );
    const activeItems = items.filter(
      (item) => item.status === "ACTIVE" && item.allianceMemberStatus !== "REVISIT_LATER"
    );

    return NextResponse.json({
      activeItems,
      revisitItems,
      summary: {
        total: items.length,
        active: activeItems.length,
        revisit: revisitItems.length,
        closed: items.filter((item) => item.status === "CLOSED").length
      }
    });
  } catch (error) {
    console.error("list_alliance_pipeline_error", error);
    return NextResponse.json({ error: "Failed to load alliance pipeline" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { healthSystemId?: unknown };
    const healthSystemId = typeof body.healthSystemId === "string" ? body.healthSystemId.trim() : "";

    if (!healthSystemId) {
      return NextResponse.json({ error: "Health system is required." }, { status: 400 });
    }

    const result = await prisma.$transaction(async (tx) => {
      const healthSystem = await tx.healthSystem.findUnique({
        where: { id: healthSystemId },
        select: {
          id: true,
          name: true
        }
      });

      if (!healthSystem) {
        throw new Error("Health system not found.");
      }

      const existing = await tx.healthSystemAlliancePipeline.findUnique({
        where: { healthSystemId }
      });

      let action: "created" | "reopened" | "existing" = "created";

      if (!existing) {
        await tx.healthSystemAlliancePipeline.create({
          data: {
            healthSystemId
          }
        });
      } else if (existing.status !== "ACTIVE") {
        action = "reopened";
        await tx.healthSystemAlliancePipeline.update({
          where: { healthSystemId },
          data: {
            status: "ACTIVE",
            closedOutcome: null,
            closedAt: null,
            closeReason: null,
            stageChangedAt: new Date()
          }
        });
      } else {
        action = "existing";
      }

      const memberState = allianceMemberStateFromPipeline("ACTIVE", null);
      await tx.healthSystem.update({
        where: { id: healthSystemId },
        data: {
          isAllianceMember: memberState.isAllianceMember,
          allianceMemberStatus: memberState.allianceMemberStatus
        }
      });

      return {
        action,
        healthSystem
      };
    });

    return NextResponse.json(result, { status: result.action === "created" ? 201 : 200 });
  } catch (error) {
    console.error("create_alliance_pipeline_entry_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add health system to alliance pipeline." },
      { status: 400 }
    );
  }
}
