"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  PIPELINE_COMPANY_TYPE_OPTIONS,
  type PipelineBoardColumn,
  type PipelineCompanyType
} from "@/lib/pipeline-opportunities";

type RaiseFilter = "ALL" | "UNDER_1M" | "ONE_TO_FIVE_M" | "FIVE_TO_TEN_M" | "TEN_PLUS_M" | "UNKNOWN";
type IntakeSortKey = "LAST_ACTIVITY" | "DAYS_IN_STAGE";
type IntakeDeepDiveGroupKey =
  | "RECEIVED"
  | "INTRO_CALLS"
  | "ACTIVE_INTAKE"
  | "TEAM_DILIGENCE"
  | "TOWARD_MANAGEMENT_PRESENTATION";

type IntakeDeepDiveItem = {
  id: string;
  createdAt: string;
  name: string;
  ownerName: string;
  lastMeaningfulActivityAt: string | null;
  nextStep: string;
  timeInStageDays: number | null;
  raiseAmountUsd: number | null;
  primaryCategory: string;
  column: PipelineBoardColumn;
  intakeStage: "RECEIVED" | "INTRO_CALLS" | "ACTIVE_INTAKE" | "MANAGEMENT_PRESENTATION";
};

type IntakeDeepDiveGroup = {
  key: IntakeDeepDiveGroupKey;
  label: string;
  description: string;
  items: IntakeDeepDiveItem[];
};

type IntakeDeepDivePageProps = {
  initialCompanyType: PipelineCompanyType;
  initialPrimaryCategory: string;
  initialRaiseFilter: string;
};

const DEFAULT_GROUP_EXPANDED: Record<IntakeDeepDiveGroupKey, boolean> = {
  RECEIVED: true,
  INTRO_CALLS: true,
  ACTIVE_INTAKE: true,
  TEAM_DILIGENCE: true,
  TOWARD_MANAGEMENT_PRESENTATION: true
};

const DEFAULT_GROUP_SORT: Record<IntakeDeepDiveGroupKey, IntakeSortKey> = {
  RECEIVED: "LAST_ACTIVITY",
  INTRO_CALLS: "LAST_ACTIVITY",
  ACTIVE_INTAKE: "DAYS_IN_STAGE",
  TEAM_DILIGENCE: "LAST_ACTIVITY",
  TOWARD_MANAGEMENT_PRESENTATION: "DAYS_IN_STAGE"
};

const RAISE_FILTER_OPTIONS: Array<{ value: RaiseFilter; label: string }> = [
  { value: "ALL", label: "All raises" },
  { value: "UNDER_1M", label: "Under $1M" },
  { value: "ONE_TO_FIVE_M", label: "$1M-$5M" },
  { value: "FIVE_TO_TEN_M", label: "$5M-$10M" },
  { value: "TEN_PLUS_M", label: "$10M+" },
  { value: "UNKNOWN", label: "Amount not set" }
];

function normalizeRaiseFilter(value: string | null | undefined): RaiseFilter {
  if (
    value === "UNDER_1M" ||
    value === "ONE_TO_FIVE_M" ||
    value === "FIVE_TO_TEN_M" ||
    value === "TEN_PLUS_M" ||
    value === "UNKNOWN"
  ) {
    return value;
  }
  return "ALL";
}

function primaryCategoryLabel(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ")
    .replace("And", "&");
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "No activity yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No activity yet";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function daysInStageLabel(days: number | null) {
  if (days === null) return "Stage age unavailable";
  return `${days} days`;
}

function matchesRaiseFilter(item: IntakeDeepDiveItem, raiseFilter: RaiseFilter) {
  if (raiseFilter === "ALL") return true;
  if (raiseFilter === "UNKNOWN") return item.raiseAmountUsd === null;
  if (item.raiseAmountUsd === null) return false;
  if (raiseFilter === "UNDER_1M") return item.raiseAmountUsd < 1_000_000;
  if (raiseFilter === "ONE_TO_FIVE_M") return item.raiseAmountUsd >= 1_000_000 && item.raiseAmountUsd < 5_000_000;
  if (raiseFilter === "FIVE_TO_TEN_M") return item.raiseAmountUsd >= 5_000_000 && item.raiseAmountUsd < 10_000_000;
  return item.raiseAmountUsd >= 10_000_000;
}

function intakeGroupForItem(item: IntakeDeepDiveItem): IntakeDeepDiveGroupKey | null {
  if (item.column === "INTAKE" && item.intakeStage === "RECEIVED") return "RECEIVED";
  if (item.column === "INTAKE" && item.intakeStage === "INTRO_CALLS") return "INTRO_CALLS";
  if (item.column === "INTAKE" && item.intakeStage === "ACTIVE_INTAKE") return "ACTIVE_INTAKE";
  if (item.column === "SCREENING") return "TEAM_DILIGENCE";
  if (
    item.intakeStage === "MANAGEMENT_PRESENTATION" ||
    item.column === "VENTURE_STUDIO_CONTRACT_EVALUATION" ||
    item.column === "COMMERCIAL_ACCELERATION"
  ) {
    return "TOWARD_MANAGEMENT_PRESENTATION";
  }
  return null;
}

function compareByLastActivity(left: IntakeDeepDiveItem, right: IntakeDeepDiveItem) {
  const leftTs = left.lastMeaningfulActivityAt ? Date.parse(left.lastMeaningfulActivityAt) : 0;
  const rightTs = right.lastMeaningfulActivityAt ? Date.parse(right.lastMeaningfulActivityAt) : 0;
  if (leftTs !== rightTs) return rightTs - leftTs;
  return (left.name || "").localeCompare(right.name || "", undefined, { sensitivity: "base" });
}

function compareByDaysInStage(left: IntakeDeepDiveItem, right: IntakeDeepDiveItem) {
  const leftDays = left.timeInStageDays ?? -1;
  const rightDays = right.timeInStageDays ?? -1;
  if (leftDays !== rightDays) return rightDays - leftDays;
  return compareByLastActivity(left, right);
}

function groupDefinition(key: IntakeDeepDiveGroupKey) {
  if (key === "RECEIVED") {
    return {
      label: "Received",
      description: "New companies that entered the pipeline and still need first-pass triage."
    };
  }
  if (key === "INTRO_CALLS") {
    return {
      label: "Intro Calls",
      description: "Companies already scheduled for or moving through a first conversation."
    };
  }
  if (key === "ACTIVE_INTAKE") {
    return {
      label: "Active Intake",
      description: "Companies under active consideration while core intake questions are being answered."
    };
  }
  if (key === "TEAM_DILIGENCE") {
    return {
      label: "Team Diligence",
      description: "Amanda / Hana / Katie are pulled in to pressure-test the company with the broader team."
    };
  }
  return {
    label: "Toward Management Presentation",
    description: "Companies being pushed toward a management presentation and next-step decision."
  };
}

function buildReturnTo(pathname: string, companyType: PipelineCompanyType, primaryCategory: string, raiseFilter: RaiseFilter) {
  const params = new URLSearchParams();
  if (companyType !== "STARTUP") params.set("companyType", companyType);
  if (primaryCategory && primaryCategory !== "ALL") params.set("primaryCategory", primaryCategory);
  if (raiseFilter !== "ALL") params.set("raiseFilter", raiseFilter);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function IntakeDeepDivePage({
  initialCompanyType,
  initialPrimaryCategory,
  initialRaiseFilter
}: IntakeDeepDivePageProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [companyType, setCompanyType] = React.useState<PipelineCompanyType>(initialCompanyType);
  const [primaryCategoryFilter, setPrimaryCategoryFilter] = React.useState(initialPrimaryCategory || "ALL");
  const [raiseFilter, setRaiseFilter] = React.useState<RaiseFilter>(normalizeRaiseFilter(initialRaiseFilter));
  const [items, setItems] = React.useState<IntakeDeepDiveItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = React.useState<Record<IntakeDeepDiveGroupKey, boolean>>(DEFAULT_GROUP_EXPANDED);
  const [groupSortBy, setGroupSortBy] = React.useState<Record<IntakeDeepDiveGroupKey, IntakeSortKey>>(DEFAULT_GROUP_SORT);

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/pipeline/opportunities?companyType=${companyType}`, { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to load intake deep dive");
        if (cancelled) return;
        setItems(Array.isArray(payload.opportunities) ? payload.opportunities : []);
      } catch (loadError) {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load intake deep dive");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [companyType]);

  React.useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (companyType === "STARTUP") {
      params.delete("companyType");
    } else {
      params.set("companyType", companyType);
    }
    if (!primaryCategoryFilter || primaryCategoryFilter === "ALL") {
      params.delete("primaryCategory");
    } else {
      params.set("primaryCategory", primaryCategoryFilter);
    }
    if (raiseFilter === "ALL") {
      params.delete("raiseFilter");
    } else {
      params.set("raiseFilter", raiseFilter);
    }
    const nextQuery = params.toString();
    const nextUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    window.history.replaceState(window.history.state, "", nextUrl);
  }, [companyType, pathname, primaryCategoryFilter, raiseFilter, searchParams]);

  const primaryCategoryOptions = React.useMemo(
    () => Array.from(new Set(items.map((item) => item.primaryCategory).filter(Boolean))).sort((left, right) =>
      left.localeCompare(right, undefined, { sensitivity: "base" })
    ),
    [items]
  );

  const filteredItems = React.useMemo(
    () =>
      items.filter((item) => {
        if (primaryCategoryFilter !== "ALL" && item.primaryCategory !== primaryCategoryFilter) return false;
        if (!matchesRaiseFilter(item, raiseFilter)) return false;
        return true;
      }),
    [items, primaryCategoryFilter, raiseFilter]
  );

  const groupedItems = React.useMemo<IntakeDeepDiveGroup[]>(() => {
    const keys: IntakeDeepDiveGroupKey[] = [
      "RECEIVED",
      "INTRO_CALLS",
      "ACTIVE_INTAKE",
      "TEAM_DILIGENCE",
      "TOWARD_MANAGEMENT_PRESENTATION"
    ];

    return keys.map((key) => {
      const definition = groupDefinition(key);
      const groupItems = filteredItems.filter((item) => intakeGroupForItem(item) === key);
      const sortKey = groupSortBy[key];
      const sortedItems = [...groupItems].sort(sortKey === "DAYS_IN_STAGE" ? compareByDaysInStage : compareByLastActivity);
      return {
        key,
        label: definition.label,
        description: definition.description,
        items: sortedItems
      };
    });
  }, [filteredItems, groupSortBy]);

  const returnTo = React.useMemo(
    () => buildReturnTo(pathname, companyType, primaryCategoryFilter, raiseFilter),
    [companyType, pathname, primaryCategoryFilter, raiseFilter]
  );

  const companyTypeView = React.useMemo(
    () => PIPELINE_COMPANY_TYPE_OPTIONS.find((entry) => entry.value === companyType) || PIPELINE_COMPANY_TYPE_OPTIONS[0],
    [companyType]
  );

  return (
    <main className="pipeline-board-page intake-deep-dive-page">
      <section className="pipeline-board-overview intake-deep-dive-hero">
        <div className="pipeline-board-overview-copy">
          <p className="eyebrow">Intake deep dive</p>
          <h1>{companyTypeView.boardTitle}</h1>
          <p className="muted">
            Review every intake-stage company in one place, grouped by the operating step the team is actively managing.
          </p>
          <button type="button" className="pipeline-inline-back-link" onClick={() => router.push(companyType === "STARTUP" ? "/pipeline" : `/pipeline?companyType=${companyType}`)}>
            Back to pipeline board
          </button>
        </div>
        <div className="pipeline-board-controls">
          <div className="pipeline-filter-group">
            <span className="pipeline-filter-label">Pipeline Lens</span>
            <div className="pipeline-filter-chip-row">
              {PIPELINE_COMPANY_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`pipeline-filter-chip ${companyType === option.value ? "active" : ""}`}
                  onClick={() => setCompanyType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pipeline-filter-grid">
            <label>
              <span className="pipeline-filter-label">Company type</span>
              <select value={primaryCategoryFilter} onChange={(event) => setPrimaryCategoryFilter(event.target.value)}>
                <option value="ALL">All company types</option>
                {primaryCategoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {primaryCategoryLabel(option)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="pipeline-filter-label">Amount raised</span>
              <select value={raiseFilter} onChange={(event) => setRaiseFilter(event.target.value as RaiseFilter)}>
                {RAISE_FILTER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      {error ? <p className="status error">{error}</p> : null}
      {loading ? <p className="status">Loading intake deep dive...</p> : null}

      <section className="intake-deep-dive-groups" aria-label="Intake groups">
        {groupedItems.map((group) => {
          const collapsed = !collapsedGroups[group.key];
          return (
            <article key={group.key} className="intake-deep-dive-group-card">
              <header className="intake-deep-dive-group-head">
                <button
                  type="button"
                  className="intake-deep-dive-group-toggle"
                  onClick={() =>
                    setCollapsedGroups((current) => ({
                      ...current,
                      [group.key]: !current[group.key]
                    }))
                  }
                  aria-expanded={!collapsed}
                >
                  <div>
                    <div className="intake-deep-dive-group-title-row">
                      <h2>{group.label}</h2>
                      <span className="status-pill draft">{group.items.length}</span>
                    </div>
                    <p className="muted">{group.description}</p>
                  </div>
                  <span className="pipeline-collapse-indicator">{collapsed ? "Show" : "Hide"}</span>
                </button>
                <label className="intake-deep-dive-sort-control">
                  <span className="pipeline-filter-label">Sort</span>
                  <select
                    value={groupSortBy[group.key]}
                    onChange={(event) =>
                      setGroupSortBy((current) => ({
                        ...current,
                        [group.key]: event.target.value as IntakeSortKey
                      }))
                    }
                  >
                    <option value="LAST_ACTIVITY">Last activity</option>
                    <option value="DAYS_IN_STAGE">Days in stage</option>
                  </select>
                </label>
              </header>

              {!collapsed ? (
                group.items.length === 0 ? (
                  <p className="muted">No companies match the current filters in this group.</p>
                ) : (
                  <div className="table-wrap intake-deep-dive-table-wrap">
                    <table className="table report-table intake-deep-dive-table">
                      <thead>
                        <tr>
                          <th>Company</th>
                          <th>Owner</th>
                          <th>Last Activity</th>
                          <th>Next Step</th>
                          <th>Days in Current Stage</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.items.map((item) => (
                          <tr
                            key={`${group.key}-${item.id}`}
                            className="intake-deep-dive-row"
                            role="link"
                            tabIndex={0}
                            onClick={() => router.push(`/pipeline/${item.id}?returnTo=${encodeURIComponent(returnTo)}`)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                router.push(`/pipeline/${item.id}?returnTo=${encodeURIComponent(returnTo)}`);
                              }
                            }}
                          >
                            <td>
                              <strong>{item.name}</strong>
                            </td>
                            <td>{item.ownerName || "Unassigned"}</td>
                            <td>{formatTimestamp(item.lastMeaningfulActivityAt)}</td>
                            <td>{item.nextStep || "No next step set"}</td>
                            <td>{daysInStageLabel(item.timeInStageDays)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}
