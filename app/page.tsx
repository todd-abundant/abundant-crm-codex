import Link from "next/link";
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
  actorName: string | null;
  narrative: string;
  kind: "ENTRY" | "MOMENTUM" | "OPPORTUNITY" | "NOTE" | "SCREENING";
  pipelineType: PipelineCompanyType;
};

type StageSummary = Record<PipelineBoardColumn, number>;

type PipelineSectionData = {
  summary: StageSummary;
  events: ActivityEvent[];
};

type OpportunityEventGroup = {
  companyId: string;
  companyType: PipelineCompanyType;
  companyName: string;
  bucket: string;
  count: number;
  latestAt: Date;
  latestTitle: string;
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
  const fromExplicit = (explicitName || "").trim();
  if (fromExplicit) return fromExplicit;
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

function opportunityBucketLabel(opportunityType: string) {
  if (opportunityType === "SCREENING_LOI") return "screening";
  if (opportunityType === "COMMERCIAL_CONTRACT") return "commercial acceleration";
  if (opportunityType === "VENTURE_STUDIO_SERVICES" || opportunityType === "S1_TERM_SHEET") {
    return "venture studio evaluation";
  }
  if (opportunityType === "PROSPECT_PURSUIT") return "intake";
  return "pipeline";
}

function upsertOpportunityEventGroup(
  groups: Map<string, OpportunityEventGroup>,
  input: {
    companyId: string;
    companyType: PipelineCompanyType;
    companyName: string;
    bucket: string;
    eventAt: Date;
    title: string;
  }
) {
  const groupKey = `${input.companyId}:${input.bucket}`;
  const existing = groups.get(groupKey);
  if (existing) {
    existing.count += 1;
    if (input.eventAt > existing.latestAt) {
      existing.latestAt = input.eventAt;
      existing.latestTitle = input.title;
    }
    return;
  }

  groups.set(groupKey, {
    companyId: input.companyId,
    companyType: input.companyType,
    companyName: input.companyName,
    bucket: input.bucket,
    count: 1,
    latestAt: input.eventAt,
    latestTitle: input.title
  });
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
            createdAt: true,
            updatedAt: true
          }
        },
        opportunities: {
          where: {
            OR: [
              { createdAt: { gte: lookbackStart } },
              { updatedAt: { gte: lookbackStart } }
            ]
          },
          select: {
            id: true,
            title: true,
            type: true,
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

  const [recentNotes, recentScreeningChanges] = companyIds.length
    ? await Promise.all([
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
                name: true
              }
            }
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        })
      ])
    : [[], []];

  const sectionDataByType: Record<PipelineCompanyType, PipelineSectionData> = {
    STARTUP: createEmptySectionData(),
    SPIN_OUT: createEmptySectionData(),
    DENOVO: createEmptySectionData()
  };

  const opportunityCreateGroups = new Map<string, OpportunityEventGroup>();
  const opportunityMomentumGroups = new Map<string, OpportunityEventGroup>();

  for (const company of companies) {
    const companyType = normalizeCompanyType(company.companyType);
    const section = sectionDataByType[companyType];
    const phase = (company.pipeline?.phase || inferDefaultPhaseFromCompany(company)) as PipelinePhase;
    const currentStageName = stageNameForPhase(phase);
    const boardColumn = mapPhaseToBoardColumn(phase);

    if (boardColumn) {
      section.summary[boardColumn] += 1;
    }

    if (company.createdAt >= lookbackStart) {
      section.events.push({
        id: `company-created-${company.id}`,
        timestamp: company.createdAt,
        actorName: null,
        narrative: `${company.name} entered the pipeline in ${currentStageName}.`,
        kind: "ENTRY",
        pipelineType: companyType
      });
    }

    if (company.pipeline?.updatedAt && company.pipeline.updatedAt >= lookbackStart) {
      const isNewPipelineRecord = company.pipeline.createdAt.getTime() === company.pipeline.updatedAt.getTime();
      if (!isNewPipelineRecord || company.pipeline.createdAt < lookbackStart) {
        section.events.push({
          id: `pipeline-updated-${company.id}`,
          timestamp: company.pipeline.updatedAt,
          actorName: null,
          narrative: `${company.name} showed pipeline momentum and is currently in ${currentStageName}.`,
          kind: "MOMENTUM",
          pipelineType: companyType
        });
      }
    }

    for (const opportunity of company.opportunities) {
      const bucket = opportunityBucketLabel(opportunity.type);
      if (opportunity.createdAt >= lookbackStart) {
        upsertOpportunityEventGroup(opportunityCreateGroups, {
          companyId: company.id,
          companyType,
          companyName: company.name,
          bucket,
          eventAt: opportunity.createdAt,
          title: opportunity.title
        });
        continue;
      }

      if (opportunity.updatedAt >= lookbackStart) {
        upsertOpportunityEventGroup(opportunityMomentumGroups, {
          companyId: company.id,
          companyType,
          companyName: company.name,
          bucket,
          eventAt: opportunity.updatedAt,
          title: opportunity.title
        });
      }
    }
  }

  for (const group of opportunityCreateGroups.values()) {
    const section = sectionDataByType[group.companyType];
    if (group.count === 1) {
      section.events.push({
        id: `opportunity-created-${group.companyId}-${group.bucket}`,
        timestamp: group.latestAt,
        actorName: null,
        narrative: `A new ${group.bucket} opportunity was added for ${group.companyName} (${group.latestTitle}).`,
        kind: "OPPORTUNITY",
        pipelineType: group.companyType
      });
      continue;
    }

    section.events.push({
      id: `opportunity-created-${group.companyId}-${group.bucket}`,
      timestamp: group.latestAt,
      actorName: null,
      narrative: `${group.count} new ${group.bucket} opportunities were added for ${group.companyName}.`,
      kind: "OPPORTUNITY",
      pipelineType: group.companyType
    });
  }

  for (const group of opportunityMomentumGroups.values()) {
    const section = sectionDataByType[group.companyType];
    if (group.count === 1) {
      section.events.push({
        id: `opportunity-momentum-${group.companyId}-${group.bucket}`,
        timestamp: group.latestAt,
        actorName: null,
        narrative: `${group.companyName} advanced or updated one ${group.bucket} opportunity (${group.latestTitle}).`,
        kind: "OPPORTUNITY",
        pipelineType: group.companyType
      });
      continue;
    }

    section.events.push({
      id: `opportunity-momentum-${group.companyId}-${group.bucket}`,
      timestamp: group.latestAt,
      actorName: null,
      narrative: `${group.companyName} advanced or updated ${group.count} ${group.bucket} opportunities.`,
      kind: "OPPORTUNITY",
      pipelineType: group.companyType
    });
  }

  for (const note of recentNotes) {
    const company = companyById.get(note.entityId);
    if (!company) continue;
    const companyType = normalizeCompanyType(company.companyType);
    const actorName = resolveActorName(note.createdByName, note.createdByUser);
    const noteSnippet = truncate(stripRichText(note.note));
    const narrative = noteSnippet
      ? `captured a note on ${company.name}: "${noteSnippet}".`
      : `captured a note on ${company.name}.`;
    sectionDataByType[companyType].events.push({
      id: `note-${note.id}`,
      timestamp: note.createdAt,
      actorName,
      narrative,
      kind: "NOTE",
      pipelineType: companyType
    });
  }

  for (const change of recentScreeningChanges) {
    const company = companyById.get(change.companyId);
    if (!company) continue;
    const companyType = normalizeCompanyType(company.companyType);
    const actorName = resolveActorName(change.changedByName, change.changedByUser);
    const fieldLabel = change.field === "STATUS_UPDATE" ? "status update" : "relevant feedback";
    const valueSnippet = truncate(stripRichText(change.value), 140);
    const scopeLabel = change.healthSystem?.name
      ? `${company.name} (${change.healthSystem.name})`
      : company.name;

    sectionDataByType[companyType].events.push({
      id: `screening-change-${change.id}`,
      timestamp: change.createdAt,
      actorName,
      narrative: valueSnippet
        ? `updated ${fieldLabel} for ${scopeLabel}: "${valueSnippet}".`
        : `updated ${fieldLabel} for ${scopeLabel}.`,
      kind: "SCREENING",
      pipelineType: companyType
    });
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
      if (!event.actorName) continue;
      contributorCounts.set(event.actorName, (contributorCounts.get(event.actorName) || 0) + 1);
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
    const attributedActions = sortedEvents.filter((event) => Boolean(event.actorName)).length;
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
            <p className="muted">{totals.active} active opportunities currently in pipeline stages.</p>
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
                      {section.activeOpportunityCount} active opportunities, {section.totalEvents} tracked updates
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

        <aside className="panel home-pipeline-activity-panel">
          <header className="home-pipeline-activity-header">
            <h2>Narrative Changes</h2>
            <p className="muted">
              Reverse chronological activity stream across all three pipelines.
            </p>
          </header>

          <div className="home-pipeline-activity-scroll">
            {visibleGlobalEvents.length === 0 ? (
              <p className="muted">No tracked changes in the last two weeks.</p>
            ) : (
              <ol className="home-pipeline-activity-list">
                {visibleGlobalEvents.map((event) => (
                  <li key={event.id} className="home-pipeline-activity-item">
                    <div className="home-activity-badges">
                      <span className={`home-activity-kind home-activity-kind-${kindClass(event.kind)}`}>
                        {kindLabel(event.kind)}
                      </span>
                      <span
                        className={`home-activity-pipeline home-activity-pipeline-${PIPELINE_BADGE_CLASS[event.pipelineType]}`}
                      >
                        {PIPELINE_LABELS[event.pipelineType]}
                      </span>
                    </div>
                    <p className="home-activity-narrative">
                      {event.actorName ? `${event.actorName} ${event.narrative}` : event.narrative}
                    </p>
                    <div className="home-pipeline-activity-meta">
                      <span>{event.actorName || "System"}</span>
                      <time dateTime={event.timestamp.toISOString()}>
                        {TIMESTAMP_FORMATTER.format(event.timestamp)}
                      </time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {globalEvents.length > visibleGlobalEvents.length ? (
            <p className="muted">Showing latest {visibleGlobalEvents.length} of {globalEvents.length} events.</p>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
