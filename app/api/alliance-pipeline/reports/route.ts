import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { closedOutcomeLabel, stageLabel, statusLabel } from "@/lib/alliance-pipeline";

type ReportPresetKey = "active" | "closed" | "revisit" | "joined";

const PRESETS: Array<{
  key: ReportPresetKey;
  name: string;
  description: string;
  defaults: {
    status: "all" | "ACTIVE" | "CLOSED" | "REVISIT";
    closedOutcome?: "JOINED" | null;
  };
}> = [
  {
    key: "active",
    name: "Active Alliance Pipeline",
    description: "Health systems currently progressing through alliance prospecting, qualification, proposal, or contracting.",
    defaults: {
      status: "ACTIVE"
    }
  },
  {
    key: "closed",
    name: "Closed Alliance Pipeline",
    description: "Health systems that have been closed out of the alliance process.",
    defaults: {
      status: "CLOSED"
    }
  },
  {
    key: "revisit",
    name: "Revisit Queue",
    description: "Health systems deferred for later follow-up.",
    defaults: {
      status: "REVISIT"
    }
  },
  {
    key: "joined",
    name: "Joined Alliance Members",
    description: "Closed-won alliance opportunities that resulted in membership.",
    defaults: {
      status: "CLOSED",
      closedOutcome: "JOINED"
    }
  }
];

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

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const presetKey = params.get("preset") as ReportPresetKey | null;
    const preset = PRESETS.find((entry) => entry.key === presetKey) || null;

    const selectedStatus =
      (params.get("status") as "all" | "ACTIVE" | "CLOSED" | "REVISIT" | null) ||
      preset?.defaults.status ||
      "ACTIVE";
    const selectedStage = params.get("stage")?.trim() || "";
    const selectedOwner = params.get("owner")?.trim() || "";
    const selectedClosedOutcome = params.get("closedOutcome")?.trim() || preset?.defaults.closedOutcome || "";

    const where: {
      status?: "ACTIVE" | "CLOSED" | "REVISIT";
      stage?: "PROSPECTING" | "QUALIFYING" | "PROPOSAL" | "CONTRACTING";
      ownerName?: { contains: string; mode: "insensitive" };
      closedOutcome?: "JOINED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER";
    } = {};

    if (selectedStatus !== "all") where.status = selectedStatus;
    if (
      selectedStage === "PROSPECTING" ||
      selectedStage === "QUALIFYING" ||
      selectedStage === "PROPOSAL" ||
      selectedStage === "CONTRACTING"
    ) {
      where.stage = selectedStage;
    }
    if (selectedOwner) {
      where.ownerName = {
        contains: selectedOwner,
        mode: "insensitive"
      };
    }
    if (
      selectedClosedOutcome === "JOINED" ||
      selectedClosedOutcome === "PASSED" ||
      selectedClosedOutcome === "LOST" ||
      selectedClosedOutcome === "WITHDREW" ||
      selectedClosedOutcome === "OTHER"
    ) {
      where.closedOutcome = selectedClosedOutcome;
    }

    const [rows, summary] = await Promise.all([
      prisma.healthSystemAlliancePipeline.findMany({
        where,
        include: {
          healthSystem: {
            select: {
              id: true,
              name: true,
              website: true,
              headquartersCity: true,
              headquartersState: true,
              headquartersCountry: true,
              allianceMemberStatus: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      }),
      prisma.healthSystemAlliancePipeline.groupBy({
        by: ["status"],
        _count: {
          _all: true
        }
      })
    ]);

    const joinedCount = await prisma.healthSystemAlliancePipeline.count({
      where: {
        status: "CLOSED",
        closedOutcome: "JOINED"
      }
    });

    return NextResponse.json({
      presets: PRESETS,
      filters: {
        status: selectedStatus,
        stage: selectedStage,
        owner: selectedOwner,
        closedOutcome: selectedClosedOutcome
      },
      summary: {
        total: summary.reduce((count, entry) => count + entry._count._all, 0),
        active: summary.find((entry) => entry.status === "ACTIVE")?._count._all || 0,
        revisit: summary.find((entry) => entry.status === "REVISIT")?._count._all || 0,
        closed: summary.find((entry) => entry.status === "CLOSED")?._count._all || 0,
        joined: joinedCount,
        filtered: rows.length
      },
      rows: rows.map((entry) => ({
        id: entry.healthSystem.id,
        name: entry.healthSystem.name,
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
        closeReason: entry.closeReason,
        allianceMemberStatus: entry.healthSystem.allianceMemberStatus,
        createdAt: entry.createdAt.toISOString(),
        updatedAt: entry.updatedAt.toISOString()
      }))
    });
  } catch (error) {
    console.error("list_alliance_pipeline_reports_error", error);
    return NextResponse.json({ error: "Failed to load alliance pipeline reports." }, { status: 400 });
  }
}
