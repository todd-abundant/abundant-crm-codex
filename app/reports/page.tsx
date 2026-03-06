"use client";

import * as React from "react";

type ReportPreset = {
  key: string;
  name: string;
  description: string;
  defaults: {
    status: "open" | "closed";
    types: string[];
  };
};

type ReportRow = {
  id: string;
  title: string;
  type: string;
  stage: string;
  company: { id: string; name: string };
  healthSystem: { id: string; name: string } | null;
  likelihoodPercent: number | null;
  amountUsd: number | null;
  contractPriceUsd: number | null;
  durationDays: number | null;
  nextSteps: string | null;
  notes: string | null;
  closeReason: string | null;
  estimatedCloseDate: string | null;
  closedAt: string | null;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
};

type OpportunityEditDraft = {
  opportunityId: string;
  companyId: string;
  type: string;
  stage: string;
  healthSystemId: string;
  likelihoodPercent: string;
  contractPriceUsd: string;
  estimatedCloseDate: string;
  nextSteps: string;
  closeReason: string;
  notes: string;
};

type ReportResponse = {
  presets: ReportPreset[];
  summary: {
    total: number;
    openCount: number;
    closedCount: number;
    wonCount: number;
    lostCount: number;
  };
  rows: ReportRow[];
};

type FilterOption = {
  id: string;
  name: string;
};

const opportunityTypeOptions: Array<{ value: string; label: string }> = [
  { value: "SCREENING_LOI", label: "Screening LOI" },
  { value: "COMMERCIAL_CONTRACT", label: "Commercial Contract" },
  { value: "VENTURE_STUDIO_SERVICES", label: "Venture Studio Services" },
  { value: "S1_TERM_SHEET", label: "S1 Term Sheet" },
  { value: "PROSPECT_PURSUIT", label: "Prospect Pursuit" }
];

const opportunityStageOptions: Array<{ value: string; label: string }> = [
  { value: "IDENTIFIED", label: "Identified" },
  { value: "QUALIFICATION", label: "Qualification" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "LEGAL", label: "Legal" },
  { value: "CLOSED_WON", label: "Closed Won" },
  { value: "CLOSED_LOST", label: "Closed Lost" },
  { value: "ON_HOLD", label: "On Hold" }
];

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
}

function parseNullableNumber(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export default function ReportsPage() {
  const [presets, setPresets] = React.useState<ReportPreset[]>([]);
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [summary, setSummary] = React.useState<ReportResponse["summary"]>({
    total: 0,
    openCount: 0,
    closedCount: 0,
    wonCount: 0,
    lostCount: 0
  });
  const [companies, setCompanies] = React.useState<FilterOption[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<FilterOption[]>([]);

  const [selectedPreset, setSelectedPreset] = React.useState<string>("open_screening");
  const [statusFilter, setStatusFilter] = React.useState<"all" | "open" | "closed">("open");
  const [typeFilter, setTypeFilter] = React.useState<string>("SCREENING_LOI");
  const [stageFilter, setStageFilter] = React.useState<string>("");
  const [companyIdFilter, setCompanyIdFilter] = React.useState<string>("");
  const [healthSystemIdFilter, setHealthSystemIdFilter] = React.useState<string>("");
  const [createdFromFilter, setCreatedFromFilter] = React.useState<string>("");
  const [createdToFilter, setCreatedToFilter] = React.useState<string>("");
  const [isFilterModalOpen, setIsFilterModalOpen] = React.useState(false);
  const [draftStatusFilter, setDraftStatusFilter] = React.useState<"all" | "open" | "closed">("open");
  const [draftTypeFilter, setDraftTypeFilter] = React.useState<string>("SCREENING_LOI");
  const [draftStageFilter, setDraftStageFilter] = React.useState<string>("");
  const [draftCompanyIdFilter, setDraftCompanyIdFilter] = React.useState<string>("");
  const [draftHealthSystemIdFilter, setDraftHealthSystemIdFilter] = React.useState<string>("");
  const [draftCreatedFromFilter, setDraftCreatedFromFilter] = React.useState<string>("");
  const [draftCreatedToFilter, setDraftCreatedToFilter] = React.useState<string>("");

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [inlineNextStepsById, setInlineNextStepsById] = React.useState<Record<string, string>>({});
  const [savingNextStepId, setSavingNextStepId] = React.useState<string | null>(null);
  const [activeOpportunityModalDraft, setActiveOpportunityModalDraft] = React.useState<OpportunityEditDraft | null>(null);
  const [savingOpportunityModal, setSavingOpportunityModal] = React.useState(false);

  const applyPreset = React.useCallback((preset: ReportPreset) => {
    setSelectedPreset(preset.key);
    setStatusFilter(preset.defaults.status);
    setTypeFilter(preset.defaults.types[0] || "");
    setStageFilter("");
    setCompanyIdFilter("");
    setHealthSystemIdFilter("");
    setCreatedFromFilter("");
    setCreatedToFilter("");
  }, []);

  const openFilterModal = React.useCallback(() => {
    setDraftStatusFilter(statusFilter);
    setDraftTypeFilter(typeFilter);
    setDraftStageFilter(stageFilter);
    setDraftCompanyIdFilter(companyIdFilter);
    setDraftHealthSystemIdFilter(healthSystemIdFilter);
    setDraftCreatedFromFilter(createdFromFilter);
    setDraftCreatedToFilter(createdToFilter);
    setIsFilterModalOpen(true);
  }, [
    companyIdFilter,
    createdFromFilter,
    createdToFilter,
    healthSystemIdFilter,
    stageFilter,
    statusFilter,
    typeFilter
  ]);

  const applyDraftFilters = React.useCallback(() => {
    setStatusFilter(draftStatusFilter);
    setTypeFilter(draftTypeFilter);
    setStageFilter(draftStageFilter);
    setCompanyIdFilter(draftCompanyIdFilter);
    setHealthSystemIdFilter(draftHealthSystemIdFilter);
    setCreatedFromFilter(draftCreatedFromFilter);
    setCreatedToFilter(draftCreatedToFilter);
    setIsFilterModalOpen(false);
  }, [
    draftCompanyIdFilter,
    draftCreatedFromFilter,
    draftCreatedToFilter,
    draftHealthSystemIdFilter,
    draftStageFilter,
    draftStatusFilter,
    draftTypeFilter
  ]);

  const clearAppliedFilters = React.useCallback(() => {
    setStatusFilter("all");
    setTypeFilter("");
    setStageFilter("");
    setCompanyIdFilter("");
    setHealthSystemIdFilter("");
    setCreatedFromFilter("");
    setCreatedToFilter("");
    setSelectedPreset("");
  }, []);

  const clearDraftFilters = React.useCallback(() => {
    setDraftStatusFilter("all");
    setDraftTypeFilter("");
    setDraftStageFilter("");
    setDraftCompanyIdFilter("");
    setDraftHealthSystemIdFilter("");
    setDraftCreatedFromFilter("");
    setDraftCreatedToFilter("");
  }, []);

  React.useEffect(() => {
    let active = true;

    const loadFilterOptions = async () => {
      try {
        const res = await fetch("/api/reports/opportunities/options", { cache: "no-store" });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load report filter options.");
        }
        if (!active) return;
        setCompanies(Array.isArray(payload.companies) ? payload.companies : []);
        setHealthSystems(Array.isArray(payload.healthSystems) ? payload.healthSystems : []);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load report filters.");
      }
    };

    void loadFilterOptions();

    return () => {
      active = false;
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    setLoading(true);

    const query = new URLSearchParams();
    query.set("status", statusFilter);
    if (typeFilter) query.set("types", typeFilter);
    if (stageFilter) query.set("stages", stageFilter);
    if (companyIdFilter) query.set("companyIds", companyIdFilter);
    if (healthSystemIdFilter) query.set("healthSystemIds", healthSystemIdFilter);
    if (createdFromFilter) query.set("createdFrom", createdFromFilter);
    if (createdToFilter) query.set("createdTo", createdToFilter);

    const loadReport = async () => {
      try {
        const res = await fetch(`/api/reports/opportunities?${query.toString()}`, { cache: "no-store" });
        const payload = (await res.json()) as ReportResponse & { error?: string };
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load report.");
        }
        if (!active) return;
        setPresets(Array.isArray(payload.presets) ? payload.presets : []);
        setRows(Array.isArray(payload.rows) ? payload.rows : []);
        setSummary(
          payload.summary || {
            total: 0,
            openCount: 0,
            closedCount: 0,
            wonCount: 0,
            lostCount: 0
          }
        );
        setError(null);
      } catch (requestError) {
        if (!active) return;
        setError(requestError instanceof Error ? requestError.message : "Failed to load report.");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadReport();

    return () => {
      active = false;
    };
  }, [
    selectedPreset,
    statusFilter,
    typeFilter,
    stageFilter,
    companyIdFilter,
    healthSystemIdFilter,
    createdFromFilter,
    createdToFilter
  ]);

  const activeFilterPills = React.useMemo(() => {
    const companyName = companies.find((entry) => entry.id === companyIdFilter)?.name || null;
    const healthSystemName = healthSystems.find((entry) => entry.id === healthSystemIdFilter)?.name || null;
    const rows: string[] = [];
    if (statusFilter !== "all") rows.push(`Status: ${statusFilter}`);
    if (typeFilter) rows.push(`Type: ${typeFilter}`);
    if (stageFilter) rows.push(`Win/Loss: ${stageFilter}`);
    if (companyName) rows.push(`Company: ${companyName}`);
    if (healthSystemName) rows.push(`Health System: ${healthSystemName}`);
    if (createdFromFilter) rows.push(`From: ${formatDate(createdFromFilter)}`);
    if (createdToFilter) rows.push(`To: ${formatDate(createdToFilter)}`);
    return rows;
  }, [
    companies,
    companyIdFilter,
    createdFromFilter,
    createdToFilter,
    healthSystemIdFilter,
    healthSystems,
    stageFilter,
    statusFilter,
    typeFilter
  ]);

  React.useEffect(() => {
    const next: Record<string, string> = {};
    for (const row of rows) {
      next[row.id] = row.nextSteps || "";
    }
    setInlineNextStepsById(next);
  }, [rows]);

  function applyOpportunityRowUpdate(opportunity: {
    id: string;
    title: string;
    type: string;
    stage: string;
    likelihoodPercent: number | null;
    contractPriceUsd: number | null;
    nextSteps: string | null;
    notes: string | null;
    closeReason: string | null;
    estimatedCloseDate: string | null;
    updatedAt: string;
    healthSystem: { id: string; name: string } | null;
  }) {
    setRows((current) =>
      current.map((row) =>
        row.id === opportunity.id
          ? {
              ...row,
              title: opportunity.title,
              type: opportunity.type,
              stage: opportunity.stage,
              likelihoodPercent: opportunity.likelihoodPercent,
              contractPriceUsd: opportunity.contractPriceUsd,
              nextSteps: opportunity.nextSteps,
              notes: opportunity.notes,
              closeReason: opportunity.closeReason,
              estimatedCloseDate: opportunity.estimatedCloseDate,
              updatedAt: opportunity.updatedAt,
              healthSystem: opportunity.healthSystem
            }
          : row
      )
    );
    setInlineNextStepsById((current) => ({
      ...current,
      [opportunity.id]: opportunity.nextSteps || ""
    }));
  }

  function openOpportunityModal(row: ReportRow) {
    setActiveOpportunityModalDraft({
      opportunityId: row.id,
      companyId: row.company.id,
      type: row.type,
      stage: row.stage,
      healthSystemId: row.healthSystem?.id || "",
      likelihoodPercent: row.likelihoodPercent === null ? "" : String(row.likelihoodPercent),
      contractPriceUsd: row.contractPriceUsd === null ? "" : String(row.contractPriceUsd),
      estimatedCloseDate: toDateInputValue(row.estimatedCloseDate),
      nextSteps: row.nextSteps || "",
      closeReason: row.closeReason || "",
      notes: row.notes || ""
    });
  }

  async function saveInlineNextStep(row: ReportRow) {
    const nextValue = (inlineNextStepsById[row.id] || "").trim();
    const currentValue = (row.nextSteps || "").trim();
    if (nextValue === currentValue) return;

    setSavingNextStepId(row.id);
    try {
      const res = await fetch(`/api/pipeline/opportunities/${row.company.id}/opportunities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: row.id,
          nextSteps: nextValue || null
        })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update next step.");
      }
      const opportunity = payload.opportunity as {
        id: string;
        title: string;
        type: string;
        stage: string;
        likelihoodPercent: number | null;
        contractPriceUsd: number | null;
        nextSteps: string | null;
        notes: string | null;
        closeReason: string | null;
        estimatedCloseDate: string | null;
        updatedAt: string;
        healthSystem: { id: string; name: string } | null;
      };
      applyOpportunityRowUpdate(opportunity);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update next step.");
      setInlineNextStepsById((current) => ({
        ...current,
        [row.id]: row.nextSteps || ""
      }));
    } finally {
      setSavingNextStepId(null);
    }
  }

  async function saveOpportunityModal() {
    const draft = activeOpportunityModalDraft;
    if (!draft) return;
    setSavingOpportunityModal(true);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${draft.companyId}/opportunities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId: draft.opportunityId,
          type: draft.type,
          stage: draft.stage,
          healthSystemId: draft.healthSystemId || "",
          likelihoodPercent: (() => {
            const parsed = parseNullableNumber(draft.likelihoodPercent);
            if (parsed === null) return null;
            return Math.max(0, Math.min(100, Math.round(parsed)));
          })(),
          contractPriceUsd: parseNullableNumber(draft.contractPriceUsd),
          estimatedCloseDate: draft.estimatedCloseDate || null,
          nextSteps: draft.nextSteps.trim() || null,
          closeReason: draft.closeReason.trim() || null,
          notes: draft.notes.trim() || null
        })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update opportunity.");
      }
      const opportunity = payload.opportunity as {
        id: string;
        title: string;
        type: string;
        stage: string;
        likelihoodPercent: number | null;
        contractPriceUsd: number | null;
        nextSteps: string | null;
        notes: string | null;
        closeReason: string | null;
        estimatedCloseDate: string | null;
        updatedAt: string;
        healthSystem: { id: string; name: string } | null;
      };
      applyOpportunityRowUpdate(opportunity);
      setActiveOpportunityModalDraft(null);
      setError(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update opportunity.");
    } finally {
      setSavingOpportunityModal(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <h1>Opportunity Reports</h1>
        <p>Salesforce-style filtering for Screening and Commercial Acceleration opportunities.</p>
      </section>

      <section className="panel">
        <h2>System Reports</h2>
        <p className="muted">Administrators can evolve these presets; users can layer their own filters.</p>
        <div className="actions" style={{ marginTop: 10 }}>
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={preset.key === selectedPreset ? "secondary small" : "ghost small"}
              onClick={() => applyPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="report-filter-bar">
          <div className="report-filter-summary">
            {activeFilterPills.length > 0 ? (
              <div className="report-filter-chip-row">
                {activeFilterPills.map((entry) => (
                  <span key={entry} className="chip">
                    {entry}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">No filters applied.</p>
            )}
          </div>
          <div className="actions">
            <button type="button" className="ghost small" onClick={clearAppliedFilters}>
              Clear
            </button>
            <button type="button" className="secondary small" onClick={openFilterModal}>
              Filters
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Summary</h2>
        <div className="chip-row">
          <span className="chip">Total: {summary.total}</span>
          <span className="chip">Open: {summary.openCount}</span>
          <span className="chip">Closed: {summary.closedCount}</span>
          <span className="chip">Won: {summary.wonCount}</span>
          <span className="chip">Lost: {summary.lostCount}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Report Rows</h2>
        {loading ? <p className="muted">Loading report...</p> : null}
        {!loading && error ? <p className="status error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="muted">No opportunities match your filters.</p> : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Opportunity</th>
                  <th>Health System</th>
                  <th>Stage</th>
                  <th>Next Step</th>
                  <th>Likelihood</th>
                  <th>Contract Price</th>
                  <th>Expected Close</th>
                  <th>Created</th>
                  <th>Contacts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.company.name}</td>
                    <td>
                      <button
                        type="button"
                        className="report-opportunity-link"
                        onClick={() => openOpportunityModal(row)}
                      >
                        {row.title}
                      </button>
                    </td>
                    <td>{row.healthSystem?.name || "-"}</td>
                    <td>{row.stage}</td>
                    <td>
                      <input
                        className="report-next-step-input"
                        value={inlineNextStepsById[row.id] || ""}
                        onChange={(event) =>
                          setInlineNextStepsById((current) => ({
                            ...current,
                            [row.id]: event.target.value
                          }))
                        }
                        onBlur={() => void saveInlineNextStep(row)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            (event.currentTarget as HTMLInputElement).blur();
                          }
                        }}
                        disabled={savingNextStepId === row.id}
                        placeholder="Add next step..."
                      />
                    </td>
                    <td>{row.likelihoodPercent === null ? "-" : `${row.likelihoodPercent}%`}</td>
                    <td>{formatCurrency(row.contractPriceUsd)}</td>
                    <td>{formatDate(row.estimatedCloseDate)}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>{row.contactCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {activeOpportunityModalDraft ? (
        <div
          className="report-filter-modal-backdrop"
          onClick={() => setActiveOpportunityModalDraft(null)}
          role="presentation"
        >
          <section
            className="report-filter-modal report-opportunity-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Edit opportunity"
          >
            <h2>Edit Opportunity</h2>
            <div className="detail-grid">
              <div>
                <label>Type</label>
                <select
                  value={activeOpportunityModalDraft.type}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, type: event.target.value } : current
                    )
                  }
                >
                  {opportunityTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Health System</label>
                <select
                  value={activeOpportunityModalDraft.healthSystemId}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, healthSystemId: event.target.value } : current
                    )
                  }
                >
                  <option value="">No health system</option>
                  {healthSystems.map((healthSystem) => (
                    <option key={healthSystem.id} value={healthSystem.id}>
                      {healthSystem.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Stage</label>
                <select
                  value={activeOpportunityModalDraft.stage}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, stage: event.target.value } : current
                    )
                  }
                >
                  {opportunityStageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Likelihood (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={activeOpportunityModalDraft.likelihoodPercent}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, likelihoodPercent: event.target.value } : current
                    )
                  }
                />
              </div>
              <div>
                <label>Contract Price (USD)</label>
                <input
                  value={activeOpportunityModalDraft.contractPriceUsd}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, contractPriceUsd: event.target.value } : current
                    )
                  }
                />
              </div>
              <div>
                <label>Estimated Close</label>
                <input
                  type="date"
                  value={activeOpportunityModalDraft.estimatedCloseDate}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, estimatedCloseDate: event.target.value } : current
                    )
                  }
                />
              </div>
            </div>
            <div className="detail-grid">
              <div>
                <label>Next Step</label>
                <textarea
                  value={activeOpportunityModalDraft.nextSteps}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, nextSteps: event.target.value } : current
                    )
                  }
                  rows={3}
                />
              </div>
              <div>
                <label>Close Reason</label>
                <textarea
                  value={activeOpportunityModalDraft.closeReason}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, closeReason: event.target.value } : current
                    )
                  }
                  rows={3}
                />
              </div>
              <div>
                <label>Notes</label>
                <textarea
                  value={activeOpportunityModalDraft.notes}
                  onChange={(event) =>
                    setActiveOpportunityModalDraft((current) =>
                      current ? { ...current, notes: event.target.value } : current
                    )
                  }
                  rows={4}
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button
                type="button"
                className="ghost small"
                onClick={() => setActiveOpportunityModalDraft(null)}
                disabled={savingOpportunityModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className="secondary small"
                onClick={() => void saveOpportunityModal()}
                disabled={savingOpportunityModal}
              >
                {savingOpportunityModal ? "Saving..." : "Save Opportunity"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {isFilterModalOpen ? (
        <div
          className="report-filter-modal-backdrop"
          onClick={() => setIsFilterModalOpen(false)}
          role="presentation"
        >
          <section
            className="report-filter-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Opportunity report filters"
          >
            <h2>Report Filters</h2>
            <div className="detail-grid">
              <div>
                <label>Status</label>
                <select
                  value={draftStatusFilter}
                  onChange={(event) => setDraftStatusFilter(event.target.value as "all" | "open" | "closed")}
                >
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label>Opportunity Type</label>
                <select value={draftTypeFilter} onChange={(event) => setDraftTypeFilter(event.target.value)}>
                  <option value="">All Types</option>
                  {opportunityTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Win / Loss</label>
                <select value={draftStageFilter} onChange={(event) => setDraftStageFilter(event.target.value)}>
                  <option value="">Any</option>
                  <option value="CLOSED_WON">Won</option>
                  <option value="CLOSED_LOST">Lost</option>
                </select>
              </div>
              <div>
                <label>Company</label>
                <select value={draftCompanyIdFilter} onChange={(event) => setDraftCompanyIdFilter(event.target.value)}>
                  <option value="">All Companies</option>
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Health System</label>
                <select
                  value={draftHealthSystemIdFilter}
                  onChange={(event) => setDraftHealthSystemIdFilter(event.target.value)}
                >
                  <option value="">All Health Systems</option>
                  {healthSystems.map((healthSystem) => (
                    <option key={healthSystem.id} value={healthSystem.id}>
                      {healthSystem.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Date Created (From)</label>
                <input
                  type="date"
                  value={draftCreatedFromFilter}
                  onChange={(event) => setDraftCreatedFromFilter(event.target.value)}
                />
              </div>
              <div>
                <label>Date Created (To)</label>
                <input
                  type="date"
                  value={draftCreatedToFilter}
                  onChange={(event) => setDraftCreatedToFilter(event.target.value)}
                />
              </div>
            </div>
            <div className="actions" style={{ marginTop: 14 }}>
              <button type="button" className="ghost small" onClick={clearDraftFilters}>
                Clear Draft
              </button>
              <button type="button" className="ghost small" onClick={() => setIsFilterModalOpen(false)}>
                Cancel
              </button>
              <button type="button" className="secondary small" onClick={applyDraftFilters}>
                Apply Filters
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
