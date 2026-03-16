import Link from "next/link";
import { HomeNarrativeChanges } from "@/components/home-narrative-changes";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import {
  inferDefaultPhaseFromCompany,
  mapPhaseToBoardColumn,
  type PipelineBoardColumn,
  type PipelineCompanyType,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

const LOOKBACK_DAYS = 14;
const MAX_TIMELINE_EVENTS = 90;
const DISPLAY_TIME_ZONE = "America/Denver";
const STALE_STAGE_DAYS = 30;
const DUE_SOON_DAYS = 7;
const FORECAST_LOOKAHEAD_DAYS = 60;
const HIGH_CONFIDENCE_LIKELIHOOD = 70;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const SECTION_ORDER: Array<{ type: PipelineCompanyType; label: string }> = [
  { type: "STARTUP", label: "Startup" },
  { type: "SPIN_OUT", label: "Spin-out" },
  { type: "DENOVO", label: "DeNovo" }
];

const STAGE_ORDER: PipelineBoardColumn[] = [
  "INTAKE",
  "VENTURE_STUDIO_CONTRACT_EVALUATION",
  "SCREENING",
  "COMMERCIAL_ACCELERATION"
];

const STAGE_LABELS: Record<PipelineBoardColumn, string> = {
  INTAKE: "Intake",
  VENTURE_STUDIO_CONTRACT_EVALUATION: "Venture Studio Evaluation",
  SCREENING: "Screening",
  COMMERCIAL_ACCELERATION: "Commercial Acceleration"
};

const PIPELINE_LABELS: Record<PipelineCompanyType, string> = {
  STARTUP: "Startup",
  SPIN_OUT: "Spin-out",
  DENOVO: "DeNovo"
};

const PIPELINE_BADGE_CLASS: Record<PipelineCompanyType, string> = {
  STARTUP: "startup",
  SPIN_OUT: "spinout",
  DENOVO: "denovo"
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric"
});

const TIMESTAMP_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: DISPLAY_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

type ActivityEvent = {
  id: string;
  timestamp: Date;
  actorNames: string[];
  narrative: string;
  kind: "ENTRY" | "MOMENTUM" | "OPPORTUNITY" | "NOTE" | "SCREENING";
  pipelineType: PipelineCompanyType;
  shouldPrefixActor: boolean;
  opportunityTarget: {
    companyId: string;
    opportunityId: string;
  } | null;
};

type StageSummary = Record<PipelineBoardColumn, number>;

type PipelineSectionData = {
  summary: StageSummary;
  events: ActivityEvent[];
};

type CompanyOpportunitySummary = {
  id: string;
  companyId: string;
  title: string;
  type: string;
  healthSystemId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type ActiveCompanySnapshot = {
  id: string;
  name: string;
  pipelineType: PipelineCompanyType;
  boardColumn: PipelineBoardColumn;
  stageChangedAt: Date | null;
  ownerName: string | null;
  nextStepDueAt: Date | null;
  ventureLikelihoodPercent: number | null;
  ventureExpectedCloseDate: Date | null;
};

function displayRoles(roles: string[]) {
  if (roles.length === 0) return "No roles assigned";
  return roles.join(", ");
}

function createEmptyStageSummary(): StageSummary {
  return {
    INTAKE: 0,
    VENTURE_STUDIO_CONTRACT_EVALUATION: 0,
    SCREENING: 0,
    COMMERCIAL_ACCELERATION: 0
  };
}

function createEmptySectionData(): PipelineSectionData {
  return {
    summary: createEmptyStageSummary(),
    events: []
  };
}

function normalizeCompanyType(value: string): PipelineCompanyType {
  if (value === "SPIN_OUT" || value === "DENOVO") return value;
  return "STARTUP";
}

function resolveActorName(
  explicitName: string | null | undefined,
  user: { name: string | null; email: string } | null | undefined
) {
  const isPlaceholderActorName = (value: string) => value.toLowerCase() === "system";
  const fromExplicit = (explicitName || "").trim();
  if (fromExplicit && !isPlaceholderActorName(fromExplicit)) return fromExplicit;
  const fromUserName = (user?.name || "").trim();
  if (fromUserName) return fromUserName;
  const fromUserEmail = (user?.email || "").trim();
  return fromUserEmail || null;
}

function stripRichText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength = 170) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function stageNameForPhase(phase: PipelinePhase) {
  const boardColumn = mapPhaseToBoardColumn(phase);
  if (!boardColumn) return "Declined";
  return STAGE_LABELS[boardColumn];
}

function opportunityNarrativeLabel(opportunityType: string) {
  if (opportunityType === "VENTURE_STUDIO_SERVICES" || opportunityType === "S1_TERM_SHEET") {
    return "venture studio opportunity";
  }
  return "health system opportunity";
}

function parseNoteAffiliations(raw: unknown) {
  if (!Array.isArray(raw)) return [];

  const affiliations: Array<{ kind: "company" | "healthSystem" | "contact" | "opportunity"; id: string; label: string }> = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const typed = entry as { kind?: unknown; id?: unknown; label?: unknown };
    const kind = typeof typed.kind === "string" ? typed.kind : "";
    const id = typeof typed.id === "string" ? typed.id.trim() : "";
    const label = typeof typed.label === "string" ? typed.label.trim() : "";
    if (!id || !label) continue;
    if (kind !== "company" && kind !== "healthSystem" && kind !== "contact" && kind !== "opportunity") {
      continue;
    }
    const key = `${kind}:${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    affiliations.push({
      kind,
      id,
      label
    });
  }

  return affiliations;
}

function addActorName(activityMap: Map<string, Set<string>>, activityKey: string, actorName: string | null) {
  if (!actorName) return;
  const existing = activityMap.get(activityKey);
  if (existing) {
    existing.add(actorName);
    return;
  }
  activityMap.set(activityKey, new Set([actorName]));
}

function sortedActorNames(actorNames: Set<string> | undefined) {
  if (!actorNames) return [];
  return Array.from(actorNames).sort((left, right) => left.localeCompare(right));
}

function progressPercentForSection(summary: StageSummary) {
  const total = STAGE_ORDER.reduce((count, stage) => count + summary[stage], 0);
  if (total === 0) return 0;
  const beyondIntake =
    summary.VENTURE_STUDIO_CONTRACT_EVALUATION + summary.SCREENING + summary.COMMERCIAL_ACCELERATION;
  return Math.round((beyondIntake / total) * 100);
}

function pacePerDay(value: number) {
  return (value / LOOKBACK_DAYS).toFixed(1);
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function daysSince(date: Date, now: Date) {
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / MS_PER_DAY));
}

function isDueWithinDays(target: Date | null | undefined, now: Date, days: number) {
  if (!target) return false;
  const delta = target.getTime() - now.getTime();
  return delta >= 0 && delta <= days * MS_PER_DAY;
}

function isOverdue(target: Date | null | undefined, now: Date) {
  return Boolean(target && target.getTime() < now.getTime());
}

function kindLabel(kind: ActivityEvent["kind"]) {
  if (kind === "ENTRY") return "New Entrant";
  if (kind === "MOMENTUM") return "Momentum";
  if (kind === "OPPORTUNITY") return "Opportunity";
  if (kind === "NOTE") return "Narrative";
  return "Screening";
}

function kindClass(kind: ActivityEvent["kind"]) {
  if (kind === "ENTRY") return "entry";
  if (kind === "MOMENTUM") return "momentum";
  if (kind === "OPPORTUNITY") return "opportunity";
  if (kind === "NOTE") return "note";
  return "screening";
}

export default async function HomePage() {
  const now = new Date();
  const lookbackStart = new Date(now);
  lookbackStart.setDate(lookbackStart.getDate() - LOOKBACK_DAYS);

  const [user, companies] = await Promise.all([
    getCurrentUser(),
    prisma.company.findMany({
      select: {
        id: true,
        name: true,
        companyType: true,
        intakeStatus: true,
        declineReason: true,
        createdAt: true,
        pipeline: {
          select: {
            phase: true,
            stageChangedAt: true,
            ownerName: true,
            nextStepDueAt: true,
            ventureLikelihoodPercent: true,
            ventureExpectedCloseDate: true,
            createdAt: true,
            updatedAt: true
          }
        }
      },
      orderBy: [{ name: "asc" }]
    })
  ]);

  const companyById = new Map(companies.map((company) => [company.id, company] as const));
  const companyIds = companies.map((company) => company.id);

  const [rawCompanyOpportunities, recentNotes, recentScreeningChanges] = companyIds.length
    ? await Promise.all([
        prisma.companyOpportunity.findMany({
          where: {
            companyId: { in: companyIds }
          },
          select: {
            id: true,
            companyId: true,
            title: true,
            type: true,
            healthSystemId: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
        }),
        prisma.entityNote.findMany({
          where: {
            entityKind: "COMPANY",
            entityId: { in: companyIds },
            createdAt: { gte: lookbackStart }
          },
          select: {
            id: true,
            entityId: true,
            note: true,
            affiliations: true,
            createdAt: true,
            createdByName: true,
            createdByUser: {
              select: {
                name: true,
                email: true
              }
            }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        }),
        prisma.companyScreeningCellChange.findMany({
          where: {
            companyId: { in: companyIds },
            createdAt: { gte: lookbackStart }
          },
          select: {
            id: true,
            companyId: true,
            healthSystemId: true,
            field: true,
            value: true,
            createdAt: true,
            changedByName: true,
            changedByUser: {
              select: {
                name: true,
                email: true
              }
            },
            healthSystem: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        })
      ])
    : [[], [], []];

  const companyOpportunities: CompanyOpportunitySummary[] = rawCompanyOpportunities;

  const sectionDataByType: Record<PipelineCompanyType, PipelineSectionData> = {
    STARTUP: createEmptySectionData(),
    SPIN_OUT: createEmptySectionData(),
    DENOVO: createEmptySectionData()
  };

  const opportunitiesByCompanyId = new Map<string, CompanyOpportunitySummary[]>();
  const opportunityById = new Map<string, CompanyOpportunitySummary>();
  const latestScreeningOpportunityByCompanyHealthSystem = new Map<string, CompanyOpportunitySummary>();
  const activeCompanySnapshots: ActiveCompanySnapshot[] = [];

  for (const opportunity of companyOpportunities) {
    const existing = opportunitiesByCompanyId.get(opportunity.companyId);
    if (existing) {
      existing.push(opportunity);
    } else {
      opportunitiesByCompanyId.set(opportunity.companyId, [opportunity]);
    }
    opportunityById.set(opportunity.id, opportunity);

    if (!opportunity.healthSystemId || opportunity.type !== "SCREENING_LOI") continue;
    const key = `${opportunity.companyId}:${opportunity.healthSystemId}`;
    const current = latestScreeningOpportunityByCompanyHealthSystem.get(key);
    if (!current || opportunity.updatedAt > current.updatedAt) {
      latestScreeningOpportunityByCompanyHealthSystem.set(key, opportunity);
    }
  }

  const opportunityActorNamesById = new Map<string, Set<string>>();

  for (const company of companies) {
    const companyType = normalizeCompanyType(company.companyType);
    const section = sectionDataByType[companyType];
    const phase = (company.pipeline?.phase || inferDefaultPhaseFromCompany(company)) as PipelinePhase;
    const currentStageName = stageNameForPhase(phase);
    const boardColumn = mapPhaseToBoardColumn(phase);

    if (boardColumn) {
      section.summary[boardColumn] += 1;
      activeCompanySnapshots.push({
        id: company.id,
        name: company.name,
        pipelineType: companyType,
        boardColumn,
        stageChangedAt: company.pipeline?.stageChangedAt ?? null,
        ownerName: company.pipeline?.ownerName ?? null,
        nextStepDueAt: company.pipeline?.nextStepDueAt ?? null,
        ventureLikelihoodPercent: company.pipeline?.ventureLikelihoodPercent ?? null,
        ventureExpectedCloseDate: company.pipeline?.ventureExpectedCloseDate ?? null
      });
    }

    if (company.createdAt >= lookbackStart) {
      section.events.push({
        id: `company-created-${company.id}`,
        timestamp: company.createdAt,
        actorNames: [],
        narrative: `${company.name} entered the pipeline in ${currentStageName}.`,
        kind: "ENTRY",
        pipelineType: companyType,
        shouldPrefixActor: false,
        opportunityTarget: null
      });
    }

    if (company.pipeline?.updatedAt && company.pipeline.updatedAt >= lookbackStart) {
      const isNewPipelineRecord = company.pipeline.createdAt.getTime() === company.pipeline.updatedAt.getTime();
      if (!isNewPipelineRecord || company.pipeline.createdAt < lookbackStart) {
        section.events.push({
          id: `pipeline-updated-${company.id}`,
          timestamp: company.pipeline.updatedAt,
          actorNames: [],
          narrative: `${company.name} showed pipeline momentum and is currently in ${currentStageName}.`,
          kind: "MOMENTUM",
          pipelineType: companyType,
          shouldPrefixActor: false,
          opportunityTarget: null
        });
      }
    }

  }

  for (const note of recentNotes) {
    const company = companyById.get(note.entityId);
    if (!company) continue;
    const companyType = normalizeCompanyType(company.companyType);
    const actorName = resolveActorName(note.createdByName, note.createdByUser);
    const noteAffiliations = parseNoteAffiliations(note.affiliations);
    const opportunityAffiliations = noteAffiliations
      .filter((entry) => entry.kind === "opportunity")
      .map((entry) => opportunityById.get(entry.id))
      .filter((entry): entry is CompanyOpportunitySummary => Boolean(entry));
    for (const opportunity of opportunityAffiliations) {
      addActorName(opportunityActorNamesById, opportunity.id, actorName);
    }
    const noteSnippet = truncate(stripRichText(note.note));
    const narrative = noteSnippet
      ? `captured a note on ${company.name}: "${noteSnippet}".`
      : `captured a note on ${company.name}.`;
    const noteOpportunity =
      opportunityAffiliations.length === 1
        ? {
            companyId: opportunityAffiliations[0].companyId,
            opportunityId: opportunityAffiliations[0].id
          }
        : null;
    sectionDataByType[companyType].events.push({
      id: `note-${note.id}`,
      timestamp: note.createdAt,
      actorNames: actorName ? [actorName] : [],
      narrative,
      kind: "NOTE",
      pipelineType: companyType,
      shouldPrefixActor: true,
      opportunityTarget: noteOpportunity
    });
  }

  for (const change of recentScreeningChanges) {
    const company = companyById.get(change.companyId);
    if (!company) continue;
    const companyType = normalizeCompanyType(company.companyType);
    const actorName = resolveActorName(change.changedByName, change.changedByUser);
    const screeningOpportunity = change.healthSystemId
      ? latestScreeningOpportunityByCompanyHealthSystem.get(`${change.companyId}:${change.healthSystemId}`)
      : null;
    if (screeningOpportunity) {
      addActorName(opportunityActorNamesById, screeningOpportunity.id, actorName);
    }
    const fieldLabel =
      change.field === "STATUS_UPDATE"
        ? "status update"
        : change.field === "MEMBER_FEEDBACK_STATUS"
          ? "member feedback/status"
          : "relevant feedback";
    const valueSnippet = truncate(stripRichText(change.value), 140);
    const scopeLabel = change.healthSystem?.name
      ? `${company.name} (${change.healthSystem.name})`
      : company.name;

    sectionDataByType[companyType].events.push({
      id: `screening-change-${change.id}`,
      timestamp: change.createdAt,
      actorNames: actorName ? [actorName] : [],
      narrative: valueSnippet
        ? `updated ${fieldLabel} for ${scopeLabel}: "${valueSnippet}".`
        : `updated ${fieldLabel} for ${scopeLabel}.`,
      kind: "SCREENING",
      pipelineType: companyType,
      shouldPrefixActor: true,
      opportunityTarget: screeningOpportunity
        ? {
            companyId: change.companyId,
            opportunityId: screeningOpportunity.id
          }
        : null
    });
  }

  for (const company of companies) {
    const companyType = normalizeCompanyType(company.companyType);
    const section = sectionDataByType[companyType];

    for (const opportunity of opportunitiesByCompanyId.get(company.id) || []) {
      if (opportunity.createdAt >= lookbackStart) {
        const label = opportunityNarrativeLabel(opportunity.type);
        section.events.push({
          id: `opportunity-created-${opportunity.id}`,
          timestamp: opportunity.createdAt,
          actorNames: sortedActorNames(opportunityActorNamesById.get(opportunity.id)),
          narrative: `A new ${label} was added for ${company.name} (${opportunity.title}).`,
          kind: "OPPORTUNITY",
          pipelineType: companyType,
          shouldPrefixActor: false,
          opportunityTarget: {
            companyId: company.id,
            opportunityId: opportunity.id
          }
        });
        continue;
      }

      if (opportunity.updatedAt >= lookbackStart) {
        const label = opportunityNarrativeLabel(opportunity.type);
        section.events.push({
          id: `opportunity-updated-${opportunity.id}`,
          timestamp: opportunity.updatedAt,
          actorNames: sortedActorNames(opportunityActorNamesById.get(opportunity.id)),
          narrative: `${company.name} advanced or updated one ${label} (${opportunity.title}).`,
          kind: "OPPORTUNITY",
          pipelineType: companyType,
          shouldPrefixActor: false,
          opportunityTarget: {
            companyId: company.id,
            opportunityId: opportunity.id
          }
        });
      }
    }
  }

  const sections = SECTION_ORDER.map((sectionMeta) => {
    const data = sectionDataByType[sectionMeta.type];
    const sortedEvents = [...data.events].sort((a, b) => {
      const delta = b.timestamp.getTime() - a.timestamp.getTime();
      if (delta !== 0) return delta;
      return a.id.localeCompare(b.id);
    });

    const contributorCounts = new Map<string, number>();
    for (const event of sortedEvents) {
      for (const actorName of event.actorNames) {
        contributorCounts.set(actorName, (contributorCounts.get(actorName) || 0) + 1);
      }
    }

    const contributors = Array.from(contributorCounts.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([name, count]) => ({ name, count }))
      .slice(0, 5);

    const activeOpportunityCount = STAGE_ORDER.reduce((total, stage) => total + data.summary[stage], 0);
    const newEntrants = sortedEvents.filter((event) => event.kind === "ENTRY").length;
    const momentumEvents = sortedEvents.filter((event) =>
      event.kind === "MOMENTUM" || event.kind === "OPPORTUNITY" || event.kind === "SCREENING"
    ).length;
    const attributedActions = sortedEvents.filter((event) => event.actorNames.length > 0).length;
    const notesCaptured = sortedEvents.filter((event) => event.kind === "NOTE").length;
    const progressPercent = progressPercentForSection(data.summary);
    const momentumScore = newEntrants * 4 + momentumEvents * 2 + attributedActions;

    return {
      ...sectionMeta,
      summary: data.summary,
      totalEvents: sortedEvents.length,
      events: sortedEvents,
      contributors,
      activeOpportunityCount,
      newEntrants,
      momentumEvents,
      attributedActions,
      notesCaptured,
      progressPercent,
      momentumScore
    };
  });

  const globalEvents = sections
    .flatMap((section) =>
      section.events.map((event) => ({
        ...event
      }))
    )
    .sort((a, b) => {
      const delta = b.timestamp.getTime() - a.timestamp.getTime();
      if (delta !== 0) return delta;
      return a.id.localeCompare(b.id);
    });

  const visibleGlobalEvents = globalEvents.slice(0, MAX_TIMELINE_EVENTS);

  const totals = sections.reduce(
    (accumulator, section) => {
      accumulator.active += section.activeOpportunityCount;
      accumulator.newEntrants += section.newEntrants;
      accumulator.momentum += section.momentumEvents;
      accumulator.attributed += section.attributedActions;
      accumulator.notes += section.notesCaptured;
      accumulator.score += section.momentumScore;
      return accumulator;
    },
    {
      active: 0,
      newEntrants: 0,
      momentum: 0,
      attributed: 0,
      notes: 0,
      score: 0
    }
  );

  const aggregateSummary = sections.reduce(
    (summary, section) => {
      for (const stage of STAGE_ORDER) {
        summary[stage] += section.summary[stage];
      }
      return summary;
    },
    createEmptyStageSummary()
  );

  const overallProgressPercent = progressPercentForSection(aggregateSummary);
  const productivityPace = pacePerDay(totals.newEntrants + totals.momentum);
  const leadingSection = sections.reduce((best, section) => {
    if (section.momentumScore !== best.momentumScore) {
      return section.momentumScore > best.momentumScore ? section : best;
    }
    if (section.totalEvents !== best.totalEvents) {
      return section.totalEvents > best.totalEvents ? section : best;
    }
    return section.activeOpportunityCount > best.activeOpportunityCount ? section : best;
  }, sections[0]!);
  const largestStage = STAGE_ORDER.reduce(
    (best, stage) => {
      const count = aggregateSummary[stage];
      if (count > best.count) return { stage, count };
      return best;
    },
    { stage: STAGE_ORDER[0], count: aggregateSummary[STAGE_ORDER[0]] }
  );
  const maxAggregateStageCount = Math.max(1, ...STAGE_ORDER.map((stage) => aggregateSummary[stage]));
  const activeCompanyCount = activeCompanySnapshots.length;
  const lateStageCount = aggregateSummary.SCREENING + aggregateSummary.COMMERCIAL_ACCELERATION;
  const lateStageShare = activeCompanyCount > 0 ? Math.round((lateStageCount / activeCompanyCount) * 100) : 0;
  const ownerCoverageCount = activeCompanySnapshots.filter((company) => company.ownerName?.trim()).length;
  const ownerCoveragePercent = activeCompanyCount > 0 ? Math.round((ownerCoverageCount / activeCompanyCount) * 100) : 0;
  const staleCompanyCount = activeCompanySnapshots.filter(
    (company) => company.stageChangedAt && daysSince(company.stageChangedAt, now) >= STALE_STAGE_DAYS
  ).length;
  const overdueNextStepCount = activeCompanySnapshots.filter((company) => isOverdue(company.nextStepDueAt, now)).length;
  const dueSoonNextStepCount = activeCompanySnapshots.filter((company) =>
    isDueWithinDays(company.nextStepDueAt, now, DUE_SOON_DAYS)
  ).length;
  const averageStageAgeDays =
    activeCompanySnapshots.length > 0
      ? Math.round(
          activeCompanySnapshots.reduce(
            (total, company) => total + (company.stageChangedAt ? daysSince(company.stageChangedAt, now) : 0),
            0
          ) / activeCompanySnapshots.length
        )
      : 0;
  const scoredCompanyLikelihoods = activeCompanySnapshots
    .map((company) => company.ventureLikelihoodPercent)
    .filter((value): value is number => typeof value === "number");
  const averageLikelihoodPercent =
    scoredCompanyLikelihoods.length > 0
      ? Math.round(scoredCompanyLikelihoods.reduce((sum, value) => sum + value, 0) / scoredCompanyLikelihoods.length)
      : null;
  const nearTermPipelineCompanies = activeCompanySnapshots.filter((company) =>
    isDueWithinDays(company.ventureExpectedCloseDate, now, FORECAST_LOOKAHEAD_DAYS)
  );
  const highConfidenceNearTermPipelineCompanies = nearTermPipelineCompanies.filter(
    (company) => (company.ventureLikelihoodPercent ?? 0) >= HIGH_CONFIDENCE_LIKELIHOOD
  );
  const executiveNarrative =
    activeCompanyCount === 0
      ? `No active companies are sitting in the tracked venture pipeline stages for this ${LOOKBACK_DAYS}-day window yet.`
      : `${pluralize(totals.newEntrants, "new company")} entered the pipeline and ${pluralize(
          totals.momentum,
          "momentum event"
        )} were captured over the last ${LOOKBACK_DAYS} days. ${overallProgressPercent}% of ${pluralize(
          activeCompanyCount,
          "active company",
          "active companies"
        )} are beyond Intake, with ${leadingSection.label} generating the most recent movement and ${
          STAGE_LABELS[largestStage.stage]
        } holding the deepest concentration of active work (${largestStage.count}).`;
  const executiveHighlights = [
    {
      label: "Pipeline mix",
      value: `${largestStage.count} in ${STAGE_LABELS[largestStage.stage]}`,
      description: `${lateStageCount} companies are already in Screening or Commercial Acceleration (${lateStageShare}% of the active pipeline).`
    },
    {
      label: "Pipeline Hygiene",
      value: `${ownerCoveragePercent}% owner coverage`,
      description:
        overdueNextStepCount > 0 || staleCompanyCount > 0
          ? `${overdueNextStepCount} overdue next steps and ${staleCompanyCount} companies sitting in the same stage for ${STALE_STAGE_DAYS}+ days.`
          : `No overdue next steps and no companies stalled in the same stage for ${STALE_STAGE_DAYS}+ days.`
    },
    {
      label: "Forecast readiness",
      value:
        averageLikelihoodPercent === null
          ? "No forecast scores"
          : `${averageLikelihoodPercent}% avg likelihood`,
      description:
        nearTermPipelineCompanies.length > 0
          ? `${highConfidenceNearTermPipelineCompanies.length} of ${nearTermPipelineCompanies.length} companies forecasted inside ${FORECAST_LOOKAHEAD_DAYS} days are at ${HIGH_CONFIDENCE_LIKELIHOOD}%+ likelihood.`
          : `No venture expected-close dates are populated inside the next ${FORECAST_LOOKAHEAD_DAYS} days yet.`
    }
  ];

  return (
    <main className="home-pipeline-page">
      <section className="panel home-pipeline-hero">
        <div className="home-pipeline-hero-top">
          <div>
            <h1>Pipeline Productivity Dashboard</h1>
            <p className="muted">
              Window: <strong>{DATE_FORMATTER.format(lookbackStart)}</strong> to{" "}
              <strong>{DATE_FORMATTER.format(now)}</strong> ({DISPLAY_TIME_ZONE}).
            </p>
            <p className="muted">
              Focused on momentum: new entrants, advancement activity, and user-attributed changes across Startup,
              Spin-out, and DeNovo.
            </p>
            {user ? (
              <p className="muted">
                Signed in as <strong>{user.name || user.email}</strong> with roles:{" "}
                <strong>{displayRoles(user.roles)}</strong>
              </p>
            ) : null}
          </div>

          <div className="home-pipeline-progress-card">
            <p className="home-progress-caption">Overall Pipeline Progress</p>
            <p className="home-progress-value">{overallProgressPercent}% beyond Intake</p>
            <div className="home-progress-track">
              <span style={{ width: `${overallProgressPercent}%` }} />
            </div>
            <p className="muted">{totals.active} active pipeline companies currently in venture studio stages.</p>
          </div>
        </div>

        <div className="home-kpi-grid">
          <article className="home-kpi-card">
            <p className="home-kpi-label">New Pipeline Entrants</p>
            <p className="home-kpi-value">{totals.newEntrants}</p>
            <p className="muted">{pacePerDay(totals.newEntrants)} per day over the last two weeks.</p>
          </article>
          <article className="home-kpi-card">
            <p className="home-kpi-label">Momentum Events</p>
            <p className="home-kpi-value">{totals.momentum}</p>
            <p className="muted">{productivityPace} momentum actions per day.</p>
          </article>
          <article className="home-kpi-card">
            <p className="home-kpi-label">User-Attributed Actions</p>
            <p className="home-kpi-value">{totals.attributed}</p>
            <p className="muted">
              Updates with a visible actor in activity history. Narratives captured: {totals.notes}.
            </p>
          </article>
          <article className="home-kpi-card">
            <p className="home-kpi-label">Productivity Score</p>
            <p className="home-kpi-value">{totals.score}</p>
            <p className="muted">Weighted from entrants, movement, and attributed activity.</p>
          </article>
        </div>
      </section>

      <section className="home-executive-grid">
        <article className="panel home-executive-brief">
          <header className="home-executive-header">
            <div>
              <p className="home-progress-caption">Executive Snapshot</p>
              <h2>Pipeline narrative, stage health, and forecast readiness</h2>
            </div>
            <p className="muted">Designed to read like the summary you would send manually, but generated directly from live pipeline data.</p>
          </header>

          <p className="home-executive-summary">{executiveNarrative}</p>

          <div className="home-executive-callout-grid">
            {executiveHighlights.map((highlight) => (
              <article key={highlight.label} className="home-executive-callout">
                <p className="home-kpi-label">{highlight.label}</p>
                <p className="home-executive-callout-value">{highlight.value}</p>
                <p className="muted">{highlight.description}</p>
              </article>
            ))}
          </div>

          <div className="home-executive-stage-band">
            {STAGE_ORDER.map((stage) => (
              <article key={stage} className="home-executive-stage-card">
                <div className="home-executive-stage-head">
                  <p className="home-executive-stage-label">{STAGE_LABELS[stage]}</p>
                  <p className="home-executive-stage-value">{aggregateSummary[stage]}</p>
                </div>
                <div className="home-executive-stage-meter">
                  <span style={{ width: `${(aggregateSummary[stage] / maxAggregateStageCount) * 100}%` }} />
                </div>
              </article>
            ))}
          </div>

          <p className="muted home-executive-footer">
            Average stage age: {averageStageAgeDays} days. Next steps due within {DUE_SOON_DAYS} days: {dueSoonNextStepCount}.
          </p>
        </article>
      </section>

      <div className="home-pipeline-shell">
        <section className="home-pipeline-left">
          {sections.map((section) => (
            <Link
              key={section.type}
              href={`/pipeline?companyType=${section.type}`}
              className="home-pipeline-section-link"
              aria-label={`Open ${section.label} pipeline`}
            >
              <article
                className="panel home-pipeline-section"
                data-pipeline={section.type}
              >
                <header className="home-pipeline-section-header">
                  <div>
                    <h2>{section.label}</h2>
                    <p className="muted">
                      {section.activeOpportunityCount} active pipeline companies, {section.totalEvents} tracked updates
                    </p>
                  </div>

                  <div className="home-pipeline-metric-chips">
                    <span className="home-chip">New entrants: {section.newEntrants}</span>
                    <span className="home-chip">Momentum: {section.momentumEvents}</span>
                    <span className="home-chip">User-attributed: {section.attributedActions}</span>
                    <span className="home-chip">Narratives: {section.notesCaptured}</span>
                  </div>
                </header>

                <div className="home-pipeline-summary-grid">
                  {STAGE_ORDER.map((stage) => (
                    <article key={stage} className="home-pipeline-stage-card">
                      <p className="home-pipeline-stage-label">{STAGE_LABELS[stage]}</p>
                      <p className="home-pipeline-stage-value">{section.summary[stage]}</p>
                    </article>
                  ))}
                </div>

                <div className="home-pipeline-progress-row">
                  <div className="home-progress-head">
                    <p className="home-progress-caption">Progress through pipeline</p>
                    <p className="home-progress-value">{section.progressPercent}% beyond Intake</p>
                  </div>
                  <div className="home-progress-track">
                    <span style={{ width: `${section.progressPercent}%` }} />
                  </div>
                </div>

                <p className="muted home-pipeline-contributors">
                  {section.contributors.length > 0
                    ? `Top contributors: ${section.contributors
                        .map((entry) => `${entry.name} (${entry.count})`)
                        .join(", ")}`
                    : "Top contributors: No attributed user activity captured in this window."}
                </p>
              </article>
            </Link>
          ))}
        </section>

        <HomeNarrativeChanges
          events={visibleGlobalEvents.map((event) => ({
            id: event.id,
            actorNames: event.actorNames,
            kindLabel: kindLabel(event.kind),
            kindClass: kindClass(event.kind),
            narrative: event.narrative,
            pipelineBadgeClass: PIPELINE_BADGE_CLASS[event.pipelineType],
            pipelineLabel: PIPELINE_LABELS[event.pipelineType],
            shouldPrefixActor: event.shouldPrefixActor,
            timestampIso: event.timestamp.toISOString(),
            timestampLabel: TIMESTAMP_FORMATTER.format(event.timestamp),
            opportunityTarget: event.opportunityTarget
          }))}
          totalCount={globalEvents.length}
        />
      </div>
    </main>
  );
}
