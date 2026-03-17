"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ALLIANCE_PIPELINE_CLOSED_OUTCOME_OPTIONS,
  ALLIANCE_PIPELINE_STAGE_OPTIONS,
  ALLIANCE_PIPELINE_STATUS_OPTIONS
} from "@/lib/alliance-pipeline";
import { getJsonErrorMessage, readJsonResponse } from "@/lib/http-response";

type ReportPreset = {
  key: "active" | "closed" | "revisit" | "joined";
  name: string;
  description: string;
  defaults: {
    status: "all" | "ACTIVE" | "CLOSED" | "REVISIT";
    closedOutcome?: "JOINED" | null;
  };
};

type ReportRow = {
  id: string;
  name: string;
  website: string | null;
  location: string;
  stage: "PROSPECTING" | "QUALIFYING" | "PROPOSAL" | "CONTRACTING";
  stageLabel: string;
  status: "ACTIVE" | "CLOSED" | "REVISIT";
  statusLabel: string;
  closedOutcome: "JOINED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
  closedOutcomeLabel: string;
  ownerName: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
  contractPriceUsd: number | null;
  likelihoodPercent: number | null;
  estimatedCloseDate: string | null;
  closedAt: string | null;
  closeReason: string | null;
  allianceMemberStatus: "YES" | "NO" | "PROSPECT" | "REVISIT_LATER";
  createdAt: string;
  updatedAt: string;
};

type ReportResponse = {
  presets: ReportPreset[];
  filters: {
    status: "all" | "ACTIVE" | "CLOSED" | "REVISIT";
    stage: string;
    owner: string;
    closedOutcome: string;
  };
  summary: {
    total: number;
    active: number;
    revisit: number;
    closed: number;
    joined: number;
    filtered: number;
  };
  rows: ReportRow[];
};

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

export function AlliancePipelineReportsPage() {
  const router = useRouter();
  const [presets, setPresets] = React.useState<ReportPreset[]>([]);
  const [selectedPresetKey, setSelectedPresetKey] = React.useState<ReportPreset["key"]>("active");
  const [statusFilter, setStatusFilter] = React.useState<ReportResponse["filters"]["status"]>("ACTIVE");
  const [stageFilter, setStageFilter] = React.useState("");
  const [ownerFilter, setOwnerFilter] = React.useState("");
  const [closedOutcomeFilter, setClosedOutcomeFilter] = React.useState("");
  const [summary, setSummary] = React.useState<ReportResponse["summary"]>({
    total: 0,
    active: 0,
    revisit: 0,
    closed: 0,
    joined: 0,
    filtered: 0
  });
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadReport = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams();
      query.set("preset", selectedPresetKey);
      query.set("status", statusFilter);
      if (stageFilter) query.set("stage", stageFilter);
      if (ownerFilter.trim()) query.set("owner", ownerFilter.trim());
      if (closedOutcomeFilter) query.set("closedOutcome", closedOutcomeFilter);

      const response = await fetch(`/api/alliance-pipeline/reports?${query.toString()}`, { cache: "no-store" });
      const payload = (await readJsonResponse(response)) as Partial<ReportResponse>;

      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to load alliance pipeline report."));
      }

      setPresets(Array.isArray(payload.presets) ? payload.presets : []);
      setSummary(
        payload.summary || {
          total: 0,
          active: 0,
          revisit: 0,
          closed: 0,
          joined: 0,
          filtered: 0
        }
      );
      setRows(Array.isArray(payload.rows) ? payload.rows : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load alliance pipeline report.");
    } finally {
      setLoading(false);
    }
  }, [closedOutcomeFilter, ownerFilter, selectedPresetKey, stageFilter, statusFilter]);

  React.useEffect(() => {
    void loadReport();
  }, [loadReport]);

  function applyPreset(preset: ReportPreset) {
    setSelectedPresetKey(preset.key);
    setStatusFilter(preset.defaults.status);
    setStageFilter("");
    setOwnerFilter("");
    setClosedOutcomeFilter(preset.defaults.closedOutcome || "");
  }

  function clearFilters() {
    setSelectedPresetKey("active");
    setStatusFilter("ACTIVE");
    setStageFilter("");
    setOwnerFilter("");
    setClosedOutcomeFilter("");
  }

  return (
    <main className="pipeline-page">
      <section className="panel">
        <div className="page-header" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <h1>Alliance Pipeline Reports</h1>
            <p className="muted" style={{ maxWidth: 760, marginBottom: 0 }}>
              Standard reporting views for active, closed, revisit, and joined alliance pipeline health systems.
            </p>
          </div>
          <div className="actions">
            <button type="button" className="ghost small" onClick={() => router.push("/alliance-pipeline")}>
              Back to Pipeline
            </button>
          </div>
        </div>

        <div className="chip-row" style={{ marginTop: 12 }}>
          <span className="chip">Total tracked: {summary.total}</span>
          <span className="chip">Active: {summary.active}</span>
          <span className="chip">Revisit: {summary.revisit}</span>
          <span className="chip">Closed: {summary.closed}</span>
          <span className="chip">Joined: {summary.joined}</span>
          <span className="chip">Filtered rows: {summary.filtered}</span>
        </div>
      </section>

      <section className="panel">
        <h2>Presets</h2>
        <div className="pipeline-filter-chip-row">
          {presets.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={`pipeline-filter-chip ${selectedPresetKey === preset.key ? "active" : ""}`}
              onClick={() => applyPreset(preset)}
            >
              {preset.name}
            </button>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 12, marginBottom: 0 }}>
          {presets.find((preset) => preset.key === selectedPresetKey)?.description || "Select a preset to focus the report."}
        </p>
      </section>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <h2 style={{ marginBottom: 0 }}>Filters</h2>
          <div className="actions">
            <button type="button" className="ghost small" onClick={clearFilters}>
              Clear
            </button>
          </div>
        </div>
        <div className="detail-grid" style={{ marginTop: 14 }}>
          <div>
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as ReportResponse["filters"]["status"])}
            >
              <option value="all">All</option>
              {ALLIANCE_PIPELINE_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Stage</label>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="">All stages</option>
              {ALLIANCE_PIPELINE_STAGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Owner</label>
            <input value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)} placeholder="Filter by owner" />
          </div>
          <div>
            <label>Closed Outcome</label>
            <select value={closedOutcomeFilter} onChange={(event) => setClosedOutcomeFilter(event.target.value)}>
              <option value="">All outcomes</option>
              {ALLIANCE_PIPELINE_CLOSED_OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Report Rows</h2>
        {loading ? <p className="muted">Loading report...</p> : null}
        {!loading && error ? <p className="status error">{error}</p> : null}
        {!loading && !error && rows.length === 0 ? <p className="muted">No alliance pipeline rows match these filters.</p> : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="table-wrap report-table-wrap" style={{ marginTop: 10 }}>
            <table className="table table-dense report-table">
              <thead>
                <tr>
                  <th>Health System</th>
                  <th>Status</th>
                  <th>Stage</th>
                  <th>Owner</th>
                  <th>Likelihood</th>
                  <th>Contract Price</th>
                  <th>Expected / Closed</th>
                  <th>Outcome</th>
                  <th>Next Step</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button
                        type="button"
                        className="report-opportunity-link"
                        onClick={() =>
                          router.push(
                            `/alliance-pipeline/${row.id}?returnTo=${encodeURIComponent("/alliance-pipeline/reports")}`
                          )
                        }
                      >
                        {row.name}
                      </button>
                    </td>
                    <td>{row.statusLabel}</td>
                    <td>{row.stageLabel}</td>
                    <td>{row.ownerName || "Unassigned"}</td>
                    <td>{row.likelihoodPercent === null ? "-" : `${row.likelihoodPercent}%`}</td>
                    <td>{formatCurrency(row.contractPriceUsd)}</td>
                    <td>{formatDate(row.status === "CLOSED" ? row.closedAt : row.estimatedCloseDate)}</td>
                    <td>{row.closedOutcomeLabel || "-"}</td>
                    <td>{row.nextStep?.trim() || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </main>
  );
}
