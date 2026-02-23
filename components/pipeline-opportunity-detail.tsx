"use client";

import * as React from "react";
import Link from "next/link";
import {
  PIPELINE_BOARD_COLUMNS,
  mapBoardColumnToCanonicalPhase,
  mapPhaseToBoardColumn,
  phaseLabel,
  type PipelineBoardColumn,
  type PipelinePhase
} from "@/lib/pipeline-opportunities";
import { EntityLookupInput } from "./entity-lookup-input";

type ScreeningStatus = "NOT_STARTED" | "PENDING" | "NEGOTIATING" | "SIGNED" | "DECLINED";
type ScreeningAttendanceStatus = "INVITED" | "ATTENDED" | "DECLINED" | "NO_SHOW";
type ScreeningFeedbackSentiment = "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";
type ScreeningCellField = "RELEVANT_FEEDBACK" | "STATUS_UPDATE";

type ScreeningParticipant = {
  id: string;
  contactId: string | null;
  contactName: string;
  contactTitle: string | null;
  attendanceStatus: ScreeningAttendanceStatus;
  eventId: string;
  eventTitle: string;
  eventType: string;
  eventScheduledAt: string | null;
  eventCompletedAt: string | null;
  notes: string | null;
};

type ScreeningQuantitativeFeedback = {
  id: string;
  contactId: string | null;
  contactName: string;
  contactTitle: string | null;
  category: string | null;
  metric: string;
  score: number | null;
  weightPercent: number | null;
  notes: string | null;
  updatedAt: string;
};

type ScreeningQualitativeFeedback = {
  id: string;
  contactId: string | null;
  contactName: string;
  contactTitle: string | null;
  category: string | null;
  theme: string;
  sentiment: ScreeningFeedbackSentiment;
  feedback: string;
  updatedAt: string;
};

type ScreeningCellChange = {
  id: string;
  value: string;
  changedAt: string;
  changedByUserId: string | null;
  changedByName: string;
};

type ScreeningHealthSystem = {
  healthSystemId: string;
  healthSystemName: string;
  status: ScreeningStatus;
  notes: string;
  statusUpdatedAt: string | null;
  relevantFeedback: string;
  statusUpdate: string;
  relevantFeedbackHistory: ScreeningCellChange[];
  statusUpdateHistory: ScreeningCellChange[];
  participants: ScreeningParticipant[];
  documents: Array<{
    id: string;
    title: string;
    url: string;
    notes: string | null;
    uploadedAt: string;
  }>;
  quantitativeFeedback: ScreeningQuantitativeFeedback[];
  qualitativeFeedback: ScreeningQualitativeFeedback[];
};

type PipelineOpportunityDetail = {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  location: string;
  phase: PipelinePhase;
  phaseLabel: string;
  column: PipelineBoardColumn | null;
  isScreeningStage: boolean;
  opportunities: Array<{
    id: string;
    title: string;
    type: string;
    stage: string;
    amountUsd: number | string | null;
    likelihoodPercent: number | null;
    nextSteps: string | null;
    notes: string | null;
    estimatedCloseDate: string | null;
    updatedAt: string;
    healthSystem: { id: string; name: string } | null;
  }>;
  documents: Array<{
    id: string;
    type: string;
    title: string;
    url: string;
    notes: string | null;
    uploadedAt: string;
  }>;
  screening: {
    healthSystems: ScreeningHealthSystem[];
  };
};

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusMeta(status: ScreeningStatus) {
  if (status === "DECLINED") {
    return { label: "Interested, declined LOI", className: "screening-status-red" };
  }
  if (status === "PENDING") {
    return { label: "Evaluating LOI", className: "screening-status-yellow" };
  }
  if (status === "NEGOTIATING") {
    return { label: "Evaluating LOI (active)", className: "screening-status-green" };
  }
  if (status === "SIGNED") {
    return { label: "LOI signed", className: "screening-status-green" };
  }
  return { label: "Not interested", className: "screening-status-grey" };
}

function attendanceStatusLabel(status: ScreeningAttendanceStatus) {
  if (status === "ATTENDED") return "Attended";
  if (status === "DECLINED") return "Declined";
  if (status === "NO_SHOW") return "No Show";
  return "Invited";
}

function sentimentLabel(sentiment: ScreeningFeedbackSentiment) {
  if (sentiment === "POSITIVE") return "Positive";
  if (sentiment === "NEGATIVE") return "Negative";
  if (sentiment === "MIXED") return "Mixed";
  return "Neutral";
}

const screeningStatusOptions: Array<{ value: ScreeningStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Not interested" },
  { value: "DECLINED", label: "Interested, declined LOI" },
  { value: "PENDING", label: "Evaluating LOI" },
  { value: "NEGOTIATING", label: "Evaluating LOI - active" },
  { value: "SIGNED", label: "LOI signed" }
];

const quantitativeCategoryOptions = [
  "Desirability",
  "Feasibility",
  "Impact and Viability",
  "Co-Development"
];

const qualitativeCategoryOptions = [
  "Data Privacy, Security & De-Identification",
  "Pricing Predictability",
  "Governance & Prioritization Requirements",
  "Differentiation with Epic",
  "Delivery Model & Implementation Capacity",
  "Sustained Value & Monitoring",
  "Consortium Economics & Research Flywheel",
  "Key Theme"
];

function uniqueIndividuals(entry: ScreeningHealthSystem) {
  const byKey = new Map<string, { key: string; label: string }>();
  for (const participant of entry.participants) {
    const key = participant.contactId || participant.id;
    if (byKey.has(key)) continue;
    const label = participant.contactTitle
      ? `${participant.contactName} (${participant.contactTitle})`
      : participant.contactName;
    byKey.set(key, { key, label });
  }
  return Array.from(byKey.values());
}

type DocumentDraft = {
  title: string;
  url: string;
  notes: string;
};

type QuantitativeFeedbackDraft = {
  contactId: string;
  category: string;
  metric: string;
  score: string;
  weightPercent: string;
  notes: string;
};

type QualitativeFeedbackDraft = {
  contactId: string;
  category: string;
  theme: string;
  sentiment: ScreeningFeedbackSentiment;
  feedback: string;
};

type FeedbackTab = "quantitative" | "qualitative";
type CellHistoryModalState = {
  healthSystemId: string;
  healthSystemName: string;
  field: ScreeningCellField;
};

function screeningCellFieldLabel(field: ScreeningCellField) {
  return field === "RELEVANT_FEEDBACK" ? "Relevant Feedback + Next Steps" : "Status Update";
}

function emptyDocumentDraft(): DocumentDraft {
  return {
    title: "",
    url: "",
    notes: ""
  };
}

function emptyQuantitativeFeedbackDraft(): QuantitativeFeedbackDraft {
  return {
    contactId: "",
    category: "Desirability",
    metric: "",
    score: "",
    weightPercent: "",
    notes: ""
  };
}

function emptyQualitativeFeedbackDraft(): QualitativeFeedbackDraft {
  return {
    contactId: "",
    category: "Key Theme",
    theme: "",
    sentiment: "NEUTRAL",
    feedback: ""
  };
}

export function PipelineOpportunityDetailView({
  itemId,
  inModal = false,
  onClose
}: {
  itemId: string;
  inModal?: boolean;
  onClose?: () => void;
}) {
  const [item, setItem] = React.useState<PipelineOpportunityDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [savingPhase, setSavingPhase] = React.useState(false);
  const [savingStatusByHealthSystemId, setSavingStatusByHealthSystemId] = React.useState<Record<string, boolean>>({});
  const [savingDocumentByHealthSystemId, setSavingDocumentByHealthSystemId] = React.useState<Record<string, boolean>>({});
  const [savingFeedbackByHealthSystemId, setSavingFeedbackByHealthSystemId] = React.useState<Record<string, boolean>>({});
  const [savingScreeningCellByKey, setSavingScreeningCellByKey] = React.useState<Record<string, boolean>>({});
  const [addingAttendeeByHealthSystemId, setAddingAttendeeByHealthSystemId] = React.useState<Record<string, boolean>>({});
  const [noteDraftByHealthSystemId, setNoteDraftByHealthSystemId] = React.useState<Record<string, string>>({});
  const [relevantFeedbackDraftByHealthSystemId, setRelevantFeedbackDraftByHealthSystemId] = React.useState<
    Record<string, string>
  >({});
  const [statusUpdateDraftByHealthSystemId, setStatusUpdateDraftByHealthSystemId] = React.useState<
    Record<string, string>
  >({});
  const [attendeeLookupValueByHealthSystemId, setAttendeeLookupValueByHealthSystemId] = React.useState<
    Record<string, string>
  >({});
  const [documentDraftByHealthSystemId, setDocumentDraftByHealthSystemId] = React.useState<Record<string, DocumentDraft>>({});
  const [quantitativeDraftByHealthSystemId, setQuantitativeDraftByHealthSystemId] = React.useState<
    Record<string, QuantitativeFeedbackDraft>
  >({});
  const [qualitativeDraftByHealthSystemId, setQualitativeDraftByHealthSystemId] = React.useState<
    Record<string, QualitativeFeedbackDraft>
  >({});
  const [feedbackTabByHealthSystemId, setFeedbackTabByHealthSystemId] = React.useState<Record<string, FeedbackTab>>({});
  const [activeScreeningHealthSystemId, setActiveScreeningHealthSystemId] = React.useState<string | null>(null);
  const [cellHistoryModal, setCellHistoryModal] = React.useState<CellHistoryModalState | null>(null);

  const loadItem = React.useCallback(async () => {
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${itemId}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load pipeline detail");
      setItem(payload.item || null);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load pipeline detail"
      });
      setItem(null);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  React.useEffect(() => {
    void loadItem();
  }, [loadItem]);

  React.useEffect(() => {
    if (!item?.isScreeningStage) {
      setActiveScreeningHealthSystemId(null);
      return;
    }

    const firstHealthSystemId = item.screening.healthSystems[0]?.healthSystemId || null;
    if (!firstHealthSystemId) {
      setActiveScreeningHealthSystemId(null);
      return;
    }

    const currentStillExists = item.screening.healthSystems.some(
      (entry) => entry.healthSystemId === activeScreeningHealthSystemId
    );
    if (currentStillExists && activeScreeningHealthSystemId) return;
    setActiveScreeningHealthSystemId(firstHealthSystemId);
  }, [item, activeScreeningHealthSystemId]);

  React.useEffect(() => {
    if (!item?.isScreeningStage) {
      setRelevantFeedbackDraftByHealthSystemId({});
      setStatusUpdateDraftByHealthSystemId({});
      setAttendeeLookupValueByHealthSystemId({});
      return;
    }

    setRelevantFeedbackDraftByHealthSystemId((current) => {
      const next: Record<string, string> = {};
      for (const entry of item.screening.healthSystems) {
        next[entry.healthSystemId] = current[entry.healthSystemId] ?? entry.relevantFeedback ?? "";
      }
      return next;
    });
    setStatusUpdateDraftByHealthSystemId((current) => {
      const next: Record<string, string> = {};
      for (const entry of item.screening.healthSystems) {
        next[entry.healthSystemId] = current[entry.healthSystemId] ?? entry.statusUpdate ?? "";
      }
      return next;
    });
    setAttendeeLookupValueByHealthSystemId((current) => {
      const next: Record<string, string> = {};
      for (const entry of item.screening.healthSystems) {
        next[entry.healthSystemId] = current[entry.healthSystemId] || "";
      }
      return next;
    });
  }, [item]);

  function screeningCellKey(healthSystemId: string, field: ScreeningCellField) {
    return `${healthSystemId}:${field}`;
  }

  async function saveScreeningCell(healthSystemId: string, field: ScreeningCellField) {
    if (!item) return;

    const value =
      field === "RELEVANT_FEEDBACK"
        ? relevantFeedbackDraftByHealthSystemId[healthSystemId] || ""
        : statusUpdateDraftByHealthSystemId[healthSystemId] || "";

    const currentEntry = item.screening.healthSystems.find((entry) => entry.healthSystemId === healthSystemId);
    if (!currentEntry) return;
    const currentValue = field === "RELEVANT_FEEDBACK" ? currentEntry.relevantFeedback : currentEntry.statusUpdate;
    if ((currentValue || "").trim() === value.trim()) return;

    const key = screeningCellKey(healthSystemId, field);
    setSavingScreeningCellByKey((current) => ({ ...current, [key]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening-cells`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          healthSystemId,
          field,
          value
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update screening field.");
      const entry = payload.entry as ScreeningCellChange | undefined;

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((healthSystem) => {
              if (healthSystem.healthSystemId !== healthSystemId) return healthSystem;

              const nextHistory =
                field === "RELEVANT_FEEDBACK"
                  ? entry
                    ? [entry, ...healthSystem.relevantFeedbackHistory]
                    : healthSystem.relevantFeedbackHistory
                  : entry
                    ? [entry, ...healthSystem.statusUpdateHistory]
                    : healthSystem.statusUpdateHistory;

              return {
                ...healthSystem,
                relevantFeedback:
                  field === "RELEVANT_FEEDBACK" ? value.trim() : healthSystem.relevantFeedback,
                statusUpdate: field === "STATUS_UPDATE" ? value.trim() : healthSystem.statusUpdate,
                relevantFeedbackHistory:
                  field === "RELEVANT_FEEDBACK"
                    ? nextHistory
                    : healthSystem.relevantFeedbackHistory,
                statusUpdateHistory:
                  field === "STATUS_UPDATE" ? nextHistory : healthSystem.statusUpdateHistory
              };
            })
          }
        };
      });
      setStatus({ kind: "ok", text: `${screeningCellFieldLabel(field)} updated.` });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update screening field."
      });
    } finally {
      setSavingScreeningCellByKey((current) => ({ ...current, [key]: false }));
    }
  }

  async function addScreeningAttendee(healthSystemId: string, contactId: string) {
    if (!item || !contactId) return;
    setAddingAttendeeByHealthSystemId((current) => ({ ...current, [healthSystemId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening-attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          healthSystemId,
          contactId,
          attendanceStatus: "ATTENDED"
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add attendee.");
      const participant = payload.participant as ScreeningParticipant | undefined;
      if (!participant) throw new Error("Failed to add attendee.");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((entry) => {
              if (entry.healthSystemId !== healthSystemId) return entry;
              const existingIndex = entry.participants.findIndex((row) => row.id === participant.id);
              if (existingIndex >= 0) {
                const next = [...entry.participants];
                next[existingIndex] = participant;
                return { ...entry, participants: next };
              }
              return { ...entry, participants: [participant, ...entry.participants] };
            })
          }
        };
      });

      setAttendeeLookupValueByHealthSystemId((current) => ({ ...current, [healthSystemId]: "" }));
      setStatus({ kind: "ok", text: "Attendee added." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add attendee."
      });
    } finally {
      setAddingAttendeeByHealthSystemId((current) => ({ ...current, [healthSystemId]: false }));
    }
  }

  async function updateColumn(nextColumn: PipelineBoardColumn) {
    if (!item) return;
    const nextPhase = mapBoardColumnToCanonicalPhase(nextColumn);
    if (item.column === nextColumn && item.phase === nextPhase) return;

    setSavingPhase(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phase: nextPhase })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update phase");

      setItem((current) => {
        if (!current) return current;
        const phase = (payload.phase || nextPhase) as PipelinePhase;
        return {
          ...current,
          phase,
          phaseLabel: payload.phaseLabel || phaseLabel(phase),
          column: (payload.column || mapPhaseToBoardColumn(phase)) as PipelineBoardColumn | null,
          isScreeningStage: mapPhaseToBoardColumn(phase) === "SCREENING"
        };
      });
      setStatus({ kind: "ok", text: "Pipeline stage updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update stage"
      });
    } finally {
      setSavingPhase(false);
    }
  }

  async function updateScreeningStatus(healthSystemId: string, nextStatus: ScreeningStatus) {
    if (!item) return;

    setSavingStatusByHealthSystemId((current) => ({ ...current, [healthSystemId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          healthSystemId,
          status: nextStatus
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update screening status");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((entry) =>
              entry.healthSystemId === healthSystemId
                ? {
                    ...entry,
                    status: payload.status || nextStatus,
                    notes: payload.notes ?? entry.notes,
                    statusUpdatedAt: payload.statusUpdatedAt || entry.statusUpdatedAt
                  }
                : entry
            )
          }
        };
      });
      setStatus({ kind: "ok", text: "Health system status updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update screening status"
      });
    } finally {
      setSavingStatusByHealthSystemId((current) => ({ ...current, [healthSystemId]: false }));
    }
  }

  async function addScreeningNote(healthSystemId: string) {
    if (!item) return;
    const note = (noteDraftByHealthSystemId[healthSystemId] || "").trim();
    if (!note) {
      setStatus({ kind: "error", text: "Enter a note before adding." });
      return;
    }

    setSavingStatusByHealthSystemId((current) => ({ ...current, [healthSystemId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          healthSystemId,
          note
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add screening note");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((entry) =>
              entry.healthSystemId === healthSystemId
                ? {
                    ...entry,
                    status: payload.status || entry.status,
                    notes: payload.notes ?? entry.notes,
                    statusUpdatedAt: payload.statusUpdatedAt || entry.statusUpdatedAt
                  }
                : entry
            )
          }
        };
      });
      setNoteDraftByHealthSystemId((current) => ({ ...current, [healthSystemId]: "" }));
      setStatus({ kind: "ok", text: "Note added." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add note"
      });
    } finally {
      setSavingStatusByHealthSystemId((current) => ({ ...current, [healthSystemId]: false }));
    }
  }

  async function addScreeningDocument(healthSystemId: string) {
    if (!item) return;
    const draft = documentDraftByHealthSystemId[healthSystemId] || emptyDocumentDraft();
    const title = draft.title.trim();
    const url = draft.url.trim();
    const notes = draft.notes.trim();

    if (!title || !url) {
      setStatus({ kind: "error", text: "Document title and URL are required." });
      return;
    }

    setSavingDocumentByHealthSystemId((current) => ({ ...current, [healthSystemId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening-documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          healthSystemId,
          title,
          url,
          notes
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add screening document");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((entry) =>
              entry.healthSystemId === healthSystemId
                ? {
                    ...entry,
                    documents: [payload.document, ...entry.documents]
                  }
                : entry
            )
          }
        };
      });
      setDocumentDraftByHealthSystemId((current) => ({
        ...current,
        [healthSystemId]: emptyDocumentDraft()
      }));
      setStatus({ kind: "ok", text: "Document added." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add document"
      });
    } finally {
      setSavingDocumentByHealthSystemId((current) => ({ ...current, [healthSystemId]: false }));
    }
  }

  async function addQuantitativeFeedback(healthSystemId: string) {
    if (!item) return;
    const draft = quantitativeDraftByHealthSystemId[healthSystemId] || emptyQuantitativeFeedbackDraft();
    const category = draft.category.trim();
    const metric = draft.metric.trim();
    const notes = draft.notes.trim();
    const scoreText = draft.score.trim();
    const weightText = draft.weightPercent.trim();

    if (!category || !metric) {
      setStatus({ kind: "error", text: "Category and metric are required for quantitative feedback." });
      return;
    }

    const score = scoreText ? Number(scoreText) : null;
    if (scoreText && (score === null || !Number.isFinite(score) || score < 1 || score > 10)) {
      setStatus({ kind: "error", text: "Score must be a number between 1 and 10." });
      return;
    }

    const weightPercent = weightText ? Number(weightText) : null;
    if (
      weightText &&
      (weightPercent === null ||
        !Number.isInteger(weightPercent) ||
        weightPercent < 0 ||
        weightPercent > 100)
    ) {
      setStatus({ kind: "error", text: "Weight must be a whole number between 0 and 100." });
      return;
    }

    setSavingFeedbackByHealthSystemId((current) => ({ ...current, [healthSystemId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "QUANTITATIVE",
          healthSystemId,
          contactId: draft.contactId || undefined,
          category,
          metric,
          score: score ?? undefined,
          weightPercent: weightPercent ?? undefined,
          notes
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add quantitative feedback");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((entry) =>
              entry.healthSystemId === healthSystemId
                ? {
                    ...entry,
                    quantitativeFeedback: [payload.entry, ...entry.quantitativeFeedback]
                  }
                : entry
            )
          }
        };
      });
      setQuantitativeDraftByHealthSystemId((current) => ({
        ...current,
        [healthSystemId]: emptyQuantitativeFeedbackDraft()
      }));
      setStatus({ kind: "ok", text: "Quantitative feedback captured." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add quantitative feedback"
      });
    } finally {
      setSavingFeedbackByHealthSystemId((current) => ({ ...current, [healthSystemId]: false }));
    }
  }

  async function addQualitativeFeedback(healthSystemId: string) {
    if (!item) return;
    const draft = qualitativeDraftByHealthSystemId[healthSystemId] || emptyQualitativeFeedbackDraft();
    const category = draft.category.trim();
    const theme = draft.theme.trim();
    const feedback = draft.feedback.trim();

    if (!category || !theme || !feedback) {
      setStatus({ kind: "error", text: "Category, theme, and feedback are required." });
      return;
    }

    setSavingFeedbackByHealthSystemId((current) => ({ ...current, [healthSystemId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "QUALITATIVE",
          healthSystemId,
          contactId: draft.contactId || undefined,
          category,
          theme,
          sentiment: draft.sentiment,
          feedback
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add qualitative feedback");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((entry) =>
              entry.healthSystemId === healthSystemId
                ? {
                    ...entry,
                    qualitativeFeedback: [payload.entry, ...entry.qualitativeFeedback]
                  }
                : entry
            )
          }
        };
      });
      setQualitativeDraftByHealthSystemId((current) => ({
        ...current,
        [healthSystemId]: emptyQualitativeFeedbackDraft()
      }));
      setStatus({ kind: "ok", text: "Qualitative feedback captured." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add qualitative feedback"
      });
    } finally {
      setSavingFeedbackByHealthSystemId((current) => ({ ...current, [healthSystemId]: false }));
    }
  }

  if (loading) {
    const LoadingWrapper: React.ElementType = inModal ? "div" : "main";
    return (
      <LoadingWrapper className={inModal ? "pipeline-detail-content" : undefined}>
        <section className="panel">
          <p className="muted">Loading pipeline detail...</p>
        </section>
      </LoadingWrapper>
    );
  }

  if (!item) {
    const EmptyWrapper: React.ElementType = inModal ? "div" : "main";
    return (
      <EmptyWrapper className={inModal ? "pipeline-detail-content" : undefined}>
        <section className="panel">
          <p className="muted">Pipeline item not found.</p>
          <div className="actions">
            {inModal ? (
              <button className="secondary" type="button" onClick={onClose}>
                Close
              </button>
            ) : (
              <Link href="/pipeline" className="top-nav-link top-nav-link-quiet">
                Back to Pipeline Board
              </Link>
            )}
          </div>
        </section>
      </EmptyWrapper>
    );
  }

  const ContentWrapper: React.ElementType = inModal ? "div" : "main";
  const selectedScreeningHealthSystem =
    item.screening.healthSystems.find((entry) => entry.healthSystemId === activeScreeningHealthSystemId) ||
    item.screening.healthSystems[0] ||
    null;

  const selectedFeedbackTab: FeedbackTab =
    (selectedScreeningHealthSystem &&
      feedbackTabByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]) ||
    "quantitative";

  const selectedIndividualOptions =
    selectedScreeningHealthSystem?.participants.reduce<Array<{ id: string; label: string }>>((accumulator, participant) => {
      if (!participant.contactId) return accumulator;
      if (accumulator.some((entry) => entry.id === participant.contactId)) return accumulator;
      const label = participant.contactTitle
        ? `${participant.contactName} (${participant.contactTitle})`
        : participant.contactName;
      accumulator.push({ id: participant.contactId, label });
      return accumulator;
    }, []) || [];

  const quantitativeSummaryByCategory = (() => {
    if (!selectedScreeningHealthSystem) return [] as Array<{
      category: string;
      rows: Array<{
        metric: string;
        responseCount: number;
        averageScore: number | null;
        distribution: Record<number, number>;
      }>;
    }>;

    const grouped = new Map<
      string,
      Map<string, { scores: number[]; distribution: Record<number, number>; responseCount: number }>
    >();

    for (const entry of selectedScreeningHealthSystem.quantitativeFeedback) {
      const category = entry.category || "Uncategorized";
      const metric = entry.metric || "Untitled metric";
      const categoryMap = grouped.get(category) || new Map();
      const metricData = categoryMap.get(metric) || {
        scores: [],
        responseCount: 0,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
      };

      metricData.responseCount += 1;
      if (entry.score !== null && Number.isFinite(entry.score)) {
        metricData.scores.push(entry.score);
        const bucket = Math.max(1, Math.min(10, Math.round(entry.score)));
        metricData.distribution[bucket] = (metricData.distribution[bucket] || 0) + 1;
      }
      categoryMap.set(metric, metricData);
      grouped.set(category, categoryMap);
    }

    return Array.from(grouped.entries())
      .map(([category, metrics]) => ({
        category,
        rows: Array.from(metrics.entries()).map(([metric, data]) => ({
          metric,
          responseCount: data.responseCount,
          averageScore:
            data.scores.length > 0
              ? Math.round((data.scores.reduce((sum, value) => sum + value, 0) / data.scores.length) * 10) / 10
              : null,
          distribution: data.distribution
        }))
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  })();

  const activeCellHistory = (() => {
    if (!cellHistoryModal) return null;
    const target = item.screening.healthSystems.find(
      (entry) => entry.healthSystemId === cellHistoryModal.healthSystemId
    );
    if (!target) return null;
    const history =
      cellHistoryModal.field === "RELEVANT_FEEDBACK"
        ? target.relevantFeedbackHistory
        : target.statusUpdateHistory;
    return {
      healthSystemName: target.healthSystemName,
      field: cellHistoryModal.field,
      history
    };
  })();

  return (
    <ContentWrapper className={inModal ? "pipeline-detail-content" : undefined}>
      <section className="hero">
        <div className="actions" style={{ marginTop: 0 }}>
          {inModal ? (
            <button className="secondary small" type="button" onClick={onClose}>
              Close
            </button>
          ) : (
            <Link href="/pipeline" className="top-nav-link top-nav-link-quiet">
              Back to Pipeline Board
            </Link>
          )}
        </div>
        <h1>{item.name}</h1>
        <p>{item.location || "Location unavailable"}</p>
      </section>

      <section className="panel">
        <h2>Pipeline Overview</h2>
        <div className="row">
          <div>
            <label>Current Stage</label>
            <select
              value={item.column || ""}
              onChange={(event) => {
                const nextColumn = event.target.value as PipelineBoardColumn;
                if (nextColumn) {
                  void updateColumn(nextColumn);
                }
              }}
              disabled={savingPhase}
            >
              <option value="" disabled>
                Select stage
              </option>
              {PIPELINE_BOARD_COLUMNS.map((column) => (
                <option key={column.key} value={column.key}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Pipeline Phase</label>
            <input value={item.phaseLabel} readOnly />
          </div>
        </div>

        <div className="row">
          <div>
            <label>Website</label>
            <input value={item.website || ""} readOnly />
          </div>
          <div>
            <label>Stage Type</label>
            <input value={item.isScreeningStage ? "Screening" : "Non-screening"} readOnly />
          </div>
        </div>

        {item.description ? (
          <div className="detail-section">
            <label>Description</label>
            <textarea value={item.description} readOnly />
          </div>
        ) : null}
      </section>

      <section className="panel">
        <h2>Open Opportunities</h2>
        {item.opportunities.length === 0 ? <p className="muted">No open opportunities.</p> : null}
        <div className="pipeline-detail-list">
          {item.opportunities.map((opportunity) => (
            <div key={opportunity.id} className="detail-list-item">
              <div className="detail-grid">
                <div>
                  <label>Title</label>
                  <input value={opportunity.title} readOnly />
                </div>
                <div>
                  <label>Stage</label>
                  <input value={opportunity.stage} readOnly />
                </div>
                <div>
                  <label>Type</label>
                  <input value={opportunity.type} readOnly />
                </div>
                <div>
                  <label>Health System</label>
                  <input value={opportunity.healthSystem?.name || "Not linked"} readOnly />
                </div>
              </div>
              {opportunity.nextSteps ? (
                <>
                  <label>Next Steps</label>
                  <textarea value={opportunity.nextSteps} readOnly />
                </>
              ) : null}
              {opportunity.notes ? (
                <>
                  <label>Notes</label>
                  <textarea value={opportunity.notes} readOnly />
                </>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Company Documents</h2>
        {item.documents.length === 0 ? <p className="muted">No company-level documents.</p> : null}
        <div className="pipeline-doc-list">
          {item.documents.map((document) => (
            <div key={document.id} className="detail-list-item">
              <div className="pipeline-doc-head">
                <strong>{document.title}</strong>
                <span className="status-pill draft">{document.type}</span>
              </div>
              <p className="muted">
                <a href={document.url} target="_blank" rel="noreferrer">
                  {document.url}
                </a>
              </p>
              <p className="muted">Uploaded {formatDate(document.uploadedAt)}</p>
              {document.notes ? <p className="muted">{document.notes}</p> : null}
            </div>
          ))}
        </div>
      </section>

      {item.isScreeningStage ? (
        <section className="panel">
          <h2>Alliance Screening Status</h2>
          <p className="muted">
            Overview mirrors screening operations: all alliance systems, tracked individuals, and each system LOI status.
          </p>

          <div className="screening-overview-table-wrap">
            <table className="screening-overview-table">
              <thead>
                <tr>
                  <th scope="col">Organization</th>
                  <th scope="col">Attend? (#)</th>
                  <th scope="col">Preliminary Interest</th>
                  <th scope="col">Attendees</th>
                  <th scope="col">Relevant Feedback + Next Steps</th>
                  <th scope="col">Status Update</th>
                </tr>
              </thead>
              <tbody>
                {item.screening.healthSystems.map((entry) => {
                  const currentStatus = statusMeta(entry.status);
                  const isActive = selectedScreeningHealthSystem?.healthSystemId === entry.healthSystemId;
                  const individuals = uniqueIndividuals(entry);
                  const attendedCount = entry.participants.filter(
                    (participant) => participant.attendanceStatus === "ATTENDED"
                  ).length;
                  const relevantFeedbackDraft =
                    relevantFeedbackDraftByHealthSystemId[entry.healthSystemId] ?? entry.relevantFeedback ?? "";
                  const statusUpdateDraft =
                    statusUpdateDraftByHealthSystemId[entry.healthSystemId] ?? entry.statusUpdate ?? "";
                  const latestFeedbackEdit = entry.relevantFeedbackHistory[0] || null;
                  const latestStatusEdit = entry.statusUpdateHistory[0] || null;
                  const savingFeedbackCell = Boolean(
                    savingScreeningCellByKey[screeningCellKey(entry.healthSystemId, "RELEVANT_FEEDBACK")]
                  );
                  const savingStatusCell = Boolean(
                    savingScreeningCellByKey[screeningCellKey(entry.healthSystemId, "STATUS_UPDATE")]
                  );
                  return (
                    <tr key={entry.healthSystemId} className={isActive ? "active" : undefined}>
                      <td>
                        <button
                          type="button"
                          className={`screening-overview-select ${isActive ? "active" : ""}`}
                          onClick={() => setActiveScreeningHealthSystemId(entry.healthSystemId)}
                        >
                          {entry.healthSystemName}
                        </button>
                      </td>
                      <td>
                        {attendedCount > 0 ? (
                          <span className="screening-attendance-pill">{`\u25cf (${attendedCount})`}</span>
                        ) : (
                          <span className="muted">NA</span>
                        )}
                      </td>
                      <td>
                        <select
                          value={entry.status}
                          className={`screening-inline-status-select ${currentStatus.className}`}
                          onChange={(event) =>
                            void updateScreeningStatus(entry.healthSystemId, event.target.value as ScreeningStatus)
                          }
                          disabled={Boolean(savingStatusByHealthSystemId[entry.healthSystemId])}
                        >
                          {screeningStatusOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {individuals.length === 0 ? (
                          <span className="muted">No attendees listed</span>
                        ) : (
                          <div className="screening-attendee-list">
                            {individuals.map((individual) => (
                              <p key={individual.key}>{individual.label}</p>
                            ))}
                          </div>
                        )}
                        <div className="screening-inline-attendee-entry">
                          <EntityLookupInput
                            entityKind="CONTACT"
                            value={attendeeLookupValueByHealthSystemId[entry.healthSystemId] || ""}
                            onChange={(nextValue) => {
                              setAttendeeLookupValueByHealthSystemId((current) => ({
                                ...current,
                                [entry.healthSystemId]: nextValue
                              }));
                              if (!nextValue) return;
                              void addScreeningAttendee(entry.healthSystemId, nextValue);
                            }}
                            placeholder="Type attendee name..."
                            emptyLabel="Start typing to add attendee"
                            contactCreateContext={{
                              parentType: "healthSystem",
                              parentId: entry.healthSystemId,
                              roleType: "EXECUTIVE"
                            }}
                            contactSearchHealthSystemId={entry.healthSystemId}
                            autoOpenCreateOnEnterNoMatch
                            disabled={Boolean(addingAttendeeByHealthSystemId[entry.healthSystemId])}
                            className="screening-attendee-lookup"
                          />
                          {addingAttendeeByHealthSystemId[entry.healthSystemId] ? (
                            <p className="muted">Adding attendee...</p>
                          ) : null}
                        </div>
                      </td>
                      <td>
                        <textarea
                          className="screening-inline-textarea"
                          value={relevantFeedbackDraft}
                          placeholder="Add relevant feedback and next steps"
                          onChange={(event) =>
                            setRelevantFeedbackDraftByHealthSystemId((current) => ({
                              ...current,
                              [entry.healthSystemId]: event.target.value
                            }))
                          }
                          onBlur={() => void saveScreeningCell(entry.healthSystemId, "RELEVANT_FEEDBACK")}
                        />
                        <div className="screening-inline-cell-actions">
                          <button
                            className="secondary small"
                            type="button"
                            onClick={() => void saveScreeningCell(entry.healthSystemId, "RELEVANT_FEEDBACK")}
                            disabled={savingFeedbackCell}
                          >
                            {savingFeedbackCell ? "Saving..." : "Save"}
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() =>
                              setCellHistoryModal({
                                healthSystemId: entry.healthSystemId,
                                healthSystemName: entry.healthSystemName,
                                field: "RELEVANT_FEEDBACK"
                              })
                            }
                          >
                            History
                          </button>
                        </div>
                        {latestFeedbackEdit ? (
                          <p className="muted">
                            {`Last edit ${new Date(latestFeedbackEdit.changedAt).toLocaleString()} by ${latestFeedbackEdit.changedByName}`}
                          </p>
                        ) : null}
                      </td>
                      <td>
                        <textarea
                          className="screening-inline-textarea"
                          value={statusUpdateDraft}
                          placeholder="Add status update"
                          onChange={(event) =>
                            setStatusUpdateDraftByHealthSystemId((current) => ({
                              ...current,
                              [entry.healthSystemId]: event.target.value
                            }))
                          }
                          onBlur={() => void saveScreeningCell(entry.healthSystemId, "STATUS_UPDATE")}
                        />
                        <div className="screening-inline-cell-actions">
                          <button
                            className="secondary small"
                            type="button"
                            onClick={() => void saveScreeningCell(entry.healthSystemId, "STATUS_UPDATE")}
                            disabled={savingStatusCell}
                          >
                            {savingStatusCell ? "Saving..." : "Save"}
                          </button>
                          <button
                            className="ghost small"
                            type="button"
                            onClick={() =>
                              setCellHistoryModal({
                                healthSystemId: entry.healthSystemId,
                                healthSystemName: entry.healthSystemName,
                                field: "STATUS_UPDATE"
                              })
                            }
                          >
                            History
                          </button>
                        </div>
                        {latestStatusEdit ? (
                          <p className="muted">
                            {`Last edit ${new Date(latestStatusEdit.changedAt).toLocaleString()} by ${latestStatusEdit.changedByName}`}
                          </p>
                        ) : null}
                        <p className="muted">{formatDate(entry.statusUpdatedAt)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {selectedScreeningHealthSystem ? (
            <article className="screening-system-card">
              <div className="pipeline-card-head">
                <h3>{selectedScreeningHealthSystem.healthSystemName}</h3>
                <span className={`screening-status-pill ${statusMeta(selectedScreeningHealthSystem.status).className}`}>
                  {statusMeta(selectedScreeningHealthSystem.status).label}
                </span>
              </div>

              <div className="row">
                <div>
                  <label>Status</label>
                  <select
                    value={selectedScreeningHealthSystem.status}
                    disabled={Boolean(
                      savingStatusByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                    )}
                    onChange={(event) =>
                      void updateScreeningStatus(
                        selectedScreeningHealthSystem.healthSystemId,
                        event.target.value as ScreeningStatus
                      )
                    }
                  >
                    {screeningStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Status Updated</label>
                  <input value={formatDate(selectedScreeningHealthSystem.statusUpdatedAt)} readOnly />
                </div>
              </div>

              <p className="detail-label">Individuals</p>
              {selectedScreeningHealthSystem.participants.length === 0 ? (
                <p className="muted">No screening participants captured for this health system.</p>
              ) : (
                <div className="screening-participant-list">
                  {selectedScreeningHealthSystem.participants.map((participant) => (
                    <div key={participant.id} className="detail-list-item">
                      <div className="pipeline-card-head">
                        <strong>
                          {participant.contactTitle
                            ? `${participant.contactName} (${participant.contactTitle})`
                            : participant.contactName}
                        </strong>
                        <span className="status-pill queued">
                          {attendanceStatusLabel(participant.attendanceStatus)}
                        </span>
                      </div>
                      <p className="muted">{participant.eventTitle}</p>
                      {participant.notes ? <p className="muted">{participant.notes}</p> : null}
                    </div>
                  ))}
                </div>
              )}

              <label>Notes History</label>
              <textarea value={selectedScreeningHealthSystem.notes || ""} readOnly />

              <label>Add Note</label>
              <textarea
                value={noteDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] || ""}
                onChange={(event) =>
                  setNoteDraftByHealthSystemId((current) => ({
                    ...current,
                    [selectedScreeningHealthSystem.healthSystemId]: event.target.value
                  }))
                }
                placeholder="Add a timestamped note"
              />
              <div className="actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void addScreeningNote(selectedScreeningHealthSystem.healthSystemId)}
                  disabled={Boolean(
                    savingStatusByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                  )}
                >
                  {savingStatusByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                    ? "Saving..."
                    : "Add Note"}
                </button>
              </div>

              <p className="detail-label">Documents</p>
              {selectedScreeningHealthSystem.documents.length === 0 ? (
                <p className="muted">No screening documents yet.</p>
              ) : null}
              <div className="pipeline-doc-list">
                {selectedScreeningHealthSystem.documents.map((document) => (
                  <div key={document.id} className="detail-list-item">
                    <strong>{document.title}</strong>
                    <p className="muted">
                      <a href={document.url} target="_blank" rel="noreferrer">
                        {document.url}
                      </a>
                    </p>
                    <p className="muted">Uploaded {formatDate(document.uploadedAt)}</p>
                    {document.notes ? <p className="muted">{document.notes}</p> : null}
                  </div>
                ))}
              </div>

              <p className="detail-label">Add Document</p>
              <div className="detail-grid">
                <div>
                  <label>Title</label>
                  <input
                    value={
                      (documentDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                        emptyDocumentDraft()).title
                    }
                    onChange={(event) =>
                      setDocumentDraftByHealthSystemId((current) => ({
                        ...current,
                        [selectedScreeningHealthSystem.healthSystemId]: {
                          ...(current[selectedScreeningHealthSystem.healthSystemId] || emptyDocumentDraft()),
                          title: event.target.value
                        }
                      }))
                    }
                  />
                </div>
                <div>
                  <label>URL</label>
                  <input
                    value={
                      (documentDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                        emptyDocumentDraft()).url
                    }
                    onChange={(event) =>
                      setDocumentDraftByHealthSystemId((current) => ({
                        ...current,
                        [selectedScreeningHealthSystem.healthSystemId]: {
                          ...(current[selectedScreeningHealthSystem.healthSystemId] || emptyDocumentDraft()),
                          url: event.target.value
                        }
                      }))
                    }
                    placeholder="https://..."
                  />
                </div>
              </div>
              <label>Document Notes</label>
              <textarea
                value={
                  (documentDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                    emptyDocumentDraft()).notes
                }
                onChange={(event) =>
                  setDocumentDraftByHealthSystemId((current) => ({
                    ...current,
                    [selectedScreeningHealthSystem.healthSystemId]: {
                      ...(current[selectedScreeningHealthSystem.healthSystemId] || emptyDocumentDraft()),
                      notes: event.target.value
                    }
                  }))
                }
              />
              <div className="actions">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => void addScreeningDocument(selectedScreeningHealthSystem.healthSystemId)}
                  disabled={Boolean(
                    savingDocumentByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                  )}
                >
                  {savingDocumentByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                    ? "Saving..."
                    : "Add Document"}
                </button>
              </div>

              <div className="detail-tabs screening-feedback-tabs" role="tablist" aria-label="Screening feedback sections">
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${selectedFeedbackTab === "quantitative" ? "active" : ""}`}
                  aria-selected={selectedFeedbackTab === "quantitative"}
                  onClick={() =>
                    setFeedbackTabByHealthSystemId((current) => ({
                      ...current,
                      [selectedScreeningHealthSystem.healthSystemId]: "quantitative"
                    }))
                  }
                >
                  Quantitative Feedback
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${selectedFeedbackTab === "qualitative" ? "active" : ""}`}
                  aria-selected={selectedFeedbackTab === "qualitative"}
                  onClick={() =>
                    setFeedbackTabByHealthSystemId((current) => ({
                      ...current,
                      [selectedScreeningHealthSystem.healthSystemId]: "qualitative"
                    }))
                  }
                >
                  Qualitative Feedback
                </button>
              </div>

              {selectedFeedbackTab === "quantitative" ? (
                <>
                  <p className="detail-label">Quantitative Results</p>
                  {quantitativeSummaryByCategory.length === 0 ? (
                    <p className="muted">No quantitative feedback captured yet.</p>
                  ) : (
                    <div className="screening-quant-grid">
                      {quantitativeSummaryByCategory.map((category) => (
                        <div key={category.category} className="detail-list-item">
                          <div className="pipeline-card-head">
                            <strong>{category.category}</strong>
                          </div>
                          <div className="screening-quant-table-wrap">
                            <table className="screening-quant-table">
                              <thead>
                                <tr>
                                  <th scope="col">Metric</th>
                                  <th scope="col">Responses</th>
                                  <th scope="col">Avg</th>
                                  <th scope="col">Distribution (1-10)</th>
                                </tr>
                              </thead>
                              <tbody>
                                {category.rows.map((row) => (
                                  <tr key={`${category.category}-${row.metric}`}>
                                    <td>{row.metric}</td>
                                    <td>{row.responseCount}</td>
                                    <td>{row.averageScore === null ? "N/A" : row.averageScore.toFixed(1)}</td>
                                    <td>
                                      <div className="screening-score-distribution">
                                        {Array.from({ length: 10 }, (_, index) => index + 1).map((value) => (
                                          <span key={value} className="screening-score-chip">
                                            {value}:{row.distribution[value] || 0}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="detail-label">Add Quantitative Feedback</p>
                  <div className="detail-grid">
                    <div>
                      <label>Individual</label>
                      <EntityLookupInput
                        entityKind="CONTACT"
                        value={
                          (quantitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQuantitativeFeedbackDraft()).contactId
                        }
                        onChange={(nextValue) =>
                          setQuantitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQuantitativeFeedbackDraft()),
                              contactId: nextValue
                            }
                          }))
                        }
                        allowEmpty
                        emptyLabel="Unlinked individual"
                        initialOptions={selectedIndividualOptions.map((option) => ({
                          id: option.id,
                          name: option.label
                        }))}
                        placeholder="Search contacts"
                        contactCreateContext={{
                          parentType: "healthSystem",
                          parentId: selectedScreeningHealthSystem.healthSystemId,
                          roleType: "EXECUTIVE"
                        }}
                        contactSearchHealthSystemId={selectedScreeningHealthSystem.healthSystemId}
                      />
                    </div>
                    <div>
                      <label>Category</label>
                      <select
                        value={
                          (quantitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQuantitativeFeedbackDraft()).category
                        }
                        onChange={(event) =>
                          setQuantitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQuantitativeFeedbackDraft()),
                              category: event.target.value
                            }
                          }))
                        }
                      >
                        {quantitativeCategoryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Metric</label>
                      <input
                        value={
                          (quantitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQuantitativeFeedbackDraft()).metric
                        }
                        onChange={(event) =>
                          setQuantitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQuantitativeFeedbackDraft()),
                              metric: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label>Score (1-10)</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        step="0.1"
                        value={
                          (quantitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQuantitativeFeedbackDraft()).score
                        }
                        onChange={(event) =>
                          setQuantitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQuantitativeFeedbackDraft()),
                              score: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label>Weight %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={
                          (quantitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQuantitativeFeedbackDraft()).weightPercent
                        }
                        onChange={(event) =>
                          setQuantitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQuantitativeFeedbackDraft()),
                              weightPercent: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                  </div>
                  <label>Notes</label>
                  <textarea
                    value={
                      (quantitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                        emptyQuantitativeFeedbackDraft()).notes
                    }
                    onChange={(event) =>
                      setQuantitativeDraftByHealthSystemId((current) => ({
                        ...current,
                        [selectedScreeningHealthSystem.healthSystemId]: {
                          ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQuantitativeFeedbackDraft()),
                          notes: event.target.value
                        }
                      }))
                    }
                  />
                  <div className="actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void addQuantitativeFeedback(selectedScreeningHealthSystem.healthSystemId)}
                      disabled={Boolean(
                        savingFeedbackByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                      )}
                    >
                      {savingFeedbackByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                        ? "Saving..."
                        : "Add Quantitative Feedback"}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="detail-label">Captured Qualitative Feedback</p>
                  {selectedScreeningHealthSystem.qualitativeFeedback.length === 0 ? (
                    <p className="muted">No qualitative feedback captured yet.</p>
                  ) : (
                    <div className="pipeline-doc-list">
                      {selectedScreeningHealthSystem.qualitativeFeedback.map((feedback) => (
                        <div key={feedback.id} className="detail-list-item">
                          <div className="pipeline-card-head">
                            <strong>{feedback.theme}</strong>
                            <span className="status-pill draft">{sentimentLabel(feedback.sentiment)}</span>
                          </div>
                          <p className="muted">
                            Category: {feedback.category || "Key Theme"}
                          </p>
                          <p className="muted">
                            {feedback.contactTitle
                              ? `${feedback.contactName} (${feedback.contactTitle})`
                              : feedback.contactName}
                          </p>
                          <p>{feedback.feedback}</p>
                          <p className="muted">Updated {formatDate(feedback.updatedAt)}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <p className="detail-label">Add Qualitative Feedback</p>
                  <div className="detail-grid">
                    <div>
                      <label>Individual</label>
                      <EntityLookupInput
                        entityKind="CONTACT"
                        value={
                          (qualitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQualitativeFeedbackDraft()).contactId
                        }
                        onChange={(nextValue) =>
                          setQualitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQualitativeFeedbackDraft()),
                              contactId: nextValue
                            }
                          }))
                        }
                        allowEmpty
                        emptyLabel="Unlinked individual"
                        initialOptions={selectedIndividualOptions.map((option) => ({
                          id: option.id,
                          name: option.label
                        }))}
                        placeholder="Search contacts"
                        contactCreateContext={{
                          parentType: "healthSystem",
                          parentId: selectedScreeningHealthSystem.healthSystemId,
                          roleType: "EXECUTIVE"
                        }}
                        contactSearchHealthSystemId={selectedScreeningHealthSystem.healthSystemId}
                      />
                    </div>
                    <div>
                      <label>Category</label>
                      <select
                        value={
                          (qualitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQualitativeFeedbackDraft()).category
                        }
                        onChange={(event) =>
                          setQualitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQualitativeFeedbackDraft()),
                              category: event.target.value
                            }
                          }))
                        }
                      >
                        {qualitativeCategoryOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Theme</label>
                      <input
                        value={
                          (qualitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQualitativeFeedbackDraft()).theme
                        }
                        onChange={(event) =>
                          setQualitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQualitativeFeedbackDraft()),
                              theme: event.target.value
                            }
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label>Sentiment</label>
                      <select
                        value={
                          (qualitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQualitativeFeedbackDraft()).sentiment
                        }
                        onChange={(event) =>
                          setQualitativeDraftByHealthSystemId((current) => ({
                            ...current,
                            [selectedScreeningHealthSystem.healthSystemId]: {
                              ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                                emptyQualitativeFeedbackDraft()),
                              sentiment: event.target.value as ScreeningFeedbackSentiment
                            }
                          }))
                        }
                      >
                        <option value="POSITIVE">Positive</option>
                        <option value="MIXED">Mixed</option>
                        <option value="NEUTRAL">Neutral</option>
                        <option value="NEGATIVE">Negative</option>
                      </select>
                    </div>
                  </div>
                  <label>Feedback</label>
                  <textarea
                    value={
                      (qualitativeDraftByHealthSystemId[selectedScreeningHealthSystem.healthSystemId] ||
                        emptyQualitativeFeedbackDraft()).feedback
                    }
                    onChange={(event) =>
                      setQualitativeDraftByHealthSystemId((current) => ({
                        ...current,
                        [selectedScreeningHealthSystem.healthSystemId]: {
                          ...(current[selectedScreeningHealthSystem.healthSystemId] ||
                            emptyQualitativeFeedbackDraft()),
                          feedback: event.target.value
                        }
                      }))
                    }
                  />
                  <div className="actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void addQualitativeFeedback(selectedScreeningHealthSystem.healthSystemId)}
                      disabled={Boolean(
                        savingFeedbackByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                      )}
                    >
                      {savingFeedbackByHealthSystemId[selectedScreeningHealthSystem.healthSystemId]
                        ? "Saving..."
                        : "Add Qualitative Feedback"}
                    </button>
                  </div>
                </>
              )}
            </article>
          ) : (
            <p className="muted">No alliance health systems configured.</p>
          )}
        </section>
      ) : (
        <section className="panel">
          <h2>Alliance Screening Status</h2>
          <p className="muted">This section appears when the item is in the Screening column.</p>
        </section>
      )}

      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

      {activeCellHistory ? (
        <div className="pipeline-note-backdrop" onClick={() => setCellHistoryModal(null)}>
          <div
            className="pipeline-note-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="pipeline-card-head">
              <h3>{`${screeningCellFieldLabel(activeCellHistory.field)} History`}</h3>
              <button className="ghost small" type="button" onClick={() => setCellHistoryModal(null)}>
                Close
              </button>
            </div>
            <p className="muted">{activeCellHistory.healthSystemName}</p>
            {activeCellHistory.history.length === 0 ? (
              <p className="muted">No edits captured yet.</p>
            ) : (
              <div className="pipeline-detail-list">
                {activeCellHistory.history.map((entry) => (
                  <div key={entry.id} className="detail-list-item">
                    <p>{entry.value || <span className="muted">(Cleared)</span>}</p>
                    <p className="muted">
                      {`${new Date(entry.changedAt).toLocaleString()} by ${entry.changedByName}`}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </ContentWrapper>
  );
}
