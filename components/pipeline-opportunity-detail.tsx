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
import { generateOpportunityTitle } from "@/lib/opportunity-title";
import { EntityLookupInput } from "./entity-lookup-input";
import { ScreeningSurveySessionSelector } from "./screening-survey-session-selector";
import { InlineSelectField, InlineTextField, InlineTextareaField } from "./inline-detail-field";
import { normalizeRichText, RichTextArea } from "./rich-text-area";
import { CompanyReportComposer } from "./company-report-composer";
import {
  inferGoogleDocumentTitle,
  MAX_COMPANY_DOCUMENT_FILE_BYTES,
  normalizeGoogleDocsUrl,
  readFileAsDataUrl
} from "@/lib/company-document-links";
import {
  defaultMarketLandscapePayload,
  marketLandscapeCellKeys,
  marketLandscapeGridRows,
  marketLandscapeTemplateOptions,
  normalizeMarketLandscapePayload,
  type MarketLandscapeCellKey,
  type MarketLandscapePayload
} from "@/lib/market-landscape";
import { parseDateInput, toDateInputValue as formatDateInputValue } from "@/lib/date-parse";
import { createDateDebugContext, debugDateLog, dateDebugHeaders } from "@/lib/date-debug";

type ScreeningStatus = "NOT_STARTED" | "PENDING" | "NEGOTIATING" | "SIGNED" | "DECLINED";
type ScreeningAttendanceStatus = "INVITED" | "ATTENDED" | "DECLINED" | "NO_SHOW";
type ScreeningFeedbackSentiment = "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";
type ScreeningCellField = "RELEVANT_FEEDBACK" | "STATUS_UPDATE";
type CompanyDocumentType =
  | "INTAKE_REPORT"
  | "SCREENING_REPORT"
  | "OPPORTUNITY_REPORT"
  | "TERM_SHEET"
  | "VENTURE_STUDIO_CONTRACT"
  | "LOI"
  | "COMMERCIAL_CONTRACT"
  | "OTHER";

type OpportunityType =
  | "SCREENING_LOI"
  | "VENTURE_STUDIO_SERVICES"
  | "S1_TERM_SHEET"
  | "COMMERCIAL_CONTRACT"
  | "PROSPECT_PURSUIT";

type OpportunityStage =
  | "IDENTIFIED"
  | "QUALIFICATION"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "LEGAL"
  | "CLOSED_WON"
  | "CLOSED_LOST"
  | "ON_HOLD";

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
  isDeprecatedQuestion?: boolean;
};

type SupplementalQuantitativeResponse = {
  id: string;
  contactName: string;
  contactTitle: string | null;
  institutionName: string;
  category: string | null;
  metric: string;
  score: number | null;
  isDeprecatedQuestion?: boolean;
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

type NoteAffiliation = {
  kind: "company" | "healthSystem" | "contact" | "opportunity";
  id: string;
  label: string;
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

type PipelineOpportunityNote = {
  id: string;
  note: string;
  affiliations: NoteAffiliation[];
  createdAt: string;
  createdByName: string;
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
  ventureStudioCriteria: PipelineVentureStudioCriteriaPayload[] | null;
  marketLandscape: MarketLandscapePayload | null;
  location: string;
  phase: PipelinePhase;
  phaseLabel: string;
  column: PipelineBoardColumn | null;
  isScreeningStage: boolean;
  intakeDecisionAt: string | null;
  ventureStudioContractExecutedAt: string | null;
  screeningWebinarDate1At: string | null;
  screeningWebinarDate2At: string | null;
  ventureLikelihoodPercent: number | null;
  ventureExpectedCloseDate: string | null;
  updatedAt: string | null;
  opportunities: Array<{
    id: string;
    title: string;
    type: OpportunityType;
    stage: OpportunityStage;
    amountUsd: number | string | null;
    contractPriceUsd: number | string | null;
    durationDays: number | null;
    likelihoodPercent: number | null;
    nextSteps: string | null;
    notes: string | null;
    closeReason: string | null;
    createdAt: string;
    estimatedCloseDate: string | null;
    closedAt: string | null;
    updatedAt: string;
    healthSystem: { id: string; name: string } | null;
    contacts: Array<{
      id: string;
      role: string | null;
      createdAt: string;
      contact: {
        id: string;
        name: string;
        title: string | null;
        email: string | null;
      };
    }>;
  }>;
  documents: Array<{
    id: string;
    type: CompanyDocumentType;
    title: string;
    url: string;
    notes: string | null;
    uploadedAt: string;
  }>;
  notes: PipelineOpportunityNote[];
  screening: {
    healthSystems: ScreeningHealthSystem[];
    supplementalQuantitativeResponses?: SupplementalQuantitativeResponse[];
  };
};

type OpportunityDraft = {
  type: OpportunityType;
  stage: OpportunityStage;
  healthSystemId: string;
  likelihoodPercent: string;
  amountUsd: string;
  contractPriceUsd: string;
  estimatedCloseDate: string;
  closedAt: string;
  closeReason: string;
  nextSteps: string;
  notes: string;
};

type IntakeDetailTab =
  | "pipeline-status"
  | "opportunities"
  | "screening-materials"
  | "intake-materials"
  | "reports"
  | "notes"
  | "documents";

type IntakeMaterialsSubTab =
  | "at-a-glance"
  | "venture-studio-criteria"
  | "market-landscape"
  | "market-landscape-option-1";

type OpportunityModalState =
  | { mode: "create" }
  | {
      mode: "edit";
      opportunityId: string;
    };

type OpportunityModalTab = "details" | "contacts";

function formatDate(value: string | null | undefined) {
  if (!value) return "Not set";
  const parsed = parseDateInput(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return "Not set";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
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

function toDateInputValue(value: string | null | undefined) {
  return formatDateInputValue(value);
}

function parseNoteAffiliations(raw: unknown): NoteAffiliation[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const parsed: NoteAffiliation[] = [];

  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const typed = entry as { kind?: unknown; id?: unknown; label?: unknown };
    const rawKind = typeof typed.kind === "string" ? typed.kind : "";
    const id = typeof typed.id === "string" ? typed.id.trim() : "";
    const label = typeof typed.label === "string" ? typed.label.trim() : "";
    const key = `${rawKind}:${id}`;
    if (!id || !label || seen.has(key)) continue;
    if (rawKind !== "company" && rawKind !== "healthSystem" && rawKind !== "contact" && rawKind !== "opportunity") {
      continue;
    }
    const kind = rawKind as NoteAffiliation["kind"];
    seen.add(key);
    parsed.push({ kind, id, label });
  }

  return parsed;
}

function noteAffiliationKindLabel(kind: NoteAffiliation["kind"]) {
  if (kind === "company") return "Company";
  if (kind === "healthSystem") return "Health System";
  if (kind === "contact") return "Contact";
  return "Opportunity";
}

function toTextValue(value: number | string | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function toOpportunityDraft(opportunity: PipelineOpportunityDetail["opportunities"][number]): OpportunityDraft {
  return {
    type: opportunity.type,
    stage: opportunity.stage,
    healthSystemId: opportunity.healthSystem?.id || "",
    likelihoodPercent: toTextValue(opportunity.likelihoodPercent),
    amountUsd: toTextValue(opportunity.amountUsd as number | string | null),
    contractPriceUsd: toTextValue(opportunity.contractPriceUsd as number | string | null),
    estimatedCloseDate: toDateInputValue(opportunity.estimatedCloseDate),
    closedAt: toDateInputValue(opportunity.closedAt),
    closeReason: opportunity.closeReason || "",
    nextSteps: opportunity.nextSteps || "",
    notes: opportunity.notes || ""
  };
}

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
  const parsedServer = new Date(serverUpdatedAt);
  const parsedClientMs = parsedClient && Number.isNaN(parsedClient.getTime()) ? null : parsedClient?.getTime() || null;
  const parsedServerMs = Number.isNaN(parsedServer.getTime()) ? null : parsedServer.getTime();

  return {
    clientUpdatedAt: clientUpdatedAt || null,
    parsedClientUpdatedAt: parsedClientMs ? new Date(parsedClientMs).toISOString() : null,
    serverUpdatedAt,
    isClientBehindServer:
      parsedClientMs !== null && parsedServerMs !== null ? parsedClientMs < parsedServerMs : null,
    serverAheadMs:
      parsedClientMs !== null && parsedServerMs !== null ? parsedServerMs - parsedClientMs : null
  };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function richTextToPlainText(value: string | null | undefined) {
  if (!value) return "";

  const normalized = normalizeRichText(value);
  if (!normalized) return "";

  if (typeof DOMParser === "undefined") {
    return normalized
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#39;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const htmlWithBreaks = normalized
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, "\n");

  const parsed = new DOMParser().parseFromString(htmlWithBreaks, "text/html");
  return (parsed.body.textContent || "")
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatVentureStudioAssessmentLabel(value: VentureStudioAssessment) {
  if (value === "green") return "Green";
  if (value === "yellow") return "Yellow";
  if (value === "red") return "Red";
  return "Grey";
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
  { value: "OPPORTUNITY_REPORT", label: "Opportunity Report" },
  { value: "TERM_SHEET", label: "Term Sheet" },
  { value: "VENTURE_STUDIO_CONTRACT", label: "Venture Studio Contract" },
  { value: "LOI", label: "LOI" },
  { value: "COMMERCIAL_CONTRACT", label: "Commercial Contract" },
  { value: "OTHER", label: "Other" }
];

const opportunityTypeOptions: Array<{ value: OpportunityType; label: string }> = [
  { value: "SCREENING_LOI", label: "Screening LOI" },
  { value: "VENTURE_STUDIO_SERVICES", label: "Venture Studio Services" },
  { value: "S1_TERM_SHEET", label: "S1 Term Sheet" },
  { value: "COMMERCIAL_CONTRACT", label: "Commercial Contract" },
  { value: "PROSPECT_PURSUIT", label: "Prospect Pursuit" }
];

const opportunityStageOptions: Array<{ value: OpportunityStage; label: string }> = [
  { value: "IDENTIFIED", label: "Identified" },
  { value: "QUALIFICATION", label: "Qualification" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "NEGOTIATION", label: "Negotiation" },
  { value: "LEGAL", label: "Legal" },
  { value: "CLOSED_WON", label: "Closed Won" },
  { value: "CLOSED_LOST", label: "Closed Lost" },
  { value: "ON_HOLD", label: "On Hold" }
];

function isClosedOpportunityStage(stage: OpportunityStage) {
  return stage === "CLOSED_WON" || stage === "CLOSED_LOST";
}

const likelihoodByStage: Record<OpportunityStage, number> = {
  IDENTIFIED: 10,
  QUALIFICATION: 25,
  PROPOSAL: 50,
  NEGOTIATION: 70,
  LEGAL: 85,
  CLOSED_WON: 100,
  CLOSED_LOST: 0,
  ON_HOLD: 35
};

function defaultLikelihoodForStage(stage: OpportunityStage) {
  return likelihoodByStage[stage];
}

function computeOpportunityDurationDays(createdAt: string | null | undefined, closedAt: string | null | undefined) {
  const parsedCreatedAt = parseDateInput(createdAt);
  if (!parsedCreatedAt) return null;
  const parsedClosedAt = parseDateInput(closedAt);
  const startMs = parsedCreatedAt.getTime();
  const endMs = (parsedClosedAt || new Date()).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return 0;
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24));
}

function defaultOpportunityTypeForItem(item: Pick<PipelineOpportunityDetail, "column" | "isScreeningStage">) {
  if (item.column === "COMMERCIAL_ACCELERATION") return "COMMERCIAL_CONTRACT" as OpportunityType;
  if (item.isScreeningStage || item.column === "SCREENING") return "SCREENING_LOI" as OpportunityType;
  return "PROSPECT_PURSUIT" as OpportunityType;
}

const companyDocumentUploadAccept =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp";
const companyDocumentMaxSizeMb = Math.round(MAX_COMPANY_DOCUMENT_FILE_BYTES / (1024 * 1024));

const screeningDetailViewOptions: Array<{ key: ScreeningDetailView; label: string; icon: string }> = [
  { key: "status", label: "Status Matrix", icon: "SM" },
  { key: "quantitative", label: "Quantitative", icon: "Q" },
  { key: "qualitative", label: "Qualitative", icon: "Ql" }
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

function normalizeCategoryKey(category: string | null | undefined) {
  return normalizeMetricKey(category || "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeQuantitativeCategory(category: string | null | undefined) {
  const raw = (category || "Uncategorized").trim();
  const normalized = normalizeCategoryKey(raw);
  if (!normalized) return raw;

  const exactAliasMap: Record<string, string> = {
    "co development interest": "Co-Development",
    "co development": "Co-Development",
    "co-development interest": "Co-Development",
    "co-development": "Co-Development",
    "desirability": "Desirability",
    "esirability": "Desirability",
    "desirable": "Desirability",
    "desireability": "Desirability",
    "feasibility": "Feasibility",
    "feasability": "Feasibility",
    "feasablity": "Feasibility",
    "feasabilty": "Feasibility",
    "feasabiltiy": "Feasibility",
    "feasible": "Feasibility",
    impact: "Impact and Viability",
    viability: "Impact and Viability",
    "impactandviability": "Impact and Viability",
    "impact and viability": "Impact and Viability"
  };

  if (exactAliasMap[normalized]) {
    return exactAliasMap[normalized];
  }

  if (normalized.includes("co") && normalized.includes("develop")) {
    return "Co-Development";
  }

  if (normalized.includes("feas")) {
    return "Feasibility";
  }

  if (normalized.includes("desir")) {
    return "Desirability";
  }

  if (normalized.includes("impact") || normalized.includes("viabil")) {
    return "Impact and Viability";
  }

  return raw;
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
      questions
    });
  }

  if (categories.length === 0) return null;
  return categories.sort((a, b) => compareQuantitativeCategoryName(a.category, b.category));
}

function mergeQuantitativeQuestionsWithFeedback(
  source: QuantitativeQuestionCategory[],
  healthSystems: ScreeningHealthSystem[],
  supplementalResponses: SupplementalQuantitativeResponse[] = []
) {
  const normalizedQuestionSetByCategory = new Map<string, Set<string>>();
  const sectionByCategory = new Map<string, QuantitativeQuestionCategory>();

  for (const section of source) {
    const category = canonicalizeQuantitativeCategory(section.category);
    if (!category) continue;
    const normalizedCategory = normalizeCategoryKey(category);
    const questions = section.questions
      .map((question) => question.trim())
      .filter((question) => question.length > 0);
    const normalizedQuestions = new Set(questions.map((question) => normalizeMetricKey(question)));

    const existingSection = sectionByCategory.get(normalizedCategory);
    if (!existingSection) {
      normalizedQuestionSetByCategory.set(normalizedCategory, normalizedQuestions);
      sectionByCategory.set(normalizedCategory, {
        category,
        questions
      });
    } else {
      const mergedQuestions = new Set<string>(existingSection.questions.map((question) => normalizeMetricKey(question)));
      for (const question of questions) {
        const normalizedQuestion = normalizeMetricKey(question);
        if (mergedQuestions.has(normalizedQuestion)) continue;
        mergedQuestions.add(normalizedQuestion);
        existingSection.questions.push(question);
      }
      normalizedQuestionSetByCategory.set(
        normalizedCategory,
        new Set(Array.from(existingSection.questions).map((question) => normalizeMetricKey(question)))
      );
    }
  }

  for (const healthSystem of healthSystems) {
    for (const entry of healthSystem.quantitativeFeedback) {
      if (entry.isDeprecatedQuestion && (entry.score === null || !Number.isFinite(entry.score))) continue;
      const category = canonicalizeQuantitativeCategory(entry.category?.trim() || "Uncategorized");
      const normalizedCategory = normalizeCategoryKey(category);
      const metric = entry.metric?.trim() || "Untitled question";
      const normalizedMetric = normalizeMetricKey(metric);

      let section = sectionByCategory.get(normalizedCategory);
      if (!section) {
        section = { category, questions: [] };
        sectionByCategory.set(normalizedCategory, section);
      }

      const normalizedQuestions = normalizedQuestionSetByCategory.get(normalizedCategory) || new Set<string>();
      if (!normalizedQuestions.has(normalizedMetric)) {
        section.questions.push(metric);
        normalizedQuestions.add(normalizedMetric);
        normalizedQuestionSetByCategory.set(normalizedCategory, normalizedQuestions);
      }
    }
  }

  for (const entry of supplementalResponses) {
    if (entry.isDeprecatedQuestion && (entry.score === null || !Number.isFinite(entry.score))) continue;
    const category = canonicalizeQuantitativeCategory(entry.category?.trim() || "Uncategorized");
    const normalizedCategory = normalizeCategoryKey(category);
    const metric = entry.metric?.trim() || "Untitled question";
    const normalizedMetric = normalizeMetricKey(metric);

    let section = sectionByCategory.get(normalizedCategory);
    if (!section) {
      section = { category, questions: [] };
      sectionByCategory.set(normalizedCategory, section);
    }

    const normalizedQuestions = normalizedQuestionSetByCategory.get(normalizedCategory) || new Set<string>();
    if (!normalizedQuestions.has(normalizedMetric)) {
      section.questions.push(metric);
      normalizedQuestions.add(normalizedMetric);
      normalizedQuestionSetByCategory.set(normalizedCategory, normalizedQuestions);
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

const ventureStudioAssessmentOptions = [
  { value: "green", label: "🟢" },
  { value: "yellow", label: "🟡" },
  { value: "red", label: "🔴" },
  { value: "grey", label: "⚪" }
] as const;
type VentureStudioAssessment = (typeof ventureStudioAssessmentOptions)[number]["value"];

type VentureStudioCriteriaRow = {
  category: string;
  criteria: string;
  assessment: VentureStudioAssessment;
  rationale: string;
};

const ventureStudioCriteriaTemplate: VentureStudioCriteriaRow[] = [
  {
    category: "Products & Services",
    criteria: "Designed to meet the needs of healthcare providers",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Value Proposition",
    criteria: "Creates a measurable impact for health systems (i.e., revenue, cost savings, outcomes)",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Prioritization",
    criteria: "Solves a high-priority pain point for health systems",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Differentiation",
    criteria: "Avoids direct competition with the core capabilities of major incumbents (i.e., Epic)",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Defined Buyer",
    criteria: "Clear decision-maker at the health system",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Implementation",
    criteria: "Implemented with minimal disruption to existing clinical operations and IT resources",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Concept Maturity",
    criteria: "Early proof of concept at 1+ sites has been collected",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Team",
    criteria: "Relevant industry expertise and/or sales experience",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Market Size",
    criteria: "Bottoms-up TAM calculation is ~$1B (at least $500M+)",
    assessment: "grey",
    rationale: ""
  },
  {
    category: "Regulatory Requirements",
    criteria: "Meets all applicable regulatory requirements (i.e., FDA)",
    assessment: "grey",
    rationale: ""
  }
];

const ventureStudioAssessmentDescriptions = [
  {
    value: "green",
    label: "Green",
    description: "Company currently meets the Abundant Venture Studio’s criteria for S1 investment"
  },
  {
    value: "yellow",
    label: "Yellow",
    description: "Company has potential to meet our criteria for S1 investment"
  },
  {
    value: "red",
    label: "Red",
    description: "Company is unlikely to meet our criteria for S1 investment"
  },
  {
    value: "grey",
    label: "Grey",
    description: "There is insufficient information to make an informed assessment"
  }
] as const;

const ventureStudioAssessmentColorByValue: Record<VentureStudioAssessment, string> = {
  green: "#16a34a",
  yellow: "#ca8a04",
  red: "#ef4444",
  grey: "#64748b"
};

type VentureStudioCriteriaDraft = {
  category: string;
  criteria: string;
  assessment: VentureStudioAssessment;
  rationale: string;
};

type PipelineVentureStudioCriteriaPayload = {
  category: string;
  assessment: VentureStudioAssessment;
  rationale: string;
};

function cloneVentureStudioCriteriaRows() {
  return ventureStudioCriteriaTemplate.map((row) => ({ ...row }));
}

function normalizeVentureStudioCriteriaRows(rows?: PipelineOpportunityDetail["ventureStudioCriteria"] | null) {
  const next: VentureStudioCriteriaDraft[] = ventureStudioCriteriaTemplate.map((template) => ({ ...template }));
  if (!rows || rows.length === 0) return next;
  const rowByCategory = new Map<string, PipelineVentureStudioCriteriaPayload>();
  for (const row of rows) {
    const key = row.category.trim();
    if (!key) continue;
    rowByCategory.set(key, row);
  }
  return next.map((row) => {
    const saved = rowByCategory.get(row.category);
    if (!saved) return row;
    return {
      ...row,
      assessment: saved.assessment,
      rationale: saved.rationale
    };
  });
}

const marketLandscapeBodyFieldGuide: Record<
  MarketLandscapePayload["template"],
  {
    primaryLabel: string;
    secondaryLabel: string;
    primaryField: "overview" | "strengths";
    secondaryField: "businessModel" | "gaps";
  }
> = {
  CATEGORY_OVERVIEW: {
    primaryLabel: "Category Overview",
    secondaryLabel: "Business Model",
    primaryField: "overview",
    secondaryField: "businessModel"
  },
  STRENGTHS_GAPS: {
    primaryLabel: "Strengths",
    secondaryLabel: "Gaps",
    primaryField: "strengths",
    secondaryField: "gaps"
  }
};

type ScreeningDetailView = "status" | "quantitative" | "qualitative";
type AddAttendeeModalState = {
  healthSystemId: string;
  healthSystemName: string;
};

type MarketLandscapeOption1InfoResponse =
  | { kind: "missing_intake_document" }
  | { kind: "invalid_intake_document"; message: string }
  | {
      kind: "ok";
      presentationId: string;
      presentationUrl: string;
      slideObjectId: string | null;
      slideEditUrl: string | null;
      thumbnailUrl: string | null;
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
  const [activeIntakeMaterialsTab, setActiveIntakeMaterialsTab] =
    React.useState<IntakeMaterialsSubTab>("at-a-glance");
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
  const [savingVentureStudioCriteria, setSavingVentureStudioCriteria] = React.useState(false);
  const [ventureStudioCriteriaDraft, setVentureStudioCriteriaDraft] = React.useState<VentureStudioCriteriaDraft[]>(
    cloneVentureStudioCriteriaRows()
  );
  const [savingMarketLandscape, setSavingMarketLandscape] = React.useState(false);
  const [marketLandscapeDraft, setMarketLandscapeDraft] = React.useState<MarketLandscapePayload>(() =>
    defaultMarketLandscapePayload()
  );
  const [marketLandscapeOption1Info, setMarketLandscapeOption1Info] =
    React.useState<MarketLandscapeOption1InfoResponse | null>(null);
  const [loadingMarketLandscapeOption1, setLoadingMarketLandscapeOption1] = React.useState(false);
  const [marketLandscapeOption1Error, setMarketLandscapeOption1Error] = React.useState<string | null>(null);
  const [marketLandscapeOption1ThumbnailNonce, setMarketLandscapeOption1ThumbnailNonce] = React.useState(0);
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
  const [showAddQualitativeFeedbackModal, setShowAddQualitativeFeedbackModal] = React.useState(false);
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
  const [isGeneratingIntakeReport, setIsGeneratingIntakeReport] = React.useState(false);
  const [lastGenerateStatus, setLastGenerateStatus] = React.useState<string | null>(null);
  const [intakeReportGenerationMode, setIntakeReportGenerationMode] = React.useState<
    "generate" | "recreate" | null
  >(null);
  const [intakeReportGenerationStartedAt, setIntakeReportGenerationStartedAt] = React.useState<number | null>(null);
  const [intakeReportElapsedSeconds, setIntakeReportElapsedSeconds] = React.useState(0);
  const [opportunityDraftById, setOpportunityDraftById] = React.useState<Record<string, OpportunityDraft>>({});
  const [savingOpportunityById, setSavingOpportunityById] = React.useState<Record<string, boolean>>({});
  const [deletingOpportunityById, setDeletingOpportunityById] = React.useState<Record<string, boolean>>({});
  const [addingOpportunity, setAddingOpportunity] = React.useState(false);
  const [newOpportunityDraft, setNewOpportunityDraft] = React.useState<OpportunityDraft>({
    type: "SCREENING_LOI",
    stage: "IDENTIFIED",
    healthSystemId: "",
    likelihoodPercent: String(defaultLikelihoodForStage("IDENTIFIED")),
    amountUsd: "",
    contractPriceUsd: "",
    estimatedCloseDate: "",
    closedAt: "",
    closeReason: "",
    nextSteps: "",
    notes: ""
  });
  const [opportunityContactLookupByOpportunityId, setOpportunityContactLookupByOpportunityId] = React.useState<
    Record<string, string>
  >({});
  const [newOpportunityContactRoleByOpportunityId, setNewOpportunityContactRoleByOpportunityId] = React.useState<
    Record<string, string>
  >({});
  const [addingOpportunityContactByOpportunityId, setAddingOpportunityContactByOpportunityId] = React.useState<
    Record<string, boolean>
  >({});
  const [opportunityContactRoleDraftByLinkId, setOpportunityContactRoleDraftByLinkId] = React.useState<
    Record<string, string>
  >({});
  const [savingOpportunityContactRoleByLinkId, setSavingOpportunityContactRoleByLinkId] = React.useState<
    Record<string, boolean>
  >({});
  const [deletingOpportunityContactByLinkId, setDeletingOpportunityContactByLinkId] = React.useState<
    Record<string, boolean>
  >({});
  const [newNoteDraft, setNewNoteDraft] = React.useState("");
  const [newNoteOpportunityId, setNewNoteOpportunityId] = React.useState("");
  const [addingNote, setAddingNote] = React.useState(false);
  const [showAddNoteModal, setShowAddNoteModal] = React.useState(false);
  const [showAddDocumentModal, setShowAddDocumentModal] = React.useState(false);
  const [opportunityModal, setOpportunityModal] = React.useState<OpportunityModalState | null>(null);
  const [opportunityModalTab, setOpportunityModalTab] = React.useState<OpportunityModalTab>("details");
  const pipelineCardUpdateSequenceRef = React.useRef(0);
  const descriptionPlainText = React.useMemo(() => richTextToPlainText(item?.description), [item?.description]);
  const showOpportunitiesTab = Boolean(
    item && (item.column === "SCREENING" || item.column === "COMMERCIAL_ACCELERATION")
  );
  const opportunityLifecycleCounts = React.useMemo(() => {
    if (!item) return { open: 0, won: 0, lost: 0 };
    return item.opportunities.reduce(
      (accumulator, opportunity) => {
        if (opportunity.stage === "CLOSED_WON") {
          accumulator.won += 1;
          return accumulator;
        }
        if (opportunity.stage === "CLOSED_LOST") {
          accumulator.lost += 1;
          return accumulator;
        }
        accumulator.open += 1;
        return accumulator;
      },
      { open: 0, won: 0, lost: 0 }
    );
  }, [item]);
  const openOpportunities = React.useMemo(
    () =>
      (item?.opportunities || []).filter(
        (opportunity) => opportunity.stage !== "CLOSED_WON" && opportunity.stage !== "CLOSED_LOST"
      ),
    [item]
  );
  const selectedOpportunityForModal = React.useMemo(() => {
    if (!item || !opportunityModal || opportunityModal.mode !== "edit") return null;
    return item.opportunities.find((opportunity) => opportunity.id === opportunityModal.opportunityId) || null;
  }, [item, opportunityModal]);

  const currentIntakeDocument = (item?.documents || [])
    .filter((document) => document.type === "INTAKE_REPORT")
    .slice()
    .sort((a, b) => {
      const left = new Date(a.uploadedAt).getTime();
      const right = new Date(b.uploadedAt).getTime();
      if (Number.isNaN(left) && Number.isNaN(right)) return 0;
      if (Number.isNaN(left)) return 1;
      if (Number.isNaN(right)) return -1;
      return right - left;
    })[0] || null;

  const loadMarketLandscapeOption1 = React.useCallback(async () => {
    setLoadingMarketLandscapeOption1(true);
    setMarketLandscapeOption1Error(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${itemId}/market-landscape-option-1`, {
        cache: "no-store"
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load Market Landscape Option 1 slide.");
      }
      setMarketLandscapeOption1Info(payload as MarketLandscapeOption1InfoResponse);
    } catch (error) {
      setMarketLandscapeOption1Info(null);
      setMarketLandscapeOption1Error(
        error instanceof Error ? error.message : "Failed to load Market Landscape Option 1 slide."
      );
    } finally {
      setLoadingMarketLandscapeOption1(false);
    }
  }, [itemId]);

  const currentIntakeDocumentId = currentIntakeDocument?.id || null;
  const shouldLoadMarketLandscapeOption1 =
    activeIntakeDetailTab === "intake-materials" && activeIntakeMaterialsTab === "market-landscape-option-1";

  React.useEffect(() => {
    if (!shouldLoadMarketLandscapeOption1) return;
    if (!currentIntakeDocumentId) return;
    void loadMarketLandscapeOption1();
  }, [shouldLoadMarketLandscapeOption1, currentIntakeDocumentId, loadMarketLandscapeOption1]);

  React.useEffect(() => {
    if (!isGeneratingIntakeReport || !intakeReportGenerationStartedAt) {
      setIntakeReportElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - intakeReportGenerationStartedAt) / 1000));
      setIntakeReportElapsedSeconds(elapsed);
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(intervalId);
  }, [isGeneratingIntakeReport, intakeReportGenerationStartedAt]);

  const loadItem = React.useCallback(async () => {
    setLoading(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${itemId}`, { cache: "no-store" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to load pipeline detail");
      setItem(
        payload.item
          ? {
              ...payload.item,
              notes: Array.isArray(payload.item.notes)
                ? payload.item.notes.map((note: { affiliations?: unknown }) => ({
                    ...note,
                    affiliations: parseNoteAffiliations(note.affiliations)
                  }))
                : [],
              marketLandscape: normalizeMarketLandscapePayload(payload.item.marketLandscape, payload.item.name)
            }
          : null
      );
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
          setItem(
            payload.item
              ? {
                  ...payload.item,
                  notes: Array.isArray(payload.item.notes)
                    ? payload.item.notes.map((note: { affiliations?: unknown }) => ({
                        ...note,
                        affiliations: parseNoteAffiliations(note.affiliations)
                      }))
                    : [],
                  marketLandscape: normalizeMarketLandscapePayload(payload.item.marketLandscape, payload.item.name)
                }
              : null
          );
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
    if (!item) {
      setNewNoteOpportunityId("");
      return;
    }
    if (!newNoteOpportunityId) return;
    const stillValid = item.opportunities.some((opportunity) => opportunity.id === newNoteOpportunityId);
    if (!stillValid) {
      setNewNoteOpportunityId("");
    }
  }, [item, newNoteOpportunityId]);

  React.useEffect(() => {
    if (item?.isScreeningStage) return;
    if (activeIntakeDetailTab !== "screening-materials") return;
    setActiveIntakeDetailTab("pipeline-status");
  }, [item?.isScreeningStage, activeIntakeDetailTab]);

  React.useEffect(() => {
    if (showOpportunitiesTab) return;
    if (activeIntakeDetailTab !== "opportunities") return;
    setActiveIntakeDetailTab("pipeline-status");
  }, [showOpportunitiesTab, activeIntakeDetailTab]);

  React.useEffect(() => {
    if (!opportunityModal || opportunityModal.mode !== "edit") return;
    if (!item) return;
    const stillExists = item.opportunities.some((opportunity) => opportunity.id === opportunityModal.opportunityId);
    if (!stillExists) {
      setOpportunityModal(null);
      setOpportunityModalTab("details");
    }
  }, [item, opportunityModal]);

  React.useEffect(() => {
    if (!opportunityModal) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpportunityModal(null);
        setOpportunityModalTab("details");
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [opportunityModal]);

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
    if (!item) {
      setOpportunityDraftById({});
      setOpportunityContactLookupByOpportunityId({});
      setNewOpportunityContactRoleByOpportunityId({});
      setOpportunityContactRoleDraftByLinkId({});
      return;
    }

    setOpportunityDraftById((current) => {
      const next: Record<string, OpportunityDraft> = {};
      for (const opportunity of item.opportunities) {
        next[opportunity.id] = current[opportunity.id] || toOpportunityDraft(opportunity);
      }
      return next;
    });
    setOpportunityContactLookupByOpportunityId((current) => {
      const next: Record<string, string> = {};
      for (const opportunity of item.opportunities) {
        next[opportunity.id] = current[opportunity.id] || "";
      }
      return next;
    });
    setNewOpportunityContactRoleByOpportunityId((current) => {
      const next: Record<string, string> = {};
      for (const opportunity of item.opportunities) {
        next[opportunity.id] = current[opportunity.id] || "";
      }
      return next;
    });
    setOpportunityContactRoleDraftByLinkId((current) => {
      const next: Record<string, string> = {};
      for (const opportunity of item.opportunities) {
        for (const link of opportunity.contacts) {
          next[link.id] = current[link.id] ?? (link.role || "");
        }
      }
      return next;
    });
    setNewOpportunityDraft((current) => ({
      ...current,
      type: defaultOpportunityTypeForItem(item)
    }));
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
    setVentureStudioCriteriaDraft((current) => {
      const next = normalizeVentureStudioCriteriaRows(item?.ventureStudioCriteria ?? null);
      const hasSameShape =
        current.length === next.length &&
        current.every(
          (row, index) =>
            row.category === next[index]?.category &&
            row.assessment === next[index]?.assessment &&
            row.rationale === next[index]?.rationale
        );
      if (hasSameShape) return current;
      return next;
    });
  }, [item?.ventureStudioCriteria, item?.id]);

  React.useEffect(() => {
    setMarketLandscapeDraft((current) => {
      const next = normalizeMarketLandscapePayload(item?.marketLandscape ?? null, item?.name);
      const same =
        current.sectionLabel === next.sectionLabel &&
        current.headline === next.headline &&
        current.subheadline === next.subheadline &&
        current.template === next.template &&
        current.xAxisLabel === next.xAxisLabel &&
        current.yAxisLabel === next.yAxisLabel &&
        current.columnLabels[0] === next.columnLabels[0] &&
        current.columnLabels[1] === next.columnLabels[1] &&
        current.rowLabels[0] === next.rowLabels[0] &&
        current.rowLabels[1] === next.rowLabels[1] &&
        current.primaryFocusCellKey === next.primaryFocusCellKey &&
        current.cards.length === next.cards.length &&
        current.cards.every((card, index) => {
          const other = next.cards[index];
          return (
            card.key === other?.key &&
            card.title === other?.title &&
            card.overview === other?.overview &&
            card.businessModel === other?.businessModel &&
            card.strengths === other?.strengths &&
            card.gaps === other?.gaps &&
            card.vendors === other?.vendors
          );
        });
      if (same) return current;
      return next;
    });
  }, [item?.marketLandscape, item?.name]);

  React.useEffect(() => {
    if (!item?.isScreeningStage) {
      setQuantitativeQuestionCategories(cloneQuantitativeQuestionCategories(defaultQuantitativeQuestionCategories));
      setQuantitativeQuestionEditorOpen(false);
      setQuantitativeQuestionsReady(false);
      return;
    }

    setQuantitativeQuestionsReady(false);
    const storageKey = `abundant:quantitative-question-set:v2:${item.id}`;
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
      mergeQuantitativeQuestionsWithFeedback(
        source,
        item.screening.healthSystems,
        item.screening.supplementalQuantitativeResponses || []
      )
    );
    setQuantitativeQuestionsReady(true);
  }, [item?.id, item?.isScreeningStage, item?.screening.healthSystems]);

  React.useEffect(() => {
    if (!item?.isScreeningStage || !quantitativeQuestionsReady || typeof window === "undefined") return;
    const storageKey = `abundant:quantitative-question-set:v2:${item.id}`;
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
        item.screening.healthSystems,
        item.screening.supplementalQuantitativeResponses || []
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

  async function saveVentureStudioCriteria() {
    if (!item) return;

    setSavingVentureStudioCriteria(true);
    setStatus(null);

    try {
      const payloadRows = ventureStudioCriteriaDraft.map((row) => ({
        category: row.category,
        assessment: row.assessment,
        rationale: row.rationale
      }));
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ventureStudioCriteria: payloadRows })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save venture studio criteria");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          ventureStudioCriteria: payload.item?.ventureStudioCriteria || current.ventureStudioCriteria
        };
      });
      setVentureStudioCriteriaDraft(normalizeVentureStudioCriteriaRows(payload.item?.ventureStudioCriteria || null));
      setStatus({ kind: "ok", text: "Venture Studio Criteria updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save venture studio criteria"
      });
    } finally {
      setSavingVentureStudioCriteria(false);
    }
  }

  function openVentureStudioCriteriaPreview() {
    if (!item) return;

    const logoUrl = `${window.location.origin}/icon.svg`;
    const generatedAt = new Date().toLocaleString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    });

    const rowsHtml = ventureStudioCriteriaDraft
      .map((row) => {
        const rationale = row.rationale.trim();
        const rationaleMarkup = rationale ? (/<[a-zA-Z]/.test(rationale) ? rationale : `<p>${escapeHtml(rationale)}</p>`) : "";

        return `
          <tr>
            <td>${escapeHtml(row.category)}</td>
            <td>${escapeHtml(row.criteria)}</td>
            <td>
              <span class="preview-assessment-chip">
                <span class="preview-assessment-dot" style="background:${ventureStudioAssessmentColorByValue[row.assessment]}"></span>
                ${formatVentureStudioAssessmentLabel(row.assessment)}
              </span>
            </td>
            <td class="preview-rationale">${rationaleMarkup || `<p class="preview-empty">No rationale entered.</p>`}</td>
          </tr>`;
      })
      .join("");

    const legendHtml = ventureStudioAssessmentDescriptions
      .map(
        (entry) => `
          <li>
            <span class="preview-legend-dot" style="background:${ventureStudioAssessmentColorByValue[entry.value]}"></span>
            ${entry.label}: ${escapeHtml(entry.description)}
          </li>`
      )
      .join("");

    const previewWindow = window.open("", "_blank", "width=1400,height=980");
    if (!previewWindow) {
      setStatus({ kind: "error", text: "Preview was blocked. Please allow pop-ups for this site." });
      return;
    }

    previewWindow.document.open();
    previewWindow.document.write(
      `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Venture Studio Criteria Preview - ${escapeHtml(item.name)}</title>
          <style>
            :root {
              --text-main: #112238;
              --text-muted: #42546b;
              --line: #d9e3f0;
              --brand: #193f60;
              --paper: #fff;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 24px;
              font-family: Arial, Helvetica, sans-serif;
              color: var(--text-main);
              background: #f6f9fc;
            }
            .preview-slide {
              max-width: 1280px;
              margin: 0 auto;
              background: var(--paper);
              border: 1px solid #e3ecf7;
              border-radius: 14px;
              box-shadow: 0 24px 48px rgba(20, 39, 61, 0.08);
              min-height: calc(100vh - 48px);
              display: flex;
              flex-direction: column;
            }
            .preview-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              border-bottom: 1px solid var(--line);
              padding: 18px 24px;
            }
            .preview-brand {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .preview-brand img {
              width: 46px;
              height: 46px;
              border-radius: 10px;
              border: 1px solid var(--line);
            }
            .preview-eyebrow {
              font-size: 11px;
              letter-spacing: 0.11em;
              text-transform: uppercase;
              font-weight: 700;
              color: #4f6b89;
              margin: 0 0 4px;
            }
            .preview-title {
              margin: 0;
              font-size: 18px;
              letter-spacing: 0.02em;
            }
            .preview-title strong {
              color: var(--brand);
            }
            .preview-body {
              padding: 16px 24px 24px;
              flex: 1;
              display: grid;
              align-content: start;
              gap: 12px;
            }
            .preview-subtitle {
              margin: 0;
              color: var(--text-muted);
            }
            .preview-meta {
              margin: 2px 0 0;
              font-size: 12px;
              color: var(--text-muted);
            }
            .preview-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid var(--line);
              table-layout: fixed;
              font-size: 12px;
            }
            .preview-table th,
            .preview-table td {
              border: 1px solid var(--line);
              text-align: left;
              vertical-align: top;
              padding: 8px 10px;
              white-space: normal;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            .preview-table th {
              background: #f4f8fc;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0.04em;
              color: #5f7390;
            }
            .preview-table col:first-child { width: 18%; }
            .preview-table col:nth-child(2) { width: 40%; }
            .preview-table col:nth-child(3) { width: 12%; }
            .preview-table col:nth-child(4) { width: 30%; }

            .preview-rationale {
              white-space: pre-wrap;
            }

            .preview-rationale p {
              margin: 0;
            }
            .preview-assessment-chip {
              display: inline-flex;
              align-items: center;
              gap: 7px;
              font-weight: 700;
            }
            .preview-assessment-dot {
              width: 10px;
              height: 10px;
              border-radius: 999px;
            }
            .preview-footnote {
              margin: 2px 0 0;
              color: var(--text-muted);
              font-size: 11px;
            }
            .preview-footnote ul {
              margin: 8px 0 0;
              padding: 0 0 0 20px;
              display: grid;
              gap: 5px;
            }
            .preview-legend-dot {
              width: 8px;
              height: 8px;
              border-radius: 999px;
              display: inline-block;
              margin-right: 8px;
            }
            .preview-empty {
              color: #8495ab;
              font-style: italic;
            }
            .preview-footer {
              margin-top: auto;
              border-top: 1px solid var(--line);
              padding: 10px 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              font-size: 11px;
              color: #71829a;
            }
            .preview-footer .logo {
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .preview-footer .logo img {
              width: 16px;
              height: 16px;
              border-radius: 4px;
              border: 1px solid #d5deec;
            }
          </style>
        </head>
        <body>
          <div class="preview-slide">
            <header class="preview-header">
              <div class="preview-brand">
                <img src="${logoUrl}" alt="Abundant logo" />
                <div>
                  <p class="preview-eyebrow">Intake Assessment</p>
                  <h1 class="preview-title"><strong>Venture Studio Criteria</strong> / Intake Card</h1>
                </div>
              </div>
              <p class="preview-meta">Generated ${escapeHtml(generatedAt)}</p>
            </header>
            <main class="preview-body">
              <p class="preview-subtitle">
                Company: <strong>${escapeHtml(item.name)}</strong> &nbsp;&nbsp;|&nbsp;&nbsp;
                Location: <strong>${escapeHtml(item.location || "Location unavailable")}</strong>
              </p>
              <table class="preview-table">
                <colgroup>
                  <col />
                  <col />
                  <col />
                  <col />
                </colgroup>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Criteria</th>
                    <th>Assessment</th>
                    <th>Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  ${rowsHtml}
                </tbody>
              </table>
              <div class="preview-footnote">
                <strong>Assessment meaning</strong>
                <ul>
                  ${legendHtml}
                </ul>
              </div>
            </main>
            <footer class="preview-footer">
              <div class="logo">
                <img src="${logoUrl}" alt="Abundant logo" />
                <span>Abundant CRM</span>
              </div>
              <span>© ${new Date().getFullYear()} Abundant. All rights reserved.</span>
            </footer>
          </div>
        </body>
      </html>`
    );
    previewWindow.document.close();
  }

  function openPreviewWindow({
    pageTitle,
    eyebrow,
    title,
    subtitleHtml,
    contentHtml,
    extraStyles = ""
  }: {
    pageTitle: string;
    eyebrow: string;
    title: string;
    subtitleHtml?: string;
    contentHtml: string;
    extraStyles?: string;
  }) {
    if (!item) return;

    const logoUrl = `${window.location.origin}/icon.svg`;
    const generatedAt = new Date().toLocaleString(undefined, {
      month: "long",
      day: "numeric",
      year: "numeric"
    });

    const previewWindow = window.open("", "_blank", "width=1400,height=980");
    if (!previewWindow) {
      setStatus({ kind: "error", text: "Preview was blocked. Please allow pop-ups for this site." });
      return;
    }

    previewWindow.document.open();
    previewWindow.document.write(
      `<!doctype html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>${pageTitle}</title>
          <style>
            :root {
              --text-main: #112238;
              --text-muted: #42546b;
              --line: #d9e3f0;
              --brand: #193f60;
              --paper: #fff;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              padding: 24px;
              font-family: Arial, Helvetica, sans-serif;
              color: var(--text-main);
              background: #f6f9fc;
            }
            .preview-slide {
              max-width: 1280px;
              margin: 0 auto;
              background: var(--paper);
              border: 1px solid #e3ecf7;
              border-radius: 14px;
              box-shadow: 0 24px 48px rgba(20, 39, 61, 0.08);
              min-height: calc(100vh - 48px);
              display: flex;
              flex-direction: column;
            }
            .preview-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 16px;
              border-bottom: 1px solid var(--line);
              padding: 18px 24px;
            }
            .preview-brand {
              display: flex;
              align-items: center;
              gap: 10px;
            }
            .preview-brand img {
              width: 46px;
              height: 46px;
              border-radius: 10px;
              border: 1px solid var(--line);
            }
            .preview-eyebrow {
              font-size: 11px;
              letter-spacing: 0.11em;
              text-transform: uppercase;
              font-weight: 700;
              color: #4f6b89;
              margin: 0 0 4px;
            }
            .preview-title {
              margin: 0;
              font-size: 18px;
              letter-spacing: 0.02em;
            }
            .preview-title strong {
              color: var(--brand);
            }
            .preview-body {
              padding: 16px 24px 24px;
              flex: 1;
              display: grid;
              align-content: start;
              gap: 12px;
            }
            .preview-subtitle {
              margin: 0;
              color: var(--text-muted);
            }
            .preview-meta {
              margin: 2px 0 0;
              font-size: 12px;
              color: var(--text-muted);
            }
            .preview-content {
              display: grid;
              gap: 16px;
            }
            .preview-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid var(--line);
              table-layout: fixed;
              font-size: 12px;
            }
            .preview-table th,
            .preview-table td {
              border: 1px solid var(--line);
              text-align: left;
              vertical-align: top;
              padding: 8px 10px;
              white-space: normal;
              overflow-wrap: anywhere;
              word-break: break-word;
            }
            .preview-table th {
              background: #f4f8fc;
              text-transform: uppercase;
              font-size: 10px;
              letter-spacing: 0.04em;
              color: #5f7390;
            }
            .preview-card {
              border: 1px solid var(--line);
              border-radius: 10px;
              padding: 12px;
              background: #fbfdff;
            }
            .preview-card h3 {
              margin: 0 0 8px;
              display: flex;
              justify-content: space-between;
              align-items: baseline;
              gap: 8px;
              font-size: 14px;
            }
            .preview-card h3 span {
              font-size: 12px;
              color: var(--text-muted);
              font-weight: 400;
            }
            .preview-rich-text p,
            .preview-rich-text ul,
            .preview-rich-text ol {
              margin: 0 0 8px;
            }
            .preview-rich-text p:last-child,
            .preview-rich-text ul:last-child,
            .preview-rich-text ol:last-child {
              margin-bottom: 0;
            }
            .preview-inline-list {
              margin: 0;
              padding-left: 16px;
              display: grid;
              gap: 4px;
            }
            .preview-empty {
              color: #8495ab;
              font-style: italic;
              margin: 0;
            }
            .preview-note {
              margin: 0;
              color: var(--text-muted);
              font-size: 11px;
            }
            .preview-footer {
              margin-top: auto;
              border-top: 1px solid var(--line);
              padding: 10px 24px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              gap: 12px;
              font-size: 11px;
              color: #71829a;
            }
            .preview-footer .logo {
              display: inline-flex;
              align-items: center;
              gap: 8px;
            }
            .preview-footer .logo img {
              width: 16px;
              height: 16px;
              border-radius: 4px;
              border: 1px solid #d5deec;
            }
            ${extraStyles}
          </style>
        </head>
        <body>
          <div class="preview-slide">
            <header class="preview-header">
              <div class="preview-brand">
                <img src="${logoUrl}" alt="Abundant logo" />
                <div>
                  <p class="preview-eyebrow">${eyebrow}</p>
                  <h1 class="preview-title"><strong>${title}</strong></h1>
                </div>
              </div>
              <p class="preview-meta">Generated ${escapeHtml(generatedAt)}</p>
            </header>
            <main class="preview-body">
              ${subtitleHtml ? `<p class="preview-subtitle">${subtitleHtml}</p>` : ""}
              <div class="preview-content">
                ${contentHtml}
              </div>
            </main>
            <footer class="preview-footer">
              <div class="logo">
                <img src="${logoUrl}" alt="Abundant logo" />
                <span>Abundant CRM</span>
              </div>
              <span>© ${new Date().getFullYear()} Abundant. All rights reserved.</span>
            </footer>
          </div>
        </body>
      </html>`
    );
    previewWindow.document.close();
  }

  function openAtAGlancePreview() {
    if (!item) return;

    const rowsHtml = atAGlanceFields
      .map((field) => {
        const valueMarkup = normalizeRichText(field.value.trim());
        return `
          <tr>
            <th>${escapeHtml(field.label)}</th>
            <td class="preview-rich-text">
              ${valueMarkup || `<p class="preview-empty">No content entered.</p>`}
            </td>
          </tr>`;
      })
      .join("");

    openPreviewWindow({
      pageTitle: `At-A-Glance Preview - ${escapeHtml(item.name)}`,
      eyebrow: "Intake Assessment",
      title: "At-A-Glance / Intake Card",
      subtitleHtml: `Company: <strong>${escapeHtml(item.name)}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; Location: <strong>${escapeHtml(item.location || "Location unavailable")}</strong>`,
      contentHtml: `
        <table class="preview-table preview-at-a-glance-table">
          <colgroup>
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Section</th>
              <th>Content</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      `,
      extraStyles: `
        .preview-at-a-glance-table col:first-child { width: 24%; }
        .preview-at-a-glance-table col:nth-child(2) { width: 76%; }
      `
    });
  }

  function openScreeningStatusPreview() {
    if (!item) return;

    const statusColorByValue: Record<ScreeningStatus, string> = {
      NOT_STARTED: "#64748b",
      PENDING: "#f59e0b",
      NEGOTIATING: "#16a34a",
      SIGNED: "#16a34a",
      DECLINED: "#dc2626"
    };

    const rowsHtml = item.screening.healthSystems
      .map((entry) => {
        const attendees = uniqueIndividuals(entry);
        const attendedCount = entry.participants.filter((participant) => participant.attendanceStatus === "ATTENDED").length;
        const relevantFeedback =
          relevantFeedbackDraftByHealthSystemId[entry.healthSystemId] ?? entry.relevantFeedback ?? "";
        const statusUpdate = statusUpdateDraftByHealthSystemId[entry.healthSystemId] ?? entry.statusUpdate ?? "";
        const attendeesMarkup =
          attendees.length > 0
            ? `<ul class="preview-inline-list">${attendees
                .map((person) => `<li>${escapeHtml(person.label)}</li>`)
                .join("")}</ul>`
            : `<p class="preview-empty">No attendees listed.</p>`;

        return `
          <tr>
            <td>${escapeHtml(entry.healthSystemName)}</td>
            <td>${attendedCount > 0 ? escapeHtml(String(attendedCount)) : "NA"}</td>
            <td>
              <span class="preview-status-chip">
                <span class="preview-status-dot" style="background:${statusColorByValue[entry.status]}"></span>
                ${escapeHtml(statusMeta(entry.status).label)}
              </span>
            </td>
            <td>${attendeesMarkup}</td>
            <td>${escapeHtml(relevantFeedback.trim() || "No relevant feedback entered.")}</td>
            <td>${escapeHtml(statusUpdate.trim() || "No status update entered.")}</td>
          </tr>`;
      })
      .join("");

    openPreviewWindow({
      pageTitle: `Screening Status Matrix Preview - ${escapeHtml(item.name)}`,
      eyebrow: "Screening Materials",
      title: "Status Matrix / Alliance Screening",
      subtitleHtml: `Company: <strong>${escapeHtml(item.name)}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; Alliance Members: <strong>${escapeHtml(String(item.screening.healthSystems.length))}</strong>`,
      contentHtml: `
        <table class="preview-table preview-screening-status-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Attend? (#)</th>
              <th>Preliminary Interest</th>
              <th>Attendees</th>
              <th>Relevant Feedback + Next Steps</th>
              <th>Status Update</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="6"><p class="preview-empty">No alliance health systems configured.</p></td></tr>`}
          </tbody>
        </table>
      `,
      extraStyles: `
        .preview-screening-status-table col:first-child { width: 16%; }
        .preview-screening-status-table col:nth-child(2) { width: 8%; }
        .preview-screening-status-table col:nth-child(3) { width: 15%; }
        .preview-screening-status-table col:nth-child(4) { width: 18%; }
        .preview-screening-status-table col:nth-child(5) { width: 21%; }
        .preview-screening-status-table col:nth-child(6) { width: 22%; }
        .preview-status-chip {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-weight: 700;
        }
        .preview-status-dot {
          width: 10px;
          height: 10px;
          border-radius: 999px;
        }
      `
    });
  }

  function openScreeningQuantitativePreview() {
    if (!item) return;

    const sectionMarkup = quantitativeSlideSections
      .map((section) => {
        const rowsMarkup = section.rows
          .map((row) => {
            const responseMarkup =
              row.responses.length > 0
                ? `<ul class="preview-inline-list">
                    ${row.responses
                      .map((response) => {
                        const contactLabel = response.contactTitle
                          ? `${response.contactName} (${response.contactTitle})`
                          : response.contactName;
                        return `<li>${escapeHtml(contactLabel)} - ${escapeHtml(response.institution)}: ${response.score.toFixed(1)}</li>`;
                      })
                      .join("")}
                  </ul>`
                : `<p class="preview-empty">No numeric responses.</p>`;

            return `
              <tr>
                <td>
                  ${escapeHtml(row.metric)}
                  ${
                    row.isUnmapped
                      ? `<p class="preview-note">Legacy question text (not in configured question set).</p>`
                      : ""
                  }
                </td>
                <td>${row.averageScore === null ? "N/A" : row.averageScore.toFixed(1)}</td>
                <td>${escapeHtml(String(row.responseCount))}</td>
                <td>${responseMarkup}</td>
              </tr>`;
          })
          .join("");

        return `
          <section class="preview-card">
            <h3>
              ${escapeHtml(section.category)}
              <span>${section.categoryAverageScore === null ? "Category avg: N/A" : `Category avg: ${section.categoryAverageScore.toFixed(1)}`}</span>
            </h3>
            <table class="preview-table preview-quant-table">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Question</th>
                  <th>Avg</th>
                  <th>Responses</th>
                  <th>Response Details</th>
                </tr>
              </thead>
              <tbody>
                ${rowsMarkup}
              </tbody>
            </table>
          </section>`;
      })
      .join("");

    const institutionsSummary =
      quantitativeRespondingInstitutions.length === 0
        ? "No responding institutions captured yet."
        : quantitativeRespondingInstitutions.join(", ");

    openPreviewWindow({
      pageTitle: `Quantitative Screening Preview - ${escapeHtml(item.name)}`,
      eyebrow: "Screening Materials",
      title: "Quantitative / Alliance Screening",
      subtitleHtml: `Company: <strong>${escapeHtml(item.name)}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; Responding Institutions: <strong>${escapeHtml(String(quantitativeRespondingInstitutions.length))}</strong>`,
      contentHtml: `${
        sectionMarkup || `<p class="preview-empty">No quantitative feedback captured yet.</p>`
      }<p class="preview-note">Responding institutions: ${escapeHtml(institutionsSummary)}</p>`,
      extraStyles: `
        .preview-quant-table col:first-child { width: 38%; }
        .preview-quant-table col:nth-child(2) { width: 8%; }
        .preview-quant-table col:nth-child(3) { width: 10%; }
        .preview-quant-table col:nth-child(4) { width: 44%; }
      `
    });
  }

  function openScreeningQualitativePreview() {
    if (!item) return;

    const rowsHtml = allQualitativeFeedbackEntries
      .map((feedback) => {
        const detailMarkup = normalizeRichText(feedback.feedback.trim());
        const contactLabel = feedback.contactTitle
          ? `${feedback.contactName} (${feedback.contactTitle})`
          : feedback.contactName;

        return `
          <tr>
            <td>${escapeHtml(feedback.theme)}</td>
            <td class="preview-rich-text">${detailMarkup || `<p class="preview-empty">No detail entered.</p>`}</td>
            <td>
              ${escapeHtml((feedback.category || "Key Theme").trim())}<br />
              ${escapeHtml(feedback.healthSystemName)}<br />
              ${escapeHtml(contactLabel)}
            </td>
            <td>${escapeHtml(sentimentLabel(feedback.sentiment))}</td>
          </tr>`;
      })
      .join("");

    openPreviewWindow({
      pageTitle: `Qualitative Screening Preview - ${escapeHtml(item.name)}`,
      eyebrow: "Screening Materials",
      title: "Qualitative / Alliance Screening",
      subtitleHtml: `Company: <strong>${escapeHtml(item.name)}</strong> &nbsp;&nbsp;|&nbsp;&nbsp; Entries: <strong>${escapeHtml(String(allQualitativeFeedbackEntries.length))}</strong>`,
      contentHtml: `
        <table class="preview-table preview-qualitative-table">
          <colgroup>
            <col />
            <col />
            <col />
            <col />
          </colgroup>
          <thead>
            <tr>
              <th>Theme</th>
              <th>Detail</th>
              <th>Source</th>
              <th>Sentiment</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || `<tr><td colspan="4"><p class="preview-empty">No qualitative feedback captured yet.</p></td></tr>`}
          </tbody>
        </table>
      `,
      extraStyles: `
        .preview-qualitative-table col:first-child { width: 20%; }
        .preview-qualitative-table col:nth-child(2) { width: 42%; }
        .preview-qualitative-table col:nth-child(3) { width: 28%; }
        .preview-qualitative-table col:nth-child(4) { width: 10%; }
      `
    });
  }

  function updateMarketLandscapeCardField(
    cardKey: MarketLandscapeCellKey,
    field: "title" | "overview" | "businessModel" | "strengths" | "gaps" | "vendors",
    value: string
  ) {
    setMarketLandscapeDraft((current) => ({
      ...current,
      cards: current.cards.map((card) => (card.key === cardKey ? { ...card, [field]: value } : card))
    }));
  }

  function updateMarketLandscapeColumnLabel(index: 0 | 1, value: string) {
    setMarketLandscapeDraft((current) => {
      const next: [string, string] = [...current.columnLabels];
      next[index] = value;
      return {
        ...current,
        columnLabels: next
      };
    });
  }

  function updateMarketLandscapeRowLabel(index: 0 | 1, value: string) {
    setMarketLandscapeDraft((current) => {
      const next: [string, string] = [...current.rowLabels];
      next[index] = value;
      return {
        ...current,
        rowLabels: next
      };
    });
  }

  async function saveMarketLandscape() {
    if (!item) return;

    setSavingMarketLandscape(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/card`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          marketLandscape: marketLandscapeDraft
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save market landscape.");

      const next = normalizeMarketLandscapePayload(payload.item?.marketLandscape ?? marketLandscapeDraft, item.name);
      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          marketLandscape: next
        };
      });
      setMarketLandscapeDraft(next);
      setStatus({ kind: "ok", text: "Market Landscape updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save market landscape."
      });
    } finally {
      setSavingMarketLandscape(false);
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

  async function updatePipelineCardMeta(input: {
    intakeDecisionAt?: string | null;
    ventureStudioContractExecutedAt?: string | null;
    screeningWebinarDate1At?: string | null;
    screeningWebinarDate2At?: string | null;
    ventureLikelihoodPercent?: number | null;
    ventureExpectedCloseDate?: string | null;
  }) {
    if (!item) return;
    const requestPayload = { ...input };
    const requestSequence = pipelineCardUpdateSequenceRef.current + 1;
    pipelineCardUpdateSequenceRef.current = requestSequence;
    const requestStartMs = Date.now();
    const requestHas = {
      intakeDecisionAt: Object.prototype.hasOwnProperty.call(input, "intakeDecisionAt"),
      ventureStudioContractExecutedAt: Object.prototype.hasOwnProperty.call(input, "ventureStudioContractExecutedAt"),
      screeningWebinarDate1At: Object.prototype.hasOwnProperty.call(input, "screeningWebinarDate1At"),
      screeningWebinarDate2At: Object.prototype.hasOwnProperty.call(input, "screeningWebinarDate2At"),
      ventureExpectedCloseDate: Object.prototype.hasOwnProperty.call(input, "ventureExpectedCloseDate"),
      ventureLikelihoodPercent: Object.prototype.hasOwnProperty.call(input, "ventureLikelihoodPercent")
    };
    const debugContext = createDateDebugContext("pipeline-opportunity-detail.update", item.id);
    const headers: Record<string, string> = {
      ...dateDebugHeaders("pipeline-opportunity-detail.update", item.id),
      "Content-Type": "application/json"
    };
    headers["x-date-debug-seq"] = String(requestSequence);
    if (item.updatedAt) {
      headers["x-date-debug-client-updated-at"] = item.updatedAt;
    }
    if (debugContext) {
      headers["x-date-debug-request-id"] = debugContext.requestId;
      headers["x-date-debug-session-id"] = debugContext.sessionId;
      headers["x-date-debug-scope"] = debugContext.scope;
      headers["x-date-debug-item-id"] = item.id;
    }
    setStatus(null);
    debugDateLog("pipeline-opportunity-detail.update-request", {
      itemId: item.id,
      debugRequestId: debugContext?.requestId,
      requestSequence,
      durationMs: 0,
      clientUpdatedAt: item.updatedAt || null,
      clientUpdatedAtParsed: compareUpdatedAt(item.updatedAt, null).parsedClientUpdatedAt,
      requestHas,
      requestPayload,
      currentDates: {
        intakeDecisionAt: item.intakeDecisionAt,
        ventureStudioContractExecutedAt: item.ventureStudioContractExecutedAt,
        screeningWebinarDate1At: item.screeningWebinarDate1At,
        screeningWebinarDate2At: item.screeningWebinarDate2At,
        ventureExpectedCloseDate: item.ventureExpectedCloseDate,
        ventureLikelihoodPercent: item.ventureLikelihoodPercent
      }
    });

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/card`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(input)
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update pipeline status.");
      const returnedItem = payload.item;
      const latestSequence = pipelineCardUpdateSequenceRef.current;
      if (latestSequence !== requestSequence) {
        debugDateLog("pipeline-opportunity-detail.update-stale-response", {
          itemId: item.id,
          debugRequestId: debugContext?.requestId,
          requestSequence,
          latestSequence,
          durationMs: Date.now() - requestStartMs,
          responseServerSequence: payload._dateDebug?.requestSequence ?? null
        });
        return;
      }
      const responseDates = {
        intakeDecisionAt: returnedItem?.intakeDecisionAt ?? null,
        ventureStudioContractExecutedAt: returnedItem?.ventureStudioContractExecutedAt ?? null,
        screeningWebinarDate1At: returnedItem?.screeningWebinarDate1At ?? null,
        screeningWebinarDate2At: returnedItem?.screeningWebinarDate2At ?? null,
        ventureExpectedCloseDate: returnedItem?.ventureExpectedCloseDate ?? null,
        ventureLikelihoodPercent: returnedItem?.ventureLikelihoodPercent ?? null
      };
      const responseUpdatedAt = typeof returnedItem?.updatedAt === "string" ? returnedItem.updatedAt : null;
      const serverClientState = compareUpdatedAt(item.updatedAt, responseUpdatedAt);
      debugDateLog("pipeline-opportunity-detail.update-response", {
        itemId: item.id,
        debugRequestId: debugContext?.requestId,
        requestSequence,
        latestSequence,
        durationMs: Date.now() - requestStartMs,
        responseServerSequence: payload._dateDebug?.requestSequence ?? null,
        requestPayload,
        response: responseDates,
        serverUpdatedAt: responseUpdatedAt,
        serverClientState,
        responseMismatch: {
          intakeDecisionAt: requestHas.intakeDecisionAt
            ? {
                requested: requestPayload.intakeDecisionAt,
                persisted: responseDates.intakeDecisionAt,
                matched:
                  toDateInputValue(responseDates.intakeDecisionAt) ===
                  toDateInputValue(requestPayload.intakeDecisionAt)
              }
            : null,
          ventureStudioContractExecutedAt: requestHas.ventureStudioContractExecutedAt
            ? {
                requested: requestPayload.ventureStudioContractExecutedAt,
                persisted: responseDates.ventureStudioContractExecutedAt,
                matched:
                  toDateInputValue(responseDates.ventureStudioContractExecutedAt) ===
                  toDateInputValue(requestPayload.ventureStudioContractExecutedAt)
              }
            : null,
          screeningWebinarDate1At: requestHas.screeningWebinarDate1At
            ? {
                requested: requestPayload.screeningWebinarDate1At,
                persisted: responseDates.screeningWebinarDate1At,
                matched:
                  toDateInputValue(responseDates.screeningWebinarDate1At) ===
                  toDateInputValue(requestPayload.screeningWebinarDate1At)
              }
            : null,
          screeningWebinarDate2At: requestHas.screeningWebinarDate2At
            ? {
                requested: requestPayload.screeningWebinarDate2At,
                persisted: responseDates.screeningWebinarDate2At,
                matched:
                  toDateInputValue(responseDates.screeningWebinarDate2At) ===
                  toDateInputValue(requestPayload.screeningWebinarDate2At)
              }
            : null,
          ventureExpectedCloseDate: requestHas.ventureExpectedCloseDate
            ? {
                requested: requestPayload.ventureExpectedCloseDate,
                persisted: responseDates.ventureExpectedCloseDate,
                matched:
                  toDateInputValue(responseDates.ventureExpectedCloseDate) ===
                  toDateInputValue(requestPayload.ventureExpectedCloseDate)
              }
            : null,
          ventureLikelihoodPercent: requestHas.ventureLikelihoodPercent
            ? {
                requested: requestPayload.ventureLikelihoodPercent,
                persisted: responseDates.ventureLikelihoodPercent,
                matched: requestPayload.ventureLikelihoodPercent === responseDates.ventureLikelihoodPercent
              }
            : null
        }
      });

      const updatedIntakeDecisionDate =
        typeof returnedItem?.intakeDecisionAt === "string" || returnedItem?.intakeDecisionAt === null
          ? (returnedItem?.intakeDecisionAt ?? null)
          : input.intakeDecisionAt ?? item.intakeDecisionAt;
      const updatedVentureStudioContractExecutedAt =
        typeof returnedItem?.ventureStudioContractExecutedAt === "string" ||
        returnedItem?.ventureStudioContractExecutedAt === null
          ? (returnedItem?.ventureStudioContractExecutedAt ?? null)
          : input.ventureStudioContractExecutedAt ?? item.ventureStudioContractExecutedAt;
      const updatedScreeningWebinarDate1At =
        typeof returnedItem?.screeningWebinarDate1At === "string" ||
        returnedItem?.screeningWebinarDate1At === null
          ? (returnedItem?.screeningWebinarDate1At ?? null)
          : input.screeningWebinarDate1At ?? item.screeningWebinarDate1At;
      const updatedScreeningWebinarDate2At =
        typeof returnedItem?.screeningWebinarDate2At === "string" ||
        returnedItem?.screeningWebinarDate2At === null
          ? (returnedItem?.screeningWebinarDate2At ?? null)
          : input.screeningWebinarDate2At ?? item.screeningWebinarDate2At;
      const updatedLikelihood =
        returnedItem?.ventureLikelihoodPercent === null || Number.isInteger(returnedItem?.ventureLikelihoodPercent)
          ? (returnedItem?.ventureLikelihoodPercent ?? null)
          : input.ventureLikelihoodPercent ?? item.ventureLikelihoodPercent;
      const updatedCloseDate =
        typeof returnedItem?.ventureExpectedCloseDate === "string" || returnedItem?.ventureExpectedCloseDate === null
          ? (returnedItem?.ventureExpectedCloseDate ?? null)
          : input.ventureExpectedCloseDate ?? item.ventureExpectedCloseDate;

      setItem((current) =>
        current
          ? {
              ...current,
              intakeDecisionAt: updatedIntakeDecisionDate,
              ventureStudioContractExecutedAt: updatedVentureStudioContractExecutedAt,
              screeningWebinarDate1At: updatedScreeningWebinarDate1At,
              screeningWebinarDate2At: updatedScreeningWebinarDate2At,
              ventureLikelihoodPercent: updatedLikelihood,
              ventureExpectedCloseDate: updatedCloseDate,
              updatedAt: responseUpdatedAt || current.updatedAt
            }
          : current
      );
      setStatus({ kind: "ok", text: "Pipeline status updated." });
    } catch (error) {
      const latestSequence = pipelineCardUpdateSequenceRef.current;
      if (latestSequence !== requestSequence) {
        debugDateLog("pipeline-opportunity-detail.update-stale-error", {
          itemId: item.id,
          debugRequestId: debugContext?.requestId,
          requestSequence,
          latestSequence,
          durationMs: Date.now() - requestStartMs,
          error: error instanceof Error ? error.message : String(error),
          responseStatus: "ignored_stale_error"
        });
        return;
      }
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update pipeline status."
      });
      debugDateLog("pipeline-opportunity-detail.update-error", {
        itemId: item.id,
        debugRequestId: debugContext?.requestId,
        requestSequence,
        durationMs: Date.now() - requestStartMs,
        input,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  async function saveVentureLikelihood(nextValue: string) {
    if (!item) return;
    const trimmed = nextValue.trim();
    if (!trimmed) {
      if (item.ventureLikelihoodPercent === null) return;
      await updatePipelineCardMeta({ ventureLikelihoodPercent: null });
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setStatus({ kind: "error", text: "Likelihood to Close must be a number from 0 to 100." });
      return;
    }
    const rounded = Math.round(parsed);
    if (rounded < 0 || rounded > 100) {
      setStatus({ kind: "error", text: "Likelihood to Close must be between 0 and 100." });
      return;
    }
    if (item.ventureLikelihoodPercent === rounded) return;
    await updatePipelineCardMeta({ ventureLikelihoodPercent: rounded });
  }

  async function saveVentureExpectedCloseDate(nextValue: string) {
    if (!item) return;
    const trimmed = nextValue.trim();
    debugDateLog("pipeline-opportunity-detail.save-field-request", {
      itemId: item.id,
      field: "ventureExpectedCloseDate",
      nextValue: trimmed,
      currentValue: item.ventureExpectedCloseDate
    });
    if (!trimmed) {
      if (!item.ventureExpectedCloseDate) return;
      await updatePipelineCardMeta({ ventureExpectedCloseDate: null });
      return;
    }
    if (item.ventureExpectedCloseDate && toDateInputValue(item.ventureExpectedCloseDate) === trimmed) return;
    await updatePipelineCardMeta({ ventureExpectedCloseDate: trimmed });
  }

  async function saveIntakeDecisionDate(nextValue: string) {
    if (!item) return;
    const trimmed = nextValue.trim();
    debugDateLog("pipeline-opportunity-detail.save-field-request", {
      itemId: item.id,
      field: "intakeDecisionAt",
      nextValue: trimmed,
      currentValue: item.intakeDecisionAt
    });
    if (!trimmed) {
      if (!item.intakeDecisionAt) return;
      await updatePipelineCardMeta({ intakeDecisionAt: null });
      return;
    }
    if (item.intakeDecisionAt && toDateInputValue(item.intakeDecisionAt) === trimmed) return;
    await updatePipelineCardMeta({ intakeDecisionAt: trimmed });
  }

  async function saveVentureStudioContractExecutedDate(nextValue: string) {
    if (!item) return;
    const trimmed = nextValue.trim();
    debugDateLog("pipeline-opportunity-detail.save-field-request", {
      itemId: item.id,
      field: "ventureStudioContractExecutedAt",
      nextValue: trimmed,
      currentValue: item.ventureStudioContractExecutedAt
    });
    if (!trimmed) {
      if (!item.ventureStudioContractExecutedAt) return;
      await updatePipelineCardMeta({ ventureStudioContractExecutedAt: null });
      return;
    }
    if (
      item.ventureStudioContractExecutedAt &&
      toDateInputValue(item.ventureStudioContractExecutedAt) === trimmed
    ) {
      return;
    }
    await updatePipelineCardMeta({ ventureStudioContractExecutedAt: trimmed });
  }

  async function saveScreeningWebinarDate1(nextValue: string) {
    if (!item) return;
    const trimmed = nextValue.trim();
    debugDateLog("pipeline-opportunity-detail.save-field-request", {
      itemId: item.id,
      field: "screeningWebinarDate1At",
      nextValue: trimmed,
      currentValue: item.screeningWebinarDate1At
    });
    if (!trimmed) {
      if (!item.screeningWebinarDate1At) return;
      await updatePipelineCardMeta({ screeningWebinarDate1At: null });
      return;
    }
    if (item.screeningWebinarDate1At && toDateInputValue(item.screeningWebinarDate1At) === trimmed) return;
    await updatePipelineCardMeta({ screeningWebinarDate1At: trimmed });
  }

  async function saveScreeningWebinarDate2(nextValue: string) {
    if (!item) return;
    const trimmed = nextValue.trim();
    debugDateLog("pipeline-opportunity-detail.save-field-request", {
      itemId: item.id,
      field: "screeningWebinarDate2At",
      nextValue: trimmed,
      currentValue: item.screeningWebinarDate2At
    });
    if (!trimmed) {
      if (!item.screeningWebinarDate2At) return;
      await updatePipelineCardMeta({ screeningWebinarDate2At: null });
      return;
    }
    if (item.screeningWebinarDate2At && toDateInputValue(item.screeningWebinarDate2At) === trimmed) return;
    await updatePipelineCardMeta({ screeningWebinarDate2At: trimmed });
  }

  function updateOpportunityDraft(opportunityId: string, patch: Partial<OpportunityDraft>) {
    setOpportunityDraftById((current) => ({
      ...current,
      [opportunityId]: {
        ...(current[opportunityId] ||
          (() => {
            const fallback = item?.opportunities.find((entry) => entry.id === opportunityId);
            return fallback
              ? toOpportunityDraft(fallback)
              : {
                  type: "SCREENING_LOI",
                  stage: "IDENTIFIED",
                  healthSystemId: "",
                  likelihoodPercent: String(defaultLikelihoodForStage("IDENTIFIED")),
                  amountUsd: "",
                  contractPriceUsd: "",
                  estimatedCloseDate: "",
                  closedAt: "",
                  closeReason: "",
                  nextSteps: "",
                  notes: ""
                };
          })()),
        ...patch
      }
    }));
  }

  function parseNullableDecimal(value: string, label: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error(`${label} must be a positive number.`);
    }
    return numeric;
  }

  function parseNullableLikelihood(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const numeric = Number(trimmed);
    if (!Number.isFinite(numeric)) {
      throw new Error("Likelihood to Close must be a number from 0 to 100.");
    }
    const rounded = Math.round(numeric);
    if (rounded < 0 || rounded > 100) {
      throw new Error("Likelihood to Close must be between 0 and 100.");
    }
    return rounded;
  }

  function nextOpportunityPayload(draft: OpportunityDraft) {
    const closeReason = draft.closeReason.trim() || null;
    if (isClosedOpportunityStage(draft.stage) && !closeReason) {
      throw new Error("Close reason is required when marking an opportunity won or lost.");
    }

    return {
      type: draft.type,
      stage: draft.stage,
      healthSystemId: draft.healthSystemId || null,
      likelihoodPercent: parseNullableLikelihood(draft.likelihoodPercent),
      amountUsd: parseNullableDecimal(draft.amountUsd, "Amount"),
      contractPriceUsd: parseNullableDecimal(draft.contractPriceUsd, "Contract Price"),
      estimatedCloseDate: draft.estimatedCloseDate.trim() || null,
      closedAt: draft.closedAt.trim() || null,
      closeReason,
      nextSteps: draft.nextSteps.trim() || null,
      notes: draft.notes.trim() || null
    };
  }

  function applyUpdatedOpportunity(updated: PipelineOpportunityDetail["opportunities"][number]) {
    setItem((current) => {
      if (!current) return current;
      const exists = current.opportunities.some((entry) => entry.id === updated.id);
      return {
        ...current,
        opportunities: exists
          ? current.opportunities.map((entry) => (entry.id === updated.id ? updated : entry))
          : [updated, ...current.opportunities]
      };
    });
    setOpportunityDraftById((current) => ({
      ...current,
      [updated.id]: toOpportunityDraft(updated)
    }));
    setOpportunityContactLookupByOpportunityId((current) => ({
      ...current,
      [updated.id]: current[updated.id] || ""
    }));
    setNewOpportunityContactRoleByOpportunityId((current) => ({
      ...current,
      [updated.id]: current[updated.id] || ""
    }));
    setOpportunityContactRoleDraftByLinkId((current) => {
      const next = { ...current };
      for (const link of updated.contacts) {
        next[link.id] = link.role || "";
      }
      return next;
    });
  }

  async function saveOpportunity(opportunityId: string) {
    if (!item) return;
    const draft = opportunityDraftById[opportunityId];
    if (!draft) return;

    setSavingOpportunityById((current) => ({ ...current, [opportunityId]: true }));
    setStatus(null);

    try {
      const payload = nextOpportunityPayload(draft);
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/opportunities`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId,
          ...payload
        })
      });
      const responsePayload = await res.json();
      if (!res.ok) throw new Error(responsePayload.error || "Failed to update opportunity.");
      const updated = responsePayload.opportunity as PipelineOpportunityDetail["opportunities"][number] | undefined;
      if (!updated) throw new Error("Failed to update opportunity.");
      applyUpdatedOpportunity(updated);
      setStatus({ kind: "ok", text: "Opportunity updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update opportunity."
      });
    } finally {
      setSavingOpportunityById((current) => ({ ...current, [opportunityId]: false }));
    }
  }

  async function createOpportunity() {
    if (!item) return null;

    setAddingOpportunity(true);
    setStatus(null);
    let createdOpportunity: PipelineOpportunityDetail["opportunities"][number] | null = null;

    try {
      const payload = nextOpportunityPayload(newOpportunityDraft);
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const responsePayload = await res.json();
      if (!res.ok) throw new Error(responsePayload.error || "Failed to create opportunity.");
      const created = responsePayload.opportunity as PipelineOpportunityDetail["opportunities"][number] | undefined;
      if (!created) throw new Error("Failed to create opportunity.");
      createdOpportunity = created;

      applyUpdatedOpportunity(created);
      setNewOpportunityDraft({
        type: defaultOpportunityTypeForItem(item),
        stage: "IDENTIFIED",
        healthSystemId: "",
        likelihoodPercent: String(defaultLikelihoodForStage("IDENTIFIED")),
        amountUsd: "",
        contractPriceUsd: "",
        estimatedCloseDate: "",
        closedAt: "",
        closeReason: "",
        nextSteps: "",
        notes: ""
      });
      setStatus({ kind: "ok", text: "Opportunity created." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create opportunity."
      });
    } finally {
      setAddingOpportunity(false);
    }
    return createdOpportunity;
  }

  async function deleteOpportunity(opportunityId: string) {
    if (!item) return false;
    const existing = item.opportunities.find((entry) => entry.id === opportunityId);
    if (!existing) return false;
    if (!window.confirm(`Delete opportunity \"${existing.title}\"?`)) return false;

    setDeletingOpportunityById((current) => ({ ...current, [opportunityId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/opportunities`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete opportunity.");

      setItem((current) =>
        current
          ? {
              ...current,
              opportunities: current.opportunities.filter((entry) => entry.id !== opportunityId)
            }
          : current
      );
      setOpportunityDraftById((current) => {
        const next = { ...current };
        delete next[opportunityId];
        return next;
      });
      setStatus({ kind: "ok", text: "Opportunity deleted." });
      return true;
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete opportunity."
      });
      return false;
    } finally {
      setDeletingOpportunityById((current) => ({ ...current, [opportunityId]: false }));
    }
  }

  async function addOpportunityContact(opportunityId: string) {
    if (!item) return;
    const contactId = (opportunityContactLookupByOpportunityId[opportunityId] || "").trim();
    if (!contactId) {
      setStatus({ kind: "error", text: "Select a contact before adding." });
      return;
    }

    setAddingOpportunityContactByOpportunityId((current) => ({ ...current, [opportunityId]: true }));
    setStatus(null);

    try {
      const role = (newOpportunityContactRoleByOpportunityId[opportunityId] || "").trim();
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/opportunity-contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          opportunityId,
          contactId,
          role: role || null
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add opportunity contact.");
      const link = payload.link as PipelineOpportunityDetail["opportunities"][number]["contacts"][number] | undefined;
      if (!link) throw new Error("Failed to add opportunity contact.");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          opportunities: current.opportunities.map((opportunity) => {
            if (opportunity.id !== opportunityId) return opportunity;
            const existingIndex = opportunity.contacts.findIndex((entry) => entry.id === link.id);
            if (existingIndex >= 0) {
              const nextContacts = [...opportunity.contacts];
              nextContacts[existingIndex] = link;
              return { ...opportunity, contacts: nextContacts };
            }
            return { ...opportunity, contacts: [...opportunity.contacts, link] };
          })
        };
      });
      setOpportunityContactLookupByOpportunityId((current) => ({ ...current, [opportunityId]: "" }));
      setNewOpportunityContactRoleByOpportunityId((current) => ({ ...current, [opportunityId]: "" }));
      setOpportunityContactRoleDraftByLinkId((current) => ({ ...current, [link.id]: link.role || "" }));
      setStatus({ kind: "ok", text: "Opportunity contact added." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add opportunity contact."
      });
    } finally {
      setAddingOpportunityContactByOpportunityId((current) => ({ ...current, [opportunityId]: false }));
    }
  }

  async function saveOpportunityContactRole(linkId: string) {
    if (!item) return;
    const role = (opportunityContactRoleDraftByLinkId[linkId] || "").trim();

    setSavingOpportunityContactRoleByLinkId((current) => ({ ...current, [linkId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/opportunity-contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          role: role || null
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update opportunity contact role.");
      const link = payload.link as PipelineOpportunityDetail["opportunities"][number]["contacts"][number] | undefined;
      if (!link) throw new Error("Failed to update opportunity contact role.");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          opportunities: current.opportunities.map((opportunity) => ({
            ...opportunity,
            contacts: opportunity.contacts.map((entry) => (entry.id === link.id ? link : entry))
          }))
        };
      });
      setOpportunityContactRoleDraftByLinkId((current) => ({ ...current, [link.id]: link.role || "" }));
      setStatus({ kind: "ok", text: "Opportunity contact updated." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update opportunity contact role."
      });
    } finally {
      setSavingOpportunityContactRoleByLinkId((current) => ({ ...current, [linkId]: false }));
    }
  }

  async function deleteOpportunityContact(opportunityId: string, linkId: string) {
    if (!item) return;
    if (!window.confirm("Remove this opportunity contact?")) return;

    setDeletingOpportunityContactByLinkId((current) => ({ ...current, [linkId]: true }));
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/opportunity-contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to remove opportunity contact.");

      setItem((current) => {
        if (!current) return current;
        return {
          ...current,
          opportunities: current.opportunities.map((opportunity) =>
            opportunity.id === opportunityId
              ? {
                  ...opportunity,
                  contacts: opportunity.contacts.filter((entry) => entry.id !== linkId)
                }
              : opportunity
          )
        };
      });
      setStatus({ kind: "ok", text: "Opportunity contact removed." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to remove opportunity contact."
      });
    } finally {
      setDeletingOpportunityContactByLinkId((current) => ({ ...current, [linkId]: false }));
    }
  }

  function openAddNoteForOpportunity(opportunityId: string) {
    setNewNoteOpportunityId(opportunityId);
    setShowAddNoteModal(true);
  }

  function openCreateOpportunityModal() {
    if (!item) return;
    setNewOpportunityDraft({
      type: defaultOpportunityTypeForItem(item),
      stage: "IDENTIFIED",
      healthSystemId: "",
      likelihoodPercent: String(defaultLikelihoodForStage("IDENTIFIED")),
      amountUsd: "",
      contractPriceUsd: "",
      estimatedCloseDate: "",
      closedAt: "",
      closeReason: "",
      nextSteps: "",
      notes: ""
    });
    setOpportunityModal({ mode: "create" });
    setOpportunityModalTab("details");
  }

  function openEditOpportunityModal(opportunityId: string) {
    setOpportunityModal({ mode: "edit", opportunityId });
    setOpportunityModalTab("details");
  }

  function closeOpportunityModal() {
    setOpportunityModal(null);
    setOpportunityModalTab("details");
  }

  async function addPipelineNote() {
    if (!item || addingNote) return;
    const trimmed = newNoteDraft.trim();
    if (!trimmed) {
      setStatus({ kind: "error", text: "Enter a note before saving." });
      return;
    }

    setAddingNote(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note: trimmed,
          opportunityId: newNoteOpportunityId || null
        })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add note");

      const createdNotePayload = payload.note as (PipelineOpportunityNote & { affiliations?: unknown }) | undefined;
      const createdNote = createdNotePayload
        ? {
            ...createdNotePayload,
            affiliations: parseNoteAffiliations(createdNotePayload.affiliations)
          }
        : undefined;
      if (!createdNote) throw new Error("Failed to add note");

      setItem((current) =>
        current
          ? {
              ...current,
              notes: [createdNote, ...current.notes]
            }
          : current
      );
      setNewNoteDraft("");
      setNewNoteOpportunityId("");
      setShowAddNoteModal(false);
      const propagatedCount = typeof payload.propagatedCount === "number" ? payload.propagatedCount : 0;
      setStatus({
        kind: "ok",
        text: propagatedCount > 0 ? `Note added and propagated to ${propagatedCount} linked record(s).` : "Note added."
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add note"
      });
    } finally {
      setAddingNote(false);
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
      setShowAddQualitativeFeedbackModal(false);
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
        setShowAddDocumentModal(false);
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
      setShowAddDocumentModal(false);
    }
  }

  async function generateIntakeReport(force: boolean) {
    if (!item) return;
    if (force && !window.confirm("Recreate the Intake Document and replace the existing one?")) {
      return;
    }

    setIntakeReportGenerationMode(force ? "recreate" : "generate");
    setIntakeReportGenerationStartedAt(Date.now());
    setIntakeReportElapsedSeconds(0);
    setIsGeneratingIntakeReport(true);
    setStatus(null);
    setLastGenerateStatus(force ? "Recreating intake report..." : "Generating intake report...");

    try {
      const res = await fetch(`/api/pipeline/opportunities/${item.id}/intake-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force })
      });
      const payload = await res.json();

      if (!res.ok) {
        if (res.status === 409 && payload?.document) {
          setStatus({
            kind: "error",
            text: payload.error || "An intake report already exists. Recreate it to replace the existing document."
          });
          return;
        }
        throw new Error(payload.error || "Failed to generate intake report.");
      }

      const created = payload.document as PipelineOpportunityDetail["documents"][number] | undefined;
      const storageHint = typeof payload.storageHint === "string" ? payload.storageHint.trim() : "";
      if (!created) {
        throw new Error("Failed to generate intake report.");
      }

      setItem((current) => {
        if (!current) return current;
        const filteredDocuments = force
          ? current.documents.filter((document) => document.type !== "INTAKE_REPORT")
          : current.documents;
        return {
          ...current,
          documents: [created, ...filteredDocuments]
        };
      });

      setStatus({
        kind: "ok",
        text: [
          force ? "Intake report recreated." : "Intake report generated.",
          storageHint
        ]
          .filter(Boolean)
          .join(" ")
      });
      const summary =
        (force ? "Intake report recreated." : "Intake report generated.") +
        (storageHint ? ` ${storageHint}` : "");
      setLastGenerateStatus(summary);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to generate intake report."
      });
      setLastGenerateStatus(null);
    } finally {
      setIsGeneratingIntakeReport(false);
      setIntakeReportGenerationMode(null);
      setIntakeReportGenerationStartedAt(null);
      setIntakeReportElapsedSeconds(0);
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

  const sortedNotes = [...item.notes].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    if (Number.isNaN(left) && Number.isNaN(right)) return b.id.localeCompare(a.id);
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    if (right !== left) return right - left;
    return b.id.localeCompare(a.id);
  });
  const sortedDocuments = [...item.documents].sort((a, b) => {
    const left = new Date(a.uploadedAt).getTime();
    const right = new Date(b.uploadedAt).getTime();
    if (Number.isNaN(left) && Number.isNaN(right)) return b.id.localeCompare(a.id);
    if (Number.isNaN(left)) return 1;
    if (Number.isNaN(right)) return -1;
    if (right !== left) return right - left;
    return b.id.localeCompare(a.id);
  });
  const intakeReportProgressLabel =
    intakeReportGenerationMode === "recreate" ? "Recreating Intake Document" : "Generating Intake Document";
  const intakeReportProgressIndicator = isGeneratingIntakeReport ? (
    <div className="intake-report-progress" role="status" aria-live="polite">
      <div className="intake-report-progress-header">
        <span className="status-pill running">{intakeReportProgressLabel}</span>
        <span className="muted">{`Working... ${intakeReportElapsedSeconds}s`}</span>
      </div>
      <div
        className="progress-track intake-report-progress-track"
        role="progressbar"
        aria-label={intakeReportProgressLabel}
        aria-busy="true"
      >
        <div className="progress-indicator intake-report-progress-indicator" />
      </div>
    </div>
  ) : null;

  const quantitativeSlideSectionsResult = (() => {
    type QuantitativeResponseAggregate = {
      metric: string;
      responseCount: number;
      responses: QuantitativeSlideResponse[];
    };

    const responseMapByCategory = new Map<string, Map<string, QuantitativeResponseAggregate>>();
    const responseCategoryByKey = new Map<string, string>();
    const questionCategoryNames = new Set(
      quantitativeQuestionCategories.map((section) => normalizeCategoryKey(canonicalizeQuantitativeCategory(section.category)))
    );
    const supplementalQuantitativeResponses = item.screening.supplementalQuantitativeResponses || [];

    for (const healthSystem of item.screening.healthSystems) {
      for (const entry of healthSystem.quantitativeFeedback) {
        if (entry.isDeprecatedQuestion && (entry.score === null || !Number.isFinite(entry.score))) continue;
        const category = canonicalizeQuantitativeCategory(entry.category?.trim() || "Uncategorized");
        const categoryKey = normalizeCategoryKey(category);
        const metric = entry.metric?.trim() || "Untitled question";
        const metricKey = normalizeMetricKey(metric);
        const categoryMap =
          responseMapByCategory.get(categoryKey) || new Map<string, QuantitativeResponseAggregate>();
        if (!responseCategoryByKey.has(categoryKey)) {
          responseCategoryByKey.set(categoryKey, category);
        }
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
        responseMapByCategory.set(categoryKey, categoryMap);
      }
    }

    for (const entry of supplementalQuantitativeResponses) {
      if (entry.isDeprecatedQuestion && (entry.score === null || !Number.isFinite(entry.score))) continue;
      const category = canonicalizeQuantitativeCategory(entry.category?.trim() || "Uncategorized");
      const categoryKey = normalizeCategoryKey(category);
      const metric = entry.metric?.trim() || "Untitled question";
      const metricKey = normalizeMetricKey(metric);
      const categoryMap =
        responseMapByCategory.get(categoryKey) || new Map<string, QuantitativeResponseAggregate>();
      if (!responseCategoryByKey.has(categoryKey)) {
        responseCategoryByKey.set(categoryKey, category);
      }
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
          institution: entry.institutionName || "Unlinked survey response"
        });
      }

      categoryMap.set(metricKey, row);
      responseMapByCategory.set(categoryKey, categoryMap);
    }

    const sectionsFromQuestionSet = quantitativeQuestionCategories.map((section) => {
      const canonicalCategory = canonicalizeQuantitativeCategory(section.category);
      const categoryKey = normalizeCategoryKey(canonicalCategory);
      const categoryResponseMap =
        responseMapByCategory.get(categoryKey) || new Map<string, QuantitativeResponseAggregate>();
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
        category: canonicalCategory,
        categoryAverageScore,
        rows
      };
    });

    const sectionsFromResponseOnlyCategories: QuantitativeSlideCategorySection[] = Array.from(
      responseMapByCategory.entries()
    )
      .filter(([category]) => !questionCategoryNames.has(category))
      .map(([category, metrics]) => {
        const categoryLabel = responseCategoryByKey.get(category) || category;
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
          category: categoryLabel,
          categoryAverageScore,
          rows
        };
      });

    const sectionsByCategory = new Map<string, QuantitativeSlideCategorySection>();
    const mergeRowsByCategory = (target: QuantitativeSlideCategorySection, incoming: QuantitativeSlideCategorySection) => {
      const metricByKey = new Map<string, QuantitativeSlideQuestionRow>([
        ...target.rows.map((row) => [normalizeMetricKey(row.metric), row] as const)
      ]);

      for (const incomingRow of incoming.rows) {
        const metricKey = normalizeMetricKey(incomingRow.metric);
        const existingRow = metricByKey.get(metricKey);
        if (!existingRow) {
          target.rows.push(incomingRow);
          metricByKey.set(metricKey, incomingRow);
          continue;
        }

        const existingResponseById = new Map(
          existingRow.responses.map((response) => [response.id, response] as const)
        );
        for (const response of incomingRow.responses) {
          if (!existingResponseById.has(response.id)) {
            existingRow.responses.push(response);
          }
        }
        existingRow.responseCount = existingRow.responses.length;
        const numericScores = existingRow.responses.map((response) => response.score);
        existingRow.averageScore =
          numericScores.length > 0
            ? Math.round((numericScores.reduce((sum, score) => sum + score, 0) / numericScores.length) * 10) /
              10
            : null;
      }

      const categoryScores = target.rows.flatMap((row) => row.responses.map((response) => response.score));
      target.categoryAverageScore =
        categoryScores.length > 0
          ? Math.round((categoryScores.reduce((sum, score) => sum + score, 0) / categoryScores.length) * 10) / 10
          : null;
      target.rows.sort((a, b) => a.metric.localeCompare(b.metric));
      target.rows.sort((a, b) => {
        const left = normalizeMetricKey(a.metric);
        const right = normalizeMetricKey(b.metric);
        if (left !== right) return left.localeCompare(right);
        if (a.isUnmapped !== b.isUnmapped) return a.isUnmapped ? 1 : -1;
        return a.metric.localeCompare(b.metric);
      });
    };

    for (const section of [...sectionsFromQuestionSet, ...sectionsFromResponseOnlyCategories]) {
      if (section.rows.length === 0) continue;
      const categoryKey = normalizeCategoryKey(canonicalizeQuantitativeCategory(section.category));
      const existing = sectionsByCategory.get(categoryKey);
      if (!existing) {
        sectionsByCategory.set(categoryKey, {
          category: section.category,
          categoryAverageScore: section.categoryAverageScore,
          rows: [...section.rows]
        });
        continue;
      }
      mergeRowsByCategory(existing, section);
    }

    const sections = Array.from(sectionsByCategory.values())
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
  const marketLandscapeGuide = marketLandscapeBodyFieldGuide[marketLandscapeDraft.template];
  const marketLandscapeCardByKey = new Map(
    marketLandscapeDraft.cards.map((card) => [card.key, card] as const)
  );

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
          {showOpportunitiesTab ? (
            <button
              type="button"
              role="tab"
              className={`detail-tab ${activeIntakeDetailTab === "opportunities" ? "active" : ""}`}
              aria-selected={activeIntakeDetailTab === "opportunities"}
              onClick={() => setActiveIntakeDetailTab("opportunities")}
            >
              Opportunities
            </button>
          ) : null}
          {item.isScreeningStage ? (
            <button
              type="button"
              role="tab"
              className={`detail-tab ${activeIntakeDetailTab === "screening-materials" ? "active" : ""}`}
              aria-selected={activeIntakeDetailTab === "screening-materials"}
              onClick={() => setActiveIntakeDetailTab("screening-materials")}
            >
              Screening Materials
            </button>
          ) : null}
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "intake-materials" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "intake-materials"}
            onClick={() => setActiveIntakeDetailTab("intake-materials")}
          >
            Intake Materials
          </button>
          <button
            type="button"
            role="tab"
            className={`detail-tab ${activeIntakeDetailTab === "reports" ? "active" : ""}`}
            aria-selected={activeIntakeDetailTab === "reports"}
            onClick={() => setActiveIntakeDetailTab("reports")}
          >
            Reports
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
        <div className="pipeline-detail-tab-panel">

        {activeIntakeDetailTab === "pipeline-status" || (activeIntakeDetailTab === "opportunities" && showOpportunitiesTab) ? (
          <>
            {activeIntakeDetailTab === "pipeline-status" ? (
              <>
                <h2>Pipeline Status</h2>
            <div className="row">
              <div>
                <InlineSelectField
                  label="Current Stage"
                  value={item.column || mapPhaseToBoardColumn(item.phase) || "INTAKE"}
                  options={PIPELINE_BOARD_COLUMNS.map((column) => ({
                    value: column.key,
                    label: column.label
                  }))}
                  onSave={(nextValue) => {
                    const nextColumn = nextValue as PipelineBoardColumn;
                    if (!savingPhase) {
                      void updateColumn(nextColumn);
                    }
                  }}
                />
              </div>
              <div>
                <div className="inline-edit-field pipeline-status-readonly-field">
                  <label>Pipeline Phase</label>
                  <div className="pipeline-status-readonly-value">{item.phaseLabel || "Not set"}</div>
                </div>
              </div>
            </div>

            <div className="row">
              <div>
                <div className="inline-edit-field pipeline-status-readonly-field">
                  <label>Website</label>
                  <div className="pipeline-status-readonly-value">{item.website || "Not set"}</div>
                </div>
              </div>
              <div>
                <InlineTextField
                  label="Likelihood to Close (%)"
                  value={
                    item.ventureLikelihoodPercent === null || item.ventureLikelihoodPercent === undefined
                      ? ""
                      : String(item.ventureLikelihoodPercent)
                  }
                  inputType="number"
                  placeholder="0-100"
                  onSave={(nextValue) => void saveVentureLikelihood(nextValue)}
                />
              </div>
            </div>
            <div className="row">
              <div>
                <InlineTextField
                  label="Intake Decision Date"
                  value={toDateInputValue(item.intakeDecisionAt)}
                  inputType="date"
                  dateDebugContext={{ scope: "pipeline-opportunity-detail.date", itemId: item.id, field: "intakeDecisionAt" }}
                  onSave={(nextValue) => void saveIntakeDecisionDate(nextValue)}
                />
              </div>
              <div>
                <InlineTextField
                  label="VS Contract Executed"
                  value={toDateInputValue(item.ventureStudioContractExecutedAt)}
                  inputType="date"
                  dateDebugContext={{
                    scope: "pipeline-opportunity-detail.date",
                    itemId: item.id,
                    field: "ventureStudioContractExecutedAt"
                  }}
                  onSave={(nextValue) => void saveVentureStudioContractExecutedDate(nextValue)}
                />
              </div>
            </div>
            {item.column !== "INTAKE" ? (
              <div className="row">
                <div>
                  <InlineTextField
                    label="Screening Webinar Date 1"
                    value={toDateInputValue(item.screeningWebinarDate1At)}
                    inputType="date"
                    dateDebugContext={{
                      scope: "pipeline-opportunity-detail.date",
                      itemId: item.id,
                      field: "screeningWebinarDate1At"
                    }}
                    onSave={(nextValue) => void saveScreeningWebinarDate1(nextValue)}
                  />
                </div>
                <div>
                  <InlineTextField
                    label="Screening Webinar Date 2"
                    value={toDateInputValue(item.screeningWebinarDate2At)}
                    inputType="date"
                    dateDebugContext={{
                      scope: "pipeline-opportunity-detail.date",
                      itemId: item.id,
                      field: "screeningWebinarDate2At"
                    }}
                    onSave={(nextValue) => void saveScreeningWebinarDate2(nextValue)}
                  />
                </div>
              </div>
            ) : null}
                <div className="pipeline-status-single-field">
                  <InlineTextField
                    label="Estimated Close Date"
                    value={toDateInputValue(item.ventureExpectedCloseDate)}
                    inputType="date"
                    dateDebugContext={{
                      scope: "pipeline-opportunity-detail.date",
                      itemId: item.id,
                      field: "ventureExpectedCloseDate"
                    }}
                    onSave={(nextValue) => void saveVentureExpectedCloseDate(nextValue)}
                  />
                </div>

                <div className="detail-section">
                  <p className="detail-label">Opportunity Lifecycle</p>
                  <div className="detail-grid">
                    <div className="inline-edit-field pipeline-status-readonly-field">
                      <label>Open</label>
                      <div className="pipeline-status-readonly-value">{opportunityLifecycleCounts.open}</div>
                    </div>
                    <div className="inline-edit-field pipeline-status-readonly-field">
                      <label>Won</label>
                      <div className="pipeline-status-readonly-value">{opportunityLifecycleCounts.won}</div>
                    </div>
                    <div className="inline-edit-field pipeline-status-readonly-field">
                      <label>Lost</label>
                      <div className="pipeline-status-readonly-value">{opportunityLifecycleCounts.lost}</div>
                    </div>
                  </div>
                </div>

                {descriptionPlainText ? (
                  <div className="pipeline-status-stacked-field">
                    <label>Description</label>
                    <div className="pipeline-status-description-scroll">{descriptionPlainText}</div>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeIntakeDetailTab === "opportunities" && showOpportunitiesTab ? (
              <>
                <h2>Opportunities</h2>
                <div className="detail-section">
                  <p className="detail-label">Open Opportunities</p>
                  <p className="muted">
                    Click an opportunity name to open details. Update Next Steps inline from this list.
                  </p>
                  <button type="button" className="opportunity-add-link" onClick={openCreateOpportunityModal}>
                    + Add new opportunity
                  </button>

                  {openOpportunities.length === 0 ? <p className="muted">No open opportunities yet.</p> : null}

                  {openOpportunities.length > 0 ? (
                    <div className="opportunity-list">
                      <div className="opportunity-list-header">
                        <span>Opportunity</span>
                        <span>Health System</span>
                        <span>Likelihood</span>
                        <span>Duration</span>
                        <span>Est. Close</span>
                        <span>Next Steps</span>
                        <span>Add a Note</span>
                        <span>Last Modified</span>
                      </div>
                      {openOpportunities.map((opportunity) => {
                        const draft = opportunityDraftById[opportunity.id] || toOpportunityDraft(opportunity);
                        const availableHealthSystems = item.screening.healthSystems.map((entry) => ({
                          id: entry.healthSystemId,
                          name: entry.healthSystemName
                        }));
                        if (
                          opportunity.healthSystem &&
                          !availableHealthSystems.some((entry) => entry.id === opportunity.healthSystem?.id)
                        ) {
                          availableHealthSystems.push({
                            id: opportunity.healthSystem.id,
                            name: opportunity.healthSystem.name
                          });
                        }
                        const opportunityTypeLabel =
                          opportunityTypeOptions.find((entry) => entry.value === opportunity.type)?.label ||
                          opportunity.type;
                        const opportunityStageLabel =
                          opportunityStageOptions.find((entry) => entry.value === opportunity.stage)?.label ||
                          opportunity.stage;
                        const healthSystemName =
                          availableHealthSystems.find((healthSystem) => healthSystem.id === draft.healthSystemId)
                            ?.name || "No health system";
                        const estimatedCloseLabel = draft.estimatedCloseDate
                          ? formatDate(draft.estimatedCloseDate)
                          : opportunity.estimatedCloseDate
                            ? formatDate(opportunity.estimatedCloseDate)
                            : "—";

                        return (
                          <div key={opportunity.id} className="opportunity-list-row">
                            <div className="opportunity-list-cell opportunity-list-opportunity">
                              <button
                                type="button"
                                className="opportunity-name-link"
                                onClick={() => openEditOpportunityModal(opportunity.id)}
                              >
                                {opportunity.title}
                              </button>
                              <p className="muted">
                                {opportunityTypeLabel} · {opportunityStageLabel}
                              </p>
                            </div>
                            <div className="opportunity-list-cell">{healthSystemName}</div>
                            <div className="opportunity-list-cell">
                              {draft.likelihoodPercent ? `${draft.likelihoodPercent}%` : "—"}
                            </div>
                            <div className="opportunity-list-cell">
                              {computeOpportunityDurationDays(opportunity.createdAt, opportunity.closedAt) ?? "—"}
                            </div>
                            <div className="opportunity-list-cell">{estimatedCloseLabel}</div>
                            <div className="opportunity-list-cell opportunity-list-next-steps">
                              <textarea
                                rows={2}
                                value={draft.nextSteps}
                                onChange={(event) =>
                                  updateOpportunityDraft(opportunity.id, {
                                    nextSteps: event.target.value
                                  })
                                }
                                onBlur={() => void saveOpportunity(opportunity.id)}
                                onKeyDown={(event) => {
                                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                                    event.preventDefault();
                                    (event.currentTarget as HTMLTextAreaElement).blur();
                                  }
                                }}
                                placeholder="Add next steps..."
                                className="opportunity-next-steps-input"
                              />
                              {savingOpportunityById[opportunity.id] ? (
                                <span className="opportunity-saving-indicator">Saving...</span>
                              ) : null}
                            </div>
                            <div className="opportunity-list-cell">
                              <button
                                type="button"
                                className="opportunity-inline-link"
                                onClick={() => openAddNoteForOpportunity(opportunity.id)}
                              >
                                Add note
                              </button>
                            </div>
                            <div className="opportunity-list-cell">{formatTimestamp(opportunity.updatedAt)}</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <button type="button" className="opportunity-add-link" onClick={openCreateOpportunityModal}>
                    + Add new opportunity
                  </button>
                </div>
              </>
            ) : null}
          </>
	        ) : null}

        {activeIntakeDetailTab === "intake-materials" ? (
          <div className="detail-tabs detail-subtabs" role="tablist" aria-label="Intake materials sections">
            <button
              type="button"
              role="tab"
              className={`detail-tab ${activeIntakeMaterialsTab === "at-a-glance" ? "active" : ""}`}
              aria-selected={activeIntakeMaterialsTab === "at-a-glance"}
              onClick={() => setActiveIntakeMaterialsTab("at-a-glance")}
            >
              At-A-Glance
            </button>
            <button
              type="button"
              role="tab"
              className={`detail-tab ${activeIntakeMaterialsTab === "venture-studio-criteria" ? "active" : ""}`}
              aria-selected={activeIntakeMaterialsTab === "venture-studio-criteria"}
              onClick={() => setActiveIntakeMaterialsTab("venture-studio-criteria")}
            >
              VS Criteria
            </button>
            <button
              type="button"
              role="tab"
              className={`detail-tab ${activeIntakeMaterialsTab === "market-landscape" ? "active" : ""}`}
              aria-selected={activeIntakeMaterialsTab === "market-landscape"}
              onClick={() => setActiveIntakeMaterialsTab("market-landscape")}
            >
              Market Landscape
            </button>
            <button
              type="button"
              role="tab"
              className={`detail-tab ${activeIntakeMaterialsTab === "market-landscape-option-1" ? "active" : ""}`}
              aria-selected={activeIntakeMaterialsTab === "market-landscape-option-1"}
              onClick={() => setActiveIntakeMaterialsTab("market-landscape-option-1")}
            >
              Market Landscape Option 1
            </button>
          </div>
        ) : null}

        {activeIntakeDetailTab === "intake-materials" && activeIntakeMaterialsTab === "at-a-glance" ? (
          <>
            <h2>At-A-Glance</h2>
            <div className="actions" style={{ marginTop: 0 }}>
              <button className="secondary small" type="button" onClick={openAtAGlancePreview}>
                Preview Format
              </button>
            </div>
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
                    stripFormattingOnPaste
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

        {activeIntakeDetailTab === "intake-materials" && activeIntakeMaterialsTab === "venture-studio-criteria" ? (
          <>
            <h2>Venture Studio Criteria</h2>
            <div className="actions" style={{ marginTop: 0 }}>
              <button className="secondary small" type="button" onClick={openVentureStudioCriteriaPreview}>
                Preview Format
              </button>
            </div>
            <p className="muted">Capture each fixed criterion with an assessment and rationale.</p>
            <div className="venture-studio-criteria-table-wrap">
              <table className="venture-studio-criteria-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Criteria</th>
                    <th>Assessment</th>
                    <th>Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {ventureStudioCriteriaDraft.map((row) => (
                    <tr key={row.category}>
                      <td className="venture-studio-criteria-category">{row.category}</td>
                      <td className="venture-studio-criteria-criteria">{row.criteria}</td>
                      <td>
                        <select
                          className="venture-studio-criteria-select"
                          title={formatVentureStudioAssessmentLabel(row.assessment)}
                          value={row.assessment}
                          style={{ color: ventureStudioAssessmentColorByValue[row.assessment] }}
                          onChange={(event) =>
                            setVentureStudioCriteriaDraft((current) =>
                              current.map((entry) =>
                                entry.category === row.category
                                  ? {
                                      ...entry,
                                      assessment: event.target.value as VentureStudioAssessment
                                    }
                                  : entry
                              )
                            )
                          }
                        >
                          {ventureStudioAssessmentOptions.map((option) => (
                            <option
                              key={option.value}
                              value={option.value}
                              title={formatVentureStudioAssessmentLabel(option.value)}
                              style={{ color: ventureStudioAssessmentColorByValue[option.value] }}
                            >
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <RichTextArea
                          className="venture-studio-criteria-rationale-editor"
                          value={row.rationale}
                          stripFormattingOnPaste
                          onChange={(nextValue) =>
                            setVentureStudioCriteriaDraft((current) =>
                              current.map((entry) =>
                                entry.category === row.category ? { ...entry, rationale: nextValue } : entry
                              )
                            )
                          }
                          rows={5}
                          placeholder="Enter rationale"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() => void saveVentureStudioCriteria()}
                disabled={savingVentureStudioCriteria}
              >
                {savingVentureStudioCriteria ? "Saving..." : "Save Venture Studio Criteria"}
              </button>
            </div>
            <div className="venture-studio-criteria-footnote">
              <p className="detail-label">Assessment meaning</p>
              <ul>
                {ventureStudioAssessmentDescriptions.map((option) => (
                  <li key={option.value}>
                    <span className={`venture-studio-assessment-dot ${option.value}`}></span> {option.description}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {activeIntakeDetailTab === "intake-materials" && activeIntakeMaterialsTab === "market-landscape" ? (
          <>
            <h2>Market Landscape</h2>
            <p className="muted">Use the structured editor to build a 2x2 market map and preview it live.</p>
            <div className="market-landscape-layout">
              <div className="market-landscape-form-panel">
                <div className="market-landscape-meta-grid">
                  <div>
                    <label>Section Label</label>
                    <input
                      value={marketLandscapeDraft.sectionLabel}
                      maxLength={80}
                      onChange={(event) =>
                        setMarketLandscapeDraft((current) => ({ ...current, sectionLabel: event.target.value }))
                      }
                      placeholder="Market Landscape"
                    />
                  </div>
                  <div>
                    <label>Template</label>
                    <select
                      value={marketLandscapeDraft.template}
                      onChange={(event) =>
                        setMarketLandscapeDraft((current) => ({
                          ...current,
                          template: event.target.value as MarketLandscapePayload["template"]
                        }))
                      }
                    >
                      {marketLandscapeTemplateOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="market-landscape-meta-grid-full">
                    <label>Headline</label>
                    <input
                      value={marketLandscapeDraft.headline}
                      maxLength={180}
                      onChange={(event) =>
                        setMarketLandscapeDraft((current) => ({ ...current, headline: event.target.value }))
                      }
                      placeholder="Headline shown at top of the slide"
                    />
                  </div>
                  <div className="market-landscape-meta-grid-full">
                    <label>Subheadline</label>
                    <input
                      value={marketLandscapeDraft.subheadline}
                      maxLength={220}
                      onChange={(event) =>
                        setMarketLandscapeDraft((current) => ({ ...current, subheadline: event.target.value }))
                      }
                      placeholder="Optional framing line under the headline"
                    />
                  </div>
                </div>

                <div className="market-landscape-axis-grid">
                  <div>
                    <label>X Axis Label</label>
                    <input
                      value={marketLandscapeDraft.xAxisLabel}
                      maxLength={80}
                      onChange={(event) =>
                        setMarketLandscapeDraft((current) => ({ ...current, xAxisLabel: event.target.value }))
                      }
                      placeholder="Product Category"
                    />
                  </div>
                  <div>
                    <label>Y Axis Label</label>
                    <input
                      value={marketLandscapeDraft.yAxisLabel}
                      maxLength={80}
                      onChange={(event) =>
                        setMarketLandscapeDraft((current) => ({ ...current, yAxisLabel: event.target.value }))
                      }
                      placeholder="Differentiation"
                    />
                  </div>
                  <div>
                    <label>Column 1</label>
                    <input
                      value={marketLandscapeDraft.columnLabels[0]}
                      maxLength={80}
                      onChange={(event) => updateMarketLandscapeColumnLabel(0, event.target.value)}
                    />
                  </div>
                  <div>
                    <label>Column 2</label>
                    <input
                      value={marketLandscapeDraft.columnLabels[1]}
                      maxLength={80}
                      onChange={(event) => updateMarketLandscapeColumnLabel(1, event.target.value)}
                    />
                  </div>
                  <div>
                    <label>Row 1</label>
                    <input
                      value={marketLandscapeDraft.rowLabels[0]}
                      maxLength={80}
                      onChange={(event) => updateMarketLandscapeRowLabel(0, event.target.value)}
                    />
                  </div>
                  <div>
                    <label>Row 2</label>
                    <input
                      value={marketLandscapeDraft.rowLabels[1]}
                      maxLength={80}
                      onChange={(event) => updateMarketLandscapeRowLabel(1, event.target.value)}
                    />
                  </div>
                  <div className="market-landscape-axis-grid-full">
                    <label>Primary Focus Cell</label>
                    <select
                      value={marketLandscapeDraft.primaryFocusCellKey}
                      onChange={(event) =>
                        setMarketLandscapeDraft((current) => ({
                          ...current,
                          primaryFocusCellKey: event.target.value as MarketLandscapeCellKey | ""
                        }))
                      }
                    >
                      <option value="">None</option>
                      {marketLandscapeCellKeys.map((cellKey, index) => {
                        const rowIndex = index < 2 ? 0 : 1;
                        const columnIndex = index % 2;
                        return (
                          <option key={cellKey} value={cellKey}>
                            {`${marketLandscapeDraft.rowLabels[rowIndex]} / ${marketLandscapeDraft.columnLabels[columnIndex]}`}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <p className="muted market-landscape-guidance">
                  Keep each card concise to avoid overflow in the generated slide.
                </p>

                <div className="market-landscape-card-editor-list">
                  {marketLandscapeCellKeys.map((cellKey, index) => {
                    const card = marketLandscapeCardByKey.get(cellKey);
                    if (!card) return null;
                    const rowIndex = index < 2 ? 0 : 1;
                    const columnIndex = index % 2;
                    return (
                      <article key={cellKey} className="market-landscape-card-editor">
                        <h3>{`${marketLandscapeDraft.rowLabels[rowIndex]} / ${marketLandscapeDraft.columnLabels[columnIndex]}`}</h3>
                        <label>Card Title</label>
                        <input
                          value={card.title}
                          maxLength={120}
                          onChange={(event) => updateMarketLandscapeCardField(card.key, "title", event.target.value)}
                          placeholder="Category title"
                        />
                        <label>{marketLandscapeGuide.primaryLabel}</label>
                        <RichTextArea
                          className="market-landscape-card-rich-editor"
                          value={card[marketLandscapeGuide.primaryField]}
                          rows={4}
                          stripFormattingOnPaste
                          onChange={(nextValue) =>
                            updateMarketLandscapeCardField(card.key, marketLandscapeGuide.primaryField, nextValue)
                          }
                          placeholder={marketLandscapeGuide.primaryLabel}
                        />
                        <label>{marketLandscapeGuide.secondaryLabel}</label>
                        <RichTextArea
                          className="market-landscape-card-rich-editor"
                          value={card[marketLandscapeGuide.secondaryField]}
                          rows={3}
                          stripFormattingOnPaste
                          onChange={(nextValue) =>
                            updateMarketLandscapeCardField(card.key, marketLandscapeGuide.secondaryField, nextValue)
                          }
                          placeholder={marketLandscapeGuide.secondaryLabel}
                        />
                        <label>Illustrative Vendors</label>
                        <input
                          value={card.vendors}
                          maxLength={220}
                          onChange={(event) => updateMarketLandscapeCardField(card.key, "vendors", event.target.value)}
                          placeholder="Vendor A, Vendor B, Vendor C"
                        />
                      </article>
                    );
                  })}
                </div>

                <div className="actions">
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => void saveMarketLandscape()}
                    disabled={savingMarketLandscape}
                  >
                    {savingMarketLandscape ? "Saving..." : "Save Market Landscape"}
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={() =>
                      setMarketLandscapeDraft(
                        defaultMarketLandscapePayload(item.name || undefined)
                      )
                    }
                  >
                    Reset to Default Layout
                  </button>
                </div>
              </div>

              <aside className="market-landscape-preview-panel">
                <p className="market-landscape-preview-eyebrow">{marketLandscapeDraft.sectionLabel || "Market Landscape"}</p>
                <h3>{marketLandscapeDraft.headline || "Market landscape headline"}</h3>
                <p className="muted">{marketLandscapeDraft.subheadline || "Add a short context sentence."}</p>
                <div className="market-landscape-preview-matrix">
                  <div className="market-landscape-preview-y-axis">{marketLandscapeDraft.yAxisLabel || "Y Axis"}</div>
                  <div>
                    <div className="market-landscape-preview-col-labels">
                      <span>{marketLandscapeDraft.columnLabels[0] || "Column 1"}</span>
                      <span>{marketLandscapeDraft.columnLabels[1] || "Column 2"}</span>
                    </div>
                    <div className="market-landscape-preview-board">
                      <div className="market-landscape-preview-row-labels">
                        <span>{marketLandscapeDraft.rowLabels[0] || "Row 1"}</span>
                        <span>{marketLandscapeDraft.rowLabels[1] || "Row 2"}</span>
                      </div>
                      <div className="market-landscape-preview-grid">
                        {marketLandscapeGridRows.flatMap((row, rowIndex) =>
                          row.map((cellKey, columnIndex) => {
                            const card = marketLandscapeCardByKey.get(cellKey);
                            if (!card) return null;
                            const primaryContent = card[marketLandscapeGuide.primaryField] || "Not provided";
                            const secondaryContent = card[marketLandscapeGuide.secondaryField] || "Not provided";
                            const label = `${marketLandscapeDraft.rowLabels[rowIndex]} / ${marketLandscapeDraft.columnLabels[columnIndex]}`;
                            const isPrimary = marketLandscapeDraft.primaryFocusCellKey === cellKey;
                            return (
                              <article
                                key={`preview-${cellKey}`}
                                className={`market-landscape-preview-card ${isPrimary ? "primary" : ""}`}
                              >
                                <p className="market-landscape-preview-cell-label">{label}</p>
                                <h4>{card.title || "Untitled category"}</h4>
                                <p>
                                  <strong>{marketLandscapeGuide.primaryLabel}:</strong>
                                </p>
                                <div
                                  className="market-landscape-preview-rich-text"
                                  dangerouslySetInnerHTML={{ __html: normalizeRichText(primaryContent) }}
                                />
                                <p>
                                  <strong>{marketLandscapeGuide.secondaryLabel}:</strong>
                                </p>
                                <div
                                  className="market-landscape-preview-rich-text"
                                  dangerouslySetInnerHTML={{ __html: normalizeRichText(secondaryContent) }}
                                />
                                <p>
                                  <strong>Illustrative Vendors:</strong> {card.vendors || "Not provided"}
                                </p>
                              </article>
                            );
                          })
                        )}
                      </div>
                      <p className="market-landscape-preview-x-axis">{marketLandscapeDraft.xAxisLabel || "X Axis"}</p>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </>
        ) : null}

        {activeIntakeDetailTab === "intake-materials" && activeIntakeMaterialsTab === "market-landscape-option-1" ? (
          <>
            <h2>Market Landscape Option 1</h2>
            <p className="muted">
              Edit the Market Landscape slide directly in Google Slides (free-form). This tab provides a link + live
              thumbnail. Changes won&apos;t sync back to the structured editor, and will be lost if you recreate the Intake
              Document.
            </p>

            <div className="actions">
              {currentIntakeDocument ? (
                <>
                  {marketLandscapeOption1Info?.kind === "ok" && marketLandscapeOption1Info.slideEditUrl ? (
                    <a
                      className="secondary small"
                      href={marketLandscapeOption1Info.slideEditUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open Option 1 Slide
                    </a>
                  ) : null}
                  <a className="ghost small" href={currentIntakeDocument.url} target="_blank" rel="noreferrer">
                    Open Intake Document
                  </a>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => {
                      setMarketLandscapeOption1ThumbnailNonce((value) => value + 1);
                      void loadMarketLandscapeOption1();
                    }}
                    disabled={loadingMarketLandscapeOption1}
                  >
                    {loadingMarketLandscapeOption1 ? "Refreshing..." : "Refresh Preview"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary small"
                  onClick={() => void generateIntakeReport(false)}
                  disabled={isGeneratingIntakeReport}
                >
                  {isGeneratingIntakeReport ? "Generating..." : "Generate Intake Document"}
                </button>
              )}
            </div>
            {intakeReportProgressIndicator}

            {marketLandscapeOption1Error ? <p className="muted">{marketLandscapeOption1Error}</p> : null}

            {marketLandscapeOption1Info?.kind === "missing_intake_document" ? (
              <p className="muted">Generate an Intake Document first to enable Option 1.</p>
            ) : null}

            {marketLandscapeOption1Info?.kind === "invalid_intake_document" ? (
              <p className="muted">{marketLandscapeOption1Info.message || "Intake Document URL is invalid."}</p>
            ) : null}

            {marketLandscapeOption1Info?.kind === "ok" && marketLandscapeOption1Info.thumbnailUrl ? (
              <div className="market-landscape-option1-preview">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${marketLandscapeOption1Info.thumbnailUrl}?refresh=1&t=${marketLandscapeOption1ThumbnailNonce}`}
                  alt="Market Landscape slide preview"
                  loading="lazy"
                />
              </div>
            ) : null}

            {marketLandscapeOption1Info?.kind === "ok" && !marketLandscapeOption1Info.thumbnailUrl ? (
              <p className="muted">
                Could not find the Market Landscape slide marker in this Intake Document. Open the Intake Document to
                confirm the Market Landscape slide exists.
              </p>
            ) : null}
          </>
        ) : null}

        {activeIntakeDetailTab === "reports" ? (
          <>
            <h2>Reports</h2>
            <p className="muted">
              Build standardized Intake, Screening, and Opportunity reports with section-level edits, live preview, and PDF export.
            </p>
            <CompanyReportComposer companyId={item.id} companyName={item.name} />
          </>
        ) : null}

        {activeIntakeDetailTab === "notes" ? (
          <>
            <h2>Notes</h2>
            <div className="detail-action-bar">
              <a
                href="#"
                className="pipeline-action-link"
                onClick={(event) => {
                  event.preventDefault();
                  setShowAddNoteModal(true);
                }}
              >
                Add Note
              </a>
            </div>
            {sortedNotes.length === 0 ? <p className="muted">No notes yet.</p> : null}
            <div className="pipeline-doc-list">
              {sortedNotes.map((entry) => (
                <div key={entry.id} className="detail-list-item">
                  {entry.affiliations && entry.affiliations.length > 0 ? (
                    <div className="pipeline-note-affiliation-tags">
                      {entry.affiliations.map((affiliation) => (
                        <span
                          key={`${entry.id}:${affiliation.kind}:${affiliation.id}`}
                          className={`pipeline-note-affiliation-tag ${affiliation.kind}`}
                        >
                          <strong>{noteAffiliationKindLabel(affiliation.kind)}:</strong> {affiliation.label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div
                    className="inline-rich-text"
                    dangerouslySetInnerHTML={{ __html: normalizeRichText(entry.note || "") }}
                  />
                  <p className="muted">Added {formatDate(entry.createdAt)} by {entry.createdByName}</p>
                </div>
              ))}
            </div>
          </>
        ) : null}

        {activeIntakeDetailTab === "documents" ? (
          <>
            <h2>Documents</h2>
            <div className="detail-action-bar">
              <a
                href="#"
                className="pipeline-action-link"
                onClick={(event) => {
                  event.preventDefault();
                  setShowAddDocumentModal(true);
                }}
              >
                Add Document
              </a>
            </div>
            <div className="actions">
              {currentIntakeDocument ? (
                <>
                  <a
                    className="secondary small"
                    href={currentIntakeDocument.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open Intake Document
                  </a>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={() => void generateIntakeReport(true)}
                    disabled={isGeneratingIntakeReport}
                  >
                    {isGeneratingIntakeReport ? "Recreating..." : "Recreate Intake Document"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="primary small"
                  onClick={() => void generateIntakeReport(false)}
                  disabled={isGeneratingIntakeReport}
                >
                  {isGeneratingIntakeReport ? "Generating..." : "Generate Intake Document"}
                </button>
              )}
            </div>
            {intakeReportProgressIndicator}
            {lastGenerateStatus && !isGeneratingIntakeReport ? <p className="muted">{lastGenerateStatus}</p> : null}
            {sortedDocuments.length === 0 ? <p className="muted">No company-level documents.</p> : null}
            <div className="pipeline-doc-list">
              {sortedDocuments.map((document) => (
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

        {activeIntakeDetailTab === "screening-materials" && item.isScreeningStage ? (
          <>
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
            <>
              <div className="actions" style={{ marginTop: 0 }}>
                <button className="secondary small" type="button" onClick={openScreeningStatusPreview}>
                  Preview Format
                </button>
              </div>
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
            </>
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
                    <h3>Qualitative Data Entries</h3>
                    <div className="actions" style={{ marginTop: 0 }}>
                      <button
                        className="secondary small"
                        type="button"
                        onClick={() => setShowQualitativePreview((current) => !current)}
                      >
                        {showQualitativePreview ? "Hide Preview" : "Preview"}
                      </button>
                      <span className="status-pill queued">{`${allQualitativeFeedbackEntries.length} entries`}</span>
                    </div>
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
                      <button className="secondary small" type="button" onClick={openScreeningQuantitativePreview}>
                        Preview Format
                      </button>
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
                  <div className="detail-action-bar">
                    <a
                      href="#"
                      className="pipeline-action-link"
                      onClick={(event) => {
                        event.preventDefault();
                        setShowAddQualitativeFeedbackModal(true);
                      }}
                    >
                      Add Qualitative Feedback
                    </a>
                    <button className="secondary small" type="button" onClick={openScreeningQualitativePreview}>
                      Preview Format
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
          </>
        ) : null}
        </div>
      </section>

      {status ? <p className={`status ${status.kind}`}>{status.text}</p> : null}

      {opportunityModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={closeOpportunityModal}>
          <div
            className="pipeline-opportunity-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pipeline-card-head">
              <h3>{opportunityModal.mode === "create" ? "Add Opportunity" : selectedOpportunityForModal?.title || "Opportunity"}</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={closeOpportunityModal}
                aria-label="Close opportunity dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="detail-tabs detail-subtabs" role="tablist" aria-label="Opportunity detail sections">
              <button
                type="button"
                role="tab"
                className={`detail-tab ${opportunityModalTab === "details" ? "active" : ""}`}
                aria-selected={opportunityModalTab === "details"}
                onClick={() => setOpportunityModalTab("details")}
              >
                Details
              </button>
              {opportunityModal.mode === "edit" ? (
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${opportunityModalTab === "contacts" ? "active" : ""}`}
                  aria-selected={opportunityModalTab === "contacts"}
                  onClick={() => setOpportunityModalTab("contacts")}
                >
                  Related Contacts
                </button>
              ) : null}
            </div>

            {opportunityModal.mode === "create" ? (
              <div className="detail-card opportunity-modal-card">
                <div className="detail-grid">
                  <div>
                    <label>Type</label>
                    <select
                      value={newOpportunityDraft.type}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          type: event.target.value as OpportunityType
                        }))
                      }
                    >
                      {opportunityTypeOptions.map((option) => (
                        <option key={`create-opportunity-type-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Title</label>
                    <input
                      value={generateOpportunityTitle({
                        companyName: item.name,
                        healthSystemName:
                          item.screening.healthSystems.find(
                            (healthSystem) => healthSystem.healthSystemId === newOpportunityDraft.healthSystemId
                          )?.healthSystemName || null,
                        type: newOpportunityDraft.type
                      })}
                      readOnly
                    />
                    <p className="muted" style={{ marginTop: 4 }}>
                      Auto-generated by the system.
                    </p>
                  </div>
                  <div>
                    <label>Stage</label>
                    <select
                      value={newOpportunityDraft.stage}
                      onChange={(event) => {
                        const stage = event.target.value as OpportunityStage;
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          stage,
                          likelihoodPercent: String(defaultLikelihoodForStage(stage))
                        }));
                      }}
                    >
                      {opportunityStageOptions.map((option) => (
                        <option key={`create-opportunity-stage-${option.value}`} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Health System</label>
                    <select
                      value={newOpportunityDraft.healthSystemId}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          healthSystemId: event.target.value
                        }))
                      }
                    >
                      <option value="">No health system</option>
                      {item.screening.healthSystems.map((healthSystem) => (
                        <option key={`create-opportunity-health-system-${healthSystem.healthSystemId}`} value={healthSystem.healthSystemId}>
                          {healthSystem.healthSystemName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label>Likelihood to Close (%)</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={newOpportunityDraft.likelihoodPercent}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          likelihoodPercent: event.target.value
                        }))
                      }
                      placeholder="0-100"
                    />
                  </div>
                  <div>
                    <label>Expected Close Date</label>
                    <input
                      type="date"
                      value={newOpportunityDraft.estimatedCloseDate}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          estimatedCloseDate: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label>Opportunity Duration (days)</label>
                    <input
                      type="text"
                      value="Calculated from created date"
                      readOnly
                    />
                  </div>
                  <div>
                    <label>Contract Price (USD)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newOpportunityDraft.contractPriceUsd}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          contractPriceUsd: event.target.value
                        }))
                      }
                      placeholder="e.g. 250000"
                    />
                  </div>
                  <div>
                    <label>Amount (USD)</label>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={newOpportunityDraft.amountUsd}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          amountUsd: event.target.value
                        }))
                      }
                      placeholder="e.g. 75000"
                    />
                  </div>
                  <div>
                    <label>Closed At</label>
                    <input
                      type="date"
                      value={newOpportunityDraft.closedAt}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          closedAt: event.target.value
                        }))
                      }
                    />
                  </div>
                  <div className="detail-grid-full">
                    <label>
                      Close Reason{isClosedOpportunityStage(newOpportunityDraft.stage) ? " (required)" : ""}
                    </label>
                    <textarea
                      rows={2}
                      value={newOpportunityDraft.closeReason}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          closeReason: event.target.value
                        }))
                      }
                      placeholder={
                        isClosedOpportunityStage(newOpportunityDraft.stage)
                          ? "Why this opportunity was won/lost"
                          : "Optional reason for closure outcome"
                      }
                    />
                  </div>
                  <div className="detail-grid-full">
                    <label>Next Steps</label>
                    <textarea
                      rows={3}
                      value={newOpportunityDraft.nextSteps}
                      onChange={(event) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          nextSteps: event.target.value
                        }))
                      }
                      placeholder="Upcoming actions and owners"
                    />
                  </div>
                  <div className="detail-grid-full">
                    <label>Opportunity Notes</label>
                    <RichTextArea
                      value={newOpportunityDraft.notes}
                      onChange={(nextValue) =>
                        setNewOpportunityDraft((current) => ({
                          ...current,
                          notes: nextValue
                        }))
                      }
                      rows={6}
                      placeholder="Opportunity-specific context"
                    />
                  </div>
                </div>
                <div className="actions">
                  <button type="button" className="ghost small" onClick={closeOpportunityModal} disabled={addingOpportunity}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="secondary small"
                    onClick={async () => {
                      const created = await createOpportunity();
                      if (!created) return;
                      setOpportunityModal({ mode: "edit", opportunityId: created.id });
                      setOpportunityModalTab("details");
                    }}
                    disabled={addingOpportunity}
                  >
                    {addingOpportunity ? "Creating..." : "Create Opportunity"}
                  </button>
                </div>
              </div>
            ) : selectedOpportunityForModal ? (
              opportunityModalTab === "details" ? (
                (() => {
                  const draft = opportunityDraftById[selectedOpportunityForModal.id] || toOpportunityDraft(selectedOpportunityForModal);
                  const availableHealthSystems = item.screening.healthSystems.map((entry) => ({
                    id: entry.healthSystemId,
                    name: entry.healthSystemName
                  }));
                  if (
                    selectedOpportunityForModal.healthSystem &&
                    !availableHealthSystems.some((entry) => entry.id === selectedOpportunityForModal.healthSystem?.id)
                  ) {
                    availableHealthSystems.push({
                      id: selectedOpportunityForModal.healthSystem.id,
                      name: selectedOpportunityForModal.healthSystem.name
                    });
                  }
                  const draftTitle = generateOpportunityTitle({
                    companyName: item.name,
                    healthSystemName:
                      availableHealthSystems.find((healthSystem) => healthSystem.id === draft.healthSystemId)?.name ||
                      null,
                    type: draft.type
                  });
                  const closedStage = isClosedOpportunityStage(draft.stage);
                  const draftDurationDays = computeOpportunityDurationDays(
                    selectedOpportunityForModal.createdAt,
                    draft.closedAt.trim() || selectedOpportunityForModal.closedAt
                  );

                  return (
                    <div className="detail-card opportunity-modal-card">
                      <div className="detail-grid">
                        <div>
                          <label>Type</label>
                          <select
                            value={draft.type}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                type: event.target.value as OpportunityType
                              })
                            }
                          >
                            {opportunityTypeOptions.map((option) => (
                              <option key={`${selectedOpportunityForModal.id}-type-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label>Title</label>
                          <input value={draftTitle} readOnly />
                          <p className="muted" style={{ marginTop: 4 }}>
                            Auto-generated by the system.
                          </p>
                        </div>
                        <div>
                          <label>Stage</label>
                          <select
                            value={draft.stage}
                            onChange={(event) => {
                              const stage = event.target.value as OpportunityStage;
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                stage,
                                likelihoodPercent: String(defaultLikelihoodForStage(stage))
                              });
                            }}
                          >
                            {opportunityStageOptions.map((option) => (
                              <option key={`${selectedOpportunityForModal.id}-stage-${option.value}`} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label>Health System</label>
                          <select
                            value={draft.healthSystemId}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                healthSystemId: event.target.value
                              })
                            }
                          >
                            <option value="">No health system</option>
                            {availableHealthSystems.map((healthSystem) => (
                              <option key={`${selectedOpportunityForModal.id}-health-system-${healthSystem.id}`} value={healthSystem.id}>
                                {healthSystem.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label>Likelihood to Close (%)</label>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={draft.likelihoodPercent}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                likelihoodPercent: event.target.value
                              })
                            }
                            placeholder="0-100"
                          />
                        </div>
                        <div>
                          <label>Expected Close Date</label>
                          <input
                            type="date"
                            value={draft.estimatedCloseDate}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                estimatedCloseDate: event.target.value
                              })
                            }
                          />
                        </div>
                        <div>
                          <label>Opportunity Duration (days)</label>
                          <input
                            type="text"
                            value={draftDurationDays ?? "—"}
                            readOnly
                          />
                        </div>
                        <div>
                          <label>Contract Price (USD)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.contractPriceUsd}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                contractPriceUsd: event.target.value
                              })
                            }
                            placeholder="e.g. 250000"
                          />
                        </div>
                        <div>
                          <label>Amount (USD)</label>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.amountUsd}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                amountUsd: event.target.value
                              })
                            }
                            placeholder="e.g. 75000"
                          />
                        </div>
                        <div>
                          <label>Closed At</label>
                          <input
                            type="date"
                            value={draft.closedAt}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                closedAt: event.target.value
                              })
                            }
                          />
                        </div>
                        <div className="detail-grid-full">
                          <label>Close Reason{closedStage ? " (required)" : ""}</label>
                          <textarea
                            rows={2}
                            value={draft.closeReason}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                closeReason: event.target.value
                              })
                            }
                            placeholder={
                              closedStage
                                ? "Why this opportunity was won/lost"
                                : "Optional reason for closure outcome"
                            }
                          />
                        </div>
                        <div className="detail-grid-full">
                          <label>Next Steps</label>
                          <textarea
                            rows={3}
                            value={draft.nextSteps}
                            onChange={(event) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                nextSteps: event.target.value
                              })
                            }
                            placeholder="Upcoming actions and owners"
                          />
                        </div>
                        <div className="detail-grid-full">
                          <label>Opportunity Notes</label>
                          <RichTextArea
                            value={draft.notes}
                            onChange={(nextValue) =>
                              updateOpportunityDraft(selectedOpportunityForModal.id, {
                                notes: nextValue
                              })
                            }
                            rows={6}
                            placeholder="Opportunity-specific context"
                          />
                        </div>
                      </div>
                      <div className="actions">
                        <button
                          type="button"
                          className="secondary small"
                          onClick={() => void saveOpportunity(selectedOpportunityForModal.id)}
                          disabled={Boolean(savingOpportunityById[selectedOpportunityForModal.id])}
                        >
                          {savingOpportunityById[selectedOpportunityForModal.id] ? "Saving..." : "Save Opportunity"}
                        </button>
                        <button
                          type="button"
                          className="ghost small"
                          onClick={async () => {
                            const deleted = await deleteOpportunity(selectedOpportunityForModal.id);
                            if (!deleted) return;
                            closeOpportunityModal();
                          }}
                          disabled={Boolean(deletingOpportunityById[selectedOpportunityForModal.id])}
                        >
                          {deletingOpportunityById[selectedOpportunityForModal.id] ? "Deleting..." : "Delete"}
                        </button>
                      </div>
                    </div>
                  );
                })()
              ) : (
                (() => {
                  const draft = opportunityDraftById[selectedOpportunityForModal.id] || toOpportunityDraft(selectedOpportunityForModal);
                  return (
                    <div className="detail-card opportunity-modal-card">
                      <div className="detail-section">
                        <p className="detail-label">Contracting Contacts</p>
                        {selectedOpportunityForModal.healthSystem &&
                        draft.healthSystemId === selectedOpportunityForModal.healthSystem.id ? (
                          <>
                            {selectedOpportunityForModal.contacts.length === 0 ? (
                              <p className="muted">No contracting contacts linked yet.</p>
                            ) : (
                              selectedOpportunityForModal.contacts.map((link) => (
                                <div key={link.id} className="contact-row" style={{ marginBottom: 8 }}>
                                  <div className="contact-row-details">
                                    <strong>{link.contact.name}</strong>
                                    {link.contact.title ? `, ${link.contact.title}` : ""}
                                    {link.contact.email ? ` | ${link.contact.email}` : ""}
                                  </div>
                                  <div className="contact-row-actions">
                                    <input
                                      value={opportunityContactRoleDraftByLinkId[link.id] ?? link.role ?? ""}
                                      onChange={(event) =>
                                        setOpportunityContactRoleDraftByLinkId((current) => ({
                                          ...current,
                                          [link.id]: event.target.value
                                        }))
                                      }
                                      placeholder="Role"
                                    />
                                    <button
                                      type="button"
                                      className="ghost small"
                                      onClick={() => void saveOpportunityContactRole(link.id)}
                                      disabled={Boolean(savingOpportunityContactRoleByLinkId[link.id])}
                                    >
                                      {savingOpportunityContactRoleByLinkId[link.id] ? "Saving..." : "Save Role"}
                                    </button>
                                    <button
                                      type="button"
                                      className="ghost small"
                                      onClick={() => void deleteOpportunityContact(selectedOpportunityForModal.id, link.id)}
                                      disabled={Boolean(deletingOpportunityContactByLinkId[link.id])}
                                    >
                                      {deletingOpportunityContactByLinkId[link.id] ? "Removing..." : "Remove"}
                                    </button>
                                  </div>
                                </div>
                              ))
                            )}
                            <div className="detail-grid" style={{ marginTop: 10 }}>
                              <div>
                                <label>Add Contact</label>
                                <EntityLookupInput
                                  entityKind="CONTACT"
                                  value={opportunityContactLookupByOpportunityId[selectedOpportunityForModal.id] || ""}
                                  onChange={(nextValue) =>
                                    setOpportunityContactLookupByOpportunityId((current) => ({
                                      ...current,
                                      [selectedOpportunityForModal.id]: nextValue
                                    }))
                                  }
                                  contactCreateContext={{
                                    parentType: "healthSystem",
                                    parentId: selectedOpportunityForModal.healthSystem.id,
                                    roleType: "EXECUTIVE"
                                  }}
                                  contactSearchHealthSystemId={selectedOpportunityForModal.healthSystem.id}
                                  disabled={Boolean(addingOpportunityContactByOpportunityId[selectedOpportunityForModal.id])}
                                />
                              </div>
                              <div>
                                <label>Role (Optional)</label>
                                <input
                                  value={newOpportunityContactRoleByOpportunityId[selectedOpportunityForModal.id] || ""}
                                  onChange={(event) =>
                                    setNewOpportunityContactRoleByOpportunityId((current) => ({
                                      ...current,
                                      [selectedOpportunityForModal.id]: event.target.value
                                    }))
                                  }
                                  placeholder="Contracting lead"
                                />
                              </div>
                            </div>
                            <div className="actions">
                              <button
                                type="button"
                                className="ghost small"
                                onClick={() => void addOpportunityContact(selectedOpportunityForModal.id)}
                                disabled={Boolean(addingOpportunityContactByOpportunityId[selectedOpportunityForModal.id])}
                              >
                                {addingOpportunityContactByOpportunityId[selectedOpportunityForModal.id]
                                  ? "Adding..."
                                  : "Add Contact"}
                              </button>
                            </div>
                          </>
                        ) : draft.healthSystemId ? (
                          <p className="muted">
                            Save this opportunity in the Details tab before editing contacts for the updated health
                            system assignment.
                          </p>
                        ) : (
                          <p className="muted">Link a health system in the Details tab before assigning contacts.</p>
                        )}
                      </div>
                    </div>
                  );
                })()
              )
            ) : (
              <p className="muted">Opportunity not found.</p>
            )}
          </div>
        </div>
      ) : null}

      {showAddNoteModal ? (
        <div
          className="pipeline-note-backdrop"
          onMouseDown={() => {
            setShowAddNoteModal(false);
            setNewNoteOpportunityId("");
          }}
        >
          <div className="pipeline-note-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="pipeline-card-head">
              <h3>Add Note</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={() => {
                  setShowAddNoteModal(false);
                  setNewNoteOpportunityId("");
                }}
                aria-label="Close add note dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <p className="muted">{item.name}</p>
            {item.opportunities.length > 0 ? (
              <div className="pipeline-status-single-field" style={{ marginTop: 10 }}>
                <label>Tag to Opportunity (Optional)</label>
                <select
                  value={newNoteOpportunityId}
                  onChange={(event) => setNewNoteOpportunityId(event.target.value)}
                >
                  <option value="">General company note</option>
                  {item.opportunities.map((opportunity) => (
                    <option key={opportunity.id} value={opportunity.id}>
                      {`${opportunity.title} (${opportunity.type})${opportunity.healthSystem ? ` - ${opportunity.healthSystem.name}` : ""}`}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <RichTextArea
              className="pipeline-note-textarea"
              value={newNoteDraft}
              onChange={(nextValue) => setNewNoteDraft(nextValue)}
              placeholder="Capture details from intake discussions"
              rows={8}
            />
            <div className="actions">
              <button
                type="button"
                className="ghost small"
                onClick={() => {
                  setShowAddNoteModal(false);
                  setNewNoteOpportunityId("");
                }}
                disabled={addingNote}
              >
                Cancel
              </button>
              <button type="button" className="secondary small" onClick={() => void addPipelineNote()} disabled={addingNote}>
                {addingNote ? "Adding..." : "Add Note"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAddDocumentModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => setShowAddDocumentModal(false)}>
          <div className="pipeline-note-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="pipeline-card-head">
              <h3>Add Document</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={() => setShowAddDocumentModal(false)}
                aria-label="Close add document dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            <p className="muted">{item.name}</p>
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
                className="ghost small"
                type="button"
                onClick={() => setShowAddDocumentModal(false)}
                disabled={addingCompanyDocument}
              >
                Cancel
              </button>
              <button
                className="secondary small"
                type="button"
                onClick={() => void addCompanyDocumentFromGoogleLink()}
                disabled={addingCompanyDocument}
              >
                {addingCompanyDocument ? "Adding..." : "Add Google Doc Link"}
              </button>
            </div>
            <p className="muted">{`Uploads are limited to ${companyDocumentMaxSizeMb} MB per file.`}</p>
          </div>
        </div>
      ) : null}

      {showAddQualitativeFeedbackModal ? (
        <div className="pipeline-note-backdrop" onMouseDown={() => setShowAddQualitativeFeedbackModal(false)}>
          <div
            className="pipeline-note-modal screening-qualitative-modal"
            role="dialog"
            aria-modal="true"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="pipeline-card-head">
              <h3>Add Qualitative Feedback</h3>
              <button
                className="modal-icon-close"
                type="button"
                onClick={() => setShowAddQualitativeFeedbackModal(false)}
                aria-label="Close add qualitative feedback dialog"
              >
                <span aria-hidden="true">×</span>
              </button>
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
                className="ghost small"
                type="button"
                onClick={() => setShowAddQualitativeFeedbackModal(false)}
                disabled={
                  !qualitativeDraft.healthSystemId ||
                  Boolean(savingFeedbackByHealthSystemId[qualitativeDraft.healthSystemId])
                }
              >
                Cancel
              </button>
              <button
                className="secondary small"
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
                  : "Add Feedback"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

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
