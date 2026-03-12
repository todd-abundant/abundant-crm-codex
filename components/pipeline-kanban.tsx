"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PipelineOpportunityDetailView } from "./pipeline-opportunity-detail";
import { RichTextArea } from "./rich-text-area";
import { DateInputField } from "./date-input-field";
import { EntityLookupInput } from "./entity-lookup-input";
import { parseDateInput, toDateInputValue as formatDateInputValue } from "@/lib/date-parse";
import { createDateDebugContext, debugDateLog, dateDebugHeaders } from "@/lib/date-debug";
import {
  PIPELINE_BOARD_COLUMNS,
  PIPELINE_COMPANY_TYPE_OPTIONS,
  mapBoardColumnToCanonicalPhase,
  phaseLabel,
  type PipelineCompanyType,
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

type PipelineBoardOpportunityStage =
  | "IDENTIFIED"
  | "QUALIFICATION"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "LEGAL"
  | "CLOSED_WON"
  | "CLOSED_LOST"
  | "ON_HOLD";

type PipelineBoardOpportunitySummary = {
  id: string;
  title: string;
  stage: PipelineBoardOpportunityStage;
  likelihoodPercent: number | null;
};

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
  openOpportunities: PipelineBoardOpportunitySummary[];
  intakeScheduledAt: string | null;
  declineReason: IntakeDeclineReason | null;
  leadSource: string;
  nextStep: string;
  nextStepDueAt: string | null;
  ownerName: string;
  companyCategory: "ACTIVE" | "CLOSED" | "RE_ENGAGE_LATER";
  intakeStage: "RECEIVED" | "INTRO_CALLS" | "ACTIVE_INTAKE" | "MANAGEMENT_PRESENTATION";
  primaryCategory: string;
  closedOutcome: "INVESTED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
  stageChangedAt: string;
  timeInStageDays: number | null;
  staleLevel: "warning" | "critical" | null;
  raiseRoundLabel: string | null;
  raiseAmountUsd: number | null;
  lastMeaningfulActivityAt: string | null;
  ventureStudioContractExecutedAt: string | null;
  screeningWebinarDate1At: string | null;
  screeningWebinarDate2At: string | null;
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
  ventureStudioContractExecutedAt: string;
  screeningWebinarDate1At: string;
  screeningWebinarDate2At: string;
  ventureLikelihoodPercent: string;
  ventureExpectedCloseDate: string;
};


type EditingField =
  | "intakeDate"
  | "declineReason"
  | "leadSource"
  | "nextStep"
  | "ventureStudioContractExecutedAt"
  | "screeningWebinarDate1At"
  | "screeningWebinarDate2At"
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

type PipelineDetailInitialTab =
  | "pipeline-status"
  | "opportunities"
  | "screening-materials"
  | "intake-materials"
  | "notes"
  | "documents";

function compareUpdatedAt(
  clientUpdatedAt: string | null | undefined,
  serverUpdatedAt: string | null | undefined
) {
  if (!serverUpdatedAt) {
    return {
      clientUpdatedAt: clientUpdatedAt || null,
      parsedClientUpdatedAt: null,
      serverUpdatedAt: null,
      isClientBehindServer: null,
      serverAheadMs: null
    };
  }

  const parsedClient = clientUpdatedAt ? new Date(clientUpdatedAt) : null;
  const parsedClientMs = parsedClient && Number.isNaN(parsedClient.getTime()) ? null : parsedClient?.getTime() || null;
  const parsedServer = new Date(serverUpdatedAt);
  const parsedServerMs = Number.isNaN(parsedServer.getTime()) ? null : parsedServer.getTime();

  return {
    clientUpdatedAt: clientUpdatedAt || null,
    parsedClientUpdatedAt: parsedClientMs ? new Date(parsedClientMs).toISOString() : null,
    serverUpdatedAt,
    isClientBehindServer: parsedClientMs !== null && parsedServerMs !== null ? parsedClientMs < parsedServerMs : null,
    serverAheadMs:
      parsedClientMs !== null && parsedServerMs !== null ? parsedServerMs - parsedClientMs : null
  };
}

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
  return formatDateInputValue(value);
}

function toDateDisplayValue(value: string | null | undefined) {
  if (!value) return "Click to set";
  const parsed = parseDateInput(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "Click to set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const boardOpportunityLikelihoodByStage: Record<PipelineBoardOpportunityStage, number> = {
  IDENTIFIED: 10,
  QUALIFICATION: 25,
  PROPOSAL: 50,
  NEGOTIATION: 70,
  LEGAL: 85,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
  ON_HOLD: 35
};

function normalizeBoardOpportunityStage(value: PipelineBoardOpportunityStage | string) {
  return (
    ([
      "IDENTIFIED",
      "QUALIFICATION",
      "PROPOSAL",
      "NEGOTIATION",
      "LEGAL",
      "ON_HOLD",
      "CLOSED_WON",
      "CLOSED_LOST"
    ] as const).includes(value as PipelineBoardOpportunityStage)
      ? (value as PipelineBoardOpportunityStage)
      : "IDENTIFIED"
  );
}

function opportunityStatusTone(stage: PipelineBoardOpportunityStage, likelihoodPercent: number | null) {
  const normalizedStage = normalizeBoardOpportunityStage(stage);
  const normalizedLikelihood = likelihoodPercent ?? boardOpportunityLikelihoodByStage[normalizedStage];
  if (normalizedLikelihood >= 70) return "green";
  if (normalizedLikelihood >= 40) return "yellow";
  return "red";
}

function opportunityStageLabel(stage: PipelineBoardOpportunityStage) {
  const normalizedStage = normalizeBoardOpportunityStage(stage);
  return normalizedStage
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function opportunityLikelihoodLabel(value: number | null) {
  return value == null ? "—" : `${value}%`;
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

function intakeStageLabel(value: PipelineBoardItem["intakeStage"]) {
  return value.toLowerCase().split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function intakeStageFlagLabel(value: PipelineBoardItem["intakeStage"]) {
  return "Intake: " + intakeStageLabel(value);
}

function companyCategoryLabel(value: PipelineBoardItem["companyCategory"]) {
  if (value === "RE_ENGAGE_LATER") return "Re-engage later";
  return value === "CLOSED" ? "Closed" : "Active";
}

function companyStatusFlagLabel(value: PipelineBoardItem["companyCategory"]) {
  return "Status: " + companyCategoryLabel(value);
}

function primaryCategoryLabel(value: PipelineBoardItem["primaryCategory"]) {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ")
    .replace("And", "&");
}

function raiseSummaryLabel(item: Pick<PipelineBoardItem, "raiseRoundLabel" | "raiseAmountUsd">) {
  if (item.raiseAmountUsd === null) return item.raiseRoundLabel ? `Raise: ${item.raiseRoundLabel}` : null;
  const amountLabel = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(item.raiseAmountUsd);
  return item.raiseRoundLabel ? `${item.raiseRoundLabel}: ${amountLabel}` : `Raise: ${amountLabel}`;
}

function closedOutcomeLabel(value: PipelineBoardItem["closedOutcome"]) {
  if (!value) return "";
  return value.toLowerCase().split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" ");
}

function timeInStageLabel(item: Pick<PipelineBoardItem, "timeInStageDays">) {
  if (item.timeInStageDays === null) return "Stage age unavailable";
  return String(item.timeInStageDays) + "d in stage";
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
    ventureStudioContractExecutedAt: toDateInputValue(item.ventureStudioContractExecutedAt),
    screeningWebinarDate1At: toDateInputValue(item.screeningWebinarDate1At),
    screeningWebinarDate2At: toDateInputValue(item.screeningWebinarDate2At),
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

type IntakeStageFilter = "ALL" | PipelineBoardItem["intakeStage"];
type InactiveStatusFilter = "ALL" | Exclude<PipelineBoardItem["companyCategory"], "ACTIVE">;

const INTAKE_STAGE_FILTER_OPTIONS: Array<{ value: IntakeStageFilter; label: string }> = [
  { value: "ALL", label: "All intake" },
  { value: "RECEIVED", label: "Received" },
  { value: "INTRO_CALLS", label: "Intro calls" },
  { value: "ACTIVE_INTAKE", label: "Active intake" },
  { value: "MANAGEMENT_PRESENTATION", label: "Management presentation" }
];

const INACTIVE_STATUS_FILTER_OPTIONS: Array<{ value: InactiveStatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "CLOSED", label: "Closed" },
  { value: "RE_ENGAGE_LATER", label: "Re-engage later" }
];

type PipelineKanbanProps = {
  companyType: PipelineCompanyType;
};

export function PipelineKanban({ companyType }: PipelineKanbanProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [items, setItems] = React.useState<PipelineBoardItem[]>([]);
  const [inactiveItems, setInactiveItems] = React.useState<PipelineBoardItem[]>([]);
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
  const [selectedDetailInitialTab, setSelectedDetailInitialTab] =
    React.useState<PipelineDetailInitialTab>("pipeline-status");
  const [intakeAddLookupValue, setIntakeAddLookupValue] = React.useState("");
  const [intakeAddModalSignal, setIntakeAddModalSignal] = React.useState(0);
  const [highlightedItemId, setHighlightedItemId] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [inactiveQueueExpanded, setInactiveQueueExpanded] = React.useState(false);
  const [intakeStageFilter, setIntakeStageFilter] = React.useState<IntakeStageFilter>("ALL");
  const [inactiveStatusFilter, setInactiveStatusFilter] = React.useState<InactiveStatusFilter>("ALL");
  const undoTimeoutRef = React.useRef<number | null>(null);
  const highlightTimeoutRef = React.useRef<number | null>(null);
  const suppressLeadSourceBlurRef = React.useRef(false);
  const cardCommitSequenceById = React.useRef<Record<string, number>>({});
  const intakeCommitSequenceById = React.useRef<Record<string, number>>({});
  const companyTypeView = React.useMemo(
    () => PIPELINE_COMPANY_TYPE_OPTIONS.find((entry) => entry.value === companyType) || PIPELINE_COMPANY_TYPE_OPTIONS[0],
    [companyType]
  );

  const loadBoard = React.useCallback(async () => {
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/pipeline/opportunities?companyType=${companyType}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load pipeline board");

      const nextItems = Array.isArray(payload.opportunities) ? payload.opportunities : [];
      const nextInactiveItems = Array.isArray(payload.inactiveOpportunities) ? payload.inactiveOpportunities : [];
      const nextHealthSystems = Array.isArray(payload.healthSystems) ? payload.healthSystems : [];
      setItems(nextItems);
      setInactiveItems(nextInactiveItems);
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
  }, [companyType]);

  const handleCompanyTypeChange = React.useCallback(
    (nextType: PipelineCompanyType) => {
      const nextSearchParams = new URLSearchParams(searchParams.toString());
      if (nextType === "STARTUP") {
        nextSearchParams.delete("companyType");
      } else {
        nextSearchParams.set("companyType", nextType);
      }
      const nextQuery = nextSearchParams.toString();
      router.push(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    },
    [pathname, router, searchParams]
  );

  React.useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  React.useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) {
        window.clearTimeout(undoTimeoutRef.current);
      }
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
    };
  }, []);

  const closeDetailModal = React.useCallback(() => {
    setSelectedDetailId(null);
    setSelectedDetailInitialTab("pipeline-status");
    void loadBoard();
  }, [loadBoard]);

  const openCardDetail = React.useCallback(
    (itemId: string, activeTab: PipelineDetailInitialTab = "pipeline-status") => {
      setSelectedDetailInitialTab(activeTab);
      setSelectedDetailId(itemId);
    },
    []
  );

  const handleIntakeCompanyCreated = React.useCallback(
    async (option: { id: string; name: string }) => {
      setStatus({ kind: "ok", text: `${option.name} added to Intake.` });
      await loadBoard();
      setIntakeAddLookupValue("");
      setHighlightedItemId(option.id);
      if (highlightTimeoutRef.current) {
        window.clearTimeout(highlightTimeoutRef.current);
      }
      highlightTimeoutRef.current = window.setTimeout(() => {
        setHighlightedItemId((current) => (current === option.id ? null : current));
      }, 3200);
    },
    [loadBoard]
  );

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
        const columnItems = items.filter((item) => item.column === column.key);
        accumulator[column.key] =
          column.key === "INTAKE" && intakeStageFilter !== "ALL"
            ? columnItems.filter((item) => item.intakeStage === intakeStageFilter)
            : columnItems;
        return accumulator;
      },
      {
        INTAKE: [],
        VENTURE_STUDIO_CONTRACT_EVALUATION: [],
        SCREENING: [],
        COMMERCIAL_ACCELERATION: []
      }
    );
  }, [intakeStageFilter, items]);

  const intakeFilterCounts = React.useMemo(() => {
    return INTAKE_STAGE_FILTER_OPTIONS.reduce<Record<IntakeStageFilter, number>>((accumulator, option) => {
      accumulator[option.value] =
        option.value === "ALL"
          ? items.filter((item) => item.column === "INTAKE").length
          : items.filter((item) => item.column === "INTAKE" && item.intakeStage === option.value).length;
      return accumulator;
    }, { ALL: 0, RECEIVED: 0, INTRO_CALLS: 0, ACTIVE_INTAKE: 0, MANAGEMENT_PRESENTATION: 0 });
  }, [items]);

  const filteredInactiveItems = React.useMemo(() => {
    if (inactiveStatusFilter === "ALL") return inactiveItems;
    return inactiveItems.filter((item) => item.companyCategory === inactiveStatusFilter);
  }, [inactiveItems, inactiveStatusFilter]);

  const inactiveFilterCounts = React.useMemo(() => {
    return INACTIVE_STATUS_FILTER_OPTIONS.reduce<Record<InactiveStatusFilter, number>>((accumulator, option) => {
      accumulator[option.value] =
        option.value === "ALL"
          ? inactiveItems.length
          : inactiveItems.filter((item) => item.companyCategory === option.value).length;
      return accumulator;
    }, { ALL: 0, CLOSED: 0, RE_ENGAGE_LATER: 0 });
  }, [inactiveItems]);

  const commitIntakeDraft = React.useCallback(
    async (itemId: string, nextDraft: IntakeDraft, previousDraft: IntakeDraft) => {
      const currentItem = items.find((item) => item.id === itemId);
      if (!currentItem) return;

      const requestSequence = (intakeCommitSequenceById.current[itemId] || 0) + 1;
      intakeCommitSequenceById.current[itemId] = requestSequence;
      const requestStartMs = Date.now();
      const debugContext = createDateDebugContext("pipeline-kanban.intake-commit", itemId);
      const headers: Record<string, string> = {
        ...dateDebugHeaders("pipeline-kanban.intake-commit", itemId),
        "Content-Type": "application/json"
      };
      headers["x-date-debug-seq"] = String(requestSequence);
      if (currentItem.updatedAt) {
        headers["x-date-debug-client-updated-at"] = currentItem.updatedAt;
      }
      if (debugContext) {
        headers["x-date-debug-request-id"] = debugContext.requestId;
        headers["x-date-debug-session-id"] = debugContext.sessionId;
        headers["x-date-debug-scope"] = debugContext.scope;
        headers["x-date-debug-item-id"] = itemId;
      }
      debugDateLog("pipeline-kanban.intake-commit-request", {
        itemId,
        debugRequestId: debugContext?.requestId,
        requestSequence,
        durationMs: 0,
        clientUpdatedAt: currentItem.updatedAt,
        clientUpdatedAtParsed: compareUpdatedAt(currentItem.updatedAt, null).parsedClientUpdatedAt,
        currentItem: {
          intakeScheduledAt: currentItem.intakeScheduledAt,
          declineReason: currentItem.declineReason,
          leadSource: currentItem.leadSource
        },
        requestPayload: {
          intakeScheduledAt: nextDraft.intakeScheduledAt || null,
          declineReason: nextDraft.declineReason || null,
          leadSource: nextDraft.leadSource
        }
      });

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
                leadSource: nextDraft.leadSource,
                updatedAt: currentItem.updatedAt
              }
            : item
        )
      );

      try {
        const res = await fetch(`/api/pipeline/opportunities/${itemId}/intake`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({
            intakeScheduledAt: nextDraft.intakeScheduledAt || null,
            declineReason: nextDraft.declineReason || null,
            leadSource: nextDraft.leadSource
          })
        });
        const payload = await res.json();
        const latestSequence = intakeCommitSequenceById.current[itemId] || requestSequence;
        if (latestSequence !== requestSequence) {
          debugDateLog("pipeline-kanban.intake-commit-stale-response", {
            itemId,
            debugRequestId: debugContext?.requestId,
            requestSequence,
            latestSequence,
            durationMs: Date.now() - requestStartMs,
            responseServerSequence: payload._dateDebug?.requestSequence ?? null
          });
          return;
        }
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
              updatedAt?: string | null;
            }
          | undefined;

        if (!updatedItem) {
          throw new Error("Invalid intake update response");
        }

        debugDateLog("pipeline-kanban.intake-commit-response", {
          itemId,
          debugRequestId: debugContext?.requestId,
          requestSequence,
          latestSequence,
          durationMs: Date.now() - requestStartMs,
          responseServerSequence: payload._dateDebug?.requestSequence ?? null,
          serverUpdatedAt: updatedItem.updatedAt || null,
          serverDebug: payload._dateDebug || null,
          clientServerState: compareUpdatedAt(currentItem.updatedAt, updatedItem.updatedAt || null),
          response: {
            intakeScheduledAt: updatedItem.intakeScheduledAt,
            declineReason: updatedItem.declineReason,
            leadSource: updatedItem.leadSource
          }
        });

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
                column: updatedColumn,
                updatedAt: updatedItem.updatedAt || item.updatedAt
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
        const latestSequence = intakeCommitSequenceById.current[itemId] || 0;
        if (latestSequence !== requestSequence) {
          debugDateLog("pipeline-kanban.intake-commit-stale-error", {
            itemId,
            debugRequestId: debugContext?.requestId,
            requestSequence,
            latestSequence,
            durationMs: Date.now() - requestStartMs,
            error: error instanceof Error ? error.message : String(error),
            responseStatus: "ignored_stale_error"
          });
          return;
        }
        debugDateLog("pipeline-kanban.intake-commit-error", {
          itemId,
          debugRequestId: debugContext?.requestId,
          requestSequence,
          durationMs: Date.now() - requestStartMs,
          error: error instanceof Error ? error.message : String(error),
          requestPayload: {
            intakeScheduledAt: nextDraft.intakeScheduledAt || null,
            declineReason: nextDraft.declineReason || null,
            leadSource: nextDraft.leadSource
          }
        });
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
    async (itemId: string, nextDraft: CardMetaDraft, previousDraft?: CardMetaDraft) => {
      const currentItem = items.find((item) => item.id === itemId);
      if (!currentItem) return;
      const resolvedPreviousDraft = previousDraft || cardMetaDraftFromItem(currentItem);

      const nextLikelihood = toNullableNumber(nextDraft.ventureLikelihoodPercent);
      const nextContractExecutedDate = nextDraft.ventureStudioContractExecutedAt || null;
      const nextScreeningWebinarDate1 = nextDraft.screeningWebinarDate1At || null;
      const nextScreeningWebinarDate2 = nextDraft.screeningWebinarDate2At || null;
      const nextExpectedDate = nextDraft.ventureExpectedCloseDate || null;
      const previousLikelihood = toNullableNumber(resolvedPreviousDraft.ventureLikelihoodPercent);
      const changed = {
        nextStep: nextDraft.nextStep !== resolvedPreviousDraft.nextStep,
        ventureStudioContractExecutedAt:
          nextContractExecutedDate !== (resolvedPreviousDraft.ventureStudioContractExecutedAt || null),
        screeningWebinarDate1At: nextScreeningWebinarDate1 !== (resolvedPreviousDraft.screeningWebinarDate1At || null),
        screeningWebinarDate2At: nextScreeningWebinarDate2 !== (resolvedPreviousDraft.screeningWebinarDate2At || null),
        ventureExpectedCloseDate: nextExpectedDate !== (resolvedPreviousDraft.ventureExpectedCloseDate || null),
        ventureLikelihoodPercent: nextLikelihood !== previousLikelihood
      };
      const requestPayload: Partial<{
        nextStep: string;
  nextStepDueAt: string | null;
  ownerName: string;
  companyCategory: "ACTIVE" | "CLOSED" | "RE_ENGAGE_LATER";
  intakeStage: "RECEIVED" | "INTRO_CALLS" | "ACTIVE_INTAKE" | "MANAGEMENT_PRESENTATION";
  closedOutcome: "INVESTED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
  stageChangedAt: string;
  timeInStageDays: number | null;
  staleLevel: "warning" | "critical" | null;
  lastMeaningfulActivityAt: string | null;
        ventureStudioContractExecutedAt: string | null;
        screeningWebinarDate1At: string | null;
        screeningWebinarDate2At: string | null;
        ventureLikelihoodPercent: number | null;
        ventureExpectedCloseDate: string | null;
      }> = {};
      if (changed.nextStep) requestPayload.nextStep = nextDraft.nextStep;
      if (changed.ventureStudioContractExecutedAt) requestPayload.ventureStudioContractExecutedAt = nextContractExecutedDate;
      if (changed.screeningWebinarDate1At) requestPayload.screeningWebinarDate1At = nextScreeningWebinarDate1;
      if (changed.screeningWebinarDate2At) requestPayload.screeningWebinarDate2At = nextScreeningWebinarDate2;
      if (changed.ventureLikelihoodPercent) requestPayload.ventureLikelihoodPercent = nextLikelihood;
      if (changed.ventureExpectedCloseDate) requestPayload.ventureExpectedCloseDate = nextExpectedDate;
      const debugContext = createDateDebugContext("pipeline-kanban.card-commit", itemId);
      const requestStartMs = Date.now();

      if (Object.keys(requestPayload).length === 0) {
        return;
      }

      const requestSequence = (cardCommitSequenceById.current[itemId] || 0) + 1;
      cardCommitSequenceById.current[itemId] = requestSequence;
      const headers: Record<string, string> = {
        ...dateDebugHeaders("pipeline-kanban.card-commit", itemId),
        "Content-Type": "application/json"
      };
      headers["x-date-debug-seq"] = String(requestSequence);
      if (currentItem.updatedAt) {
        headers["x-date-debug-client-updated-at"] = currentItem.updatedAt;
      }
      if (debugContext) {
        headers["x-date-debug-request-id"] = debugContext.requestId;
        headers["x-date-debug-session-id"] = debugContext.sessionId;
        headers["x-date-debug-scope"] = debugContext.scope;
        headers["x-date-debug-item-id"] = itemId;
      }
      debugDateLog("pipeline-kanban.card-commit-request", {
        itemId,
        debugRequestId: debugContext?.requestId,
        requestSequence,
        durationMs: 0,
        clientUpdatedAt: currentItem.updatedAt,
        clientUpdatedAtParsed: compareUpdatedAt(currentItem.updatedAt, null).parsedClientUpdatedAt,
        currentItem: {
          nextStep: currentItem.nextStep,
          ventureStudioContractExecutedAt: currentItem.ventureStudioContractExecutedAt,
          screeningWebinarDate1At: currentItem.screeningWebinarDate1At,
          screeningWebinarDate2At: currentItem.screeningWebinarDate2At,
          ventureExpectedCloseDate: currentItem.ventureExpectedCloseDate,
          ventureLikelihoodPercent: currentItem.ventureLikelihoodPercent
        },
        previousDraft: resolvedPreviousDraft,
        nextDraft,
        changed,
        requestPayload
      });

      setSavingCardById((current) => ({ ...current, [itemId]: true }));
      setStatus(null);
      setCardMetaDraftsById((current) => ({ ...current, [itemId]: nextDraft }));
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                nextStep: nextDraft.nextStep,
                ventureStudioContractExecutedAt: nextContractExecutedDate,
                screeningWebinarDate1At: nextScreeningWebinarDate1,
                screeningWebinarDate2At: nextScreeningWebinarDate2,
                ventureLikelihoodPercent: nextLikelihood,
                ventureExpectedCloseDate: nextExpectedDate
              }
            : item
        )
      );

      try {
        const res = await fetch(`/api/pipeline/opportunities/${itemId}/card`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(requestPayload)
        });
        const responsePayload = await res.json();
        if (!res.ok) throw new Error(responsePayload.error || "Failed to update card");
        const latestSequence = cardCommitSequenceById.current[itemId] || requestSequence;
        const isLatestRequest = latestSequence === requestSequence;
        if (!isLatestRequest) {
          debugDateLog("pipeline-kanban.card-commit-stale-response", {
            itemId,
            debugRequestId: debugContext?.requestId,
            requestSequence,
            latestSequence,
            durationMs: Date.now() - requestStartMs,
            responseServerSequence: responsePayload?._dateDebug?.requestSequence ?? null
          });
          return;
        }

        const updated = responsePayload.item as
          | {
              nextStep: string;
  nextStepDueAt: string | null;
  ownerName: string;
  companyCategory: "ACTIVE" | "CLOSED" | "RE_ENGAGE_LATER";
  intakeStage: "RECEIVED" | "INTRO_CALLS" | "ACTIVE_INTAKE" | "MANAGEMENT_PRESENTATION";
  closedOutcome: "INVESTED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER" | null;
  stageChangedAt: string;
  timeInStageDays: number | null;
  staleLevel: "warning" | "critical" | null;
  lastMeaningfulActivityAt: string | null;
              ventureStudioContractExecutedAt: string | null;
              screeningWebinarDate1At: string | null;
              screeningWebinarDate2At: string | null;
              ventureLikelihoodPercent: number | null;
              ventureExpectedCloseDate: string | null;
              phase: PipelinePhase;
              phaseLabel: string;
              column: PipelineBoardColumn | null;
              updatedAt?: string | null;
            }
          | undefined;

        if (!updated) {
          throw new Error("Invalid card update response");
        }
        debugDateLog("pipeline-kanban.card-commit-response", {
          itemId,
          debugRequestId: debugContext?.requestId,
          requestSequence,
          latestSequence,
          durationMs: Date.now() - requestStartMs,
          serverUpdatedAt: updated.updatedAt || null,
          serverDebug: responsePayload._dateDebug || null,
          clientServerState: compareUpdatedAt(currentItem.updatedAt, updated.updatedAt || null),
          requestPayload,
          response: {
            nextStep: updated.nextStep,
            ventureStudioContractExecutedAt: updated.ventureStudioContractExecutedAt,
            screeningWebinarDate1At: updated.screeningWebinarDate1At,
            screeningWebinarDate2At: updated.screeningWebinarDate2At,
            ventureExpectedCloseDate: updated.ventureExpectedCloseDate,
            ventureLikelihoodPercent: updated.ventureLikelihoodPercent,
            column: updated.column
          },
          dateDelta: {
            nextStep: {
              requested: requestPayload.nextStep ?? null,
              persisted: updated.nextStep,
              changed: changed.nextStep
            },
            ventureStudioContractExecutedAt: {
              requested: requestPayload.ventureStudioContractExecutedAt,
              persisted: updated.ventureStudioContractExecutedAt,
              matched:
                requestPayload.ventureStudioContractExecutedAt === undefined ||
                toDateInputValue(requestPayload.ventureStudioContractExecutedAt) ===
                toDateInputValue(updated.ventureStudioContractExecutedAt)
            },
            screeningWebinarDate1At: {
              requested: requestPayload.screeningWebinarDate1At,
              persisted: updated.screeningWebinarDate1At,
              matched:
                requestPayload.screeningWebinarDate1At === undefined ||
                toDateInputValue(requestPayload.screeningWebinarDate1At) ===
                toDateInputValue(updated.screeningWebinarDate1At)
            },
            screeningWebinarDate2At: {
              requested: requestPayload.screeningWebinarDate2At,
              persisted: updated.screeningWebinarDate2At,
              matched:
                requestPayload.screeningWebinarDate2At === undefined ||
                toDateInputValue(requestPayload.screeningWebinarDate2At) ===
                toDateInputValue(updated.screeningWebinarDate2At)
            },
            ventureExpectedCloseDate: {
              requested: requestPayload.ventureExpectedCloseDate,
              persisted: updated.ventureExpectedCloseDate,
              matched:
                requestPayload.ventureExpectedCloseDate === undefined ||
                toDateInputValue(requestPayload.ventureExpectedCloseDate) ===
                toDateInputValue(updated.ventureExpectedCloseDate)
            },
            ventureLikelihoodPercent: {
              requested: requestPayload.ventureLikelihoodPercent,
              persisted: updated.ventureLikelihoodPercent,
              matched:
                requestPayload.ventureLikelihoodPercent === undefined ||
                requestPayload.ventureLikelihoodPercent === updated.ventureLikelihoodPercent
            }
          }
        });

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
                  ventureStudioContractExecutedAt: updated.ventureStudioContractExecutedAt,
                  screeningWebinarDate1At: updated.screeningWebinarDate1At,
                  screeningWebinarDate2At: updated.screeningWebinarDate2At,
                  ventureLikelihoodPercent: updated.ventureLikelihoodPercent,
                  ventureExpectedCloseDate: updated.ventureExpectedCloseDate,
                  phase: updated.phase,
                  phaseLabel: updated.phaseLabel,
                  column: updatedColumn,
                  updatedAt: updated.updatedAt || item.updatedAt
                }
              : item
          )
        );
        setCardMetaDraftsById((current) => ({
          ...current,
          [itemId]: {
            nextStep: updated.nextStep || "",
            ventureStudioContractExecutedAt: toDateInputValue(updated.ventureStudioContractExecutedAt),
            screeningWebinarDate1At: toDateInputValue(updated.screeningWebinarDate1At),
            screeningWebinarDate2At: toDateInputValue(updated.screeningWebinarDate2At),
            ventureLikelihoodPercent:
              updated.ventureLikelihoodPercent === null ? "" : String(updated.ventureLikelihoodPercent),
            ventureExpectedCloseDate: toDateInputValue(updated.ventureExpectedCloseDate)
          }
        }));
      } catch (error) {
        const latestSequence = cardCommitSequenceById.current[itemId] || 0;
        if (latestSequence !== requestSequence) {
          debugDateLog("pipeline-kanban.card-commit-stale-error", {
            itemId,
            debugRequestId: debugContext?.requestId,
            requestSequence,
            latestSequence,
            durationMs: Date.now() - requestStartMs,
            error: error instanceof Error ? error.message : error,
            responseStatus: "ignored_stale_error"
          });
          return;
        }
        debugDateLog("pipeline-kanban.card-commit-error", {
          itemId,
          debugRequestId: debugContext?.requestId,
          error: error instanceof Error ? error.message : error,
          requestSequence,
          durationMs: Date.now() - requestStartMs,
          requestPayload
        });
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to update card"
        });
        setCardMetaDraftsById((current) => ({ ...current, [itemId]: resolvedPreviousDraft }));
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                ...item,
                nextStep: resolvedPreviousDraft.nextStep,
                ventureStudioContractExecutedAt: resolvedPreviousDraft.ventureStudioContractExecutedAt || null,
                screeningWebinarDate1At: resolvedPreviousDraft.screeningWebinarDate1At || null,
                screeningWebinarDate2At: resolvedPreviousDraft.screeningWebinarDate2At || null,
                ventureLikelihoodPercent: toNullableNumber(resolvedPreviousDraft.ventureLikelihoodPercent),
                ventureExpectedCloseDate: resolvedPreviousDraft.ventureExpectedCloseDate || null
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

function pipelinePhasePillClass(column: PipelineBoardColumn) {
  if (column === "INTAKE") return "phase-intake";
  if (column === "VENTURE_STUDIO_CONTRACT_EVALUATION") return "phase-vs-evaluation";
  if (column === "SCREENING") return "phase-screening";
  return "phase-commercial";
}

  return (
    <main>
      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}
      {loading ? <p className="status">Loading pipeline board...</p> : null}

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
                {column.key === "INTAKE" ? (
                  <>
                    <div className="pipeline-filter-row" onClick={(event) => event.stopPropagation()}>
                      {INTAKE_STAGE_FILTER_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`pipeline-filter-chip ${intakeStageFilter === option.value ? "active" : ""}`}
                          onClick={() => setIntakeStageFilter(option.value)}
                        >
                          <span>{option.label}</span>
                          <span className="pipeline-filter-chip-count">{intakeFilterCounts[option.value]}</span>
                        </button>
                      ))}
                    </div>
                    <div className="pipeline-column-add-row">
                    <button
                      type="button"
                      className="pipeline-column-add-button"
                      onClick={() => setIntakeAddModalSignal((current) => current + 1)}
                    >
                      + Add New Company
                    </button>
                    <EntityLookupInput
                      entityKind="COMPANY"
                      value={intakeAddLookupValue}
                      onChange={setIntakeAddLookupValue}
                      companyCreateDefaults={{ companyType }}
                      onEntityCreated={(created) => {
                        void handleIntakeCompanyCreated(created);
                      }}
                      openAddModalSignal={intakeAddModalSignal}
                      hideLookupField
                    />
                  </div>
                  </>
                ) : null}
                {columnItems.length === 0 ? <p className="muted">No items in this stage.</p> : null}

                {columnItems.map((item) => {
                  const openOpportunities = item.openOpportunities || [];
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
                      className={`pipeline-card ${highlightedItemId === item.id ? "newly-added" : ""} ${draggingId === item.id ? "dragging" : ""}`}
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
                      onClick={() => openCardDetail(item.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openCardDetail(item.id);
                        }
                      }}
                    >
                      <div className="pipeline-card-head">
                        <h3>{item.name}</h3>
                        <span className={`pipeline-phase-pill ${pipelinePhasePillClass(item.column)}`}>
                          {item.phaseLabel}
                        </span>
                      </div>
                      <p className="muted">{item.location || "Location unavailable"}</p>
                      <div className="pipeline-card-signals pipeline-card-signals-inactive">
                        <span className={`pipeline-signal-pill ${item.staleLevel ? `pipeline-signal-pill-${item.staleLevel}` : ""}`}>
                          {timeInStageLabel(item)}
                        </span>
                        <span className="pipeline-signal-pill">{intakeStageFlagLabel(item.intakeStage)}</span>
                        <span className="pipeline-signal-pill">{primaryCategoryLabel(item.primaryCategory)}</span>
                        {raiseSummaryLabel(item) ? <span className="pipeline-signal-pill">{raiseSummaryLabel(item)}</span> : null}
                        {item.companyCategory !== "ACTIVE" ? (
                          <span className={"pipeline-signal-pill pipeline-signal-pill-category " + (item.companyCategory === "RE_ENGAGE_LATER" ? "pipeline-signal-pill-reengage" : "pipeline-signal-pill-closed")}>{companyStatusFlagLabel(item.companyCategory)}</span>
                        ) : null}
                        {item.closedOutcome ? (
                          <span className="pipeline-signal-pill">{closedOutcomeLabel(item.closedOutcome)}</span>
                        ) : null}
                      </div>
                      <div className="pipeline-card-meta">
                        {item.openOpportunityCount > 0 && (
                          <div className="muted pipeline-card-open-opportunities">
                            <span className="pipeline-open-opportunities-trigger">
                              <span
                                className="pipeline-open-opportunities-summary"
                                role="button"
                                tabIndex={0}
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  openCardDetail(item.id, "opportunities");
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    openCardDetail(item.id, "opportunities");
                                  }
                                }}
                              >
                                  <strong>{item.openOpportunityCount}</strong> open{" "}
                                  {item.openOpportunityCount === 1 ? "opportunity" : "opportunities"}
                              </span>
                              <span className="pipeline-open-opportunities-popover" role="tooltip">
                                {openOpportunities.length === 0 ? (
                                  <span className="pipeline-open-opportunity-empty">No open opportunities loaded.</span>
                                ) : (
                                  <ul className="pipeline-open-opportunity-list">
                                    {openOpportunities.map((opportunity) => {
                                      const stage = normalizeBoardOpportunityStage(opportunity.stage);
                                      const tone = opportunityStatusTone(stage, opportunity.likelihoodPercent);
                                      return (
                                        <li key={opportunity.id} className="pipeline-open-opportunity-item">
                                          <span className={`pipeline-open-opportunity-status-dot pipeline-open-opportunity-status-${tone}`} />
                                          <span className="pipeline-open-opportunity-name">
                                            {opportunity.title || "Untitled opportunity"}
                                          </span>
                                          <span className="pipeline-open-opportunity-status">
                                            {opportunityStageLabel(stage)}
                                          </span>
                                          <span className="pipeline-open-opportunity-likelihood">
                                            {opportunityLikelihoodLabel(opportunity.likelihoodPercent)}
                                          </span>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </span>
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="pipeline-card-submeta">
                        <span><strong>Owner:</strong> {item.ownerName || "Unassigned"}</span>
                        <span><strong>Next due:</strong> {toDateDisplayValue(item.nextStepDueAt)}</span>
                        <span><strong>Last activity:</strong> {formatTimestamp(item.lastMeaningfulActivityAt)}</span>
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
                          <div className="pipeline-inline-field pipeline-inline-field--date">
                            <span className="pipeline-inline-label">Intake Decision Date</span>
                            {isEditing(item.id, "intakeDate") ? (
                              <DateInputField
                                value={intakeDraft.intakeScheduledAt}
                                className="pipeline-inline-input"
                                debugContext={{ scope: "pipeline-kanban.intakeDate", itemId: item.id, field: "intakeScheduledAt" }}
                                onChange={(nextValue) => {
                                  const nextDraft: IntakeDraft = {
                                    ...intakeDraft,
                                    intakeScheduledAt: nextValue
                                  };
                                  setEditingField(null);
                                  void commitIntakeDraft(item.id, nextDraft, intakeDraftFromItem(item));
                                }}
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
                        ) : null}

                        {item.column === "INTAKE" ? (
                          <>
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

                        {item.column !== "INTAKE" ? (
                          <>
                            {item.column !== "COMMERCIAL_ACCELERATION" ? (
                              <div className="pipeline-inline-field pipeline-inline-field--date">
                                <span className="pipeline-inline-label">VS Contract Executed</span>
                                {isEditing(item.id, "ventureStudioContractExecutedAt") ? (
                                  <DateInputField
                                    value={cardMetaDraft.ventureStudioContractExecutedAt}
                                    className="pipeline-inline-input"
                                    debugContext={{
                                      scope: "pipeline-kanban.cardMetaDate",
                                      itemId: item.id,
                                      field: "ventureStudioContractExecutedAt"
                                    }}
                                    onChange={(nextValue) => {
                                      const nextDraft: CardMetaDraft = {
                                        ...cardMetaDraft,
                                        ventureStudioContractExecutedAt: nextValue
                                      };
                                      debugDateLog("pipeline-kanban.date-field-change", {
                                        itemId: item.id,
                                        field: "ventureStudioContractExecutedAt",
                                        next: nextValue,
                                        previous: cardMetaDraft.ventureStudioContractExecutedAt
                                      });
                                      setEditingField(null);
                                      void commitCardMetaDraft(item.id, nextDraft, cardMetaDraftFromItem(item));
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  <a
                                    href="#"
                                    className="pipeline-inline-link"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setEditingField({ itemId: item.id, field: "ventureStudioContractExecutedAt" });
                                    }}
                                  >
                                    {toDateDisplayValue(item.ventureStudioContractExecutedAt)}
                                  </a>
                                )}
                              </div>
                            ) : null}

                            {item.column !== "COMMERCIAL_ACCELERATION" ? (
                              <div className="pipeline-inline-field pipeline-inline-field--date">
                                <span className="pipeline-inline-label pipeline-inline-label--nowrap">Screening Webinar 1</span>
                                {isEditing(item.id, "screeningWebinarDate1At") ? (
                                  <DateInputField
                                    value={cardMetaDraft.screeningWebinarDate1At}
                                    className="pipeline-inline-input"
                                    debugContext={{
                                      scope: "pipeline-kanban.cardMetaDate",
                                      itemId: item.id,
                                      field: "screeningWebinarDate1At"
                                    }}
                                    onChange={(nextValue) => {
                                      const nextDraft: CardMetaDraft = {
                                        ...cardMetaDraft,
                                        screeningWebinarDate1At: nextValue
                                      };
                                      debugDateLog("pipeline-kanban.date-field-change", {
                                        itemId: item.id,
                                        field: "screeningWebinarDate1At",
                                        next: nextValue,
                                        previous: cardMetaDraft.screeningWebinarDate1At
                                      });
                                      setEditingField(null);
                                      void commitCardMetaDraft(item.id, nextDraft, cardMetaDraftFromItem(item));
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  <a
                                    href="#"
                                    className="pipeline-inline-link"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setEditingField({ itemId: item.id, field: "screeningWebinarDate1At" });
                                    }}
                                  >
                                    {toDateDisplayValue(item.screeningWebinarDate1At)}
                                  </a>
                                )}
                              </div>
                            ) : null}

                            {item.column !== "COMMERCIAL_ACCELERATION" ? (
                              <div className="pipeline-inline-field pipeline-inline-field--date">
                                <span className="pipeline-inline-label pipeline-inline-label--nowrap">Screening Webinar 2</span>
                                {isEditing(item.id, "screeningWebinarDate2At") ? (
                                  <DateInputField
                                    value={cardMetaDraft.screeningWebinarDate2At}
                                    className="pipeline-inline-input"
                                    debugContext={{
                                      scope: "pipeline-kanban.cardMetaDate",
                                      itemId: item.id,
                                      field: "screeningWebinarDate2At"
                                    }}
                                    onChange={(nextValue) => {
                                      const nextDraft: CardMetaDraft = {
                                        ...cardMetaDraft,
                                        screeningWebinarDate2At: nextValue
                                      };
                                      debugDateLog("pipeline-kanban.date-field-change", {
                                        itemId: item.id,
                                        field: "screeningWebinarDate2At",
                                        next: nextValue,
                                        previous: cardMetaDraft.screeningWebinarDate2At
                                      });
                                      setEditingField(null);
                                      void commitCardMetaDraft(item.id, nextDraft, cardMetaDraftFromItem(item));
                                    }}
                                    autoFocus
                                  />
                                ) : (
                                  <a
                                    href="#"
                                    className="pipeline-inline-link"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      setEditingField({ itemId: item.id, field: "screeningWebinarDate2At" });
                                    }}
                                  >
                                    {toDateDisplayValue(item.screeningWebinarDate2At)}
                                  </a>
                                )}
                              </div>
                            ) : null}
                          </>
                        ) : null}

                        {item.column === "VENTURE_STUDIO_CONTRACT_EVALUATION" ? (
                          <>
                            <div className="pipeline-inline-field">
                              <span className="pipeline-inline-label pipeline-inline-label--nowrap">Likelihood</span>
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

                            <div className="pipeline-inline-field pipeline-inline-field--date">
                              <span className="pipeline-inline-label">Expected Close Date</span>
                              {isEditing(item.id, "ventureExpectedCloseDate") ? (
                                <DateInputField
                                  value={cardMetaDraft.ventureExpectedCloseDate}
                                  className="pipeline-inline-input"
                                  debugContext={{
                                    scope: "pipeline-kanban.cardMetaDate",
                                    itemId: item.id,
                                    field: "ventureExpectedCloseDate"
                                  }}
                                  onChange={(nextValue) => {
                                    const nextDraft: CardMetaDraft = {
                                      ...cardMetaDraft,
                                      ventureExpectedCloseDate: nextValue
                                    };
                                    debugDateLog("pipeline-kanban.date-field-change", {
                                      itemId: item.id,
                                      field: "ventureExpectedCloseDate",
                                      next: nextValue,
                                      previous: cardMetaDraft.ventureExpectedCloseDate
                                    });
                                    setEditingField(null);
                                    void commitCardMetaDraft(item.id, nextDraft, cardMetaDraftFromItem(item));
                                  }}
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

                      <div className="actions actions-flush">
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

      <section className="pipeline-inactive-queue" aria-label="Inactive pipeline queue">
        <button
          type="button"
          className="pipeline-inactive-queue-head pipeline-inactive-queue-toggle"
          onClick={() => setInactiveQueueExpanded((current) => !current)}
          aria-expanded={inactiveQueueExpanded}
        >
          <div>
            <h2>Closed and revisit queue</h2>
            <p className="muted">Companies that fell out of the active process live here instead of as a pipeline stage.</p>
          </div>
          <div className="pipeline-inactive-queue-head-right">
            <span className="status-pill draft">{filteredInactiveItems.length}</span>
            <span className="pipeline-collapse-indicator">{inactiveQueueExpanded ? "Hide" : "Show"}</span>
          </div>
        </button>
        {inactiveQueueExpanded ? (
          filteredInactiveItems.length === 0 && inactiveItems.length === 0 ? (
            <p className="muted">No closed or revisit-later companies right now.</p>
          ) : (
            <>
              <div className="pipeline-filter-row" onClick={(event) => event.stopPropagation()}>
                {INACTIVE_STATUS_FILTER_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`pipeline-filter-chip ${inactiveStatusFilter === option.value ? "active" : ""}`}
                    onClick={() => setInactiveStatusFilter(option.value)}
                  >
                    <span>{option.label}</span>
                    <span className="pipeline-filter-chip-count">{inactiveFilterCounts[option.value]}</span>
                  </button>
                ))}
              </div>
              {filteredInactiveItems.length === 0 ? (
                <p className="muted">No companies match this inactive filter.</p>
              ) : (
                <div className="pipeline-inactive-grid">
                  {filteredInactiveItems.map((item) => (
                <button
                  key={`inactive-${item.id}`}
                  type="button"
                  className="pipeline-card pipeline-card-inactive"
                  onClick={() => openCardDetail(item.id)}
                >
                  <div className="pipeline-card-head">
                    <h3>{item.name}</h3>
                    <span className={"pipeline-signal-pill pipeline-signal-pill-category " + (item.companyCategory === "RE_ENGAGE_LATER" ? "pipeline-signal-pill-reengage" : "pipeline-signal-pill-closed")}>
                      {companyCategoryLabel(item.companyCategory)}
                    </span>
                  </div>
                  <p className="muted">{item.location || "Location unavailable"}</p>
                  <div className="pipeline-card-signals pipeline-card-signals-inactive">
                    <span className={"pipeline-signal-pill pipeline-signal-pill-category " + (item.companyCategory === "RE_ENGAGE_LATER" ? "pipeline-signal-pill-reengage" : "pipeline-signal-pill-closed")}>{companyStatusFlagLabel(item.companyCategory)}</span>
                    <span className="pipeline-signal-pill">{item.phaseLabel}</span>
                    <span className="pipeline-signal-pill">{timeInStageLabel(item)}</span>
                    <span className="pipeline-signal-pill">{intakeStageFlagLabel(item.intakeStage)}</span>
                    <span className="pipeline-signal-pill">{primaryCategoryLabel(item.primaryCategory)}</span>
                    {raiseSummaryLabel(item) ? <span className="pipeline-signal-pill">{raiseSummaryLabel(item)}</span> : null}
                    {item.closedOutcome ? <span className="pipeline-signal-pill">{closedOutcomeLabel(item.closedOutcome)}</span> : null}
                    {item.declineReason ? <span className="pipeline-signal-pill">{declineReasonLabel(item.declineReason)}</span> : null}
                  </div>
                  <div className="pipeline-card-submeta">
                    <span><strong>Owner:</strong> {item.ownerName || "Unassigned"}</span>
                    <span><strong>Next due:</strong> {toDateDisplayValue(item.nextStepDueAt)}</span>
                    <span><strong>Last activity:</strong> {formatTimestamp(item.lastMeaningfulActivityAt)}</span>
                  </div>
                </button>
                  ))}
                </div>
              )}
            </>
          )
        ) : null}
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
          <PipelineOpportunityDetailView
            itemId={selectedDetailId}
            inModal
            initialIntakeDetailTab={selectedDetailInitialTab}
            onCloseModal={closeDetailModal}
          />
        </div>
      ) : null}
    </main>
  );
}
