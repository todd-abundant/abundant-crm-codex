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
import { ScreeningSurveySessionSelector } from "./screening-survey-session-selector";
import { InlineTextareaField } from "./inline-detail-field";
import { RichTextArea } from "./rich-text-area";
import {
  inferGoogleDocumentTitle,
  MAX_COMPANY_DOCUMENT_FILE_BYTES,
  normalizeGoogleDocsUrl,
  readFileAsDataUrl
} from "@/lib/company-document-links";

type ScreeningStatus = "NOT_STARTED" | "PENDING" | "NEGOTIATING" | "SIGNED" | "DECLINED";
type ScreeningAttendanceStatus = "INVITED" | "ATTENDED" | "DECLINED" | "NO_SHOW";
type ScreeningFeedbackSentiment = "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";
type ScreeningCellField = "RELEVANT_FEEDBACK" | "STATUS_UPDATE";
type CompanyDocumentType =
  | "INTAKE_REPORT"
  | "SCREENING_REPORT"
  | "TERM_SHEET"
  | "VENTURE_STUDIO_CONTRACT"
  | "LOI"
  | "COMMERCIAL_CONTRACT"
  | "OTHER";

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

type QualitativeFeedbackEntry = ScreeningQualitativeFeedback & {
  healthSystemId: string;
  healthSystemName: string;
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
  atAGlanceProblem: string | null;
  atAGlanceSolution: string | null;
  atAGlanceImpact: string | null;
  atAGlanceKeyStrengths: string | null;
  atAGlanceKeyConsiderations: string | null;
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
    type: CompanyDocumentType;
    title: string;
    url: string;
    notes: string | null;
    uploadedAt: string;
  }>;
  screening: {
    healthSystems: ScreeningHealthSystem[];
  };
};

type IntakeDetailTab =
  | "pipeline-status"
  | "at-a-glance-status"
  | "venture-studio-criteria"
  | "market-landscape"
  | "recommendations"
  | "notes"
  | "documents";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isEmbeddedDocumentUrl(value: string) {
  return value.startsWith("data:");
}

function documentUrlLabel(value: string) {
  return isEmbeddedDocumentUrl(value) ? "Open uploaded file" : value;
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

function inlineInterestClassName(status: ScreeningStatus) {
  if (status === "SIGNED") return "screening-status-green-check";
  return statusMeta(status).className;
}

function sentimentLabel(sentiment: ScreeningFeedbackSentiment) {
  if (sentiment === "POSITIVE") return "Positive";
  if (sentiment === "NEGATIVE") return "Negative";
  if (sentiment === "MIXED") return "Mixed";
  return "Neutral";
}

const screeningInlineInterestOptions: Array<{ value: ScreeningStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Grey" },
  { value: "DECLINED", label: "Red" },
  { value: "PENDING", label: "Yellow" },
  { value: "NEGOTIATING", label: "Green" },
  { value: "SIGNED", label: "LOI signed" }
];

const companyDocumentTypeOptions: Array<{ value: CompanyDocumentType; label: string }> = [
  { value: "INTAKE_REPORT", label: "Intake Report" },
  { value: "SCREENING_REPORT", label: "Screening Report" },
  { value: "TERM_SHEET", label: "Term Sheet" },
  { value: "VENTURE_STUDIO_CONTRACT", label: "Venture Studio Contract" },
  { value: "LOI", label: "LOI" },
  { value: "COMMERCIAL_CONTRACT", label: "Commercial Contract" },
  { value: "OTHER", label: "Other" }
];

const companyDocumentUploadAccept =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp";
const companyDocumentMaxSizeMb = Math.round(MAX_COMPANY_DOCUMENT_FILE_BYTES / (1024 * 1024));

const screeningDetailViewOptions: Array<{ key: ScreeningDetailView; label: string; icon: string }> = [
  { key: "status", label: "Status Matrix", icon: "SM" },
  { key: "quantitative", label: "Quantitative", icon: "Q" },
  { key: "qualitative", label: "Qualitative", icon: "Ql" },
  { key: "documents", label: "Company Docs", icon: "CD" }
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

function compareQualitativeCategoryName(a: string, b: string) {
  const categoryAIndex = qualitativeCategoryOptions.indexOf(a);
  const categoryBIndex = qualitativeCategoryOptions.indexOf(b);
  if (categoryAIndex >= 0 && categoryBIndex >= 0) return categoryAIndex - categoryBIndex;
  if (categoryAIndex >= 0) return -1;
  if (categoryBIndex >= 0) return 1;
  return a.localeCompare(b);
}

type QuantitativeQuestionCategory = {
  category: string;
  questions: string[];
};

const defaultQuantitativeQuestionCategories: QuantitativeQuestionCategory[] = [
  {
    category: "Desirability",
    questions: [
      "How urgent is the underlying problem for your organization?",
      "How clear is the value proposition for clinicians and operators?",
      "How likely is your team to champion adoption internally?"
    ]
  },
  {
    category: "Feasibility",
    questions: [
      "How feasible is implementation with current workflow and resources?",
      "How realistic is integration with existing systems (Epic/EHR/data)?",
      "How manageable is change management for frontline teams?"
    ]
  },
  {
    category: "Impact and Viability",
    questions: [
      "How strong is expected clinical and operational impact?",
      "How compelling is expected ROI over the next 12-24 months?",
      "How durable is the model for long-term adoption and scale?"
    ]
  },
  {
    category: "Co-Development",
    questions: [
      "How interested is your organization in co-development participation?",
      "How prepared is your team to share data and feedback loops?",
      "How aligned are incentives for pilot design and governance?"
    ]
  }
];

function compareQuantitativeCategoryName(a: string, b: string) {
  const categoryAIndex = quantitativeCategoryOptions.indexOf(a);
  const categoryBIndex = quantitativeCategoryOptions.indexOf(b);
  if (categoryAIndex >= 0 && categoryBIndex >= 0) return categoryAIndex - categoryBIndex;
  if (categoryAIndex >= 0) return -1;
  if (categoryBIndex >= 0) return 1;
  return a.localeCompare(b);
}

function cloneQuantitativeQuestionCategories(source: QuantitativeQuestionCategory[]) {
  return source.map((entry) => ({
    category: entry.category,
    questions: [...entry.questions]
  }));
}

function normalizeMetricKey(metric: string) {
  return metric.trim().toLowerCase().replace(/\s+/g, " ");
}

function sanitizeQuantitativeQuestionCategories(raw: unknown): QuantitativeQuestionCategory[] | null {
  if (!Array.isArray(raw)) return null;

  const categories: QuantitativeQuestionCategory[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const candidate = entry as { category?: unknown; questions?: unknown };
    const category = typeof candidate.category === "string" ? candidate.category.trim() : "";
    if (!category) continue;

    const questions = Array.isArray(candidate.questions)
      ? candidate.questions
          .filter((question): question is string => typeof question === "string")
          .map((question) => question.trim())
          .filter((question) => question.length > 0)
      : [];

    categories.push({
      category,
      questions: questions.length > 0 ? questions : ["Untitled question"]
    });
  }

  if (categories.length === 0) return null;
  return categories.sort((a, b) => compareQuantitativeCategoryName(a.category, b.category));
}

function mergeQuantitativeQuestionsWithFeedback(
  source: QuantitativeQuestionCategory[],
  healthSystems: ScreeningHealthSystem[]
) {
  const normalizedQuestionSetByCategory = new Map<string, Set<string>>();
  const sectionByCategory = new Map<string, QuantitativeQuestionCategory>();

  for (const section of source) {
    const category = section.category.trim();
    if (!category) continue;
    const questions = section.questions
      .map((question) => question.trim())
      .filter((question) => question.length > 0);
    const normalizedQuestions = new Set(questions.map((question) => normalizeMetricKey(question)));

    normalizedQuestionSetByCategory.set(category, normalizedQuestions);
    sectionByCategory.set(category, {
      category,
      questions: questions.length > 0 ? questions : ["Untitled question"]
    });
  }

  for (const healthSystem of healthSystems) {
    for (const entry of healthSystem.quantitativeFeedback) {
      const category = entry.category?.trim() || "Uncategorized";
      const metric = entry.metric?.trim() || "Untitled question";
      const normalizedMetric = normalizeMetricKey(metric);

      let section = sectionByCategory.get(category);
      if (!section) {
        section = { category, questions: [] };
        sectionByCategory.set(category, section);
      }

      const normalizedQuestions = normalizedQuestionSetByCategory.get(category) || new Set<string>();
      if (!normalizedQuestions.has(normalizedMetric)) {
        section.questions.push(metric);
        normalizedQuestions.add(normalizedMetric);
        normalizedQuestionSetByCategory.set(category, normalizedQuestions);
      }
    }
  }

  return Array.from(sectionByCategory.values()).sort((a, b) =>
    compareQuantitativeCategoryName(a.category, b.category)
  );
}

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

type QualitativeFeedbackDraft = {
  healthSystemId: string;
  contactId: string;
  category: string;
  theme: string;
  sentiment: ScreeningFeedbackSentiment;
  feedback: string;
};

type QualitativeFeedbackEditDraft = {
  contactId: string;
  category: string;
  theme: string;
  sentiment: ScreeningFeedbackSentiment;
  feedback: string;
};

type QuantitativeSlideResponse = {
  id: string;
  score: number;
  contactName: string;
  contactTitle: string | null;
  institution: string;
};

type QuantitativeSlideQuestionRow = {
  metric: string;
  responseCount: number;
  averageScore: number | null;
  responses: QuantitativeSlideResponse[];
  isUnmapped: boolean;
};

type QuantitativeSlideCategorySection = {
  category: string;
  categoryAverageScore: number | null;
  rows: QuantitativeSlideQuestionRow[];
};

type AtAGlanceFieldKey =
  | "atAGlanceProblem"
  | "atAGlanceSolution"
  | "atAGlanceImpact"
  | "atAGlanceKeyStrengths"
  | "atAGlanceKeyConsiderations";

type ScreeningDetailView = "status" | "quantitative" | "qualitative" | "documents";
type AddAttendeeModalState = {
  healthSystemId: string;
  healthSystemName: string;
};

function screeningCellFieldLabel(field: ScreeningCellField) {
  return field === "RELEVANT_FEEDBACK" ? "Relevant Feedback + Next Steps" : "Status Update";
}

function emptyQualitativeFeedbackDraft(healthSystemId: string): QualitativeFeedbackDraft {
  return {
    healthSystemId,
    contactId: "",
    category: "Key Theme",
    theme: "",
    sentiment: "NEUTRAL",
    feedback: ""
  };
}

export function PipelineOpportunityDetailView({
  itemId,
  inModal = false
}: {
  itemId: string;
  inModal?: boolean;
}) {
  const [item, setItem] = React.useState<PipelineOpportunityDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [activeIntakeDetailTab, setActiveIntakeDetailTab] = React.useState<IntakeDetailTab>("pipeline-status");
  const [savingPhase, setSavingPhase] = React.useState(false);
  const [savingStatusByHealthSystemId, setSavingStatusByHealthSystemId] = React.useState<Record<string, boolean>>({});
  const [savingFeedbackByHealthSystemId, setSavingFeedbackByHealthSystemId] = React.useState<Record<string, boolean>>({});
  const [savingScreeningCellByKey, setSavingScreeningCellByKey] = React.useState<Record<string, boolean>>({});
  const [addingAttendeeByHealthSystemId, setAddingAttendeeByHealthSystemId] = React.useState<Record<string, boolean>>({});
  const [relevantFeedbackDraftByHealthSystemId, setRelevantFeedbackDraftByHealthSystemId] = React.useState<
    Record<string, string>
  >({});
  const [statusUpdateDraftByHealthSystemId, setStatusUpdateDraftByHealthSystemId] = React.useState<
    Record<string, string>
  >({});
  const [addAttendeeModal, setAddAttendeeModal] = React.useState<AddAttendeeModalState | null>(null);
  const [addAttendeeLookupValue, setAddAttendeeLookupValue] = React.useState("");
  const [editingScreeningCell, setEditingScreeningCell] = React.useState<{
    healthSystemId: string;
    field: ScreeningCellField;
  } | null>(null);
  const [qualitativeDraft, setQualitativeDraft] = React.useState<QualitativeFeedbackDraft>(() =>
    emptyQualitativeFeedbackDraft("")
  );
  const [editingQualitativeFeedbackId, setEditingQualitativeFeedbackId] = React.useState<string | null>(null);
  const [editingQualitativeDraft, setEditingQualitativeDraft] =
    React.useState<QualitativeFeedbackEditDraft | null>(null);
  const [savingQualitativeEntryById, setSavingQualitativeEntryById] = React.useState<Record<string, boolean>>({});
  const [deletingQualitativeEntryById, setDeletingQualitativeEntryById] = React.useState<Record<string, boolean>>({});
  const [showQualitativePreview, setShowQualitativePreview] = React.useState(false);
  const [quantitativeQuestionCategories, setQuantitativeQuestionCategories] = React.useState<
    QuantitativeQuestionCategory[]
  >(() => cloneQuantitativeQuestionCategories(defaultQuantitativeQuestionCategories));
  const [quantitativeQuestionEditorOpen, setQuantitativeQuestionEditorOpen] = React.useState(false);
  const [quantitativeQuestionsReady, setQuantitativeQuestionsReady] = React.useState(false);
  const [screeningDetailView, setScreeningDetailView] = React.useState<ScreeningDetailView>("status");
  const [activeScreeningHealthSystemId, setActiveScreeningHealthSystemId] = React.useState<string | null>(null);
  const [addingCompanyDocument, setAddingCompanyDocument] = React.useState(false);
  const [newCompanyDocumentType, setNewCompanyDocumentType] = React.useState<CompanyDocumentType>("OTHER");
  const [newCompanyDocumentTitle, setNewCompanyDocumentTitle] = React.useState("");
  const [newCompanyDocumentGoogleUrl, setNewCompanyDocumentGoogleUrl] = React.useState("");
  const [savingAtAGlanceFieldByKey, setSavingAtAGlanceFieldByKey] = React.useState<Record<string, boolean>>({});

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
    if (!item?.isScreeningStage || screeningDetailView !== "quantitative") return;

    const intervalId = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/pipeline/opportunities/${itemId}`, { cache: "no-store" });
          const payload = await res.json();
          if (!res.ok) return;
          setItem(payload.item || null);
        } catch {
          // Keep background refresh silent; foreground actions surface errors.
        }
      })();
    }, 8000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [item?.isScreeningStage, screeningDetailView, itemId]);

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
  }, [item]);

  React.useEffect(() => {
    if (!item?.isScreeningStage) {
      setQualitativeDraft(emptyQualitativeFeedbackDraft(""));
      setEditingQualitativeFeedbackId(null);
      setEditingQualitativeDraft(null);
      setShowQualitativePreview(false);
      return;
    }

    const availableHealthSystemIds = new Set(
      item.screening.healthSystems.map((entry) => entry.healthSystemId)
    );
    const firstHealthSystemId = item.screening.healthSystems[0]?.healthSystemId || "";

    setQualitativeDraft((current) => {
      const nextHealthSystemId =
        current.healthSystemId && availableHealthSystemIds.has(current.healthSystemId)
          ? current.healthSystemId
          : firstHealthSystemId;

      if (current.healthSystemId === nextHealthSystemId) return current;
      return {
        ...current,
        healthSystemId: nextHealthSystemId
      };
    });

    if (!editingQualitativeFeedbackId) return;

    const stillExists = item.screening.healthSystems.some((entry) =>
      entry.qualitativeFeedback.some((feedback) => feedback.id === editingQualitativeFeedbackId)
    );
    if (!stillExists) {
      setEditingQualitativeFeedbackId(null);
      setEditingQualitativeDraft(null);
    }
  }, [item?.isScreeningStage, item?.screening.healthSystems, editingQualitativeFeedbackId]);

  React.useEffect(() => {
    if (!item?.isScreeningStage) {
      setQuantitativeQuestionCategories(cloneQuantitativeQuestionCategories(defaultQuantitativeQuestionCategories));
      setQuantitativeQuestionEditorOpen(false);
      setQuantitativeQuestionsReady(false);
      return;
    }

    setQuantitativeQuestionsReady(false);
    const storageKey = `abundant:quantitative-question-set:${item.id}`;
    let source = cloneQuantitativeQuestionCategories(defaultQuantitativeQuestionCategories);

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          const stored = sanitizeQuantitativeQuestionCategories(parsed);
          if (stored) source = stored;
        }
      } catch {
        // Ignore malformed persisted state and fall back to defaults.
      }
    }

    setQuantitativeQuestionCategories(
      mergeQuantitativeQuestionsWithFeedback(source, item.screening.healthSystems)
    );
    setQuantitativeQuestionsReady(true);
  }, [item?.id, item?.isScreeningStage, item?.screening.healthSystems]);

  React.useEffect(() => {
    if (!item?.isScreeningStage || !quantitativeQuestionsReady || typeof window === "undefined") return;
    const storageKey = `abundant:quantitative-question-set:${item.id}`;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(quantitativeQuestionCategories));
    } catch {
      // Ignore local storage failures in restrictive browser contexts.
    }
  }, [item?.id, item?.isScreeningStage, quantitativeQuestionCategories, quantitativeQuestionsReady]);

  function screeningCellKey(healthSystemId: string, field: ScreeningCellField) {
    return `${healthSystemId}:${field}`;
  }

  function updateQuantitativeQuestion(
    category: string,
    questionIndex: number,
    nextQuestion: string
  ) {
    setQuantitativeQuestionCategories((current) =>
      current.map((section) => {
        if (section.category !== category) return section;
        const nextQuestions = section.questions.map((question, index) =>
          index === questionIndex ? nextQuestion : question
        );
        return {
          ...section,
          questions: nextQuestions
        };
      })
    );
  }

  function normalizeQuantitativeQuestion(category: string, questionIndex: number) {
    setQuantitativeQuestionCategories((current) =>
      current.map((section) => {
        if (section.category !== category) return section;
        const nextQuestions = section.questions.map((question, index) =>
          index === questionIndex ? question.trim() || "Untitled question" : question
        );
        return {
          ...section,
          questions: nextQuestions
        };
      })
    );
  }

  function addQuantitativeQuestion(category: string) {
    setQuantitativeQuestionCategories((current) =>
      current.map((section) =>
        section.category === category
          ? {
              ...section,
              questions: [...section.questions, `New question ${section.questions.length + 1}`]
            }
          : section
      )
    );
  }

  function removeQuantitativeQuestion(category: string, questionIndex: number) {
    setQuantitativeQuestionCategories((current) =>
      current.map((section) => {
        if (section.category !== category) return section;
        if (section.questions.length <= 1) return section;
        return {
          ...section,
          questions: section.questions.filter((_, index) => index !== questionIndex)
        };
      })
    );
  }

  function resetQuantitativeQuestions() {
    if (!item?.isScreeningStage) return;
    setQuantitativeQuestionCategories(
      mergeQuantitativeQuestionsWithFeedback(
        cloneQuantitativeQuestionCategories(defaultQuantitativeQuestionCategories),
        item.screening.healthSystems
      )
    );
    setStatus({ kind: "ok", text: "Quantitative question set reset to defaults." });
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

  async function updateAtAGlanceField(field: AtAGlanceFieldKey, value: string) {
    if (!item) return;
    if ((item[field] || "") === value) return;

    setSavingAtAGlanceFieldByKey((current) => ({ ...current, [field]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [field]: value
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update At a Glance field.");

      const returnedValue = payload.item?.[field];
      const nextValue = typeof returnedValue === "string" ? returnedValue : value;
      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          [field]: nextValue
        };
      });
      setStatus({ kind: "ok", text: "At a Glance section updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update At a Glance field."
      });
    } finally {
      setSavingAtAGlanceFieldByKey((current) => ({ ...current, [field]: false }));
    }
  }

  async function addScreeningAttendee(healthSystemId: string, contactId: string) {
    if (!item || !contactId) return false;
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

      setStatus({ kind: "ok", text: "Attendee added." });
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add attendee."
      });
      return false;
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

  function startQualitativeFeedbackEdit(entry: QualitativeFeedbackEntry) {
    setEditingQualitativeFeedbackId(entry.id);
    setEditingQualitativeDraft({
      contactId: entry.contactId || "",
      category: entry.category || "Key Theme",
      theme: entry.theme,
      sentiment: entry.sentiment,
      feedback: entry.feedback
    });
  }

  function cancelQualitativeFeedbackEdit() {
    setEditingQualitativeFeedbackId(null);
    setEditingQualitativeDraft(null);
  }

  async function addQualitativeFeedback() {
    if (!item) return;

    const healthSystemId = qualitativeDraft.healthSystemId;
    const category = qualitativeDraft.category.trim();
    const theme = qualitativeDraft.theme.trim();
    const feedback = qualitativeDraft.feedback.trim();

    if (!healthSystemId || !category || !theme || !feedback) {
      setStatus({ kind: "error", text: "Alliance member, category, theme, and detail are required." });
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
          contactId: qualitativeDraft.contactId || undefined,
          category,
          theme,
          sentiment: qualitativeDraft.sentiment,
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
      setQualitativeDraft(emptyQualitativeFeedbackDraft(healthSystemId));
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

  async function saveQualitativeFeedbackEdit(entry: QualitativeFeedbackEntry) {
    if (!item || !editingQualitativeDraft) return;

    const category = editingQualitativeDraft.category.trim();
    const theme = editingQualitativeDraft.theme.trim();
    const feedback = editingQualitativeDraft.feedback.trim();

    if (!category || !theme || !feedback) {
      setStatus({ kind: "error", text: "Category, theme, and detail are required." });
      return;
    }

    setSavingQualitativeEntryById((current) => ({ ...current, [entry.id]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening-feedback/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: editingQualitativeDraft.contactId || null,
          category,
          theme,
          sentiment: editingQualitativeDraft.sentiment,
          feedback
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update qualitative feedback");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((healthSystem) => ({
              ...healthSystem,
              qualitativeFeedback: healthSystem.qualitativeFeedback.map((feedbackEntry) =>
                feedbackEntry.id === entry.id ? payload.entry : feedbackEntry
              )
            }))
          }
        };
      });
      setEditingQualitativeFeedbackId(null);
      setEditingQualitativeDraft(null);
      setStatus({ kind: "ok", text: "Qualitative feedback updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update qualitative feedback"
      });
    } finally {
      setSavingQualitativeEntryById((current) => ({ ...current, [entry.id]: false }));
    }
  }

  async function deleteQualitativeFeedback(entry: QualitativeFeedbackEntry) {
    if (!item) return;
    if (!window.confirm(`Delete qualitative entry "${entry.theme}"?`)) return;

    setDeletingQualitativeEntryById((current) => ({ ...current, [entry.id]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/screening-feedback/${entry.id}`, {
        method: "DELETE"
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete qualitative feedback");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          screening: {
            healthSystems: current.screening.healthSystems.map((healthSystem) => ({
              ...healthSystem,
              qualitativeFeedback: healthSystem.qualitativeFeedback.filter(
                (feedbackEntry) => feedbackEntry.id !== entry.id
              )
            }))
          }
        };
      });

      if (editingQualitativeFeedbackId === entry.id) {
        setEditingQualitativeFeedbackId(null);
        setEditingQualitativeDraft(null);
      }

      setStatus({ kind: "ok", text: "Qualitative feedback deleted." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete qualitative feedback"
      });
    } finally {
      setDeletingQualitativeEntryById((current) => ({ ...current, [entry.id]: false }));
    }
  }

  function appendCompanyDocument(document: PipelineOpportunityDetail["documents"][number]) {
    setItem((current) => {
      if (!current) return current;
      return {
        ...current,
        documents: [document, ...current.documents]
      };
    });
  }

  async function createCompanyDocument(input: {
    type: CompanyDocumentType;
    title: string;
    url: string;
  }) {
    if (!item) return false;

    setAddingCompanyDocument(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add company document.");

      const created = payload.document as PipelineOpportunityDetail["documents"][number] | undefined;
      if (!created) throw new Error("Failed to add company document.");
      appendCompanyDocument(created);
      setStatus({ kind: "ok", text: "Company document added." });
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add company document."
      });
      return false;
    } finally {
      setAddingCompanyDocument(false);
    }
  }

  async function addCompanyDocumentFromUpload(file: File) {
    if (file.size > MAX_COMPANY_DOCUMENT_FILE_BYTES) {
      setStatus({
        kind: "error",
        text: `File is too large. Max size is ${companyDocumentMaxSizeMb} MB.`
      });
      return;
    }

    const title = newCompanyDocumentTitle.trim() || file.name.trim() || "Uploaded Document";

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const created = await createCompanyDocument({
        type: newCompanyDocumentType,
        title,
        url: dataUrl
      });
      if (created) {
        setNewCompanyDocumentTitle("");
      }
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to process uploaded document."
      });
    }
  }

  async function addCompanyDocumentFromGoogleLink() {
    const normalizedUrl = normalizeGoogleDocsUrl(newCompanyDocumentGoogleUrl);
    if (!normalizedUrl) {
      setStatus({
        kind: "error",
        text: "Provide a valid Google Docs or Google Drive link."
      });
      return;
    }

    const title = newCompanyDocumentTitle.trim() || inferGoogleDocumentTitle(normalizedUrl);
    const created = await createCompanyDocument({
      type: newCompanyDocumentType,
      title,
      url: normalizedUrl
    });
    if (created) {
      setNewCompanyDocumentGoogleUrl("");
      setNewCompanyDocumentTitle("");
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
          {!inModal ? (
            <div className="actions">
              <Link href="/pipeline" className="top-nav-link top-nav-link-quiet">
                Back to Pipeline Board
              </Link>
            </div>
          ) : null}
        </section>
      </EmptyWrapper>
    );
  }

  const ContentWrapper: React.ElementType = inModal ? "div" : "main";
  const selectedScreeningHealthSystem =
    item.screening.healthSystems.find((entry) => entry.healthSystemId === activeScreeningHealthSystemId) ||
    item.screening.healthSystems[0] ||
    null;

  const contactOptionsByHealthSystemId = new Map<string, Array<{ id: string; label: string }>>();
  for (const healthSystem of item.screening.healthSystems) {
    const options: Array<{ id: string; label: string }> = [];
    const seenContactIds = new Set<string>();

    for (const participant of healthSystem.participants) {
      if (!participant.contactId || seenContactIds.has(participant.contactId)) continue;
      seenContactIds.add(participant.contactId);
      options.push({
        id: participant.contactId,
        label: participant.contactTitle
          ? `${participant.contactName} (${participant.contactTitle})`
          : participant.contactName
      });
    }

    contactOptionsByHealthSystemId.set(healthSystem.healthSystemId, options);
  }

  const qualitativeDraftContactOptions =
    contactOptionsByHealthSystemId.get(qualitativeDraft.healthSystemId) || [];

  const allQualitativeFeedbackEntries: QualitativeFeedbackEntry[] = [];
  for (const healthSystem of item.screening.healthSystems) {
    for (const feedback of healthSystem.qualitativeFeedback) {
      allQualitativeFeedbackEntries.push({
        ...feedback,
        healthSystemId: healthSystem.healthSystemId,
        healthSystemName: healthSystem.healthSystemName
      });
    }
  }

  allQualitativeFeedbackEntries.sort((a, b) => {
    const categorySort = compareQualitativeCategoryName(a.category || "Key Theme", b.category || "Key Theme");
    if (categorySort !== 0) return categorySort;

    const timeA = new Date(a.updatedAt).getTime();
    const timeB = new Date(b.updatedAt).getTime();
    if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeB - timeA;

    return a.theme.localeCompare(b.theme);
  });

  const companyDocumentComposer = (
    <div className="detail-section">
      <p className="detail-label">Add Company Document</p>
      <div className="detail-grid">
        <div>
          <label>Document Type</label>
          <select
            value={newCompanyDocumentType}
            onChange={(event) => setNewCompanyDocumentType(event.target.value as CompanyDocumentType)}
          >
            {companyDocumentTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Document Title (optional)</label>
          <input
            value={newCompanyDocumentTitle}
            onChange={(event) => setNewCompanyDocumentTitle(event.target.value)}
            placeholder="Screening memo"
          />
        </div>
        <div>
          <label>Google Docs Link</label>
          <input
            value={newCompanyDocumentGoogleUrl}
            onChange={(event) => setNewCompanyDocumentGoogleUrl(event.target.value)}
            placeholder="https://docs.google.com/..."
          />
        </div>
        <div>
          <label>Upload from Computer</label>
          <input
            type="file"
            accept={companyDocumentUploadAccept}
            disabled={addingCompanyDocument}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void addCompanyDocumentFromUpload(file);
            }}
          />
        </div>
      </div>
      <div className="actions">
        <button
          className="secondary small"
          type="button"
          onClick={() => void addCompanyDocumentFromGoogleLink()}
          disabled={addingCompanyDocument}
        >
          Add Google Doc Link
        </button>
      </div>
      <p className="muted">{`Uploads are limited to ${companyDocumentMaxSizeMb} MB per file.`}</p>
    </div>
  );

  const quantitativeSlideSectionsResult = (() => {
    type QuantitativeResponseAggregate = {
      metric: string;
      responseCount: number;
      responses: QuantitativeSlideResponse[];
    };

    const responseMapByCategory = new Map<string, Map<string, QuantitativeResponseAggregate>>();
    const questionCategoryNames = new Set(quantitativeQuestionCategories.map((section) => section.category));

    for (const healthSystem of item.screening.healthSystems) {
      for (const entry of healthSystem.quantitativeFeedback) {
        const category = entry.category?.trim() || "Uncategorized";
        const metric = entry.metric?.trim() || "Untitled question";
        const metricKey = normalizeMetricKey(metric);
        const categoryMap =
          responseMapByCategory.get(category) || new Map<string, QuantitativeResponseAggregate>();
        const row = categoryMap.get(metricKey) || {
          metric,
          responseCount: 0,
          responses: []
        };

        row.responseCount += 1;
        if (entry.score !== null && Number.isFinite(entry.score)) {
          row.responses.push({
            id: entry.id,
            score: Math.max(1, Math.min(10, entry.score)),
            contactName: entry.contactName?.trim() || "Unlinked individual",
            contactTitle: entry.contactTitle,
            institution: healthSystem.healthSystemName
          });
        }

        categoryMap.set(metricKey, row);
        responseMapByCategory.set(category, categoryMap);
      }
    }

    const sectionsFromQuestionSet = quantitativeQuestionCategories.map((section) => {
      const categoryResponseMap =
        responseMapByCategory.get(section.category) || new Map<string, QuantitativeResponseAggregate>();
      const questionKeySet = new Set(section.questions.map((question) => normalizeMetricKey(question)));
      const configuredRows: QuantitativeSlideQuestionRow[] = section.questions.map((question) => {
        const bucket = categoryResponseMap.get(normalizeMetricKey(question));
        const numericScores = bucket?.responses.map((response) => response.score) || [];
        const averageScore =
          numericScores.length > 0
            ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) / 10
            : null;

        return {
          metric: question,
          responseCount: bucket?.responseCount || 0,
          averageScore,
          responses: bucket?.responses || [],
          isUnmapped: false
        };
      });

      const unmappedRows: QuantitativeSlideQuestionRow[] = Array.from(categoryResponseMap.entries())
        .filter(([metricKey]) => !questionKeySet.has(metricKey))
        .map(([, bucket]) => {
          const numericScores = bucket.responses.map((response) => response.score);
          const averageScore =
            numericScores.length > 0
              ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) / 10
              : null;
          return {
            metric: bucket.metric,
            responseCount: bucket.responseCount,
            averageScore,
            responses: bucket.responses,
            isUnmapped: true
          };
        })
        .sort((a, b) => a.metric.localeCompare(b.metric));

      const rows = [...configuredRows, ...unmappedRows];
      const categoryScores = rows.flatMap((row) => row.responses.map((response) => response.score));
      const categoryAverageScore =
        categoryScores.length > 0
          ? Math.round((categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length) * 10) / 10
          : null;

      return {
        category: section.category,
        categoryAverageScore,
        rows
      };
    });

    const sectionsFromResponseOnlyCategories: QuantitativeSlideCategorySection[] = Array.from(
      responseMapByCategory.entries()
    )
      .filter(([category]) => !questionCategoryNames.has(category))
      .map(([category, metrics]) => {
        const rows: QuantitativeSlideQuestionRow[] = Array.from(metrics.values())
          .map((bucket) => {
            const numericScores = bucket.responses.map((response) => response.score);
            const averageScore =
              numericScores.length > 0
                ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) / 10
                : null;
            return {
              metric: bucket.metric,
              responseCount: bucket.responseCount,
              averageScore,
              responses: bucket.responses,
              isUnmapped: true
            };
          })
          .sort((a, b) => a.metric.localeCompare(b.metric));
        const categoryScores = rows.flatMap((row) => row.responses.map((response) => response.score));
        const categoryAverageScore =
          categoryScores.length > 0
            ? Math.round((categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length) * 10) / 10
            : null;

        return {
          category,
          categoryAverageScore,
          rows
        };
      });

    const sections = [...sectionsFromQuestionSet, ...sectionsFromResponseOnlyCategories]
      .filter((section) => section.rows.length > 0)
      .sort((a, b) => compareQuantitativeCategoryName(a.category, b.category));

    const institutions = Array.from(
      new Set(
        sections
          .flatMap((section) => section.rows)
          .flatMap((row) => row.responses)
          .map((response) => response.institution)
          .filter((institution) => institution.trim().length > 0)
      )
    );

    return {
      sections,
      institutions
    };
  })();
  const quantitativeSlideSections = quantitativeSlideSectionsResult.sections;
  const quantitativeRespondingInstitutions = quantitativeSlideSectionsResult.institutions;
  const quantitativeQuestionCount = quantitativeQuestionCategories.reduce(
    (sum, section) => sum + section.questions.length,
    0
  );
  const quantitativeInstitutionColorByName = (() => {
    const palette = [
      { fill: "#1f80dc", border: "#145ea8" },
      { fill: "#16a34a", border: "#166534" },
      { fill: "#ea580c", border: "#9a3412" },
      { fill: "#7c3aed", border: "#5b21b6" },
      { fill: "#e11d48", border: "#9f1239" },
      { fill: "#0891b2", border: "#155e75" },
      { fill: "#b45309", border: "#78350f" }
    ] as const;
    const colorMap = new Map<string, { fill: string; border: string }>();
    quantitativeRespondingInstitutions.forEach((institution, index) => {
      colorMap.set(institution, palette[index % palette.length]);
    });
    return colorMap;
  })();

  const atAGlanceFields: Array<{ key: AtAGlanceFieldKey; label: string; value: string }> = [
    { key: "atAGlanceProblem", label: "Problem", value: item.atAGlanceProblem || "" },
    { key: "atAGlanceSolution", label: "The Solution", value: item.atAGlanceSolution || "" },
    { key: "atAGlanceImpact", label: "The Impact", value: item.atAGlanceImpact || "" },
    { key: "atAGlanceKeyStrengths", label: "Key Strengths", value: item.atAGlanceKeyStrengths || "" },
    {
      key: "atAGlanceKeyConsiderations",
      label: "Key Considerations",
      value: item.atAGlanceKeyConsiderations || ""
    }
  ];

  return (
    <ContentWrapper className={inModal ? "pipeline-detail-content" : undefined}>
      <section className="hero">
        {!inModal ? (
          <div className="actions" style={{ marginTop: 0 }}>
            <Link href="/pipeline" className="top-nav-link top-nav-link-quiet">
              Back to Pipeline Board
            </Link>
          </div>
        ) : null}
        <h1>{item.name}</h1>
        <p>{item.location || "Location unavailable"}</p>
      </section>

      <section className="panel">
        <div className="detail-tabs" role="tablist" aria-label="Pipeline intake detail sections">
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "pipeline-status" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "pipeline-status"}
            onClick={() => setActiveIntakeDetailTab("pipeline-status")}
          >
            Pipeline Status
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "at-a-glance-status" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "at-a-glance-status"}
            onClick={() => setActiveIntakeDetailTab("at-a-glance-status")}
          >
            At a Glance Status
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "venture-studio-criteria" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "venture-studio-criteria"}
            onClick={() => setActiveIntakeDetailTab("venture-studio-criteria")}
          >
            Venture Studio Criteria
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "market-landscape" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "market-landscape"}
            onClick={() => setActiveIntakeDetailTab("market-landscape")}
          >
            Market Landscape
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "recommendations" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "recommendations"}
            onClick={() => setActiveIntakeDetailTab("recommendations")}
          >
            Recommendations
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "notes" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "notes"}
            onClick={() => setActiveIntakeDetailTab("notes")}
          >
            Notes
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "documents" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "documents"}
            onClick={() => setActiveIntakeDetailTab("documents")}
          >
            Documents
          </button>
        </div>

        {activeIntakeDetailTab === "pipeline-status" ? (
          <>
            <h2>Pipeline Status</h2>
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
          </>
        ) : null}

        {activeIntakeDetailTab === "at-a-glance-status" ? (
          <>
            <h2>At a Glance Status</h2>
            <p className="muted">Capture concise intake framing using markdown-style formatting.</p>
            <div className="detail-section">
              {atAGlanceFields.map((field) => (
                <div key={field.key} className="pipeline-at-a-glance-field">
                  <InlineTextareaField
                    multiline
                    label={field.label}
                    value={field.value}
                    rows={12}
                    enableFormatting
                    onSave={(nextValue) => void updateAtAGlanceField(field.key, nextValue)}
                  />
                  {savingAtAGlanceFieldByKey[field.key] ? (
                    <p className="muted pipeline-at-a-glance-saving">Saving...</p>
                  ) : null}
                </div>
              ))}
            </div>
          </>
        ) : null}

        {activeIntakeDetailTab === "venture-studio-criteria" ? (
          <>
            <h2>Venture Studio Criteria</h2>
            <p className="muted">Content for this section will be added later.</p>
          </>
        ) : null}

        {activeIntakeDetailTab === "market-landscape" ? (
          <>
            <h2>Market Landscape</h2>
            <p className="muted">Content for this section will be added later.</p>
          </>
        ) : null}

        {activeIntakeDetailTab === "recommendations" ? (
          <>
            <h2>Recommendations</h2>
            <p className="muted">Content for this section will be added later.</p>
          </>
        ) : null}

        {activeIntakeDetailTab === "notes" ? (
          <>
            <h2>Notes</h2>
            <p className="muted">Content for this section will be added later.</p>
          </>
        ) : null}

        {activeIntakeDetailTab === "documents" ? (
          <>
            <h2>Documents</h2>
            {companyDocumentComposer}
            {item.documents.length === 0 ? <p className="muted">No company-level documents.</p> : null}
            <div className="pipeline-doc-list">
              {item.documents.map((document) => (
                <div key={document.id} className="detail-list-item">
                  <div className="pipeline-doc-head">
                    <strong>{document.title}</strong>
                    <span className="status-pill draft">{document.type}</span>
                  </div>
                  <p className="muted">
                    <a
                      href={document.url}
                      target="_blank"
                      rel="noreferrer"
                      download={isEmbeddedDocumentUrl(document.url) ? document.title : undefined}
                    >
                      {documentUrlLabel(document.url)}
                    </a>
                  </p>
                  <p className="muted">Uploaded {formatDate(document.uploadedAt)}</p>
                  {document.notes ? <p className="muted">{document.notes}</p> : null}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>

      {item.isScreeningStage ? (
        <section className="panel">
          <h2>Alliance Screening Status</h2>
          <p className="muted">
            Overview mirrors screening operations: all alliance systems, tracked individuals, and each system LOI status.
          </p>
          <p className="muted">{`Showing ${item.screening.healthSystems.length} alliance members.`}</p>

          <div className="detail-action-bar screening-bubble-nav" role="tablist" aria-label="Screening detail views">
            {screeningDetailViewOptions.map((view) => (
              <button
                key={view.key}
                type="button"
                role="tab"
                className={`quick-action-pill screening-bubble-pill ${screeningDetailView === view.key ? "active" : ""}`}
                aria-selected={screeningDetailView === view.key}
                onClick={() => setScreeningDetailView(view.key)}
              >
                <span className="screening-bubble-icon" aria-hidden="true">
                  {view.icon}
                </span>
                {view.label}
              </button>
            ))}
          </div>

          {screeningDetailView === "status" ? (
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
                    const individuals = uniqueIndividuals(entry);
                    const attendedCount = entry.participants.filter(
                      (participant) => participant.attendanceStatus === "ATTENDED"
                    ).length;
                    const relevantFeedbackDraft =
                      relevantFeedbackDraftByHealthSystemId[entry.healthSystemId] ?? entry.relevantFeedback ?? "";
                    const statusUpdateDraft =
                      statusUpdateDraftByHealthSystemId[entry.healthSystemId] ?? entry.statusUpdate ?? "";
                    const savingFeedbackCell = Boolean(
                      savingScreeningCellByKey[screeningCellKey(entry.healthSystemId, "RELEVANT_FEEDBACK")]
                    );
                    const savingStatusCell = Boolean(
                      savingScreeningCellByKey[screeningCellKey(entry.healthSystemId, "STATUS_UPDATE")]
                    );
                    const isEditingRelevant =
                      editingScreeningCell?.healthSystemId === entry.healthSystemId &&
                      editingScreeningCell.field === "RELEVANT_FEEDBACK";
                    const isEditingStatus =
                      editingScreeningCell?.healthSystemId === entry.healthSystemId &&
                      editingScreeningCell.field === "STATUS_UPDATE";

                    return (
                      <tr key={entry.healthSystemId}>
                        <td>
                          <span className="screening-overview-org-name">{entry.healthSystemName}</span>
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
                            className={`screening-inline-status-select ${inlineInterestClassName(entry.status)}`}
                            onChange={(event) =>
                              void updateScreeningStatus(entry.healthSystemId, event.target.value as ScreeningStatus)
                            }
                            disabled={Boolean(savingStatusByHealthSystemId[entry.healthSystemId])}
                          >
                            {screeningInlineInterestOptions.map((option) => (
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
                          <p className="screening-inline-link-row">
                            <a
                              href="#"
                              className="screening-inline-add-contact"
                              onClick={(event) => {
                                event.preventDefault();
                                setAddAttendeeLookupValue("");
                                setAddAttendeeModal({
                                  healthSystemId: entry.healthSystemId,
                                  healthSystemName: entry.healthSystemName
                                });
                              }}
                            >
                              add contact
                            </a>
                            {addingAttendeeByHealthSystemId[entry.healthSystemId] ? (
                              <span className="muted">Adding...</span>
                            ) : null}
                          </p>
                        </td>
                        <td>
                          {isEditingRelevant ? (
                            <textarea
                              className="screening-inline-cell-editor"
                              autoFocus
                              value={relevantFeedbackDraft}
                              onChange={(event) =>
                                setRelevantFeedbackDraftByHealthSystemId((current) => ({
                                  ...current,
                                  [entry.healthSystemId]: event.target.value
                                }))
                              }
                              onBlur={() => {
                                setEditingScreeningCell((current) =>
                                  current?.healthSystemId === entry.healthSystemId &&
                                  current.field === "RELEVANT_FEEDBACK"
                                    ? null
                                    : current
                                );
                                void saveScreeningCell(entry.healthSystemId, "RELEVANT_FEEDBACK");
                              }}
                            />
                          ) : (
                            <p
                              className={`screening-inline-cell-text ${relevantFeedbackDraft.trim() ? "" : "empty"}`}
                              onClick={() =>
                                setEditingScreeningCell({
                                  healthSystemId: entry.healthSystemId,
                                  field: "RELEVANT_FEEDBACK"
                                })
                              }
                            >
                              {relevantFeedbackDraft.trim() || "Click to add relevant feedback + next steps"}
                            </p>
                          )}
                          {savingFeedbackCell ? <p className="muted screening-inline-saving">Saving...</p> : null}
                        </td>
                        <td>
                          {isEditingStatus ? (
                            <textarea
                              className="screening-inline-cell-editor"
                              autoFocus
                              value={statusUpdateDraft}
                              onChange={(event) =>
                                setStatusUpdateDraftByHealthSystemId((current) => ({
                                  ...current,
                                  [entry.healthSystemId]: event.target.value
                                }))
                              }
                              onBlur={() => {
                                setEditingScreeningCell((current) =>
                                  current?.healthSystemId === entry.healthSystemId && current.field === "STATUS_UPDATE"
                                    ? null
                                    : current
                                );
                                void saveScreeningCell(entry.healthSystemId, "STATUS_UPDATE");
                              }}
                            />
                          ) : (
                            <p
                              className={`screening-inline-cell-text ${statusUpdateDraft.trim() ? "" : "empty"}`}
                              onClick={() =>
                                setEditingScreeningCell({
                                  healthSystemId: entry.healthSystemId,
                                  field: "STATUS_UPDATE"
                                })
                              }
                            >
                              {statusUpdateDraft.trim() || "Click to add status update"}
                            </p>
                          )}
                          {savingStatusCell ? <p className="muted screening-inline-saving">Saving...</p> : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {screeningDetailView === "documents" ? (
            <article className="screening-system-card">
              <div className="pipeline-card-head">
                <h3>Company Documents</h3>
                <span className="status-pill queued">{`${item.documents.length} total`}</span>
              </div>
              {companyDocumentComposer}
              {item.documents.length === 0 ? <p className="muted">No company-level documents.</p> : null}
              <div className="pipeline-doc-list">
                {item.documents.map((document) => (
                  <div key={document.id} className="detail-list-item">
                    <div className="pipeline-doc-head">
                      <strong>{document.title}</strong>
                      <span className="status-pill draft">{document.type}</span>
                    </div>
                    <p className="muted">
                      <a
                        href={document.url}
                        target="_blank"
                        rel="noreferrer"
                        download={isEmbeddedDocumentUrl(document.url) ? document.title : undefined}
                      >
                        {documentUrlLabel(document.url)}
                      </a>
                    </p>
                    <p className="muted">Uploaded {formatDate(document.uploadedAt)}</p>
                    {document.notes ? <p className="muted">{document.notes}</p> : null}
                  </div>
                ))}
              </div>
            </article>
          ) : null}

          {screeningDetailView === "quantitative" || screeningDetailView === "qualitative" ? (
            selectedScreeningHealthSystem ? (
              <article className="screening-system-card">
                {screeningDetailView === "quantitative" ? (
                  <div className="pipeline-card-head">
                    <h3>Alliance Quantitative Survey Results</h3>
                    <span className="status-pill queued">{`${quantitativeRespondingInstitutions.length} institutions`}</span>
                  </div>
                ) : (
                  <div className="pipeline-card-head">
                    <h3>Qualitative Themes & Details</h3>
                    <span className="status-pill queued">{`${allQualitativeFeedbackEntries.length} entries`}</span>
                  </div>
                )}

              {screeningDetailView === "quantitative" ? (
                <>
                  <div className="screening-quant-header">
                    <div>
                      <p className="detail-label">Quantitative Results</p>
                      <p className="muted">
                        Each dot is an individual survey response and each block shows the average score for that
                        question.
                      </p>
                    </div>
                    <div className="actions">
                      <button
                        className="secondary small"
                        type="button"
                        onClick={() =>
                          setQuantitativeQuestionEditorOpen((current) => !current)
                        }
                      >
                        {quantitativeQuestionEditorOpen ? "Done Editing Questions" : "Admin: Edit Questions"}
                      </button>
                      {quantitativeQuestionEditorOpen ? (
                        <button className="ghost small" type="button" onClick={resetQuantitativeQuestions}>
                          Reset to Standard Questions
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <ScreeningSurveySessionSelector companyId={item.id} />
                  {quantitativeRespondingInstitutions.length > 0 ? (
                    <div className="screening-survey-legend">
                      {quantitativeRespondingInstitutions.map((institution) => {
                        const institutionColor =
                          quantitativeInstitutionColorByName.get(institution) || {
                            fill: "#1f80dc",
                            border: "#145ea8"
                          };
                        return (
                          <span key={institution} className="screening-survey-legend-item">
                            <span
                              className="screening-survey-legend-dot"
                              style={{
                                background: institutionColor.fill,
                                borderColor: institutionColor.border
                              }}
                            />
                            {institution}
                          </span>
                        );
                      })}
                    </div>
                  ) : null}
                  <div
                    className={`screening-quant-layout ${quantitativeQuestionEditorOpen ? "with-editor" : ""}`}
                  >
                    {quantitativeSlideSections.length === 0 ? (
                      <p className="muted">No quantitative feedback captured yet.</p>
                    ) : (
                      <div className="screening-survey-pane">
                        {quantitativeSlideSections.map((section) => (
                          <section key={section.category} className="screening-survey-section">
                            <div className="pipeline-card-head">
                              <strong>{section.category}</strong>
                              <span className="screening-survey-category-average">
                                {section.categoryAverageScore === null
                                  ? "Category avg: N/A"
                                  : `Category avg: ${section.categoryAverageScore.toFixed(1)}`}
                              </span>
                            </div>

                            <div className="screening-survey-question-list">
                              {section.rows.map((row, rowIndex) => {
                                const laneCountByBucket = new Map<number, number>();

                                return (
                                  <div
                                    key={`${section.category}-${row.metric}-${rowIndex}`}
                                    className="screening-survey-question-row"
                                  >
                                    <p className="screening-survey-question-text">
                                      {row.metric}
                                      <span className="screening-survey-question-meta">
                                        {row.responseCount > 0
                                          ? `${row.responseCount} response${row.responseCount === 1 ? "" : "s"}`
                                          : "No responses yet"}
                                        {row.isUnmapped ? " - legacy question text" : ""}
                                      </span>
                                    </p>

                                    <div className="screening-survey-track-wrap">
                                      <div className="screening-survey-scale-labels">
                                        {Array.from({ length: 10 }, (_, index) => (
                                          <span key={`scale-${section.category}-${row.metric}-${index + 1}`}>
                                            {index + 1}
                                          </span>
                                        ))}
                                      </div>
                                      <div className="screening-survey-track">
                                        <div className="screening-survey-grid" aria-hidden="true">
                                          {Array.from({ length: 10 }, (_, index) => (
                                            <span key={`grid-${section.category}-${row.metric}-${index + 1}`} />
                                          ))}
                                        </div>
                                        {row.responses.map((response) => {
                                          const bucket = Math.round(response.score * 2);
                                          const lane = laneCountByBucket.get(bucket) || 0;
                                          laneCountByBucket.set(bucket, lane + 1);
                                          const leftPercent = ((response.score - 1) / 9) * 100;
                                          const topOffset = 8 + (lane % 4) * 10;
                                          const institutionColor =
                                            quantitativeInstitutionColorByName.get(response.institution) || {
                                              fill: "#1f80dc",
                                              border: "#145ea8"
                                            };
                                          const hoverLabel = response.contactTitle
                                            ? `${response.contactName} (${response.contactTitle}) - ${response.institution}`
                                            : `${response.contactName} - ${response.institution}`;

                                          return (
                                            <span
                                              key={response.id}
                                              className="screening-survey-dot"
                                              title={`${hoverLabel}: ${response.score.toFixed(1)}`}
                                              style={{
                                                left: `${leftPercent}%`,
                                                top: `${topOffset}px`,
                                                background: institutionColor.fill,
                                                borderColor: institutionColor.border
                                              }}
                                            />
                                          );
                                        })}
                                      </div>
                                    </div>

                                    <div className="screening-survey-average-block">
                                      {row.averageScore === null ? "N/A" : row.averageScore.toFixed(1)}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </section>
                        ))}
                      </div>
                    )}
                    {quantitativeQuestionEditorOpen ? (
                      <aside className="screening-question-editor">
                        <div className="pipeline-card-head">
                          <strong>Question Set (Admin)</strong>
                          <span className="status-pill draft">{`${quantitativeQuestionCount} questions`}</span>
                        </div>
                        <p className="muted">
                          Standard questions can be adjusted for this screening. Changes are saved for this card.
                        </p>
                        <div className="screening-question-editor-sections">
                          {quantitativeQuestionCategories.map((section) => (
                            <section key={section.category} className="screening-question-editor-section">
                              <div className="pipeline-card-head">
                                <strong>{section.category}</strong>
                                <button
                                  className="ghost small"
                                  type="button"
                                  onClick={() => addQuantitativeQuestion(section.category)}
                                >
                                  Add question
                                </button>
                              </div>
                              <div className="screening-question-editor-list">
                                {section.questions.map((question, questionIndex) => (
                                  <div
                                    key={`${section.category}-question-${questionIndex}`}
                                    className="screening-question-editor-row"
                                  >
                                    <input
                                      value={question}
                                      onChange={(event) =>
                                        updateQuantitativeQuestion(
                                          section.category,
                                          questionIndex,
                                          event.target.value
                                        )
                                      }
                                      onBlur={() =>
                                        normalizeQuantitativeQuestion(section.category, questionIndex)
                                      }
                                      placeholder={`Question ${questionIndex + 1}`}
                                    />
                                    <button
                                      className="ghost small"
                                      type="button"
                                      onClick={() =>
                                        removeQuantitativeQuestion(section.category, questionIndex)
                                      }
                                      disabled={section.questions.length <= 1}
                                    >
                                      Remove
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </section>
                          ))}
                        </div>
                      </aside>
                    ) : null}
                  </div>
                  <p className="screening-survey-footnote">
                    {quantitativeRespondingInstitutions.length === 0
                      ? "* Institution footnote will populate as quantitative responses are captured."
                      : `* Responding institutions: ${quantitativeRespondingInstitutions.join(", ")}.`}
                  </p>
                </>
              ) : null}

              {screeningDetailView === "qualitative" ? (
                <>
                  <div className="screening-qualitative-head">
                    <p className="detail-label">Qualitative Data Entry</p>
                    <div className="actions">
                      <button
                        className="secondary small"
                        type="button"
                        onClick={() => setShowQualitativePreview((current) => !current)}
                      >
                        {showQualitativePreview ? "Hide Preview" : "Preview"}
                      </button>
                    </div>
                  </div>
                  <div className="detail-grid">
                    <div>
                      <label>Alliance Member</label>
                      <select
                        value={qualitativeDraft.healthSystemId}
                        onChange={(event) =>
                          setQualitativeDraft((current) => ({
                            ...current,
                            healthSystemId: event.target.value,
                            contactId: ""
                          }))
                        }
                      >
                        {item.screening.healthSystems.map((entry) => (
                          <option key={entry.healthSystemId} value={entry.healthSystemId}>
                            {entry.healthSystemName}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Individual</label>
                      <EntityLookupInput
                        entityKind="CONTACT"
                        value={qualitativeDraft.contactId}
                        onChange={(nextValue) =>
                          setQualitativeDraft((current) => ({
                            ...current,
                            contactId: nextValue
                          }))
                        }
                        allowEmpty
                        emptyLabel="Unlinked individual"
                        initialOptions={qualitativeDraftContactOptions.map((option) => ({
                          id: option.id,
                          name: option.label
                        }))}
                        placeholder="Search contacts"
                        contactCreateContext={
                          qualitativeDraft.healthSystemId
                            ? {
                                parentType: "healthSystem",
                                parentId: qualitativeDraft.healthSystemId,
                                roleType: "EXECUTIVE"
                              }
                            : undefined
                        }
                        contactSearchHealthSystemId={qualitativeDraft.healthSystemId || undefined}
                        disabled={!qualitativeDraft.healthSystemId}
                      />
                    </div>
                    <div>
                      <label>Category</label>
                      <select
                        value={qualitativeDraft.category}
                        onChange={(event) =>
                          setQualitativeDraft((current) => ({
                            ...current,
                            category: event.target.value
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
                        value={qualitativeDraft.theme}
                        onChange={(event) =>
                          setQualitativeDraft((current) => ({
                            ...current,
                            theme: event.target.value
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label>Sentiment</label>
                      <select
                        value={qualitativeDraft.sentiment}
                        onChange={(event) =>
                          setQualitativeDraft((current) => ({
                            ...current,
                            sentiment: event.target.value as ScreeningFeedbackSentiment
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
                  <label>Detail</label>
                  <RichTextArea
                    value={qualitativeDraft.feedback}
                    onChange={(nextValue) =>
                      setQualitativeDraft((current) => ({
                        ...current,
                        feedback: nextValue
                      }))
                    }
                    rows={8}
                    placeholder="Enter qualitative feedback detail"
                  />
                  <div className="actions">
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => void addQualitativeFeedback()}
                      disabled={
                        !qualitativeDraft.healthSystemId ||
                        Boolean(savingFeedbackByHealthSystemId[qualitativeDraft.healthSystemId])
                      }
                    >
                      {qualitativeDraft.healthSystemId &&
                      savingFeedbackByHealthSystemId[qualitativeDraft.healthSystemId]
                        ? "Saving..."
                        : "Add Entry"}
                    </button>
                  </div>

                  {showQualitativePreview ? (
                    <div className="screening-qual-preview">
                      <p className="detail-label">Report Preview</p>
                      <p className="muted">
                        Preview mirrors the final report structure: theme on the left and narrative detail on the
                        right.
                      </p>
                      {allQualitativeFeedbackEntries.length === 0 ? (
                        <p className="muted">No qualitative feedback captured yet.</p>
                      ) : (
                        <div className="screening-qual-preview-list">
                          {allQualitativeFeedbackEntries.map((feedback) => (
                            <div key={`preview-${feedback.id}`} className="screening-qual-preview-row">
                              <div className="screening-qual-preview-theme">{feedback.theme}</div>
                              <div className="screening-qual-preview-detail">
                                <p>{feedback.feedback}</p>
                                <p className="muted">
                                  {(feedback.category || "Key Theme").trim()} | {feedback.healthSystemName} |{" "}
                                  {feedback.contactTitle
                                    ? `${feedback.contactName} (${feedback.contactTitle})`
                                    : feedback.contactName}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  <p className="detail-label">All Captured Entries</p>
                  {allQualitativeFeedbackEntries.length === 0 ? (
                    <p className="muted">No qualitative feedback captured yet.</p>
                  ) : (
                    <div className="pipeline-doc-list">
                      {allQualitativeFeedbackEntries.map((feedback) => {
                        const isEditing = editingQualitativeFeedbackId === feedback.id;
                        const isSaving = Boolean(savingQualitativeEntryById[feedback.id]);
                        const isDeleting = Boolean(deletingQualitativeEntryById[feedback.id]);
                        const contactOptions = contactOptionsByHealthSystemId.get(feedback.healthSystemId) || [];
                        const currentContactLabel = feedback.contactTitle
                          ? `${feedback.contactName} (${feedback.contactTitle})`
                          : feedback.contactName;
                        const editInitialOptions =
                          feedback.contactId && !contactOptions.some((option) => option.id === feedback.contactId)
                            ? [{ id: feedback.contactId, label: currentContactLabel }, ...contactOptions]
                            : contactOptions;

                        return (
                          <div key={feedback.id} className="detail-list-item screening-qualitative-entry">
                            <div className="pipeline-card-head">
                              <div>
                                <strong>{feedback.theme}</strong>
                                <p className="muted">{feedback.healthSystemName}</p>
                              </div>
                              <span className="status-pill draft">{sentimentLabel(feedback.sentiment)}</span>
                            </div>

                            {isEditing && editingQualitativeDraft ? (
                              <>
                                <div className="detail-grid">
                                  <div>
                                    <label>Individual</label>
                                    <EntityLookupInput
                                      entityKind="CONTACT"
                                      value={editingQualitativeDraft.contactId}
                                      onChange={(nextValue) =>
                                        setEditingQualitativeDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                contactId: nextValue
                                              }
                                            : current
                                        )
                                      }
                                      allowEmpty
                                      emptyLabel="Unlinked individual"
                                      initialOptions={editInitialOptions.map((option) => ({
                                        id: option.id,
                                        name: option.label
                                      }))}
                                      placeholder="Search contacts"
                                      contactCreateContext={{
                                        parentType: "healthSystem",
                                        parentId: feedback.healthSystemId,
                                        roleType: "EXECUTIVE"
                                      }}
                                      contactSearchHealthSystemId={feedback.healthSystemId}
                                    />
                                  </div>
                                  <div>
                                    <label>Category</label>
                                    <select
                                      value={editingQualitativeDraft.category}
                                      onChange={(event) =>
                                        setEditingQualitativeDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                category: event.target.value
                                              }
                                            : current
                                        )
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
                                      value={editingQualitativeDraft.theme}
                                      onChange={(event) =>
                                        setEditingQualitativeDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                theme: event.target.value
                                              }
                                            : current
                                        )
                                      }
                                    />
                                  </div>
                                  <div>
                                    <label>Sentiment</label>
                                    <select
                                      value={editingQualitativeDraft.sentiment}
                                      onChange={(event) =>
                                        setEditingQualitativeDraft((current) =>
                                          current
                                            ? {
                                                ...current,
                                                sentiment: event.target.value as ScreeningFeedbackSentiment
                                              }
                                            : current
                                        )
                                      }
                                    >
                                      <option value="POSITIVE">Positive</option>
                                      <option value="MIXED">Mixed</option>
                                      <option value="NEUTRAL">Neutral</option>
                                      <option value="NEGATIVE">Negative</option>
                                    </select>
                                  </div>
                                </div>
                                <label>Detail</label>
                                <RichTextArea
                                  value={editingQualitativeDraft.feedback}
                                  onChange={(nextValue) =>
                                    setEditingQualitativeDraft((current) =>
                                      current
                                        ? {
                                            ...current,
                                            feedback: nextValue
                                          }
                                        : current
                                    )
                                  }
                                  rows={8}
                                  placeholder="Enter qualitative feedback detail"
                                />
                                <div className="actions">
                                  <button
                                    className="secondary small"
                                    type="button"
                                    onClick={() => void saveQualitativeFeedbackEdit(feedback)}
                                    disabled={isSaving || isDeleting}
                                  >
                                    {isSaving ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={cancelQualitativeFeedbackEdit}
                                    disabled={isSaving || isDeleting}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => void deleteQualitativeFeedback(feedback)}
                                    disabled={isSaving || isDeleting}
                                  >
                                    {isDeleting ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="muted">Category: {(feedback.category || "Key Theme").trim()}</p>
                                <p className="muted">
                                  {feedback.contactTitle
                                    ? `${feedback.contactName} (${feedback.contactTitle})`
                                    : feedback.contactName}
                                </p>
                                <p>{feedback.feedback}</p>
                                <p className="muted">Updated {formatDate(feedback.updatedAt)}</p>
                                <div className="actions">
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => startQualitativeFeedbackEdit(feedback)}
                                    disabled={isDeleting}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    className="ghost small"
                                    type="button"
                                    onClick={() => void deleteQualitativeFeedback(feedback)}
                                    disabled={isDeleting}
                                  >
                                    {isDeleting ? "Deleting..." : "Delete"}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : null}
              </article>
            ) : (
              <p className="muted">No alliance health systems configured.</p>
            )
          ) : null}
        </section>
      ) : null}

      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

      {addAttendeeModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => setAddAttendeeModal(null)}>
          <div
            className="pipeline-note-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pipeline-card-head">
              <h3>Add Contact</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={() => setAddAttendeeModal(null)}
                aria-label="Close add contact dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <p className="muted">{addAttendeeModal.healthSystemName}</p>
            <EntityLookupInput
              entityKind="CONTACT"
              value={addAttendeeLookupValue}
              onChange={(nextValue) => {
                setAddAttendeeLookupValue(nextValue);
                if (!nextValue) return;
                void (async () => {
                  const success = await addScreeningAttendee(addAttendeeModal.healthSystemId, nextValue);
                  if (!success) return;
                  setAddAttendeeLookupValue("");
                  setAddAttendeeModal(null);
                })();
              }}
              placeholder="Type attendee name..."
              emptyLabel="Start typing to find a contact"
              contactCreateContext={{
                parentType: "healthSystem",
                parentId: addAttendeeModal.healthSystemId,
                roleType: "EXECUTIVE"
              }}
              contactSearchHealthSystemId={addAttendeeModal.healthSystemId}
              autoOpenCreateOnEnterNoMatch
              disabled={Boolean(addingAttendeeByHealthSystemId[addAttendeeModal.healthSystemId])}
              className="screening-attendee-lookup"
            />
            {addingAttendeeByHealthSystemId[addAttendeeModal.healthSystemId] ? (
              <p className="muted">Adding attendee...</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </ContentWrapper>
  );
}
