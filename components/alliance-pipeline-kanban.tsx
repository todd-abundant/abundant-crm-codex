"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ALLIANCE_PIPELINE_STAGE_OPTIONS, closedOutcomeLabel } from "@/lib/alliance-pipeline";
import { getJsonErrorMessage, readJsonResponse } from "@/lib/http-response";

type AlliancePipelineBoardItem = {
  id: string;
  name: string;
  legalName: string | null;
  website: string | null;
  location: string;
  stage: "PROSPECTING" | "QUALIFYING" | "PROPOSAL" | "CONTRACTING";
  stageLabel: string;
  status: "ACTIVE" | "CLOSED" | "REVISIT";
  statusLabel: string;
  closedOutcome: "JOINED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
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
  allianceMemberStatus: "YES" | "NO" | "PROSPECT" | "REVISIT_LATER";
  isAllianceMember: boolean;
  noteCount: number;
  latestNote: {
    id: string;
    note: string;
    createdAt: string;
    createdByName: string;
  } | null;
};

type BoardResponse = {
  activeItems: AlliancePipelineBoardItem[];
  revisitItems: AlliancePipelineBoardItem[];
  summary: {
    total: number;
    active: number;
    revisit: number;
    closed: number;
  };
};

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "Unset";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
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

function stripRichText(value: string | null | undefined) {
  return (value || "")
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

function likelihoodLabel(value: number | null) {
  return value === null ? "Unset" : `${value}%`;
}

export function AlliancePipelineKanban() {
  const router = useRouter();
  const [activeItems, setActiveItems] = React.useState<AlliancePipelineBoardItem[]>([]);
  const [revisitItems, setRevisitItems] = React.useState<AlliancePipelineBoardItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = React.useState<string | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [revisitQueueExpanded, setRevisitQueueExpanded] = React.useState(false);
  const loadBoard = React.useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/alliance-pipeline", { cache: "no-store" });
      const payload = (await readJsonResponse(response)) as Partial<BoardResponse>;
      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to load alliance pipeline."));
      }

      setActiveItems(Array.isArray(payload.activeItems) ? payload.activeItems : []);
      setRevisitItems(Array.isArray(payload.revisitItems) ? payload.revisitItems : []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to load alliance pipeline.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  const groupedItems = React.useMemo(() => {
    return ALLIANCE_PIPELINE_STAGE_OPTIONS.reduce<Record<string, AlliancePipelineBoardItem[]>>((accumulator, stage) => {
      accumulator[stage.value] = activeItems
        .filter((item) => item.stage === stage.value)
        .sort((left, right) => {
          const leftLikelihood = left.likelihoodPercent ?? -1;
          const rightLikelihood = right.likelihoodPercent ?? -1;
          if (leftLikelihood !== rightLikelihood) return rightLikelihood - leftLikelihood;
          return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
        });
      return accumulator;
    }, {});
  }, [activeItems]);

  async function moveItemToStage(itemId: string, stage: AlliancePipelineBoardItem["stage"]) {
    const existingItem = activeItems.find((item) => item.id === itemId);
    if (!existingItem || existingItem.stage === stage) return;

    setUpdatingId(itemId);
    setStatus(null);
    const previousItems = activeItems;
    setActiveItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              stage,
              stageLabel: ALLIANCE_PIPELINE_STAGE_OPTIONS.find((option) => option.value === stage)?.label || stage
            }
          : item
      )
    );

    try {
      const response = await fetch(`/api/alliance-pipeline/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage, status: "ACTIVE" })
      });
      const payload = await readJsonResponse(response);

      if (!response.ok) {
        throw new Error(getJsonErrorMessage(payload, "Failed to update alliance stage."));
      }

      const updatedItem =
        typeof payload.item === "object" && payload.item ? (payload.item as AlliancePipelineBoardItem) : null;
      if (updatedItem) {
        setActiveItems((current) => current.map((item) => (item.id === itemId ? updatedItem : item)));
      } else {
        await loadBoard();
      }
    } catch (requestError) {
      setActiveItems(previousItems);
      setStatus({
        kind: "error",
        text: requestError instanceof Error ? requestError.message : "Failed to update alliance stage."
      });
    } finally {
      setUpdatingId(null);
    }
  }

  function openDetail(itemId: string) {
    router.push(`/alliance-pipeline/${itemId}?returnTo=${encodeURIComponent("/alliance-pipeline")}`);
  }

  return (
    <main className="pipeline-page pipeline-board-page alliance-pipeline-page">
      <section className="panel alliance-pipeline-toolbar">
        <div className="alliance-pipeline-toolbar-grid">
          <div className="alliance-pipeline-toolbar-copy">
            <h1>Alliance Pipeline</h1>
            <p className="muted">
              Health systems evaluating alliance membership. This board keeps the motion simple: prospecting through
              contracting, with revisit handled separately and closed outcomes tracked in reports.
            </p>
          </div>
        </div>
      </section>

      {status ? <p className={status.kind === "error" ? "status error" : "status"}>{status.text}</p> : null}
      {loading ? <p className="muted">Loading alliance pipeline...</p> : null}
      {!loading && error ? <p className="status error">{error}</p> : null}

      {!loading && !error ? (
        <div className="pipeline-board-shell">
          <section className="pipeline-kanban" aria-label="Alliance pipeline board">
            {ALLIANCE_PIPELINE_STAGE_OPTIONS.map((column) => {
              const columnItems = groupedItems[column.value] || [];
              const isOver = dragOverStage === column.value;
              return (
                <article
                  key={column.value}
                  className={`pipeline-column ${isOver ? "drag-over" : ""}`}
                  onDragOver={(event) => {
                    event.preventDefault();
                    if (dragOverStage !== column.value) setDragOverStage(column.value);
                  }}
                  onDragLeave={() => {
                    if (dragOverStage === column.value) setDragOverStage(null);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const droppedId = event.dataTransfer.getData("text/alliance-pipeline-item-id");
                    setDragOverStage(null);
                    if (droppedId) {
                      void moveItemToStage(droppedId, column.value);
                    }
                  }}
                >
                  <header className="pipeline-column-head">
                    <div className="pipeline-column-head-main">
                      <h2>{column.label}</h2>
                    </div>
                    <span className="status-pill draft">{columnItems.length}</span>
                  </header>

                  <div className="pipeline-column-body">
                    {columnItems.length === 0 ? <p className="muted">No health systems in this stage.</p> : null}

                    {columnItems.map((item) => (
                      <div
                        key={item.id}
                        className={`pipeline-card ${draggingId === item.id ? "dragging" : ""}`}
                        draggable={updatingId !== item.id}
                        onDragStart={(event) => {
                          setDraggingId(item.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/alliance-pipeline-item-id", item.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverStage(null);
                        }}
                        onClick={() => openDetail(item.id)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openDetail(item.id);
                          }
                        }}
                      >
                        <div className="pipeline-card-head">
                          <h3>{item.name}</h3>
                          <span className="status-pill draft">{item.stageLabel}</span>
                        </div>
                        <p className="muted">{item.location || "Location unavailable"}</p>
                        <div className="pipeline-card-signals pipeline-card-signals-inactive">
                          <span className="pipeline-signal-pill">Likelihood: {likelihoodLabel(item.likelihoodPercent)}</span>
                          <span className="pipeline-signal-pill">Contract: {formatCurrency(item.contractPriceUsd)}</span>
                          <span className="pipeline-signal-pill">Est. close: {formatDate(item.estimatedCloseDate)}</span>
                          {item.closedOutcome ? (
                            <span className="pipeline-signal-pill">{closedOutcomeLabel(item.closedOutcome)}</span>
                          ) : null}
                        </div>
                        <div className="pipeline-card-submeta">
                          <span>
                            <strong>Owner:</strong> {item.ownerName || "Unassigned"}
                          </span>
                          <span>
                            <strong>Notes:</strong> {item.noteCount}
                          </span>
                        </div>
                        {item.nextStep ? (
                          <p className="muted" style={{ marginBottom: 0 }}>
                            <strong>Next step:</strong> {item.nextStep}
                          </p>
                        ) : null}
                        {item.latestNote ? (
                          <p className="muted" style={{ marginBottom: 0 }}>
                            <strong>Latest note:</strong> {stripRichText(item.latestNote.note).slice(0, 140) || "Open detail to view note."}
                          </p>
                        ) : null}
                        {updatingId === item.id ? <p className="status">Saving stage change...</p> : null}
                      </div>
                    ))}
                  </div>
                </article>
              );
            })}
          </section>

          <section className="pipeline-inactive-queue" aria-label="Alliance revisit queue">
            <button
              type="button"
              className="pipeline-inactive-queue-head pipeline-inactive-queue-toggle"
              onClick={() => setRevisitQueueExpanded((current) => !current)}
              aria-expanded={revisitQueueExpanded}
            >
              <div>
                <h2>Revisit Queue</h2>
                <p className="muted">Health systems paused for later re-engagement stay here instead of occupying a board column.</p>
              </div>
              <div className="pipeline-inactive-queue-head-right">
                <span className="status-pill draft">{revisitItems.length}</span>
                <span className="pipeline-collapse-indicator">{revisitQueueExpanded ? "Hide" : "Show"}</span>
              </div>
            </button>

            {revisitQueueExpanded ? (
              revisitItems.length === 0 ? (
                <p className="muted">No revisit health systems right now.</p>
              ) : (
                <div className="pipeline-inactive-grid">
                  {revisitItems.map((item) => (
                    <button key={item.id} type="button" className="pipeline-card pipeline-card-inactive" onClick={() => openDetail(item.id)}>
                      <div className="pipeline-card-head">
                        <h3>{item.name}</h3>
                        <span className="pipeline-signal-pill pipeline-signal-pill-category pipeline-signal-pill-reengage">
                          {item.statusLabel}
                        </span>
                      </div>
                      <p className="muted">{item.location || "Location unavailable"}</p>
                      <div className="pipeline-card-signals pipeline-card-signals-inactive">
                        <span className="pipeline-signal-pill">{item.stageLabel}</span>
                        <span className="pipeline-signal-pill">Likelihood: {likelihoodLabel(item.likelihoodPercent)}</span>
                        <span className="pipeline-signal-pill">Contract: {formatCurrency(item.contractPriceUsd)}</span>
                      </div>
                      <div className="pipeline-card-submeta">
                        <span>
                          <strong>Owner:</strong> {item.ownerName || "Unassigned"}
                        </span>
                        <span>
                          <strong>Last updated:</strong> {formatDate(item.updatedAt)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )
            ) : null}
          </section>
        </div>
      ) : null}
    </main>
  );
}
