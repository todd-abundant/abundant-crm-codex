"use client";

import * as React from "react";
import { DateInputField } from "./date-input-field";
import { EntityLookupInput } from "./entity-lookup-input";
import {
  inferGoogleDocumentTitle,
  MAX_COMPANY_DOCUMENT_FILE_BYTES,
  normalizeGoogleDocsUrl,
  readFileAsDataUrl,
  toDateInputString
} from "@/lib/company-document-links";

type PipelinePhase =
  | "INTAKE"
  | "DECLINED"
  | "VENTURE_STUDIO_NEGOTIATION"
  | "SCREENING"
  | "LOI_COLLECTION"
  | "COMMERCIAL_NEGOTIATION"
  | "PORTFOLIO_GROWTH";

type IntakeDecision = "PENDING" | "ADVANCE_TO_NEGOTIATION" | "DECLINE";
type DocumentType =
  | "INTAKE_REPORT"
  | "SCREENING_REPORT"
  | "TERM_SHEET"
  | "VENTURE_STUDIO_CONTRACT"
  | "LOI"
  | "COMMERCIAL_CONTRACT"
  | "OTHER";
type OpportunityType = "VENTURE_STUDIO_SERVICES" | "S1_TERM_SHEET" | "COMMERCIAL_CONTRACT" | "PROSPECT_PURSUIT";
type OpportunityStage =
  | "IDENTIFIED"
  | "QUALIFICATION"
  | "PROPOSAL"
  | "NEGOTIATION"
  | "LEGAL"
  | "CLOSED_WON"
  | "CLOSED_LOST"
  | "ON_HOLD";
type ScreeningEventType = "WEBINAR" | "INDIVIDUAL_SESSION" | "OTHER";
type AttendanceStatus = "INVITED" | "ATTENDED" | "DECLINED" | "NO_SHOW";
type LoiStatus = "NOT_STARTED" | "PENDING" | "NEGOTIATING" | "SIGNED" | "DECLINED";
type FundraiseStatus = "PLANNED" | "OPEN" | "CLOSED" | "CANCELLED";

type HealthSystemOption = {
  id: string;
  name: string;
};

type CoInvestorOption = {
  id: string;
  name: string;
};

type CompanyContactOption = {
  id: string;
  name: string;
  title?: string | null;
};

type PipelineDocumentDraft = {
  type: DocumentType;
  title: string;
  url: string;
  uploadedAt: string;
  notes: string;
};

type PipelineOpportunityDraft = {
  type: OpportunityType;
  title: string;
  healthSystemId: string;
  stage: OpportunityStage;
  likelihoodPercent: string;
  amountUsd: string;
  notes: string;
  nextSteps: string;
  estimatedCloseDate: string;
  closedAt: string;
};

type ScreeningParticipantDraft = {
  healthSystemId: string;
  contactId: string;
  attendanceStatus: AttendanceStatus;
  notes: string;
};

type ScreeningEventDraft = {
  type: ScreeningEventType;
  title: string;
  scheduledAt: string;
  completedAt: string;
  notes: string;
  participants: ScreeningParticipantDraft[];
};

type LoiDraft = {
  healthSystemId: string;
  status: LoiStatus;
  signedAt: string;
  notes: string;
};

type FundraiseInvestorDraft = {
  coInvestorId: string;
  investorName: string;
  investmentAmountUsd: string;
  isLeadInvestor: boolean;
  notes: string;
};

type FundraiseDraft = {
  roundLabel: string;
  status: FundraiseStatus;
  totalAmountUsd: string;
  s1InvestmentUsd: string;
  announcedAt: string;
  closedAt: string;
  notes: string;
  investors: FundraiseInvestorDraft[];
};

type PipelineDraft = {
  phase: PipelinePhase;
  intakeDecision: IntakeDecision;
  intakeDecisionAt: string;
  intakeDecisionNotes: string;
  ventureStudioContractExecutedAt: string;
  targetLoiCount: string;
  s1Invested: boolean;
  s1InvestmentAt: string;
  s1InvestmentAmountUsd: string;
  portfolioAddedAt: string;
  documents: PipelineDocumentDraft[];
  opportunities: PipelineOpportunityDraft[];
  screeningEvents: ScreeningEventDraft[];
  lois: LoiDraft[];
  fundraises: FundraiseDraft[];
};

type GoogleDocumentDraft = {
  type: DocumentType;
  title: string;
  url: string;
};

const pipelinePhaseOptions: Array<{ value: PipelinePhase; label: string }> = [
  { value: "INTAKE", label: "Intake" },
  { value: "DECLINED", label: "Declined" },
  { value: "VENTURE_STUDIO_NEGOTIATION", label: "Venture Studio Negotiation" },
  { value: "SCREENING", label: "Screening" },
  { value: "LOI_COLLECTION", label: "LOI Collection" },
  { value: "COMMERCIAL_NEGOTIATION", label: "Commercial Negotiation" },
  { value: "PORTFOLIO_GROWTH", label: "Portfolio Growth" }
];

const intakeDecisionOptions: Array<{ value: IntakeDecision; label: string }> = [
  { value: "PENDING", label: "Pending" },
  { value: "ADVANCE_TO_NEGOTIATION", label: "Advance" },
  { value: "DECLINE", label: "Decline" }
];

const documentTypeOptions: Array<{ value: DocumentType; label: string }> = [
  { value: "INTAKE_REPORT", label: "Intake Report" },
  { value: "SCREENING_REPORT", label: "Screening Report" },
  { value: "TERM_SHEET", label: "Term Sheet" },
  { value: "VENTURE_STUDIO_CONTRACT", label: "Venture Studio Contract" },
  { value: "LOI", label: "LOI" },
  { value: "COMMERCIAL_CONTRACT", label: "Commercial Contract" },
  { value: "OTHER", label: "Other" }
];

const opportunityTypeOptions: Array<{ value: OpportunityType; label: string }> = [
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

const screeningEventTypeOptions: Array<{ value: ScreeningEventType; label: string }> = [
  { value: "WEBINAR", label: "Webinar" },
  { value: "INDIVIDUAL_SESSION", label: "Individual Session" },
  { value: "OTHER", label: "Other" }
];

const attendanceStatusOptions: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "INVITED", label: "Invited" },
  { value: "ATTENDED", label: "Attended" },
  { value: "DECLINED", label: "Declined" },
  { value: "NO_SHOW", label: "No Show" }
];

const loiStatusOptions: Array<{ value: LoiStatus; label: string }> = [
  { value: "NOT_STARTED", label: "Not Started" },
  { value: "PENDING", label: "Pending" },
  { value: "NEGOTIATING", label: "Negotiating" },
  { value: "SIGNED", label: "Signed" },
  { value: "DECLINED", label: "Declined" }
];

const fundraiseStatusOptions: Array<{ value: FundraiseStatus; label: string }> = [
  { value: "PLANNED", label: "Planned" },
  { value: "OPEN", label: "Open" },
  { value: "CLOSED", label: "Closed" },
  { value: "CANCELLED", label: "Cancelled" }
];

const companyDocumentUploadAccept =
  ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp";
const companyDocumentMaxSizeMb = Math.round(MAX_COMPANY_DOCUMENT_FILE_BYTES / (1024 * 1024));

function toDateInputValue(value: unknown) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function toText(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function parseNullableNumber(value: string) {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function emptyDocument(): PipelineDocumentDraft {
  return {
    type: "INTAKE_REPORT",
    title: "",
    url: "",
    uploadedAt: "",
    notes: ""
  };
}

function emptyGoogleDocumentDraft(): GoogleDocumentDraft {
  return {
    type: "OTHER",
    title: "",
    url: ""
  };
}

function emptyOpportunity(): PipelineOpportunityDraft {
  return {
    type: "VENTURE_STUDIO_SERVICES",
    title: "",
    healthSystemId: "",
    stage: "IDENTIFIED",
    likelihoodPercent: "",
    amountUsd: "",
    notes: "",
    nextSteps: "",
    estimatedCloseDate: "",
    closedAt: ""
  };
}

function emptyParticipant(): ScreeningParticipantDraft {
  return {
    healthSystemId: "",
    contactId: "",
    attendanceStatus: "INVITED",
    notes: ""
  };
}

function emptyScreeningEvent(): ScreeningEventDraft {
  return {
    type: "WEBINAR",
    title: "",
    scheduledAt: "",
    completedAt: "",
    notes: "",
    participants: []
  };
}

function emptyLoi(): LoiDraft {
  return {
    healthSystemId: "",
    status: "NOT_STARTED",
    signedAt: "",
    notes: ""
  };
}

function emptyFundraiseInvestor(): FundraiseInvestorDraft {
  return {
    coInvestorId: "",
    investorName: "",
    investmentAmountUsd: "",
    isLeadInvestor: false,
    notes: ""
  };
}

function emptyFundraise(): FundraiseDraft {
  return {
    roundLabel: "",
    status: "PLANNED",
    totalAmountUsd: "",
    s1InvestmentUsd: "",
    announcedAt: "",
    closedAt: "",
    notes: "",
    investors: []
  };
}

function hydratePipelineDraft(input: unknown): PipelineDraft {
  const payload = asObject(input);

  return {
    phase: (payload.phase as PipelinePhase) || "INTAKE",
    intakeDecision: (payload.intakeDecision as IntakeDecision) || "PENDING",
    intakeDecisionAt: toDateInputValue(payload.intakeDecisionAt),
    intakeDecisionNotes: toText(payload.intakeDecisionNotes),
    ventureStudioContractExecutedAt: toDateInputValue(payload.ventureStudioContractExecutedAt),
    targetLoiCount: toText(payload.targetLoiCount || "3"),
    s1Invested: Boolean(payload.s1Invested),
    s1InvestmentAt: toDateInputValue(payload.s1InvestmentAt),
    s1InvestmentAmountUsd: toText(payload.s1InvestmentAmountUsd),
    portfolioAddedAt: toDateInputValue(payload.portfolioAddedAt),
    documents: asArray(payload.documents).map((item) => {
      const entry = asObject(item);
      return {
        type: (entry.type as DocumentType) || "OTHER",
        title: toText(entry.title),
        url: toText(entry.url),
        uploadedAt: toDateInputValue(entry.uploadedAt),
        notes: toText(entry.notes)
      };
    }),
    opportunities: asArray(payload.opportunities).map((item) => {
      const entry = asObject(item);
      return {
        type: (entry.type as OpportunityType) || "VENTURE_STUDIO_SERVICES",
        title: toText(entry.title),
        healthSystemId: toText(entry.healthSystemId),
        stage: (entry.stage as OpportunityStage) || "IDENTIFIED",
        likelihoodPercent: toText(entry.likelihoodPercent),
        amountUsd: toText(entry.amountUsd),
        notes: toText(entry.notes),
        nextSteps: toText(entry.nextSteps),
        estimatedCloseDate: toDateInputValue(entry.estimatedCloseDate),
        closedAt: toDateInputValue(entry.closedAt)
      };
    }),
    screeningEvents: asArray(payload.screeningEvents).map((item) => {
      const event = asObject(item);
      return {
        type: (event.type as ScreeningEventType) || "OTHER",
        title: toText(event.title),
        scheduledAt: toDateInputValue(event.scheduledAt),
        completedAt: toDateInputValue(event.completedAt),
        notes: toText(event.notes),
        participants: asArray(event.participants).map((participant) => {
          const participantEntry = asObject(participant);
          return {
            healthSystemId: toText(participantEntry.healthSystemId),
            contactId: toText(participantEntry.contactId),
            attendanceStatus: (participantEntry.attendanceStatus as AttendanceStatus) || "INVITED",
            notes: toText(participantEntry.notes)
          };
        })
      };
    }),
    lois: asArray(payload.lois).map((item) => {
      const entry = asObject(item);
      return {
        healthSystemId: toText(entry.healthSystemId),
        status: (entry.status as LoiStatus) || "NOT_STARTED",
        signedAt: toDateInputValue(entry.signedAt),
        notes: toText(entry.notes)
      };
    }),
    fundraises: asArray(payload.fundraises).map((item) => {
      const entry = asObject(item);
      return {
        roundLabel: toText(entry.roundLabel),
        status: (entry.status as FundraiseStatus) || "PLANNED",
        totalAmountUsd: toText(entry.totalAmountUsd),
        s1InvestmentUsd: toText(entry.s1InvestmentUsd),
        announcedAt: toDateInputValue(entry.announcedAt),
        closedAt: toDateInputValue(entry.closedAt),
        notes: toText(entry.notes),
        investors: asArray(entry.investors).map((investor) => {
          const investorEntry = asObject(investor);
          return {
            coInvestorId: toText(investorEntry.coInvestorId),
            investorName: toText(investorEntry.investorName),
            investmentAmountUsd: toText(investorEntry.investmentAmountUsd),
            isLeadInvestor: Boolean(investorEntry.isLeadInvestor),
            notes: toText(investorEntry.notes)
          };
        })
      };
    })
  };
}

function serializePipelineDraft(draft: PipelineDraft) {
  return {
    phase: draft.phase,
    intakeDecision: draft.intakeDecision,
    intakeDecisionAt: draft.intakeDecisionAt || null,
    intakeDecisionNotes: draft.intakeDecisionNotes || null,
    ventureStudioContractExecutedAt: draft.ventureStudioContractExecutedAt || null,
    targetLoiCount: Math.max(1, Math.round(Number(draft.targetLoiCount) || 3)),
    s1Invested: draft.s1Invested,
    s1InvestmentAt: draft.s1InvestmentAt || null,
    s1InvestmentAmountUsd: parseNullableNumber(draft.s1InvestmentAmountUsd),
    portfolioAddedAt: draft.portfolioAddedAt || null,
    documents: draft.documents
      .map((document) => ({
        type: document.type,
        title: document.title.trim(),
        url: document.url.trim(),
        uploadedAt: document.uploadedAt || null,
        notes: document.notes.trim() || null
      }))
      .filter((document) => document.title && document.url),
    opportunities: draft.opportunities
      .map((opportunity) => ({
        type: opportunity.type,
        title: opportunity.title.trim(),
        healthSystemId: opportunity.healthSystemId || null,
        stage: opportunity.stage,
        likelihoodPercent: parseNullableNumber(opportunity.likelihoodPercent),
        amountUsd: parseNullableNumber(opportunity.amountUsd),
        notes: opportunity.notes.trim() || null,
        nextSteps: opportunity.nextSteps.trim() || null,
        estimatedCloseDate: opportunity.estimatedCloseDate || null,
        closedAt: opportunity.closedAt || null
      }))
      .filter((opportunity) => opportunity.title),
    screeningEvents: draft.screeningEvents
      .map((event) => ({
        type: event.type,
        title: event.title.trim(),
        scheduledAt: event.scheduledAt || null,
        completedAt: event.completedAt || null,
        notes: event.notes.trim() || null,
        participants: event.participants
          .map((participant) => ({
            healthSystemId: participant.healthSystemId,
            contactId: participant.contactId || null,
            attendanceStatus: participant.attendanceStatus,
            notes: participant.notes.trim() || null
          }))
          .filter((participant) => participant.healthSystemId)
      }))
      .filter((event) => event.title),
    lois: draft.lois
      .map((loi) => ({
        healthSystemId: loi.healthSystemId,
        status: loi.status,
        signedAt: loi.signedAt || null,
        notes: loi.notes.trim() || null
      }))
      .filter((loi) => loi.healthSystemId),
    fundraises: draft.fundraises
      .map((fundraise) => ({
        roundLabel: fundraise.roundLabel.trim(),
        status: fundraise.status,
        totalAmountUsd: parseNullableNumber(fundraise.totalAmountUsd),
        s1InvestmentUsd: parseNullableNumber(fundraise.s1InvestmentUsd),
        announcedAt: fundraise.announcedAt || null,
        closedAt: fundraise.closedAt || null,
        notes: fundraise.notes.trim() || null,
        investors: fundraise.investors
          .map((investor) => ({
            coInvestorId: investor.coInvestorId || null,
            investorName: investor.investorName.trim(),
            investmentAmountUsd: parseNullableNumber(investor.investmentAmountUsd),
            isLeadInvestor: investor.isLeadInvestor,
            notes: investor.notes.trim() || null
          }))
          .filter((investor) => investor.investorName)
      }))
      .filter((fundraise) => fundraise.roundLabel)
  };
}

export function CompanyPipelineManager({
  companyId,
  healthSystems,
  coInvestors,
  contacts
}: {
  companyId: string;
  healthSystems: HealthSystemOption[];
  coInvestors: CoInvestorOption[];
  contacts: CompanyContactOption[];
}) {
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [draft, setDraft] = React.useState<PipelineDraft | null>(null);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [healthSystemOptions, setHealthSystemOptions] = React.useState<HealthSystemOption[]>(healthSystems);
  const [coInvestorOptions, setCoInvestorOptions] = React.useState<CoInvestorOption[]>(coInvestors);
  const [contactOptions, setContactOptions] = React.useState<CompanyContactOption[]>(contacts);
  const [uploadingDocument, setUploadingDocument] = React.useState(false);
  const [googleDocumentDraft, setGoogleDocumentDraft] = React.useState<GoogleDocumentDraft>(() =>
    emptyGoogleDocumentDraft()
  );

  React.useEffect(() => {
    setHealthSystemOptions(healthSystems);
  }, [healthSystems]);

  React.useEffect(() => {
    setCoInvestorOptions(coInvestors);
  }, [coInvestors]);

  React.useEffect(() => {
    setContactOptions(contacts);
  }, [contacts]);

  function addHealthSystemOption(option: { id: string; name: string }) {
    setHealthSystemOptions((current) => {
      if (current.some((entry) => entry.id === option.id)) return current;
      return [{ id: option.id, name: option.name }, ...current];
    });
  }

  function addCoInvestorOption(option: { id: string; name: string }) {
    setCoInvestorOptions((current) => {
      if (current.some((entry) => entry.id === option.id)) return current;
      return [{ id: option.id, name: option.name }, ...current];
    });
  }

  function addContactOption(option: { id: string; name: string; subtitle?: string | null }) {
    setContactOptions((current) => {
      if (current.some((entry) => entry.id === option.id)) return current;
      return [{ id: option.id, name: option.name, title: option.subtitle || null }, ...current];
    });
  }

  React.useEffect(() => {
    let active = true;

    async function loadPipeline() {
      setLoading(true);
      setStatus(null);
      try {
        const res = await fetch(`/api/companies/${companyId}/pipeline`, { cache: "no-store" });
        const payload = (await res.json()) as { pipeline?: unknown; error?: string };

        if (!res.ok) {
          throw new Error(payload.error || "Failed to load pipeline");
        }

        if (!active) return;
        setDraft(hydratePipelineDraft(payload.pipeline));
      } catch (error) {
        if (!active) return;
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load pipeline"
        });
        setDraft(null);
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadPipeline();

    return () => {
      active = false;
    };
  }, [companyId]);

  const signedLoiCount = React.useMemo(
    () => (draft ? draft.lois.filter((loi) => loi.status === "SIGNED").length : 0),
    [draft]
  );

  const loiTargetCount = React.useMemo(() => {
    if (!draft) return 3;
    const parsed = Number(draft.targetLoiCount);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
  }, [draft]);

  function updateDraft(patch: Partial<PipelineDraft>) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, ...patch };
    });
  }

  function updateDocument(index: number, patch: Partial<PipelineDocumentDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.documents];
      next[index] = { ...next[index], ...patch };
      return { ...current, documents: next };
    });
  }

  function appendDocument(document: PipelineDocumentDraft) {
    setDraft((current) => {
      if (!current) return current;
      return { ...current, documents: [...current.documents, document] };
    });
  }

  async function addUploadedDocument(file: File) {
    const documentType = googleDocumentDraft.type;
    if (file.size > MAX_COMPANY_DOCUMENT_FILE_BYTES) {
      setStatus({
        kind: "error",
        text: `File is too large. Max size is ${companyDocumentMaxSizeMb} MB.`
      });
      return;
    }

    setUploadingDocument(true);
    setStatus(null);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      appendDocument({
        type: documentType,
        title: file.name.trim() || "Uploaded Document",
        url: dataUrl,
        uploadedAt: toDateInputString(),
        notes: ""
      });
      setStatus({ kind: "ok", text: `Added ${file.name} to documents.` });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to process uploaded document."
      });
    } finally {
      setUploadingDocument(false);
    }
  }

  function addGoogleDocument() {
    const normalizedUrl = normalizeGoogleDocsUrl(googleDocumentDraft.url);
    if (!normalizedUrl) {
      setStatus({
        kind: "error",
        text: "Provide a valid Google Docs or Google Drive link."
      });
      return;
    }

    const title = googleDocumentDraft.title.trim() || inferGoogleDocumentTitle(normalizedUrl);
    appendDocument({
      type: googleDocumentDraft.type,
      title,
      url: normalizedUrl,
      uploadedAt: toDateInputString(),
      notes: ""
    });

    setGoogleDocumentDraft(emptyGoogleDocumentDraft());
    setStatus({ kind: "ok", text: "Google document link added." });
  }

  function updateOpportunity(index: number, patch: Partial<PipelineOpportunityDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.opportunities];
      next[index] = { ...next[index], ...patch };
      return { ...current, opportunities: next };
    });
  }

  function updateScreeningEvent(index: number, patch: Partial<ScreeningEventDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.screeningEvents];
      next[index] = { ...next[index], ...patch };
      return { ...current, screeningEvents: next };
    });
  }

  function updateScreeningParticipant(
    eventIndex: number,
    participantIndex: number,
    patch: Partial<ScreeningParticipantDraft>
  ) {
    setDraft((current) => {
      if (!current) return current;
      const events = [...current.screeningEvents];
      const participants = [...events[eventIndex].participants];
      participants[participantIndex] = { ...participants[participantIndex], ...patch };
      events[eventIndex] = { ...events[eventIndex], participants };
      return { ...current, screeningEvents: events };
    });
  }

  function updateLoi(index: number, patch: Partial<LoiDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.lois];
      next[index] = { ...next[index], ...patch };
      return { ...current, lois: next };
    });
  }

  function updateFundraise(index: number, patch: Partial<FundraiseDraft>) {
    setDraft((current) => {
      if (!current) return current;
      const next = [...current.fundraises];
      next[index] = { ...next[index], ...patch };
      return { ...current, fundraises: next };
    });
  }

  function updateFundraiseInvestor(
    fundraiseIndex: number,
    investorIndex: number,
    patch: Partial<FundraiseInvestorDraft>
  ) {
    setDraft((current) => {
      if (!current) return current;
      const fundraises = [...current.fundraises];
      const investors = [...fundraises[fundraiseIndex].investors];
      investors[investorIndex] = { ...investors[investorIndex], ...patch };
      fundraises[fundraiseIndex] = { ...fundraises[fundraiseIndex], investors };
      return { ...current, fundraises };
    });
  }

  async function savePipeline() {
    if (!draft) return;

    setSaving(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/companies/${companyId}/pipeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(serializePipelineDraft(draft))
      });

      const payload = (await res.json()) as { pipeline?: unknown; error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to save pipeline");
      }

      setDraft(hydratePipelineDraft(payload.pipeline));
      setStatus({ kind: "ok", text: "Pipeline saved." });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save pipeline"
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading || !draft) {
    return (
      <div className="detail-section">
        <p className="detail-label">Pipeline Management</p>
        <p className="muted">Loading pipeline details...</p>
      </div>
    );
  }

  return (
    <div className="detail-section">
      <p className="detail-label">Pipeline Management</p>
      <p className="muted">
        Track intake, venture studio negotiation, screening participation, LOI conversion, fundraise, and ongoing
        commercial pursuits.
      </p>

      <div className="detail-grid">
        <div>
          <label>Pipeline Phase</label>
          <select value={draft.phase} onChange={(event) => updateDraft({ phase: event.target.value as PipelinePhase })}>
            {pipelinePhaseOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Intake Decision</label>
          <select
            value={draft.intakeDecision}
            onChange={(event) => updateDraft({ intakeDecision: event.target.value as IntakeDecision })}
          >
            {intakeDecisionOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Intake Decision Date</label>
          <DateInputField
            value={draft.intakeDecisionAt}
            onChange={(nextValue) => updateDraft({ intakeDecisionAt: nextValue })}
          />
        </div>
        <div>
          <label>Target LOIs</label>
          <input
            type="number"
            min="1"
            max="50"
            value={draft.targetLoiCount}
            onChange={(event) => updateDraft({ targetLoiCount: event.target.value })}
          />
        </div>
        <div>
          <label>VS Contract Executed</label>
          <DateInputField
            value={draft.ventureStudioContractExecutedAt}
            onChange={(nextValue) => updateDraft({ ventureStudioContractExecutedAt: nextValue })}
          />
        </div>
        <div>
          <label>S1 Investment Date</label>
          <DateInputField
            value={draft.s1InvestmentAt}
            onChange={(nextValue) => updateDraft({ s1InvestmentAt: nextValue })}
          />
        </div>
        <div>
          <label>S1 Investment Amount (USD)</label>
          <input
            value={draft.s1InvestmentAmountUsd}
            onChange={(event) => updateDraft({ s1InvestmentAmountUsd: event.target.value })}
            placeholder="0"
          />
        </div>
        <div>
          <label>Portfolio Added Date</label>
          <DateInputField
            value={draft.portfolioAddedAt}
            onChange={(nextValue) => updateDraft({ portfolioAddedAt: nextValue })}
          />
        </div>
      </div>

      <div className="detail-section">
        <label>
          <input
            type="checkbox"
            checked={draft.s1Invested}
            onChange={(event) => updateDraft({ s1Invested: event.target.checked })}
          />{" "}
          S1 Invested
        </label>
        <label>Intake Decision Notes</label>
        <textarea
          value={draft.intakeDecisionNotes}
          onChange={(event) => updateDraft({ intakeDecisionNotes: event.target.value })}
          placeholder="Notes on why we advanced or declined"
        />
      </div>

      <div className="detail-section">
        <p className="detail-label">Documents</p>
        <div className="detail-list-item">
          <p className="detail-label">Add Company Document</p>
          <div className="detail-grid">
            <div>
              <label>Document Type</label>
              <select
                value={googleDocumentDraft.type}
                onChange={(event) =>
                  setGoogleDocumentDraft((current) => ({
                    ...current,
                    type: event.target.value as DocumentType
                  }))
                }
              >
                {documentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Google Doc Title (optional)</label>
              <input
                value={googleDocumentDraft.title}
                onChange={(event) =>
                  setGoogleDocumentDraft((current) => ({
                    ...current,
                    title: event.target.value
                  }))
                }
                placeholder="Quarterly diligence summary"
              />
            </div>
            <div>
              <label>Google Docs Link</label>
              <input
                value={googleDocumentDraft.url}
                onChange={(event) =>
                  setGoogleDocumentDraft((current) => ({
                    ...current,
                    url: event.target.value
                  }))
                }
                placeholder="https://docs.google.com/..."
              />
            </div>
            <div>
              <label>Upload from Computer</label>
              <input
                type="file"
                accept={companyDocumentUploadAccept}
                disabled={uploadingDocument || saving}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void addUploadedDocument(file);
                }}
              />
            </div>
          </div>
          <div className="actions">
            <button
              className="secondary small"
              type="button"
              onClick={addGoogleDocument}
              disabled={uploadingDocument || saving}
            >
              Add Google Doc Link
            </button>
          </div>
          <p className="muted">{`Uploads are limited to ${companyDocumentMaxSizeMb} MB per file.`}</p>
        </div>
        {draft.documents.length === 0 && <p className="muted">No documents yet.</p>}
        {draft.documents.map((document, index) => (
          <div key={`document-${index}`} className="detail-list-item">
            <div className="detail-grid">
              <div>
                <label>Type</label>
                <select
                  value={document.type}
                  onChange={(event) => updateDocument(index, { type: event.target.value as DocumentType })}
                >
                  {documentTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Uploaded Date</label>
                <DateInputField
                  value={document.uploadedAt}
                  onChange={(nextValue) => updateDocument(index, { uploadedAt: nextValue })}
                />
              </div>
              <div>
                <label>Title</label>
                <input value={document.title} onChange={(event) => updateDocument(index, { title: event.target.value })} />
              </div>
              <div>
                <label>URL</label>
                {document.url.startsWith("data:") ? (
                  <>
                    <input value="Uploaded file (stored in record)" readOnly />
                    <button
                      className="ghost small"
                      type="button"
                      onClick={() => updateDocument(index, { url: "" })}
                      style={{ marginTop: 8 }}
                    >
                      Replace with Link
                    </button>
                  </>
                ) : (
                  <input
                    value={document.url}
                    onChange={(event) => updateDocument(index, { url: event.target.value })}
                    placeholder="https://..."
                  />
                )}
              </div>
            </div>
            <label>Notes</label>
            <textarea value={document.notes} onChange={(event) => updateDocument(index, { notes: event.target.value })} />
            <div className="actions">
              <button
                className="ghost small"
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    if (!current) return current;
                    return { ...current, documents: current.documents.filter((_, itemIndex) => itemIndex !== index) };
                  })
                }
              >
                Remove Document
              </button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setDraft((current) => {
                if (!current) return current;
                return { ...current, documents: [...current.documents, emptyDocument()] };
              })
            }
          >
            Add Document
          </button>
        </div>
      </div>

      <div className="detail-section">
        <p className="detail-label">Opportunities</p>
        {draft.opportunities.length === 0 && <p className="muted">No opportunities yet.</p>}
        {draft.opportunities.map((opportunity, index) => (
          <div key={`opportunity-${index}`} className="detail-list-item">
            <div className="detail-grid">
              <div>
                <label>Type</label>
                <select
                  value={opportunity.type}
                  onChange={(event) => updateOpportunity(index, { type: event.target.value as OpportunityType })}
                >
                  {opportunityTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Stage</label>
                <select
                  value={opportunity.stage}
                  onChange={(event) => updateOpportunity(index, { stage: event.target.value as OpportunityStage })}
                >
                  {opportunityStageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Title</label>
                <input
                  value={opportunity.title}
                  onChange={(event) => updateOpportunity(index, { title: event.target.value })}
                  placeholder="S1 term sheet"
                />
              </div>
              <div>
                <label>Health System (optional)</label>
                <EntityLookupInput
                  entityKind="HEALTH_SYSTEM"
                  value={opportunity.healthSystemId}
                  onChange={(nextValue) => updateOpportunity(index, { healthSystemId: nextValue })}
                  allowEmpty
                  emptyLabel="Not specific to a health system"
                  initialOptions={healthSystemOptions.map((system) => ({
                    id: system.id,
                    name: system.name
                  }))}
                  placeholder="Search health systems"
                  onEntityCreated={(option) => addHealthSystemOption(option)}
                />
              </div>
              <div>
                <label>Likelihood (%)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={opportunity.likelihoodPercent}
                  onChange={(event) => updateOpportunity(index, { likelihoodPercent: event.target.value })}
                />
              </div>
              <div>
                <label>Amount (USD)</label>
                <input
                  value={opportunity.amountUsd}
                  onChange={(event) => updateOpportunity(index, { amountUsd: event.target.value })}
                  placeholder="0"
                />
              </div>
              <div>
                <label>Estimated Close</label>
                <DateInputField
                  value={opportunity.estimatedCloseDate}
                  onChange={(nextValue) => updateOpportunity(index, { estimatedCloseDate: nextValue })}
                />
              </div>
              <div>
                <label>Closed Date</label>
                <DateInputField
                  value={opportunity.closedAt}
                  onChange={(nextValue) => updateOpportunity(index, { closedAt: nextValue })}
                />
              </div>
            </div>
            <label>Next Steps</label>
            <textarea
              value={opportunity.nextSteps}
              onChange={(event) => updateOpportunity(index, { nextSteps: event.target.value })}
            />
            <label>Notes</label>
            <textarea value={opportunity.notes} onChange={(event) => updateOpportunity(index, { notes: event.target.value })} />
            <div className="actions">
              <button
                className="ghost small"
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    if (!current) return current;
                    return { ...current, opportunities: current.opportunities.filter((_, itemIndex) => itemIndex !== index) };
                  })
                }
              >
                Remove Opportunity
              </button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setDraft((current) => {
                if (!current) return current;
                return { ...current, opportunities: [...current.opportunities, emptyOpportunity()] };
              })
            }
          >
            Add Opportunity
          </button>
        </div>
      </div>

      <div className="detail-section">
        <p className="detail-label">Screening Events</p>
        {draft.screeningEvents.length === 0 && <p className="muted">No screening events yet.</p>}
        {draft.screeningEvents.map((event, eventIndex) => (
          <div key={`screening-${eventIndex}`} className="detail-list-item">
            <div className="detail-grid">
              <div>
                <label>Event Type</label>
                <select
                  value={event.type}
                  onChange={(entry) => updateScreeningEvent(eventIndex, { type: entry.target.value as ScreeningEventType })}
                >
                  {screeningEventTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Title</label>
                <input value={event.title} onChange={(entry) => updateScreeningEvent(eventIndex, { title: entry.target.value })} />
              </div>
              <div>
                <label>Scheduled Date</label>
                <DateInputField
                  value={event.scheduledAt}
                  onChange={(nextValue) => updateScreeningEvent(eventIndex, { scheduledAt: nextValue })}
                />
              </div>
              <div>
                <label>Completed Date</label>
                <DateInputField
                  value={event.completedAt}
                  onChange={(nextValue) => updateScreeningEvent(eventIndex, { completedAt: nextValue })}
                />
              </div>
            </div>
            <label>Notes</label>
            <textarea value={event.notes} onChange={(entry) => updateScreeningEvent(eventIndex, { notes: entry.target.value })} />

            <p className="detail-label">Participants</p>
            {event.participants.length === 0 && <p className="muted">No participants captured.</p>}
            {event.participants.map((participant, participantIndex) => (
              <div key={`participant-${eventIndex}-${participantIndex}`} className="detail-list-item">
                <div className="detail-grid">
                  <div>
                    <label>Health System</label>
                    <EntityLookupInput
                      entityKind="HEALTH_SYSTEM"
                      value={participant.healthSystemId}
                      onChange={(nextValue) =>
                        updateScreeningParticipant(eventIndex, participantIndex, { healthSystemId: nextValue })
                      }
                      allowEmpty
                      emptyLabel="No health system selected"
                      initialOptions={healthSystemOptions.map((system) => ({
                        id: system.id,
                        name: system.name
                      }))}
                      placeholder="Search health systems"
                      onEntityCreated={(option) => addHealthSystemOption(option)}
                    />
                  </div>
                  <div>
                    <label>Contact</label>
                    <EntityLookupInput
                      entityKind="CONTACT"
                      value={participant.contactId}
                      onChange={(nextValue) =>
                        updateScreeningParticipant(eventIndex, participantIndex, { contactId: nextValue })
                      }
                      allowEmpty
                      emptyLabel="No contact selected"
                      initialOptions={contactOptions.map((contact) => ({
                        id: contact.id,
                        name: contact.name,
                        subtitle: contact.title || null
                      }))}
                      placeholder="Search contacts"
                      contactCreateContext={{
                        parentType: "company",
                        parentId: companyId,
                        roleType: "COMPANY_CONTACT"
                      }}
                      onEntityCreated={(option) => addContactOption(option)}
                    />
                  </div>
                  <div>
                    <label>Attendance</label>
                    <select
                      value={participant.attendanceStatus}
                      onChange={(entry) =>
                        updateScreeningParticipant(eventIndex, participantIndex, {
                          attendanceStatus: entry.target.value as AttendanceStatus
                        })
                      }
                    >
                      {attendanceStatusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <label>Notes</label>
                <textarea
                  value={participant.notes}
                  onChange={(entry) => updateScreeningParticipant(eventIndex, participantIndex, { notes: entry.target.value })}
                />
                <div className="actions">
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() =>
                      setDraft((current) => {
                        if (!current) return current;
                        const events = [...current.screeningEvents];
                        events[eventIndex] = {
                          ...events[eventIndex],
                          participants: events[eventIndex].participants.filter((_, idx) => idx !== participantIndex)
                        };
                        return { ...current, screeningEvents: events };
                      })
                    }
                  >
                    Remove Participant
                  </button>
                </div>
              </div>
            ))}

            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    if (!current) return current;
                    const events = [...current.screeningEvents];
                    events[eventIndex] = {
                      ...events[eventIndex],
                      participants: [...events[eventIndex].participants, emptyParticipant()]
                    };
                    return { ...current, screeningEvents: events };
                  })
                }
              >
                Add Participant
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    if (!current) return current;
                    return {
                      ...current,
                      screeningEvents: current.screeningEvents.filter((_, itemIndex) => itemIndex !== eventIndex)
                    };
                  })
                }
              >
                Remove Event
              </button>
            </div>
          </div>
        ))}
        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setDraft((current) => {
                if (!current) return current;
                return { ...current, screeningEvents: [...current.screeningEvents, emptyScreeningEvent()] };
              })
            }
          >
            Add Screening Event
          </button>
        </div>
      </div>

      <div className="detail-section">
        <p className="detail-label">LOI Tracker</p>
        <p className="muted">
          Signed LOIs: <strong>{signedLoiCount}</strong> / {loiTargetCount}
          <span className={`status-pill ${signedLoiCount >= loiTargetCount ? "done" : "queued"}`} style={{ marginLeft: 8 }}>
            {signedLoiCount >= loiTargetCount ? "S1 Ready" : "In Progress"}
          </span>
        </p>

        {draft.lois.length === 0 && <p className="muted">No LOI statuses yet.</p>}
        {draft.lois.map((loi, index) => (
          <div key={`loi-${index}`} className="detail-list-item">
            <div className="detail-grid">
              <div>
                <label>Health System</label>
                <EntityLookupInput
                  entityKind="HEALTH_SYSTEM"
                  value={loi.healthSystemId}
                  onChange={(nextValue) => updateLoi(index, { healthSystemId: nextValue })}
                  allowEmpty
                  emptyLabel="No health system selected"
                  initialOptions={healthSystemOptions.map((system) => ({
                    id: system.id,
                    name: system.name
                  }))}
                  placeholder="Search health systems"
                  onEntityCreated={(option) => addHealthSystemOption(option)}
                />
              </div>
              <div>
                <label>Status</label>
                <select value={loi.status} onChange={(event) => updateLoi(index, { status: event.target.value as LoiStatus })}>
                  {loiStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Signed Date</label>
                <DateInputField value={loi.signedAt} onChange={(nextValue) => updateLoi(index, { signedAt: nextValue })} />
              </div>
            </div>
            <label>Notes</label>
            <textarea value={loi.notes} onChange={(event) => updateLoi(index, { notes: event.target.value })} />
            <div className="actions">
              <button
                className="ghost small"
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    if (!current) return current;
                    return { ...current, lois: current.lois.filter((_, itemIndex) => itemIndex !== index) };
                  })
                }
              >
                Remove LOI Status
              </button>
            </div>
          </div>
        ))}

        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setDraft((current) => {
                if (!current) return current;
                return { ...current, lois: [...current.lois, emptyLoi()] };
              })
            }
          >
            Add LOI Status
          </button>
        </div>
      </div>

      <div className="detail-section">
        <p className="detail-label">Fundraise</p>
        {draft.fundraises.length === 0 && <p className="muted">No fundraise rounds yet.</p>}
        {draft.fundraises.map((fundraise, fundraiseIndex) => (
          <div key={`fundraise-${fundraiseIndex}`} className="detail-list-item">
            <div className="detail-grid">
              <div>
                <label>Round</label>
                <input
                  value={fundraise.roundLabel}
                  onChange={(event) => updateFundraise(fundraiseIndex, { roundLabel: event.target.value })}
                  placeholder="S1 Strategic Round"
                />
              </div>
              <div>
                <label>Status</label>
                <select
                  value={fundraise.status}
                  onChange={(event) => updateFundraise(fundraiseIndex, { status: event.target.value as FundraiseStatus })}
                >
                  {fundraiseStatusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Total Amount (USD)</label>
                <input
                  value={fundraise.totalAmountUsd}
                  onChange={(event) => updateFundraise(fundraiseIndex, { totalAmountUsd: event.target.value })}
                />
              </div>
              <div>
                <label>S1 Amount (USD)</label>
                <input
                  value={fundraise.s1InvestmentUsd}
                  onChange={(event) => updateFundraise(fundraiseIndex, { s1InvestmentUsd: event.target.value })}
                />
              </div>
              <div>
                <label>Announced</label>
                <DateInputField
                  value={fundraise.announcedAt}
                  onChange={(nextValue) => updateFundraise(fundraiseIndex, { announcedAt: nextValue })}
                />
              </div>
              <div>
                <label>Closed</label>
                <DateInputField
                  value={fundraise.closedAt}
                  onChange={(nextValue) => updateFundraise(fundraiseIndex, { closedAt: nextValue })}
                />
              </div>
            </div>
            <label>Notes</label>
            <textarea value={fundraise.notes} onChange={(event) => updateFundraise(fundraiseIndex, { notes: event.target.value })} />

            <p className="detail-label">Co-Investors</p>
            {fundraise.investors.length === 0 && <p className="muted">No co-investors yet.</p>}
            {fundraise.investors.map((investor, investorIndex) => (
              <div key={`fundraise-${fundraiseIndex}-investor-${investorIndex}`} className="detail-list-item">
                <div className="detail-grid">
                  <div>
                    <label>Co-Investor Record</label>
                    <EntityLookupInput
                      entityKind="CO_INVESTOR"
                      value={investor.coInvestorId}
                      onChange={(nextValue) =>
                        updateFundraiseInvestor(fundraiseIndex, investorIndex, { coInvestorId: nextValue })
                      }
                      allowEmpty
                      emptyLabel="Not linked"
                      initialOptions={coInvestorOptions.map((entry) => ({
                        id: entry.id,
                        name: entry.name
                      }))}
                      placeholder="Search co-investors"
                      onEntityCreated={(option) => addCoInvestorOption(option)}
                    />
                  </div>
                  <div>
                    <label>Investor Name</label>
                    <input
                      value={investor.investorName}
                      onChange={(event) =>
                        updateFundraiseInvestor(fundraiseIndex, investorIndex, { investorName: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label>Amount (USD)</label>
                    <input
                      value={investor.investmentAmountUsd}
                      onChange={(event) =>
                        updateFundraiseInvestor(fundraiseIndex, investorIndex, { investmentAmountUsd: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label>
                      <input
                        type="checkbox"
                        checked={investor.isLeadInvestor}
                        onChange={(event) =>
                          updateFundraiseInvestor(fundraiseIndex, investorIndex, { isLeadInvestor: event.target.checked })
                        }
                      />{" "}
                      Lead Investor
                    </label>
                  </div>
                </div>
                <label>Notes</label>
                <textarea
                  value={investor.notes}
                  onChange={(event) => updateFundraiseInvestor(fundraiseIndex, investorIndex, { notes: event.target.value })}
                />
                <div className="actions">
                  <button
                    className="ghost small"
                    type="button"
                    onClick={() =>
                      setDraft((current) => {
                        if (!current) return current;
                        const fundraises = [...current.fundraises];
                        fundraises[fundraiseIndex] = {
                          ...fundraises[fundraiseIndex],
                          investors: fundraises[fundraiseIndex].investors.filter((_, idx) => idx !== investorIndex)
                        };
                        return { ...current, fundraises };
                      })
                    }
                  >
                    Remove Co-Investor
                  </button>
                </div>
              </div>
            ))}

            <div className="actions">
              <button
                className="secondary"
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    if (!current) return current;
                    const fundraises = [...current.fundraises];
                    fundraises[fundraiseIndex] = {
                      ...fundraises[fundraiseIndex],
                      investors: [...fundraises[fundraiseIndex].investors, emptyFundraiseInvestor()]
                    };
                    return { ...current, fundraises };
                  })
                }
              >
                Add Co-Investor
              </button>
              <button
                className="ghost small"
                type="button"
                onClick={() =>
                  setDraft((current) => {
                    if (!current) return current;
                    return {
                      ...current,
                      fundraises: current.fundraises.filter((_, itemIndex) => itemIndex !== fundraiseIndex)
                    };
                  })
                }
              >
                Remove Fundraise
              </button>
            </div>
          </div>
        ))}

        <div className="actions">
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setDraft((current) => {
                if (!current) return current;
                return { ...current, fundraises: [...current.fundraises, emptyFundraise()] };
              })
            }
          >
            Add Fundraise
          </button>
        </div>
      </div>

      <div className="actions">
        <button className="primary" type="button" onClick={savePipeline} disabled={saving}>
          {saving ? "Saving..." : "Save Pipeline"}
        </button>
      </div>

      {status && <p className={`status ${status.kind}`}>{status.text}</p>}
    </div>
  );
}
