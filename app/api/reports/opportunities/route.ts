import { NextResponse } from "next/server";
import { type CompanyOpportunityStage, type CompanyOpportunityType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { parseDateInput } from "@/lib/date-parse";
import { inferDefaultPhaseFromCompany } from "@/lib/pipeline-opportunities";

const CLOSED_STAGES: CompanyOpportunityStage[] = ["CLOSED_WON", "CLOSED_LOST"];
const VALID_TYPES: CompanyOpportunityType[] = [
  "SCREENING_LOI",
  "VENTURE_STUDIO_SERVICES",
  "S1_TERM_SHEET",
  "COMMERCIAL_CONTRACT",
  "PROSPECT_PURSUIT"
];
const VALID_STAGES: CompanyOpportunityStage[] = [
  "IDENTIFIED",
  "QUALIFICATION",
  "PROPOSAL",
  "NEGOTIATION",
  "LEGAL",
  "CLOSED_WON",
  "CLOSED_LOST",
  "ON_HOLD"
];

type PresetKey =
  | "open_intake"
  | "closed_intake"
  | "open_screening"
  | "closed_screening"
  | "open_commercial_acceleration"
  | "closed_commercial_acceleration";

type PresetConfig = {
  key: PresetKey;
  name: string;
  description: string;
  defaults: {
    status: "open" | "closed";
    types: string[];
  };
};

type ReportRow = {
  id: string;
  sourceKind: "OPPORTUNITY" | "INTAKE_COMPANY";
  opportunityId: string | null;
  title: string;
  type: string;
  stage: CompanyOpportunityStage;
  company: {
    id: string;
    name: string;
  };
  declineReason: string | null;
  declineReasonOther: string | null;
  healthSystem: {
    id: string;
    name: string;
  } | null;
  likelihoodPercent: number | null;
  contractPriceUsd: number | null;
  durationDays: number;
  nextSteps: string | null;
  notes: string | null;
  closeReason: string | null;
  estimatedCloseDate: Date | null;
  closedAt: Date | null;
  contactCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const presetConfigs: PresetConfig[] = [
  {
    key: "open_intake",
    name: "Open Intake Opportunities",
    description: "Intake-phase opportunities that are not closed.",
    defaults: {
      status: "open",
      types: ["PROSPECT_PURSUIT"]
    }
  },
  {
    key: "closed_intake",
    name: "Closed Intake Opportunities",
    description: "Intake-phase opportunities that were won or lost.",
    defaults: {
      status: "closed",
      types: ["PROSPECT_PURSUIT"]
    }
  },
  {
    key: "open_screening",
    name: "Open Screening Opportunities",
    description: "Screening-phase LOI opportunities that are not closed.",
    defaults: {
      status: "open",
      types: ["SCREENING_LOI"]
    }
  },
  {
    key: "closed_screening",
    name: "Closed Screening Opportunities",
    description: "Screening-phase LOI opportunities that were won or lost.",
    defaults: {
      status: "closed",
      types: ["SCREENING_LOI"]
    }
  },
  {
    key: "open_commercial_acceleration",
    name: "Open Commercial Acceleration Opportunities",
    description: "Commercial contract opportunities that are not closed.",
    defaults: {
      status: "open",
      types: ["COMMERCIAL_CONTRACT"]
    }
  },
  {
    key: "closed_commercial_acceleration",
    name: "Closed Commercial Acceleration Opportunities",
    description: "Commercial contract opportunities that were won or lost.",
    defaults: {
      status: "closed",
      types: ["COMMERCIAL_CONTRACT"]
    }
  }
];

function splitCsv(value: string | null) {
  if (!value) return [] as string[];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTypes(values: string[]) {
  const set = new Set<CompanyOpportunityType>();
  for (const value of values) {
    if (VALID_TYPES.includes(value as CompanyOpportunityType)) {
      set.add(value as CompanyOpportunityType);
    }
  }
  return Array.from(set);
}

function parseStages(values: string[]) {
  const set = new Set<CompanyOpportunityStage>();
  for (const value of values) {
    if (VALID_STAGES.includes(value as CompanyOpportunityStage)) {
      set.add(value as CompanyOpportunityStage);
    }
  }
  return Array.from(set);
}

function toNullableDate(value: string | null, inclusiveEnd = false) {
  const parsed = parseDateInput(value);
  if (!parsed) return null;
  if (!inclusiveEnd) return parsed;
  parsed.setHours(23, 59, 59, 999);
  return parsed;
}

function computeDurationDays(createdAt: Date, closedAt: Date | null) {
  const startMs = createdAt.getTime();
  const endMs = (closedAt || new Date()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
}

function toNumber(value: { toString(): string } | null) {
  return value ? Number(value.toString()) : null;
}

function mapIntakePhaseToReportStage(phase: string): CompanyOpportunityStage {
  if (phase === "DECLINED") return "CLOSED_LOST";
  if (phase === "INTAKE") return "QUALIFICATION";
  return "CLOSED_WON";
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const presetKey = params.get("preset") as PresetKey | null;
    const preset = presetConfigs.find((entry) => entry.key === presetKey) || null;

    const selectedStatus =
      (params.get("status") as "open" | "closed" | "all" | null) ||
      (preset ? preset.defaults.status : "all");

    const selectedTypes = (() => {
      const fromQuery = parseTypes(splitCsv(params.get("types")));
      if (fromQuery.length > 0) return fromQuery;
      return preset ? parseTypes(preset.defaults.types) : [];
    })();

    const companyIds = splitCsv(params.get("companyIds"));
    const healthSystemIds = splitCsv(params.get("healthSystemIds"));
    const selectedStages = parseStages(splitCsv(params.get("stages")));
    const createdFrom = toNullableDate(params.get("createdFrom"), false);
    const createdTo = toNullableDate(params.get("createdTo"), true);
    const isIntakePreset = preset?.key === "open_intake" || preset?.key === "closed_intake";

    const where: Prisma.CompanyOpportunityWhereInput = {};

    if (companyIds.length > 0) {
      where.companyId = { in: companyIds };
    }
    if (healthSystemIds.length > 0) {
      where.healthSystemId = { in: healthSystemIds };
    }
    if (selectedTypes.length > 0) {
      where.type = { in: selectedTypes };
    }
    let stageInFilter: CompanyOpportunityStage[] | null = null;
    let stageNotInFilter: CompanyOpportunityStage[] | null = null;

    if (selectedStatus === "open") {
      stageNotInFilter = [...CLOSED_STAGES];
    } else if (selectedStatus === "closed") {
      stageInFilter = [...CLOSED_STAGES];
    }
    if (selectedStages.length > 0) {
      if (stageInFilter) {
        stageInFilter = stageInFilter.filter((stage) => selectedStages.includes(stage));
      } else if (stageNotInFilter) {
        stageInFilter = selectedStages.filter((stage) => !stageNotInFilter?.includes(stage));
        stageNotInFilter = null;
      } else {
        stageInFilter = selectedStages;
      }
    }
    if (stageInFilter) {
      where.stage = { in: stageInFilter };
    } else if (stageNotInFilter) {
      where.stage = { notIn: stageNotInFilter };
    }
    if (createdFrom || createdTo) {
      where.createdAt = {};
      if (createdFrom) where.createdAt.gte = createdFrom;
      if (createdTo) where.createdAt.lte = createdTo;
    }

    const reportInclude = {
      company: {
        select: {
          id: true,
          name: true,
          declineReason: true,
          declineReasonOther: true
        }
      },
      healthSystem: {
        select: {
          id: true,
          name: true
        }
      },
      contacts: {
        select: {
          id: true
        }
      }
    } satisfies Prisma.CompanyOpportunityInclude;

    const opportunities = await prisma.companyOpportunity.findMany({
      where,
      include: reportInclude,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    const companiesWithProspectOpportunity = new Set(
      opportunities
        .filter((entry) => entry.type === "PROSPECT_PURSUIT")
        .map((entry) => entry.companyId)
    );

    const rows: ReportRow[] = opportunities.map((entry) => ({
      id: entry.id,
      sourceKind: "OPPORTUNITY" as const,
      opportunityId: entry.id,
      title: entry.title,
      type: entry.type,
      stage: entry.stage,
      company: {
        id: entry.company.id,
        name: entry.company.name
      },
      declineReason: entry.company.declineReason,
      declineReasonOther: entry.company.declineReasonOther,
      healthSystem: entry.healthSystem
        ? {
            id: entry.healthSystem.id,
            name: entry.healthSystem.name
          }
        : null,
      likelihoodPercent: entry.likelihoodPercent,
      contractPriceUsd: toNumber(entry.contractPriceUsd),
      durationDays: computeDurationDays(entry.createdAt, entry.closedAt),
      nextSteps: entry.nextSteps,
      notes: entry.notes,
      closeReason: entry.closeReason,
      estimatedCloseDate: entry.estimatedCloseDate,
      closedAt: entry.closedAt,
      contactCount: entry.contacts.length,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    }));

    const includeIntakeCompanyRows =
      selectedTypes.includes("PROSPECT_PURSUIT") || (isIntakePreset && selectedTypes.length === 0);

    if (includeIntakeCompanyRows) {
      const companyWhere: Prisma.CompanyWhereInput = {};
      if (companyIds.length > 0) {
        companyWhere.id = { in: companyIds };
      }
      if (healthSystemIds.length > 0) {
        companyWhere.leadSourceHealthSystemId = { in: healthSystemIds };
      }
      if (createdFrom || createdTo) {
        companyWhere.createdAt = {};
        if (createdFrom) companyWhere.createdAt.gte = createdFrom;
        if (createdTo) companyWhere.createdAt.lte = createdTo;
      }

      const intakeCompanies = await prisma.company.findMany({
        where: companyWhere,
        include: {
          leadSourceHealthSystem: {
            select: {
              id: true,
              name: true
            }
          },
          pipeline: {
            select: {
              phase: true,
              intakeDecisionAt: true,
              intakeDecisionNotes: true,
              updatedAt: true
            }
          },
          _count: {
            select: {
              contactLinks: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      });

      const intakeRows = intakeCompanies
        .map((company) => {
          if (companiesWithProspectOpportunity.has(company.id)) return null;

          const phase =
            company.pipeline?.phase ||
            inferDefaultPhaseFromCompany({
              intakeStatus: company.intakeStatus,
              declineReason: company.declineReason
            });
          const isClosed = phase !== "INTAKE";

          if (selectedStatus === "open" && isClosed) return null;
          if (selectedStatus === "closed" && !isClosed) return null;

          const stage = mapIntakePhaseToReportStage(phase);
          if (selectedStages.length > 0 && !selectedStages.includes(stage)) return null;

          const closedAt = isClosed ? (company.pipeline?.intakeDecisionAt ?? company.updatedAt) : null;

          return {
            id: `intake_company_${company.id}`,
            sourceKind: "INTAKE_COMPANY" as const,
            opportunityId: null,
            title: "Intake Opportunity",
            type: "PROSPECT_PURSUIT",
            stage,
            company: {
              id: company.id,
              name: company.name
            },
            declineReason: company.declineReason,
            declineReasonOther: company.declineReasonOther,
            healthSystem: company.leadSourceHealthSystem
              ? {
                  id: company.leadSourceHealthSystem.id,
                  name: company.leadSourceHealthSystem.name
                }
              : null,
            likelihoodPercent: null,
            contractPriceUsd: null,
            durationDays: computeDurationDays(company.createdAt, closedAt),
            nextSteps: company.pipeline?.intakeDecisionNotes || null,
            notes: company.researchNotes,
            closeReason: null,
            estimatedCloseDate: company.intakeScheduledAt,
            closedAt,
            contactCount: company._count.contactLinks,
            createdAt: company.createdAt,
            updatedAt: company.pipeline?.updatedAt ?? company.updatedAt
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

      rows.push(...intakeRows);
    }

    const summary = {
      total: rows.length,
      openCount: rows.filter((entry) => !CLOSED_STAGES.includes(entry.stage)).length,
      closedCount: rows.filter((entry) => CLOSED_STAGES.includes(entry.stage)).length,
      wonCount: rows.filter((entry) => entry.stage === "CLOSED_WON").length,
      lostCount: rows.filter((entry) => entry.stage === "CLOSED_LOST").length
    };

    return NextResponse.json({
      preset: preset
        ? {
            key: preset.key,
            name: preset.name,
            description: preset.description
          }
        : null,
      presets: presetConfigs.map((config) => ({
        key: config.key,
        name: config.name,
        description: config.description,
        defaults: config.defaults
      })),
      filters: {
        status: selectedStatus,
        stages: selectedStages,
        types: selectedTypes,
        companyIds,
        healthSystemIds,
        createdFrom,
        createdTo
      },
      summary,
      rows
    });
  } catch (error) {
    console.error("list_opportunity_reports_error", error);
    return NextResponse.json({ error: "Failed to load opportunity report." }, { status: 400 });
  }
}
