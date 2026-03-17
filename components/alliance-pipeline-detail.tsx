"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DateInputField } from "./date-input-field";
import { EntityDocumentsPane } from "./entity-documents-pane";
import { EntityNotesPane } from "./entity-notes-pane";
import { HealthSystemContactsPane } from "./health-system-contacts-pane";
import {
  ALLIANCE_PIPELINE_CLOSED_OUTCOME_OPTIONS,
  ALLIANCE_PIPELINE_STAGE_OPTIONS,
  ALLIANCE_PIPELINE_STATUS_OPTIONS
} from "@/lib/alliance-pipeline";
import { toDateInputValue } from "@/lib/date-parse";
import { getJsonErrorMessage, readJsonResponse } from "@/lib/http-response";

type AlliancePipelineDetailItem = {
  id: string;
  name: string;
  legalName: string | null;
  website: string | null;
  location: string;
  allianceMemberStatus: "YES" | "NO" | "PROSPECT" | "REVISIT_LATER";
  isAllianceMember: boolean;
  stage: "PROSPECTING" | "QUALIFYING" | "PROPOSAL" | "CONTRACTING";
  stageLabel: string;
  status: "ACTIVE" | "CLOSED" | "REVISIT";
  statusLabel: string;
  closedOutcome: "JOINED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
  closedOutcomeLabel: string;
  closeReason: string | null;
  ownerName: string | null;
  nextStep: string | null;
  nextStepDueAt: string | null;
  contractPriceUsd: number | null;
  likelihoodPercent: number | null;
  estimatedCloseDate: string | null;
  closedAt: string | null;
  stageChangedAt: string;
  createdAt: string;
  updatedAt: string;
  counts: {
    contacts: number;
    documents: number;
    notes: number;
  };
};

type DetailTab = "pipeline" | "contacts" | "documents" | "notes";

type AlliancePipelineDetailViewProps = {
  healthSystemId: string;
  returnTo?: string | null;
};

type DetailDraft = {
  stage: AlliancePipelineDetailItem["stage"];
  status: AlliancePipelineDetailItem["status"];
  closedOutcome: Exclude<AlliancePipelineDetailItem["closedOutcome"], null> | "";
  ownerName: string;
  nextStep: string;
  nextStepDueAt: string;
  contractPriceUsd: string;
  likelihoodPercent: string;
  estimatedCloseDate: string;
  closeReason: string;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Unset";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unset";
  return parsed.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Unset";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unset";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unset";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
}

function detailDraftFromItem(item: AlliancePipelineDetailItem): DetailDraft {
  return {
    stage: item.stage,
    status: item.status,
    closedOutcome: item.closedOutcome || "",
    ownerName: item.ownerName || "",
    nextStep: item.nextStep || "",
    nextStepDueAt: toDateInputValue(item.nextStepDueAt),
    contractPriceUsd: item.contractPriceUsd === null ? "" : String(item.contractPriceUsd),
    likelihoodPercent: item.likelihoodPercent === null ? "" : String(item.likelihoodPercent),
    estimatedCloseDate: toDateInputValue(item.estimatedCloseDate),
    closeReason: item.closeReason || ""
  };
}

function parseNullableNumber(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function AlliancePipelineDetailView({ healthSystemId, returnTo }: AlliancePipelineDetailViewProps) {
  const router = useRouter();
  const [item, setItem] = React.useState<AlliancePipelineDetailItem | null>(null);
  const [draft, setDraft] = React.useState<DetailDraft | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [activeTab, setActiveTab] = React.useState<DetailTab>("pipeline");

  const loadItem = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/alliance-pipeline/${healthSystemId}`, { cache: "no-store" });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to load alliance pipeline item."));
      }

      const nextItem =
        typeof payload.item === "object" && payload.item ? (payload.item as AlliancePipelineDetailItem) : null;
      if (!nextItem) {
        throw new Error("Alliance pipeline item not found.");
      }

      setItem(nextItem);
      setDraft(detailDraftFromItem(nextItem));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load alliance pipeline item.");
    } finally {
      setLoading(false);
    }
  }, [healthSystemId]);

  React.useEffect(() => {
    void loadItem();
  }, [loadItem]);

  function handleBack() {
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    if (window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/alliance-pipeline");
  }

  async function savePipeline() {
    if (!draft) return;

    setSaving(true);
    setStatus(null);

    try {
      const response = await fetch(`/api/alliance-pipeline/${healthSystemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: draft.stage,
          status: draft.status,
          closedOutcome: draft.status === "CLOSED" ? draft.closedOutcome || null : null,
          ownerName: draft.ownerName || null,
          nextStep: draft.nextStep || null,
          nextStepDueAt: draft.nextStepDueAt || null,
          contractPriceUsd: parseNullableNumber(draft.contractPriceUsd),
          likelihoodPercent: parseNullableNumber(draft.likelihoodPercent),
          estimatedCloseDate: draft.estimatedCloseDate || null,
          closeReason: draft.status === "CLOSED" ? draft.closeReason || null : null
        })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to save alliance pipeline item."));
      }

      const nextItem =
        typeof payload.item === "object" && payload.item ? (payload.item as AlliancePipelineDetailItem) : null;
      if (!nextItem) {
        throw new Error("Alliance pipeline item updated, but the response was incomplete.");
      }

      setItem(nextItem);
      setDraft(detailDraftFromItem(nextItem));
      setStatus({ kind: "ok", text: "Alliance pipeline updated." });
    } catch (requestError) {
      setStatus({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to save alliance pipeline item."
      });
    } finally {
      setSaving(false);
    }
  }

  const detailTabs: Array<{ key: DetailTab; label: string; count?: number }> = React.useMemo(
    () => [
      { key: "pipeline", label: "Pipeline" },
      { key: "contacts", label: "Contacts", count: item?.counts.contacts || 0 },
      { key: "documents", label: "Documents", count: item?.counts.documents || 0 },
      { key: "notes", label: "Notes", count: item?.counts.notes || 0 }
    ],
    [item]
  );

  return (
    <main className="pipeline-page">
      <section className="panel entity-detail-panel health-system-detail-panel">
        <div className="detail-section">
          <div className="actions actions-flush" style={{ justifyContent: "space-between" }}>
            <button type="button" className="ghost small" onClick={handleBack}>
              Back to Alliance Pipeline
            </button>
            <button type="button" className="modal-icon-close" onClick={handleBack} aria-label="Close alliance pipeline detail">
              ×
            </button>
          </div>
          {loading ? <p className="muted">Loading alliance pipeline item...</p> : null}
          {!loading && error ? <p className="status error">{error}</p> : null}
        </div>

        {!loading && !error && item && draft ? (
          <>
            <div className="detail-section">
              <div className="pipeline-card-head">
                <h1>{item.name}</h1>
                <span className="status-pill draft">{item.stageLabel}</span>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                {item.location || "Location unavailable"}
                {item.website ? (
                  <>
                    {" "}
                    -{" "}
                    <a href={item.website} target="_blank" rel="noreferrer">
                      {item.website}
                    </a>
                  </>
                ) : null}
              </p>
              <div className="chip-row" style={{ marginTop: 12 }}>
                <span className="chip">Status: {item.statusLabel}</span>
                <span className="chip">Alliance member flag: {item.allianceMemberStatus}</span>
                <span className="chip">Contract price: {formatCurrency(item.contractPriceUsd)}</span>
                <span className="chip">Likelihood: {item.likelihoodPercent === null ? "Unset" : `${item.likelihoodPercent}%`}</span>
                <span className="chip">Estimated close: {formatDate(item.estimatedCloseDate)}</span>
              </div>
              <div className="pipeline-card-submeta" style={{ marginTop: 12 }}>
                <span>
                  <strong>Stage changed:</strong> {formatDateTime(item.stageChangedAt)}
                </span>
                <span>
                  <strong>Updated:</strong> {formatDateTime(item.updatedAt)}
                </span>
                {item.closedAt ? (
                  <span>
                    <strong>Closed:</strong> {formatDateTime(item.closedAt)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="detail-tabs">
              {detailTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  className={`detail-tab ${activeTab === tab.key ? "active" : ""}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  <span className="detail-tab-label-with-badges">
                    <span>{tab.label}</span>
                    {typeof tab.count === "number" ? <span className="detail-tab-badge">{tab.count}</span> : null}
                  </span>
                </button>
              ))}
            </div>

            {status ? <p className={status.kind === "error" ? "status error" : "status"}>{status.text}</p> : null}

            {activeTab === "pipeline" ? (
              <div className="detail-card">
                <div className="detail-section company-pipeline-main-section">
                  <p className="detail-label">Alliance Pipeline Status</p>
                  <div className="detail-grid">
                    <div>
                      <label>Status</label>
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setDraft((current) =>
                            current
                              ? {
                                  ...current,
                                  status: event.target.value as DetailDraft["status"],
                                  closedOutcome:
                                    event.target.value === "CLOSED" ? current.closedOutcome : "",
                                  closeReason: event.target.value === "CLOSED" ? current.closeReason : ""
                                }
                              : current
                          )
                        }
                      >
                        {ALLIANCE_PIPELINE_STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Stage</label>
                      <select
                        value={draft.stage}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, stage: event.target.value as DetailDraft["stage"] } : current
                          )
                        }
                      >
                        {ALLIANCE_PIPELINE_STAGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {draft.status === "CLOSED" ? (
                      <div>
                        <label>Closed Outcome</label>
                        <select
                          value={draft.closedOutcome}
                          onChange={(event) =>
                            setDraft((current) =>
                              current
                                ? {
                                    ...current,
                                    closedOutcome: event.target.value as DetailDraft["closedOutcome"]
                                  }
                                : current
                            )
                          }
                        >
                          <option value="">Select outcome</option>
                          {ALLIANCE_PIPELINE_CLOSED_OUTCOME_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                    <div>
                      <label>Owner</label>
                      <input
                        value={draft.ownerName}
                        onChange={(event) =>
                          setDraft((current) => (current ? { ...current, ownerName: event.target.value } : current))
                        }
                        placeholder="Unassigned"
                      />
                    </div>
                    <div>
                      <label>Likelihood to Close (%)</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={draft.likelihoodPercent}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, likelihoodPercent: event.target.value } : current
                          )
                        }
                        placeholder="75"
                      />
                    </div>
                    <div>
                      <label>Contract Price (USD)</label>
                      <input
                        value={draft.contractPriceUsd}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, contractPriceUsd: event.target.value } : current
                          )
                        }
                        placeholder="$125000"
                      />
                    </div>
                    <div>
                      <label>Estimated Close Date</label>
                      <DateInputField
                        value={draft.estimatedCloseDate}
                        onChange={(nextValue) =>
                          setDraft((current) => (current ? { ...current, estimatedCloseDate: nextValue } : current))
                        }
                      />
                    </div>
                  </div>

                  <label>Next Step</label>
                  <textarea
                    value={draft.nextStep}
                    onChange={(event) =>
                      setDraft((current) => (current ? { ...current, nextStep: event.target.value } : current))
                    }
                    rows={4}
                    placeholder="Document the next concrete step in the alliance process."
                  />

                  {draft.status === "CLOSED" ? (
                    <>
                      <label>Close Reason</label>
                      <textarea
                        value={draft.closeReason}
                        onChange={(event) =>
                          setDraft((current) => (current ? { ...current, closeReason: event.target.value } : current))
                        }
                        rows={4}
                        placeholder="Capture why the opportunity closed."
                      />
                    </>
                  ) : null}

                  <div className="actions" style={{ marginTop: 14 }}>
                    <button type="button" className="primary" onClick={() => void savePipeline()} disabled={saving}>
                      {saving ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      className="ghost small"
                      onClick={() => {
                        setDraft(detailDraftFromItem(item));
                        setStatus(null);
                      }}
                      disabled={saving}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {activeTab === "contacts" ? <HealthSystemContactsPane healthSystemId={healthSystemId} onStatus={setStatus} /> : null}
            {activeTab === "documents" ? (
              <EntityDocumentsPane entityPath="health-systems" entityId={healthSystemId} onStatus={setStatus} />
            ) : null}
            {activeTab === "notes" ? (
              <EntityNotesPane entityPath="health-systems" entityId={healthSystemId} onStatus={setStatus} />
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}
