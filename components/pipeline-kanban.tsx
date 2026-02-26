"use client";

import * as React from "react";
import { PipelineOpportunityDetailView } from "./pipeline-opportunity-detail";
import { RichTextArea } from "./rich-text-area";
import {
  PIPELINE_BOARD_COLUMNS,
  mapBoardColumnToCanonicalPhase,
  phaseLabel,
  type PipelineBoardColumn,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";

type IntakeDeclineReason =
  | "PRODUCT"
  | "INSUFFICIENT_ROI"
  | "HIGHLY_COMPETITIVE_LANDSCAPE"
  | "OUT_OF_INVESTMENT_THESIS_SCOPE"
  | "TOO_EARLY"
  | "TOO_MATURE_FOR_SEED_INVESTMENT"
  | "LACKS_PROOF_POINTS"
  | "INSUFFICIENT_TAM"
  | "TEAM"
  | "HEALTH_SYSTEM_BUYING_PROCESS"
  | "WORKFLOW_FRICTION"
  | "OTHER";

type PipelineBoardItem = {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  location: string;
  phase: PipelinePhase;
  phaseLabel: string;
  column: PipelineBoardColumn;
  openOpportunityCount: number;
  intakeScheduledAt: string | null;
  declineReason: IntakeDeclineReason | null;
  leadSource: string;
  nextStep: string;
  ventureLikelihoodPercent: number | null;
  ventureExpectedCloseDate: string | null;
  noteCount: number;
  latestNote: {
    id: string;
    note: string;
    createdAt: string;
    createdByName: string;
  } | null;
  updatedAt: string;
};

type HealthSystemOption = {
  id: string;
  name: string;
};

type IntakeDraft = {
  intakeScheduledAt: string;
  declineReason: IntakeDeclineReason | "";
  leadSource: string;
};

type CardMetaDraft = {
  nextStep: string;
  ventureLikelihoodPercent: string;
  ventureExpectedCloseDate: string;
};

type EditingField =
  | "intakeDate"
  | "declineReason"
  | "leadSource"
  | "nextStep"
  | "ventureLikelihoodPercent"
  | "ventureExpectedCloseDate";

type UndoToast = {
  itemId: string;
  itemName: string;
  previousDraft: IntakeDraft;
};

type NoteModalState = {
  itemId: string;
  itemName: string;
  draft: string;
  saving: boolean;
};

const intakeDeclineReasonOptions: Array<{ value: IntakeDeclineReason | ""; label: string }> = [
  { value: "", label: "Not declined" },
  { value: "PRODUCT", label: "Product" },
  { value: "INSUFFICIENT_ROI", label: "Insufficient ROI" },
  { value: "HIGHLY_COMPETITIVE_LANDSCAPE", label: "Highly Competitive Landscape" },
  { value: "OUT_OF_INVESTMENT_THESIS_SCOPE", label: "Out of Investment Thesis Scope" },
  { value: "TOO_EARLY", label: "Too Early" },
  { value: "TOO_MATURE_FOR_SEED_INVESTMENT", label: "Too Mature for Seed Investment" },
  { value: "LACKS_PROOF_POINTS", label: "Lacks Proof Points" },
  { value: "INSUFFICIENT_TAM", label: "Insufficient TAM" },
  { value: "TEAM", label: "Team" },
  { value: "HEALTH_SYSTEM_BUYING_PROCESS", label: "Health System Buying Process" },
  { value: "WORKFLOW_FRICTION", label: "Workflow Friction" },
  { value: "OTHER", label: "Other" }
];

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function toDateDisplayValue(value: string | null | undefined) {
  if (!value) return "Click to set";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Click to set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatLastUpdated(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return "Date unavailable";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Date unavailable";
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function nextBoardColumn(column: PipelineBoardColumn): PipelineBoardColumn | null {
  const index = PIPELINE_BOARD_COLUMNS.findIndex((entry) => entry.key === column);
  if (index < 0 || index >= PIPELINE_BOARD_COLUMNS.length - 1) return null;
  return PIPELINE_BOARD_COLUMNS[index + 1].key;
}

function declineReasonLabel(value: IntakeDeclineReason | "") {
  return intakeDeclineReasonOptions.find((option) => option.value === value)?.label || "Not declined";
}

function intakeDraftFromItem(item: PipelineBoardItem): IntakeDraft {
  return {
    intakeScheduledAt: toDateInputValue(item.intakeScheduledAt),
    declineReason: item.declineReason || "",
    leadSource: item.leadSource || ""
  };
}

function cardMetaDraftFromItem(item: PipelineBoardItem): CardMetaDraft {
  return {
    nextStep: item.nextStep || "",
    ventureLikelihoodPercent: item.ventureLikelihoodPercent === null ? "" : String(item.ventureLikelihoodPercent),
    ventureExpectedCloseDate: toDateInputValue(item.ventureExpectedCloseDate)
  };
}

function toNullableNumber(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const rounded = Math.round(parsed);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

export function PipelineKanban() {
  const [items, setItems] = React.useState<PipelineBoardItem[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<HealthSystemOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = React.useState<PipelineBoardColumn | null>(null);
  const [updatingId, setUpdatingId] = React.useState<string | null>(null);
  const [savingIntakeById, setSavingIntakeById] = React.useState<Record<string, boolean>>({});
  const [savingCardById, setSavingCardById] = React.useState<Record<string, boolean>>({});
  const [intakeDraftsById, setIntakeDraftsById] = React.useState<Record<string, IntakeDraft>>({});
  const [cardMetaDraftsById, setCardMetaDraftsById] = React.useState<Record<string, CardMetaDraft>>({});
  const [editingField, setEditingField] = React.useState<{ itemId: string; field: EditingField } | null>(null);
  const [undoToast, setUndoToast] = React.useState<UndoToast | null>(null);
  const [noteModal, setNoteModal] = React.useState<NoteModalState | null>(null);
  const [selectedDetailId, setSelectedDetailId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const undoTimeoutRef = React.useRef<number | null>(null);
  const suppressLeadSourceBlurRef = React.useRef(false);

  const loadBoard = React.useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/pipeline/opportunities", { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load pipeline board");

      const nextItems = Array.isArray(payload.opportunities) ? payload.opportunities : [];
      const nextHealthSystems = Array.isArray(payload.healthSystems) ? payload.healthSystems : [];
      setItems(nextItems);
      setHealthSystems(nextHealthSystems);
      setIntakeDraftsById(() => {
        const next: Record<string, IntakeDraft> = {};
        for (const item of nextItems) {
          next[item.id] = intakeDraftFromItem(item);
        }
        return next;
      });
      setCardMetaDraftsById(() => {
        const next: Record<string, CardMetaDraft> = {};
        for (const item of nextItems) {
          next[item.id] = cardMetaDraftFromItem(item);
        }
        return next;
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load pipeline board"
      });
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  React.useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
    };
  }, []);

  const closeDetailModal = React.useCallback(() => {
    setSelectedDetailId(null);
    void loadBoard();
  }, [loadBoard]);

  React.useEffect(() => {
    if (!selectedDetailId) return;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDetailModal();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [selectedDetailId, closeDetailModal]);

  const groupedItems = React.useMemo(() => {
    return PIPELINE_BOARD_COLUMNS.reduce<Record<PipelineBoardColumn, PipelineBoardItem[]>>(
      (accumulator, column) => {
        accumulator[column.key] = items.filter((item) => item.column === column.key);
        return accumulator;
      },
      {
        INTAKE: [],
        VENTURE_STUDIO_CONTRACT_EVALUATION: [],
        SCREENING: [],
        COMMERCIAL_ACCELERATION: []
      }
    );
  }, [items]);

  const commitIntakeDraft = React.useCallback(
    async (itemId: string, nextDraft: IntakeDraft, previousDraft: IntakeDraft) => {
      const currentItem = items.find((item) => item.id === itemId);
      if (!currentItem) return;

      setSavingIntakeById((current) => ({ ...current, [itemId]: true }));
      setStatus(null);
      setIntakeDraftsById((current) => ({ ...current, [itemId]: nextDraft }));
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                intakeScheduledAt: nextDraft.intakeScheduledAt || null,
                declineReason: nextDraft.declineReason || null,
                leadSource: nextDraft.leadSource
              }
            : item
        )
      );

      try {
        const res = await fetch(`/api/pipeline/opportunities/${itemId}/intake`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            intakeScheduledAt: nextDraft.intakeScheduledAt || null,
            declineReason: nextDraft.declineReason || null,
            leadSource: nextDraft.leadSource
          })
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to update intake field");

        const updatedItem = payload.item as
          | {
              id: string;
              intakeScheduledAt: string | null;
              declineReason: IntakeDeclineReason | null;
              leadSource: string;
              phase: PipelinePhase;
              phaseLabel: string;
              column: PipelineBoardColumn | null;
            }
          | undefined;

        if (!updatedItem) {
          throw new Error("Invalid intake update response");
        }

        if (!updatedItem.column) {
          setItems((current) => current.filter((item) => item.id !== itemId));
          setIntakeDraftsById((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          setCardMetaDraftsById((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          setEditingField((current) => (current?.itemId === itemId ? null : current));

          if (undoTimeoutRef.current) {
            window.clearTimeout(undoTimeoutRef.current);
          }
          setUndoToast({
            itemId,
            itemName: currentItem.name,
            previousDraft
          });
          undoTimeoutRef.current = window.setTimeout(() => {
            setUndoToast(null);
            undoTimeoutRef.current = null;
          }, 4000);
          return;
        }

        const updatedColumn = updatedItem.column;
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  intakeScheduledAt: updatedItem.intakeScheduledAt,
                  declineReason: updatedItem.declineReason,
                  leadSource: updatedItem.leadSource || "",
                  phase: updatedItem.phase,
                  phaseLabel: updatedItem.phaseLabel,
                  column: updatedColumn
                }
              : item
          )
        );
        setIntakeDraftsById((current) => ({
          ...current,
          [itemId]: {
            intakeScheduledAt: toDateInputValue(updatedItem.intakeScheduledAt),
            declineReason: updatedItem.declineReason || "",
            leadSource: updatedItem.leadSource || ""
          }
        }));
      } catch (error) {
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to update intake field"
        });
        setIntakeDraftsById((current) => ({ ...current, [itemId]: previousDraft }));
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  intakeScheduledAt: previousDraft.intakeScheduledAt || null,
                  declineReason: previousDraft.declineReason || null,
                  leadSource: previousDraft.leadSource
                }
              : item
          )
        );
      } finally {
        setSavingIntakeById((current) => ({ ...current, [itemId]: false }));
      }
    },
    [items]
  );

  const commitCardMetaDraft = React.useCallback(
    async (itemId: string, nextDraft: CardMetaDraft, previousDraft: CardMetaDraft) => {
      const currentItem = items.find((item) => item.id === itemId);
      if (!currentItem) return;

      const nextLikelihood = toNullableNumber(nextDraft.ventureLikelihoodPercent);
      const nextExpectedDate = nextDraft.ventureExpectedCloseDate || null;

      setSavingCardById((current) => ({ ...current, [itemId]: true }));
      setStatus(null);
      setCardMetaDraftsById((current) => ({ ...current, [itemId]: nextDraft }));
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                nextStep: nextDraft.nextStep,
                ventureLikelihoodPercent: nextLikelihood,
                ventureExpectedCloseDate: nextExpectedDate
              }
            : item
        )
      );

      try {
        const res = await fetch(`/api/pipeline/opportunities/${itemId}/card`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nextStep: nextDraft.nextStep,
            ventureLikelihoodPercent: nextLikelihood,
            ventureExpectedCloseDate: nextExpectedDate
          })
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error || "Failed to update card");

        const updated = payload.item as
          | {
              nextStep: string;
              ventureLikelihoodPercent: number | null;
              ventureExpectedCloseDate: string | null;
              phase: PipelinePhase;
              phaseLabel: string;
              column: PipelineBoardColumn | null;
            }
          | undefined;

        if (!updated) {
          throw new Error("Invalid card update response");
        }

        if (!updated.column) {
          setItems((current) => current.filter((item) => item.id !== itemId));
          setIntakeDraftsById((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          setCardMetaDraftsById((current) => {
            const next = { ...current };
            delete next[itemId];
            return next;
          });
          return;
        }

        const updatedColumn = updated.column;
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  nextStep: updated.nextStep || "",
                  ventureLikelihoodPercent: updated.ventureLikelihoodPercent,
                  ventureExpectedCloseDate: updated.ventureExpectedCloseDate,
                  phase: updated.phase,
                  phaseLabel: updated.phaseLabel,
                  column: updatedColumn
                }
              : item
          )
        );
        setCardMetaDraftsById((current) => ({
          ...current,
          [itemId]: {
            nextStep: updated.nextStep || "",
            ventureLikelihoodPercent:
              updated.ventureLikelihoodPercent === null ? "" : String(updated.ventureLikelihoodPercent),
            ventureExpectedCloseDate: toDateInputValue(updated.ventureExpectedCloseDate)
          }
        }));
      } catch (error) {
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to update card"
        });
        setCardMetaDraftsById((current) => ({ ...current, [itemId]: previousDraft }));
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  nextStep: previousDraft.nextStep,
                  ventureLikelihoodPercent: toNullableNumber(previousDraft.ventureLikelihoodPercent),
                  ventureExpectedCloseDate: previousDraft.ventureExpectedCloseDate || null
                }
              : item
          )
        );
      } finally {
        setSavingCardById((current) => ({ ...current, [itemId]: false }));
      }
    },
    [items]
  );

  async function moveItemToColumn(itemId: string, nextColumn: PipelineBoardColumn) {
    const current = items.find((item) => item.id === itemId);
    if (!current || current.column === nextColumn) return;

    const nextPhase = mapBoardColumnToCanonicalPhase(nextColumn);
    setUpdatingId(itemId);
    setStatus(null);

    const previousItems = items;
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.id === itemId
          ? {
              ...item,
              column: nextColumn,
              phase: nextPhase,
              phaseLabel: phaseLabel(nextPhase)
            }
          : item
      )
    );

    try {
      const res = await fetch(`/api/pipeline/opportunities/${itemId}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: nextPhase })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to move item");

      setItems((currentItems) =>
        currentItems.map((item) =>
          item.id === itemId
            ? {
                ...item,
                phase: payload.phase || nextPhase,
                phaseLabel: payload.phaseLabel || phaseLabel(nextPhase),
                column: payload.column || nextColumn
              }
            : item
        )
      );
      setStatus({
        kind: "ok",
        text: `${current.name} moved to ${PIPELINE_BOARD_COLUMNS.find((column) => column.key === nextColumn)?.label}.`
      });
    } catch (error) {
      setItems(previousItems);
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to move item"
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function undoDecline() {
    if (!undoToast) return;
    const toast = undoToast;
    setUndoToast(null);
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }

    try {
      const res = await fetch(`/api/pipeline/opportunities/${toast.itemId}/intake`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intakeScheduledAt: toast.previousDraft.intakeScheduledAt || null,
          declineReason: toast.previousDraft.declineReason || null,
          leadSource: toast.previousDraft.leadSource
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to undo");
      await loadBoard();
      setStatus({ kind: "ok", text: `${toast.itemName} was restored to intake.` });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to undo decline"
      });
      await loadBoard();
    }
  }

  async function savePipelineNote() {
    if (!noteModal) return;
    const trimmed = noteModal.draft.trim();
    if (!trimmed) {
      setStatus({ kind: "error", text: "Enter a note before saving." });
      return;
    }

    setNoteModal((current) => (current ? { ...current, saving: true } : current));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${noteModal.itemId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add note");

      const returnedNote = payload.note as { id: string; note: string; createdAt: string; createdByName: string } | undefined;
      const returnedCount = typeof payload.noteCount === "number" ? payload.noteCount : null;

      setItems((current) =>
        current.map((item) =>
          item.id === noteModal.itemId
            ? {
                ...item,
                noteCount: returnedCount ?? item.noteCount + 1,
                latestNote: returnedNote || item.latestNote
              }
            : item
        )
      );
      setNoteModal(null);
      setStatus({ kind: "ok", text: `Note added for ${noteModal.itemName}.` });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add note"
      });
      setNoteModal((current) => (current ? { ...current, saving: false } : current));
    }
  }

  function getIntakeDraft(item: PipelineBoardItem) {
    return intakeDraftsById[item.id] || intakeDraftFromItem(item);
  }

  function getCardMetaDraft(item: PipelineBoardItem) {
    return cardMetaDraftsById[item.id] || cardMetaDraftFromItem(item);
  }

  function isEditing(itemId: string, field: EditingField) {
    return editingField?.itemId === itemId && editingField.field === field;
  }

  return (
    <main>
      <section className="hero">
        <h1>Pipeline Kanban</h1>
        <p>
          Active pipeline opportunities by stage. Drag cards between columns to update phase. Click any card for full details.
        </p>
      </section>

      <section className="panel">
        <div className="actions" style={{ marginTop: 0 }}>
          <button className="secondary" type="button" onClick={() => void loadBoard()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh Board"}
          </button>
        </div>
        {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}
      </section>

      <section className="pipeline-kanban" aria-label="Pipeline opportunities board">
        {PIPELINE_BOARD_COLUMNS.map((column) => {
          const columnItems = groupedItems[column.key];
          const isOver = dragOverColumn === column.key;
          return (
            <article
              key={column.key}
              className={`pipeline-column ${isOver ? "drag-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                if (dragOverColumn !== column.key) setDragOverColumn(column.key);
              }}
              onDragLeave={() => {
                if (dragOverColumn === column.key) setDragOverColumn(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                const droppedId = event.dataTransfer.getData("text/pipeline-item-id");
                setDragOverColumn(null);
                if (droppedId) {
                  void moveItemToColumn(droppedId, column.key);
                }
              }}
            >
              <header className="pipeline-column-head">
                <h2>{column.label}</h2>
                <span className="status-pill draft">{columnItems.length}</span>
              </header>

              <div className="pipeline-column-body">
                {columnItems.length === 0 ? <p className="muted">No items in this stage.</p> : null}

                {columnItems.map((item) => {
                  const intakeDraft = getIntakeDraft(item);
                  const cardMetaDraft = getCardMetaDraft(item);
                  const filteredHealthSystems = intakeDraft.leadSource.trim()
                    ? healthSystems
                        .filter((entry) => entry.name.toLowerCase().includes(intakeDraft.leadSource.toLowerCase()))
                        .slice(0, 8)
                    : healthSystems.slice(0, 8);

                  return (
                    <div
                      key={item.id}
                      className={`pipeline-card ${draggingId === item.id ? "dragging" : ""}`}
                      draggable={updatingId !== item.id}
                      onDragStart={(event) => {
                        setDraggingId(item.id);
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/pipeline-item-id", item.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setDragOverColumn(null);
                      }}
                      onClick={() => setSelectedDetailId(item.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDetailId(item.id);
                        }
                      }}
                    >
                      <div className="pipeline-card-head">
                        <h3>{item.name}</h3>
                        <span className="status-pill queued">{item.phaseLabel}</span>
                      </div>
                      <p className="muted">{item.location || "Location unavailable"}</p>
                      <div className="pipeline-card-meta">
                        {item.openOpportunityCount > 0 && (
                          <p className="muted">
                            {item.openOpportunityCount} open opportunity{item.openOpportunityCount === 1 ? "" : "ies"}
                          </p>
                        )}
                        <p className="muted">Updated {formatLastUpdated(item.updatedAt)}</p>
                        {item.noteCount > 0 ? (
                          <p className="muted">
                            Notes: {item.noteCount}
                            {item.latestNote?.createdAt ? ` • Last ${formatTimestamp(item.latestNote.createdAt)} by ${item.latestNote.createdByName}` : ""}
                          </p>
                        ) : null}
                      </div>

                      <div className="pipeline-intake-fields" onClick={(event) => event.stopPropagation()}>
                        <div className="pipeline-inline-field">
                          <span className="pipeline-inline-label">Next Step</span>
                          {isEditing(item.id, "nextStep") ? (
                            <input
                              className="pipeline-inline-input"
                              value={cardMetaDraft.nextStep}
                              onChange={(event) =>
                                setCardMetaDraftsById((current) => ({
                                  ...current,
                                  [item.id]: {
                                    ...cardMetaDraft,
                                    nextStep: event.target.value
                                  }
                                }))
                              }
                              onBlur={() => {
                                setEditingField(null);
                                if (cardMetaDraft.nextStep !== item.nextStep) {
                                  void commitCardMetaDraft(item.id, cardMetaDraft, cardMetaDraftFromItem(item));
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  (event.currentTarget as HTMLInputElement).blur();
                                }
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditingField(null);
                                  setCardMetaDraftsById((current) => ({
                                    ...current,
                                    [item.id]: cardMetaDraftFromItem(item)
                                  }));
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <a
                              href="#"
                              className="pipeline-inline-link"
                              onClick={(event) => {
                                event.preventDefault();
                                setEditingField({ itemId: item.id, field: "nextStep" });
                              }}
                            >
                              {cardMetaDraft.nextStep || "Click to set"}
                            </a>
                          )}
                        </div>

                        {item.column === "INTAKE" ? (
                          <>
                            <div className="pipeline-inline-field">
                              <span className="pipeline-inline-label">Intake Date</span>
                              {isEditing(item.id, "intakeDate") ? (
                                <input
                                  type="date"
                                  className="pipeline-inline-input"
                                  value={intakeDraft.intakeScheduledAt}
                                  onChange={(event) => {
                                    const nextDraft: IntakeDraft = {
                                      ...intakeDraft,
                                      intakeScheduledAt: event.target.value
                                    };
                                    setEditingField(null);
                                    void commitIntakeDraft(item.id, nextDraft, intakeDraftFromItem(item));
                                  }}
                                  onBlur={() => setEditingField(null)}
                                  autoFocus
                                />
                              ) : (
                                <a
                                  href="#"
                                  className="pipeline-inline-link"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setEditingField({ itemId: item.id, field: "intakeDate" });
                                  }}
                                >
                                  {toDateDisplayValue(item.intakeScheduledAt)}
                                </a>
                              )}
                            </div>

                            <div className="pipeline-inline-field">
                              <span className="pipeline-inline-label">Decline Reason</span>
                              {isEditing(item.id, "declineReason") ? (
                                <select
                                  className="pipeline-inline-input"
                                  value={intakeDraft.declineReason}
                                  onChange={(event) => {
                                    const nextDraft: IntakeDraft = {
                                      ...intakeDraft,
                                      declineReason: event.target.value as IntakeDeclineReason | ""
                                    };
                                    setEditingField(null);
                                    void commitIntakeDraft(item.id, nextDraft, intakeDraftFromItem(item));
                                  }}
                                  onBlur={() => setEditingField(null)}
                                  autoFocus
                                >
                                  {intakeDeclineReasonOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <a
                                  href="#"
                                  className="pipeline-inline-link"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setEditingField({ itemId: item.id, field: "declineReason" });
                                  }}
                                >
                                  {declineReasonLabel(intakeDraft.declineReason)}
                                </a>
                              )}
                            </div>

                            <div className="pipeline-inline-field pipeline-inline-field-lead-source">
                              <span className="pipeline-inline-label">Lead Source</span>
                              {isEditing(item.id, "leadSource") ? (
                                <div className="pipeline-inline-lead-source">
                                  <input
                                    className="pipeline-inline-input"
                                    value={intakeDraft.leadSource}
                                    onChange={(event) =>
                                      setIntakeDraftsById((current) => ({
                                        ...current,
                                        [item.id]: {
                                          ...intakeDraft,
                                          leadSource: event.target.value
                                        }
                                      }))
                                    }
                                    onBlur={() => {
                                      if (suppressLeadSourceBlurRef.current) {
                                        suppressLeadSourceBlurRef.current = false;
                                        return;
                                      }
                                      setEditingField(null);
                                      if (intakeDraft.leadSource !== item.leadSource) {
                                        void commitIntakeDraft(item.id, intakeDraft, intakeDraftFromItem(item));
                                      }
                                    }}
                                    onKeyDown={(event) => {
                                      if (event.key === "Enter") {
                                        event.preventDefault();
                                        setEditingField(null);
                                        if (intakeDraft.leadSource !== item.leadSource) {
                                          void commitIntakeDraft(item.id, intakeDraft, intakeDraftFromItem(item));
                                        }
                                      }
                                      if (event.key === "Escape") {
                                        event.preventDefault();
                                        setEditingField(null);
                                        setIntakeDraftsById((current) => ({
                                          ...current,
                                          [item.id]: intakeDraftFromItem(item)
                                        }));
                                      }
                                    }}
                                    placeholder="Type to search health systems or free text"
                                    autoFocus
                                  />
                                  {filteredHealthSystems.length > 0 ? (
                                    <div className="pipeline-inline-suggestions">
                                      {filteredHealthSystems.map((entry) => (
                                        <a
                                          key={entry.id}
                                          href="#"
                                          className="pipeline-inline-suggestion"
                                          onMouseDown={(event) => {
                                            event.preventDefault();
                                            suppressLeadSourceBlurRef.current = true;
                                          }}
                                          onClick={(event) => {
                                            event.preventDefault();
                                            setEditingField(null);
                                            const nextDraft: IntakeDraft = { ...intakeDraft, leadSource: entry.name };
                                            void commitIntakeDraft(item.id, nextDraft, intakeDraftFromItem(item));
                                          }}
                                        >
                                          {entry.name}
                                        </a>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              ) : (
                                <a
                                  href="#"
                                  className="pipeline-inline-link"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setEditingField({ itemId: item.id, field: "leadSource" });
                                  }}
                                >
                                  {intakeDraft.leadSource || "Click to set"}
                                </a>
                              )}
                            </div>
                          </>
                        ) : null}

                        {item.column === "VENTURE_STUDIO_CONTRACT_EVALUATION" ? (
                          <>
                            <div className="pipeline-inline-field">
                              <span className="pipeline-inline-label">Likelihood to Close (%)</span>
                              {isEditing(item.id, "ventureLikelihoodPercent") ? (
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  className="pipeline-inline-input"
                                  value={cardMetaDraft.ventureLikelihoodPercent}
                                  onChange={(event) =>
                                    setCardMetaDraftsById((current) => ({
                                      ...current,
                                      [item.id]: {
                                        ...cardMetaDraft,
                                        ventureLikelihoodPercent: event.target.value
                                      }
                                    }))
                                  }
                                  onBlur={() => {
                                    setEditingField(null);
                                    if (
                                      cardMetaDraft.ventureLikelihoodPercent !==
                                      (item.ventureLikelihoodPercent === null ? "" : String(item.ventureLikelihoodPercent))
                                    ) {
                                      void commitCardMetaDraft(item.id, cardMetaDraft, cardMetaDraftFromItem(item));
                                    }
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") {
                                      event.preventDefault();
                                      (event.currentTarget as HTMLInputElement).blur();
                                    }
                                    if (event.key === "Escape") {
                                      event.preventDefault();
                                      setEditingField(null);
                                      setCardMetaDraftsById((current) => ({
                                        ...current,
                                        [item.id]: cardMetaDraftFromItem(item)
                                      }));
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <a
                                  href="#"
                                  className="pipeline-inline-link"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setEditingField({ itemId: item.id, field: "ventureLikelihoodPercent" });
                                  }}
                                >
                                  {cardMetaDraft.ventureLikelihoodPercent || "Click to set"}
                                </a>
                              )}
                            </div>

                            <div className="pipeline-inline-field">
                              <span className="pipeline-inline-label">Expected Close Date</span>
                              {isEditing(item.id, "ventureExpectedCloseDate") ? (
                                <input
                                  type="date"
                                  className="pipeline-inline-input"
                                  value={cardMetaDraft.ventureExpectedCloseDate}
                                  onChange={(event) => {
                                    const nextDraft: CardMetaDraft = {
                                      ...cardMetaDraft,
                                      ventureExpectedCloseDate: event.target.value
                                    };
                                    setEditingField(null);
                                    void commitCardMetaDraft(item.id, nextDraft, cardMetaDraftFromItem(item));
                                  }}
                                  onBlur={() => setEditingField(null)}
                                  autoFocus
                                />
                              ) : (
                                <a
                                  href="#"
                                  className="pipeline-inline-link"
                                  onClick={(event) => {
                                    event.preventDefault();
                                    setEditingField({ itemId: item.id, field: "ventureExpectedCloseDate" });
                                  }}
                                >
                                  {toDateDisplayValue(item.ventureExpectedCloseDate)}
                                </a>
                              )}
                            </div>
                          </>
                        ) : null}

                        {savingIntakeById[item.id] || savingCardById[item.id] ? <p className="status">Saving...</p> : null}
                      </div>

                      <div className="actions" style={{ marginTop: 0 }}>
                        <a
                          href="#"
                          className="pipeline-action-link"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setNoteModal({
                              itemId: item.id,
                              itemName: item.name,
                              draft: "",
                              saving: false
                            });
                          }}
                        >
                          Add Note
                        </a>

                        {nextBoardColumn(item.column) ? (
                          <a
                            href="#"
                            className={`pipeline-action-link ${updatingId ? "disabled" : ""}`}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              if (updatingId) return;
                              const nextColumn = nextBoardColumn(item.column);
                              if (nextColumn) {
                                void moveItemToColumn(item.id, nextColumn);
                              }
                            }}
                          >
                            Move to{" "}
                            {PIPELINE_BOARD_COLUMNS.find((entry) => entry.key === nextBoardColumn(item.column))?.label}
                          </a>
                        ) : null}
                      </div>

                      {updatingId === item.id ? <p className="status">Saving stage change...</p> : null}
                    </div>
                  );
                })}
              </div>
            </article>
          );
        })}
      </section>

      {undoToast ? (
        <div className="pipeline-undo-toast" role="status" aria-live="polite">
          <p>{undoToast.itemName} did not meet our criteria.</p>
          <a
            href="#"
            className="pipeline-action-link"
            onClick={(event) => {
              event.preventDefault();
              void undoDecline();
            }}
          >
            Undo
          </a>
        </div>
      ) : null}

      {noteModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => setNoteModal(null)}>
            <div className="pipeline-note-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <h3>Add Note</h3>
            <p className="muted">{noteModal.itemName}</p>
            <RichTextArea
              className="pipeline-note-textarea"
              value={noteModal.draft}
              onChange={(nextValue) =>
                setNoteModal((current) => (current ? { ...current, draft: nextValue } : current))
              }
              placeholder="Enter note text"
            />
            <div className="actions">
              <a
                href="#"
                className={`pipeline-action-link ${noteModal.saving ? "disabled" : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  if (noteModal.saving) return;
                  setNoteModal(null);
                }}
              >
                Cancel
              </a>
              <a
                href="#"
                className={`pipeline-action-link ${noteModal.saving ? "disabled" : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  if (noteModal.saving) return;
                  void savePipelineNote();
                }}
              >
                {noteModal.saving ? "Saving..." : "Save Note"}
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {selectedDetailId ? (
        <div className="pipeline-detail-backdrop" onMouseDown={closeDetailModal}>
          <div className="pipeline-detail-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="pipeline-detail-modal-header">
              <button
                type="button"
                className="modal-icon-close"
                onClick={closeDetailModal}
                aria-label="Close pipeline detail dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <PipelineOpportunityDetailView itemId={selectedDetailId} inModal />
          </div>
        </div>
      ) : null}
    </main>
  );
}
