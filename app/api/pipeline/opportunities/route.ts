import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  inferDefaultPhaseFromCompany,
  mapPhaseToBoardColumn,
  normalizePipelineCompanyType,
  phaseLabel,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

function formatLocation(company: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  return [company.headquartersCity, company.headquartersState, company.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function summarizeFundraise(
  fundraises: Array<{
    roundLabel: string;
    status: "PLANNED" | "OPEN" | "CLOSED" | "CANCELLED";
    totalAmountUsd: { toNumber(): number } | null;
  }>
) {
  const prioritized =
    fundraises.find((fundraise) => fundraise.status === "OPEN") ||
    fundraises.find((fundraise) => fundraise.status === "PLANNED") ||
    fundraises[0] ||
    null;

  return {
    raiseRoundLabel: prioritized?.roundLabel || null,
    raiseAmountUsd: prioritized?.totalAmountUsd ? prioritized.totalAmountUsd.toNumber() : null
  };
}


const staleThresholdDaysByPhase: Partial<Record<PipelinePhase, number>> = {
  INTAKE: 7,
  VENTURE_STUDIO_NEGOTIATION: 14,
  SCREENING: 21,
  LOI_COLLECTION: 14,
  COMMERCIAL_NEGOTIATION: 21
};

function daysSince(value: Date | null | undefined) {
  if (!value) return null;
  const diffMs = Date.now() - value.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function staleLevelForPhase(phase: PipelinePhase, timeInStageDays: number | null) {
  const threshold = staleThresholdDaysByPhase[phase];
  if (!threshold || timeInStageDays === null) return null;
  if (timeInStageDays >= threshold * 2) return "critical";
  if (timeInStageDays >= threshold) return "warning";
  return null;
}

export async function GET(request: Request) {
  try {
    const companyType = normalizePipelineCompanyType(new URL(request.url).searchParams.get("companyType"));
    const [companies, healthSystems] = await Promise.all([
      prisma.company.findMany({
        where: {
          companyType
        },
        include: {
          leadSourceHealthSystem: {
            select: {
              id: true,
              name: true
            }
          },
          fundraises: {
            select: {
              roundLabel: true,
              status: true,
              totalAmountUsd: true
            },
            orderBy: [{ announcedAt: "desc" }, { createdAt: "desc" }]
          },
          pipeline: true,
          opportunities: {
            where: {
              stage: {
                notIn: ["CLOSED_WON", "CLOSED_LOST"]
              }
            },
            select: {
              id: true,
              title: true,
              stage: true,
              likelihoodPercent: true
            },
            orderBy: [{ updatedAt: "desc" }]
          }
        },
        orderBy: [{ updatedAt: "desc" }]
      }),
      prisma.healthSystem.findMany({
        select: {
          id: true,
          name: true
        },
        orderBy: [{ name: "asc" }]
      })
    ]);

    const companyIds = companies.map((company) => company.id);
    const notes =
      companyIds.length === 0
        ? []
        : await prisma.entityNote.findMany({
            where: {
              entityKind: "COMPANY",
              entityId: { in: companyIds }
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

    const notesByCompanyId = new Map<string, typeof notes>();
    for (const note of notes) {
      const list = notesByCompanyId.get(note.entityId);
      if (list) {
        list.push(note);
      } else {
        notesByCompanyId.set(note.entityId, [note]);
      }
    }

    const pipelineEntries = companies
      .map((company) => {
        const phase = (company.pipeline?.phase || inferDefaultPhaseFromCompany(company)) as PipelinePhase;
        const column = mapPhaseToBoardColumn(phase);

        const companyNotes = notesByCompanyId.get(company.id) || [];
        const stageChangedAt = company.pipeline?.stageChangedAt || company.createdAt;
        const timeInStageDays = daysSince(stageChangedAt);
        const staleLevel = staleLevelForPhase(phase, timeInStageDays);
        const fundraiseSummary = summarizeFundraise(company.fundraises);

        return {
          id: company.id,
          name: company.name,
          website: company.website,
          description: company.description,
          location: formatLocation(company),
          primaryCategory: company.primaryCategory,
          phase,
          phaseLabel: phaseLabel(phase),
          column,
          openOpportunityCount: company.opportunities.length,
          openOpportunities: company.opportunities.map((opportunity) => ({
            id: opportunity.id,
            title: opportunity.title,
            stage: opportunity.stage,
            likelihoodPercent: opportunity.likelihoodPercent
          })),
          intakeScheduledAt: company.pipeline?.intakeDecisionAt ?? company.intakeScheduledAt,
          declineReason: company.declineReason,
          leadSource:
            company.leadSourceType === "HEALTH_SYSTEM"
              ? company.leadSourceHealthSystem?.name || ""
              : company.leadSourceOther || "",
          nextStep: company.pipeline?.nextStep || "",
          nextStepDueAt: company.pipeline?.nextStepDueAt ?? null,
          ownerName: company.pipeline?.ownerName || "",
          companyCategory: company.pipeline?.category || "ACTIVE",
          intakeStage: company.pipeline?.intakeStage || "RECEIVED",
          closedOutcome: company.pipeline?.closedOutcome ?? null,
          stageChangedAt,
          timeInStageDays,
          staleLevel,
          raiseRoundLabel: fundraiseSummary.raiseRoundLabel,
          raiseAmountUsd: fundraiseSummary.raiseAmountUsd,
          lastMeaningfulActivityAt: company.pipeline?.lastMeaningfulActivityAt ?? null,
          ventureStudioContractExecutedAt: company.pipeline?.ventureStudioContractExecutedAt ?? null,
          screeningWebinarDate1At: company.pipeline?.screeningWebinarDate1At ?? null,
          screeningWebinarDate2At: company.pipeline?.screeningWebinarDate2At ?? null,
          ventureLikelihoodPercent: company.pipeline?.ventureLikelihoodPercent ?? null,
          ventureExpectedCloseDate: company.pipeline?.ventureExpectedCloseDate ?? null,
          noteCount: companyNotes.length,
          latestNote: companyNotes[0]
            ? {
                id: companyNotes[0].id,
                note: companyNotes[0].note,
                createdAt: companyNotes[0].createdAt,
                createdByName:
                  companyNotes[0].createdByName ||
                  companyNotes[0].createdByUser?.name ||
                  companyNotes[0].createdByUser?.email ||
                  "Unknown user"
              }
            : null,
          updatedAt: company.pipeline?.updatedAt || company.updatedAt
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    const opportunities = pipelineEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry && entry.column && entry.companyCategory === "ACTIVE"));
    const inactiveOpportunities = pipelineEntries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry) && (!entry.column || entry.companyCategory !== "ACTIVE"));

    return NextResponse.json({
      companyType,
      opportunities,
      inactiveOpportunities,
      healthSystems
    });
  } catch (error) {
    console.error("list_pipeline_opportunities_error", error);
    return NextResponse.json({ error: "Failed to load pipeline opportunities" }, { status: 400 });
  }
}
