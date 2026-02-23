import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  inferDefaultPhaseFromCompany,
  mapPhaseToBoardColumn,
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

export async function GET() {
  try {
    const [companies, healthSystems] = await Promise.all([
      prisma.company.findMany({
        include: {
          leadSourceHealthSystem: {
            select: {
              id: true,
              name: true
            }
          },
          pipeline: true,
          pipelineNotes: {
            orderBy: [{ createdAt: "desc" }],
            take: 1,
            select: {
              id: true,
              note: true,
              createdAt: true
            }
          },
          _count: {
            select: {
              pipelineNotes: true
            }
          },
          opportunities: {
            where: {
              stage: {
                notIn: ["CLOSED_WON", "CLOSED_LOST"]
              }
            },
            select: { id: true }
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

    const opportunities = companies
      .map((company) => {
        const phase = (company.pipeline?.phase || inferDefaultPhaseFromCompany(company)) as PipelinePhase;
        const column = mapPhaseToBoardColumn(phase);
        if (!column) return null;

        return {
          id: company.id,
          name: company.name,
          website: company.website,
          description: company.description,
          location: formatLocation(company),
          phase,
          phaseLabel: phaseLabel(phase),
          column,
          openOpportunityCount: company.opportunities.length,
          intakeScheduledAt: company.intakeScheduledAt,
          declineReason: company.declineReason,
          leadSource:
            company.leadSourceType === "HEALTH_SYSTEM"
              ? company.leadSourceHealthSystem?.name || ""
              : company.leadSourceOther || "",
          nextStep: company.pipeline?.nextStep || "",
          ventureLikelihoodPercent: company.pipeline?.ventureLikelihoodPercent ?? null,
          ventureExpectedCloseDate: company.pipeline?.ventureExpectedCloseDate ?? null,
          noteCount: company._count.pipelineNotes,
          latestNote: company.pipelineNotes[0]
            ? {
                id: company.pipelineNotes[0].id,
                note: company.pipelineNotes[0].note,
                createdAt: company.pipelineNotes[0].createdAt
              }
            : null,
          updatedAt: company.pipeline?.updatedAt || company.updatedAt
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

    return NextResponse.json({
      opportunities,
      healthSystems
    });
  } catch (error) {
    console.error("list_pipeline_opportunities_error", error);
    return NextResponse.json({ error: "Failed to load pipeline opportunities" }, { status: 400 });
  }
}
