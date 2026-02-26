"use client";

import * as React from "react";
import {
  InlineSelectField,
  InlineTextField,
  InlineTextareaField
} from "./inline-detail-field";
import { SearchMatchModal } from "./search-match-modal";
import { CompanyPipelineManager } from "./company-pipeline-manager";
import { EntityLookupInput } from "./entity-lookup-input";
import { AddContactModal } from "./add-contact-modal";
import { EntityDocumentsPane } from "./entity-documents-pane";
import { EntityNotesPane } from "./entity-notes-pane";
import { RichTextArea } from "./rich-text-area";

type SearchCandidate = {
  name: string;
  website?: string;
  headquartersCity?: string;
  headquartersState?: string;
  headquartersCountry?: string;
  summary?: string;
  sourceUrls: string[];
};

type ManualSearchCandidate = {
  name: string;
  website: string;
  headquartersCity: string;
  headquartersState: string;
  headquartersCountry: string;
};

type CoInvestorOption = {
  id: string;
  name: string;
};

type ResearchStatus = "DRAFT" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
type IntakeStatus = "NOT_SCHEDULED" | "SCHEDULED" | "COMPLETED" | "SCREENING_EVALUATION";
type CompanyType = "STARTUP" | "SPIN_OUT" | "DENOVO";
type PrimaryCategory =
  | "PATIENT_ACCESS_AND_GROWTH"
  | "CARE_DELIVERY_TECH_ENABLED_SERVICES"
  | "CLINICAL_WORKFLOW_AND_PRODUCTIVITY"
  | "REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS"
  | "VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT"
  | "AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT"
  | "DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION"
  | "REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES"
  | "DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT"
  | "PHARMACY_AND_MEDICATION_ENABLEMENT"
  | "SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS"
  | "SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE"
  | "PROVIDER_EXPERIENCE_AND_DEVELOPMENT"
  | "OTHER";
type DeclineReason =
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
type LeadSourceType = "HEALTH_SYSTEM" | "OTHER";

type CompanyHealthSystemLink = {
  id: string;
  healthSystemId: string;
  relationshipType: "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER";
  notes: string | null;
  investmentAmountUsd: number | string | null;
  ownershipPercent: number | string | null;
  healthSystem: { id: string; name: string };
};

type CompanyCoInvestorLink = {
  id: string;
  coInvestorId: string;
  relationshipType: "INVESTOR" | "PARTNER" | "OTHER";
  notes: string | null;
  investmentAmountUsd: number | string | null;
  coInvestor: { id: string; name: string };
};

type CompanyRecord = {
  id: string;
  name: string;
  legalName?: string | null;
  website?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
  companyType: CompanyType;
  primaryCategory: PrimaryCategory;
  primaryCategoryOther?: string | null;
  declineReason: DeclineReason | null;
  declineReasonOther?: string | null;
  leadSourceType: LeadSourceType;
  leadSourceHealthSystemId?: string | null;
  leadSourceHealthSystem?: {
    id: string;
    name: string;
  } | null;
  leadSourceOther?: string | null;
  leadSourceNotes?: string | null;
  description?: string | null;
  atAGlanceProblem?: string | null;
  atAGlanceSolution?: string | null;
  atAGlanceImpact?: string | null;
  atAGlanceKeyStrengths?: string | null;
  atAGlanceKeyConsiderations?: string | null;
  googleTranscriptUrl?: string | null;
  spinOutOwnershipPercent?: number | string | null;
  intakeStatus: IntakeStatus;
  intakeScheduledAt?: string | null;
  screeningEvaluationAt?: string | null;
  researchStatus: ResearchStatus;
  researchNotes?: string | null;
  researchError?: string | null;
  healthSystemLinks: CompanyHealthSystemLink[];
  coInvestorLinks: CompanyCoInvestorLink[];
  contactLinks: Array<{
    id: string;
    roleType: "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "COMPANY_CONTACT" | "OTHER";
    title?: string | null;
    contact: {
      id: string;
      name: string;
      title?: string | null;
      email?: string | null;
      phone?: string | null;
      linkedinUrl?: string | null;
    };
  }>;
};

type HealthSystemOption = {
  id: string;
  name: string;
};

type DetailDraft = {
  name: string;
  legalName: string;
  website: string;
  headquartersCity: string;
  headquartersState: string;
  headquartersCountry: string;
  companyType: CompanyType;
  primaryCategory: PrimaryCategory;
  primaryCategoryOther: string;
  declineReason: DeclineReason | "";
  declineReasonOther: string;
  leadSourceType: LeadSourceType;
  leadSourceHealthSystemId: string;
  leadSourceOther: string;
  leadSourceNotes: string;
  description: string;
  atAGlanceProblem: string;
  atAGlanceSolution: string;
  atAGlanceImpact: string;
  atAGlanceKeyStrengths: string;
  atAGlanceKeyConsiderations: string;
  googleTranscriptUrl: string;
  spinOutOwnershipPercent: string;
  intakeStatus: IntakeStatus;
  intakeScheduledAt: string;
  screeningEvaluationAt: string;
  researchNotes: string;
  healthSystemLinks: Array<{
    healthSystemId: string;
    relationshipType: "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER";
    notes: string;
    investmentAmountUsd: string;
    ownershipPercent: string;
  }>;
  coInvestorLinks: Array<{
    coInvestorId: string;
    relationshipType: "INVESTOR" | "PARTNER" | "OTHER";
    notes: string;
    investmentAmountUsd: string;
  }>;
};

type DetailTab = "overview" | "at-a-glance" | "documents" | "notes" | "contacts" | "relationships" | "pipeline";

const companyHealthSystemRelationshipOptions: Array<{ value: "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"; label: string }> =
  [
    { value: "CUSTOMER", label: "Customer" },
    { value: "SPIN_OUT_PARTNER", label: "Spin-out Partner" },
    { value: "INVESTOR_PARTNER", label: "Investor Partner" },
    { value: "OTHER", label: "Other" }
  ];

const companyCoInvestorRelationshipOptions: Array<{ value: "INVESTOR" | "PARTNER" | "OTHER"; label: string }> = [
  { value: "INVESTOR", label: "Investor" },
  { value: "PARTNER", label: "Partner" },
  { value: "OTHER", label: "Other" }
];

const companyTypeOptions: Array<{ value: CompanyType; label: string }> = [
  { value: "STARTUP", label: "Startup" },
  { value: "SPIN_OUT", label: "Spin-out" },
  { value: "DENOVO", label: "DeNovo" }
];

const primaryCategoryOptions: Array<{ value: PrimaryCategory; label: string }> = [
  { value: "PATIENT_ACCESS_AND_GROWTH", label: "Patient Access & Growth" },
  {
    value: "CARE_DELIVERY_TECH_ENABLED_SERVICES",
    label: "Care Delivery (Tech-Enabled Services)"
  },
  { value: "CLINICAL_WORKFLOW_AND_PRODUCTIVITY", label: "Clinical Workflow & Productivity" },
  { value: "REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS", label: "Revenue Cycle & Financial Operations" },
  {
    value: "VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT",
    label: "Value-Based Care & Population Health Enablement"
  },
  { value: "AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT", label: "AI Automation & Decision Support" },
  { value: "DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION", label: "Data Platform & Interoperability" },
  { value: "REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES", label: "Remote Patient Monitoring & Devices" },
  { value: "DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT", label: "Diagnostics, Imaging & Testing Enablement" },
  { value: "PHARMACY_AND_MEDICATION_ENABLEMENT", label: "Pharmacy & Medication Enablement" },
  { value: "SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS", label: "Supply Chain, Procurement & Assets" },
  { value: "SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE", label: "Security, Privacy & Compliance Infrastructure" },
  { value: "PROVIDER_EXPERIENCE_AND_DEVELOPMENT", label: "Provider Experience & Development" },
  { value: "OTHER", label: "Other" }
];

const declineReasonOptions: Array<{ value: DeclineReason | ""; label: string }> = [
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

const leadSourceOptions: Array<{ value: LeadSourceType; label: string }> = [
  { value: "OTHER", label: "Other" },
  { value: "HEALTH_SYSTEM", label: "Health System" }
];

function formatLocation(record: {
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
}) {
  return [record.headquartersCity, record.headquartersState, record.headquartersCountry].filter(Boolean).join(", ");
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function normalizeForMatch(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeWebsiteForMatch(value?: string | null) {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/g, "");
    return `${host}${path || ""}`;
  } catch {
    return trimmed.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/g, "").replace(/\/+/g, "/");
  }
}

function findDuplicateRecord(records: CompanyRecord[], candidate: SearchCandidate) {
  const candidateName = normalizeForMatch(candidate.name);
  if (!candidateName) return null;

  const candidateWebsite = normalizeWebsiteForMatch(candidate.website);
  return (
    records.find((record) => {
      const recordName = normalizeForMatch(record.name);
      if (recordName !== candidateName) return false;

      const recordWebsite = normalizeWebsiteForMatch(record.website);
      if (candidateWebsite && recordWebsite && candidateWebsite === recordWebsite) {
        return true;
      }

      const candidateCity = normalizeForMatch(candidate.headquartersCity);
      const candidateState = normalizeForMatch(candidate.headquartersState);
      const candidateCountry = normalizeForMatch(candidate.headquartersCountry);
      const recordCity = normalizeForMatch(record.headquartersCity);
      const recordState = normalizeForMatch(record.headquartersState);
      const recordCountry = normalizeForMatch(record.headquartersCountry);

      const comparableParts = [
        [candidateCity, recordCity],
        [candidateState, recordState],
        [candidateCountry, recordCountry]
      ].filter(([candidateValue, recordValue]) => candidateValue || recordValue);

      if (comparableParts.length === 0) return false;
      return comparableParts.every(([candidateValue, recordValue]) => candidateValue === recordValue);
    }) || null
  );
}

function statusClass(status: ResearchStatus) {
  if (status === "COMPLETED") return "done";
  if (status === "FAILED") return "failed";
  if (status === "RUNNING") return "running";
  if (status === "QUEUED") return "queued";
  return "draft";
}

function isResearchInProgress(status: ResearchStatus) {
  return status === "QUEUED" || status === "RUNNING";
}

function intakeStatusClass(status: IntakeStatus, intakeScheduledAt?: string | null) {
  if (status === "SCREENING_EVALUATION") return "done";
  if (status === "COMPLETED") return "done";
  if (status === "SCHEDULED" && intakeScheduledAt) return "queued";
  return "draft";
}

function intakeStatusLabel(status: IntakeStatus, intakeScheduledAt: string) {
  const scheduledLabel = toDateInputValue(intakeScheduledAt);

  if (status === "SCREENING_EVALUATION") return "Screening Evaluation";
  if (status === "COMPLETED") return "Completed";
  if (status === "SCHEDULED" && scheduledLabel) return scheduledLabel;
  return "Not Scheduled";
}

function toNullableNumber(value: string): number | null {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseNumber(value: string | number | null | undefined): string {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value.toString() : "";
  }
  return value || "";
}

function buildFallbackCandidate(term: string): SearchCandidate {
  return {
    name: term,
    website: "",
    headquartersCity: "",
    headquartersState: "",
    headquartersCountry: "",
    summary: "Created from search term.",
    sourceUrls: []
  };
}

function draftFromRecord(record: CompanyRecord): DetailDraft {
  return {
    name: record.name || "",
    legalName: record.legalName || "",
    website: record.website || "",
    headquartersCity: record.headquartersCity || "",
    headquartersState: record.headquartersState || "",
    headquartersCountry: record.headquartersCountry || "",
    companyType: record.companyType || "STARTUP",
    primaryCategory: record.primaryCategory || "OTHER",
    primaryCategoryOther: record.primaryCategoryOther || "",
    declineReason: record.declineReason || "",
    declineReasonOther: record.declineReasonOther || "",
    leadSourceType: record.leadSourceType || "OTHER",
    leadSourceHealthSystemId: record.leadSourceHealthSystemId || "",
    leadSourceOther: record.leadSourceOther || "",
    leadSourceNotes: record.leadSourceNotes || "",
    description: record.description || "",
    atAGlanceProblem: record.atAGlanceProblem || "",
    atAGlanceSolution: record.atAGlanceSolution || "",
    atAGlanceImpact: record.atAGlanceImpact || "",
    atAGlanceKeyStrengths: record.atAGlanceKeyStrengths || "",
    atAGlanceKeyConsiderations: record.atAGlanceKeyConsiderations || "",
    googleTranscriptUrl: record.googleTranscriptUrl || "",
    spinOutOwnershipPercent: parseNumber(record.spinOutOwnershipPercent),
    intakeStatus: record.intakeStatus || "NOT_SCHEDULED",
    intakeScheduledAt: toDateInputValue(record.intakeScheduledAt),
    screeningEvaluationAt: toDateInputValue(record.screeningEvaluationAt),
    researchNotes: record.researchNotes || "",
    healthSystemLinks: record.healthSystemLinks.map((link) => ({
      healthSystemId: link.healthSystemId,
      relationshipType: link.relationshipType,
      notes: link.notes || "",
      investmentAmountUsd: parseNumber(link.investmentAmountUsd),
      ownershipPercent: parseNumber(link.ownershipPercent)
    })),
    coInvestorLinks: record.coInvestorLinks.map((link) => ({
      coInvestorId: link.coInvestorId,
      relationshipType: link.relationshipType,
      notes: link.notes || "",
      investmentAmountUsd: parseNumber(link.investmentAmountUsd)
    }))
  };
}

export function CompanyWorkbench() {
  const [query, setQuery] = React.useState("");
  const [records, setRecords] = React.useState<CompanyRecord[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<HealthSystemOption[]>([]);
  const [coInvestors, setCoInvestors] = React.useState<CoInvestorOption[]>([]);
  const [selectedRecordId, setSelectedRecordId] = React.useState<string | null>(null);
  const [draftRecordId, setDraftRecordId] = React.useState<string | null>(null);
  const [detailDraft, setDetailDraft] = React.useState<DetailDraft | null>(null);
  const [runningAgent, setRunningAgent] = React.useState(false);
  const [creatingFromSearch, setCreatingFromSearch] = React.useState(false);
  const [deletingRecordId, setDeletingRecordId] = React.useState<string | null>(null);
  const [searchCandidates, setSearchCandidates] = React.useState<SearchCandidate[]>([]);
  const [candidateSearchQuery, setCandidateSearchQuery] = React.useState("");
  const [searchingCandidates, setSearchingCandidates] = React.useState(false);
  const [searchCandidateError, setSearchCandidateError] = React.useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = React.useState(-1);
  const [searchMatchCandidateCache] = React.useState(() => new Map<string, SearchCandidate[]>());
  const [searchAbortController, setSearchAbortController] = React.useState<AbortController | null>(null);
  const [matchModalOpen, setMatchModalOpen] = React.useState(false);
  const [matchModalManualMode, setMatchModalManualMode] = React.useState(false);
  const [manualMatchCandidate, setManualMatchCandidate] = React.useState<ManualSearchCandidate>({
    name: "",
    website: "",
    headquartersCity: "",
    headquartersState: "",
    headquartersCountry: ""
  });
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [addingContact, setAddingContact] = React.useState(false);
  const [addContactModalOpen, setAddContactModalOpen] = React.useState(false);
  const [contactName, setContactName] = React.useState("");
  const [contactTitle, setContactTitle] = React.useState("");
  const [contactRelationshipTitle, setContactRelationshipTitle] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactLinkedinUrl, setContactLinkedinUrl] = React.useState("");
  const [contactRoleType, setContactRoleType] = React.useState<
    "COMPANY_CONTACT" | "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
  >("COMPANY_CONTACT");
  const [editingContactLinkId, setEditingContactLinkId] = React.useState<string | null>(null);
  const [editingContactName, setEditingContactName] = React.useState("");
  const [editingContactTitle, setEditingContactTitle] = React.useState("");
  const [editingContactRelationshipTitle, setEditingContactRelationshipTitle] = React.useState("");
  const [editingContactEmail, setEditingContactEmail] = React.useState("");
  const [editingContactPhone, setEditingContactPhone] = React.useState("");
  const [editingContactLinkedinUrl, setEditingContactLinkedinUrl] = React.useState("");
  const [editingContactRoleType, setEditingContactRoleType] = React.useState<
    "COMPANY_CONTACT" | "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
  >("COMPANY_CONTACT");
  const [updatingContact, setUpdatingContact] = React.useState(false);
  const [deletingContactLinkId, setDeletingContactLinkId] = React.useState<string | null>(null);
  const [addingHealthSystemLink, setAddingHealthSystemLink] = React.useState(false);
  const [editingHealthSystemLinkId, setEditingHealthSystemLinkId] = React.useState<string | null>(null);
  const [editingHealthSystemRelationshipType, setEditingHealthSystemRelationshipType] = React.useState<
    "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
  >("CUSTOMER");
  const [editingHealthSystemNotes, setEditingHealthSystemNotes] = React.useState("");
  const [editingHealthSystemInvestmentAmountUsd, setEditingHealthSystemInvestmentAmountUsd] = React.useState("");
  const [editingHealthSystemOwnershipPercent, setEditingHealthSystemOwnershipPercent] = React.useState("");
  const [newHealthSystemLinkId, setNewHealthSystemLinkId] = React.useState("");
  const [newHealthSystemRelationshipType, setNewHealthSystemRelationshipType] = React.useState<
    "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
  >("CUSTOMER");
  const [newHealthSystemNotes, setNewHealthSystemNotes] = React.useState("");
  const [newHealthSystemInvestmentAmountUsd, setNewHealthSystemInvestmentAmountUsd] = React.useState("");
  const [newHealthSystemOwnershipPercent, setNewHealthSystemOwnershipPercent] = React.useState("");
  const [addingCoInvestorLink, setAddingCoInvestorLink] = React.useState(false);
  const [editingCoInvestorLinkId, setEditingCoInvestorLinkId] = React.useState<string | null>(null);
  const [editingCoInvestorRelationshipType, setEditingCoInvestorRelationshipType] = React.useState<
    "INVESTOR" | "PARTNER" | "OTHER"
  >("INVESTOR");
  const [editingCoInvestorNotes, setEditingCoInvestorNotes] = React.useState("");
  const [editingCoInvestorInvestmentAmountUsd, setEditingCoInvestorInvestmentAmountUsd] = React.useState("");
  const [newCoInvestorId, setNewCoInvestorId] = React.useState("");
  const [newCoInvestorRelationshipType, setNewCoInvestorRelationshipType] = React.useState<"INVESTOR" | "PARTNER" | "OTHER">("INVESTOR");
  const [newCoInvestorNotes, setNewCoInvestorNotes] = React.useState("");
  const [newCoInvestorInvestmentAmountUsd, setNewCoInvestorInvestmentAmountUsd] = React.useState("");
  const [keepListView, setKeepListView] = React.useState(false);
  const [newCompanyType, setNewCompanyType] = React.useState<CompanyType>("STARTUP");
  const [newPrimaryCategory, setNewPrimaryCategory] = React.useState<PrimaryCategory>("OTHER");
  const [newPrimaryCategoryOther, setNewPrimaryCategoryOther] = React.useState("");
  const [newLeadSourceType, setNewLeadSourceType] = React.useState<LeadSourceType>("OTHER");
  const [newLeadSourceHealthSystemId, setNewLeadSourceHealthSystemId] = React.useState("");
  const [newLeadSourceOther, setNewLeadSourceOther] = React.useState("");
  const [leadSourceOtherOptions, setLeadSourceOtherOptions] = React.useState<string[]>([]);
  const [newDescription, setNewDescription] = React.useState("");
  const [newResearchNotes, setNewResearchNotes] = React.useState("");
  const [newGoogleTranscriptUrl, setNewGoogleTranscriptUrl] = React.useState("");
  const [newSpinOutOwnershipPercent, setNewSpinOutOwnershipPercent] = React.useState("");
  const [activeDetailTab, setActiveDetailTab] = React.useState<DetailTab>("overview");

  const hasPending = React.useMemo(
    () => records.some((record) => record.researchStatus === "QUEUED" || record.researchStatus === "RUNNING"),
    [records]
  );

  const filteredRecords = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    const matchingRecords = !term
      ? records
      : records.filter((record) => {
          const haystack = [
            record.name,
            record.legalName,
            record.headquartersCity,
            record.headquartersState,
            record.headquartersCountry,
            record.website,
            record.description
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(term);
        });

    return [...matchingRecords].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { sensitivity: "base" })
    );
  }, [records, query]);

  const selectedRecord = React.useMemo(
    () => records.find((record) => record.id === selectedRecordId) || null,
    [records, selectedRecordId]
  );

  const shouldOfferCreate = query.trim().length >= 2 && filteredRecords.length === 0;
  const selectedCandidate =
    selectedCandidateIndex >= 0 && selectedCandidateIndex < searchCandidates.length
      ? searchCandidates[selectedCandidateIndex]
      : null;

  const createButtonDisabled =
    creatingFromSearch ||
    (!isManualCreationType(newCompanyType) &&
      (matchModalManualMode
        ? !manualMatchCandidate.name.trim()
        : searchingCandidates ||
          (searchCandidates.length > 1 && selectedCandidate === null) ||
          (searchCandidates.length === 0 && !manualMatchCandidate.name.trim())));

  function beginManualMatchEntry() {
    setMatchModalManualMode(true);
    setSearchAbortController((previous) => {
      previous?.abort();
      return previous;
    });
    setSearchingCandidates(false);
    setSearchCandidateError(null);
    setSearchCandidates([]);
    setCandidateSearchQuery(query.trim());
    setSelectedCandidateIndex(-1);
  }

  function openCreateMatchModal() {
    const term = query.trim();
    if (!term || !shouldOfferCreate || isManualCreationType(newCompanyType)) {
      return;
    }

    setManualMatchCandidate((prev) => {
      if (prev.name === term) {
        return prev;
      }

      return {
        ...prev,
        name: term
      };
    });
    setSearchCandidates([]);
    setCandidateSearchQuery("");
    setSelectedCandidateIndex(-1);
    setSearchCandidateError(null);
    setSearchingCandidates(false);
    setMatchModalManualMode(false);
    setMatchModalOpen(true);
  }

  function statusForLeadSourceType(
    type: LeadSourceType,
    otherSource: string | null | undefined
  ) {
    if (type === "HEALTH_SYSTEM") return "Health System";
    return otherSource && otherSource.trim() ? otherSource.trim() : "Other";
  }

  function isManualCreationType(type: CompanyType) {
    return type === "SPIN_OUT" || type === "DENOVO";
  }

  async function readDescriptorFileFromUpload(file: File) {
    const text = await file.text();
    const trimmedText = text.trim();
    if (!trimmedText) return;
    setNewDescription((current) => (current ? `${current}\n\n${trimmedText}` : trimmedText));
  }

  async function loadHealthSystems() {
    const res = await fetch("/api/health-systems", { cache: "no-store" });
    const payload = await res.json();
    const list = Array.isArray(payload.healthSystems) ? payload.healthSystems : [];
    setHealthSystems(list.map((system: { id: string; name: string }) => ({ id: system.id, name: system.name })));
  }

  async function loadCoInvestors() {
    const res = await fetch("/api/co-investors", { cache: "no-store" });
    const payload = await res.json();
    const list = Array.isArray(payload.coInvestors) ? payload.coInvestors : [];
    setCoInvestors(list.map((coInvestor: { id: string; name: string }) => ({ id: coInvestor.id, name: coInvestor.name })));
  }

  async function loadLeadSourceOtherOptions() {
    const res = await fetch("/api/companies/lead-sources", { cache: "no-store" });
    const payload = await res.json();
    const list: unknown[] = Array.isArray(payload.leadSources) ? payload.leadSources : [];
    const sanitized = list
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    setLeadSourceOtherOptions(sanitized);
  }

  async function loadRecords() {
    const res = await fetch("/api/companies", { cache: "no-store" });
    const payload = await res.json();
    setRecords(payload.companies || []);
  }

  async function runQueuedAgent(maxJobs = 2) {
    setRunningAgent(true);
    try {
      await fetch("/api/companies/research-jobs/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxJobs })
      });
    } finally {
      setRunningAgent(false);
      await loadRecords();
    }
  }

  async function searchCandidateMatches(
    term: string,
    options?: { signal?: AbortSignal }
  ): Promise<SearchCandidate[]> {
    const searchRes = await fetch("/api/companies/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: term }),
      signal: options?.signal
    });

    if (!searchRes.ok) {
      const searchPayload = await searchRes.json().catch(() => ({ error: "Failed to search companies" }));
      throw new Error(searchPayload.error || "Failed to search companies");
    }

    const searchPayload = await searchRes.json();
    if (!Array.isArray(searchPayload.candidates) || searchPayload.candidates.length === 0) {
      return [];
    }

    return searchPayload.candidates as SearchCandidate[];
  }

  async function createAndResearchFromSearchTerm() {
    const term = query.trim();
    if (!term) return;

    setCreatingFromSearch(true);
    setStatus(null);
    setKeepListView(false);

    try {
      const isManual = isManualCreationType(newCompanyType);
      let candidate = buildFallbackCandidate(term);

      if (!isManual) {
        let candidates = searchCandidates;
        if (!matchModalManualMode && (candidateSearchQuery !== term || candidates.length === 0)) {
          candidates = await searchCandidateMatches(term);
          setSearchCandidates(candidates);
          setCandidateSearchQuery(term);
          setSelectedCandidateIndex(candidates.length === 1 ? 0 : -1);
        }

        if (!matchModalManualMode && candidates.length > 1 && selectedCandidateIndex < 0) {
          throw new Error("Select one matching company before creating.");
        }

        if (!matchModalManualMode && candidates.length > 0) {
          candidate = candidates[selectedCandidateIndex >= 0 ? selectedCandidateIndex : 0];
        } else {
          candidate = {
            name: manualMatchCandidate.name || term,
            website: manualMatchCandidate.website,
            headquartersCity: manualMatchCandidate.headquartersCity,
            headquartersState: manualMatchCandidate.headquartersState,
            headquartersCountry: manualMatchCandidate.headquartersCountry,
            summary: "Created from manual entry.",
            sourceUrls: []
          };
        }
      }

      const duplicateRecord = findDuplicateRecord(records, candidate);
      if (duplicateRecord) {
        const location = formatLocation(duplicateRecord);
        throw new Error(
          `Duplicate blocked: ${duplicateRecord.name}${location ? ` (${location})` : ""} already exists.`
        );
      }

      if (isManual) {
        const createRes = await fetch("/api/companies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: candidate.name,
            legalName: undefined,
            website: candidate.website || "",
            headquartersCity: candidate.headquartersCity || "",
            headquartersState: candidate.headquartersState || "",
            headquartersCountry: candidate.headquartersCountry || "",
            companyType: newCompanyType,
            primaryCategory: newPrimaryCategory,
            primaryCategoryOther: newPrimaryCategoryOther || undefined,
            leadSourceType: newLeadSourceType,
            leadSourceHealthSystemId:
              newLeadSourceType === "HEALTH_SYSTEM" && newLeadSourceHealthSystemId
                ? newLeadSourceHealthSystemId
                : undefined,
            leadSourceOther: newLeadSourceType === "OTHER" ? newLeadSourceOther || undefined : undefined,
            description: newDescription || undefined,
            researchNotes: newResearchNotes || undefined,
            googleTranscriptUrl: newGoogleTranscriptUrl || undefined,
            spinOutOwnershipPercent:
              newCompanyType === "SPIN_OUT" ? toNullableNumber(newSpinOutOwnershipPercent) : undefined
          })
        });

        const createPayload = await createRes.json();
        if (!createRes.ok) throw new Error(createPayload.error || "Failed to create company");

        setStatus({ kind: "ok", text: `${createPayload.company.name} created.` });
      } else {
        const verifyRes = await fetch("/api/companies/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate,
            companyType: newCompanyType,
            primaryCategory: newPrimaryCategory,
            primaryCategoryOther: newPrimaryCategoryOther || undefined,
            leadSourceType: newLeadSourceType,
            leadSourceOther: newLeadSourceOther || undefined,
            leadSourceHealthSystemId:
              newLeadSourceType === "HEALTH_SYSTEM" && newLeadSourceHealthSystemId
                ? newLeadSourceHealthSystemId
                : undefined
          })
        });

        const verifyPayload = await verifyRes.json();
        if (!verifyRes.ok) throw new Error(verifyPayload.error || "Failed to create company");

        setStatus({ kind: "ok", text: `${verifyPayload.company.name} created. Research agent queued.` });
      }

      setKeepListView(true);
      setSelectedRecordId(null);
      setDraftRecordId(null);
      setQuery("");
      setSearchCandidates([]);
      setCandidateSearchQuery("");
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      setNewPrimaryCategoryOther("");
      setNewLeadSourceOther("");
      setNewDescription("");
      setNewResearchNotes("");
      setNewGoogleTranscriptUrl("");
      setNewSpinOutOwnershipPercent("");
      setNewLeadSourceHealthSystemId("");
      setMatchModalOpen(false);
      setMatchModalManualMode(false);
      setManualMatchCandidate({
        name: "",
        website: "",
        headquartersCity: "",
        headquartersState: "",
        headquartersCountry: ""
      });
      await loadRecords();

      if (!isManual) {
        await runQueuedAgent(1);
      }
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create company"
      });
    } finally {
      setCreatingFromSearch(false);
    }
  }

  async function addContactToSelectedRecord() {
    if (!selectedRecord) return;
    if (!contactName.trim()) {
      setStatus({ kind: "error", text: "Contact name is required." });
      return;
    }

    setAddingContact(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/companies/${selectedRecord.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          title: contactTitle,
          relationshipTitle: contactRelationshipTitle,
          email: contactEmail,
          phone: contactPhone,
          linkedinUrl: contactLinkedinUrl,
          roleType: contactRoleType
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add contact");
      }

      const matchLabel =
        payload?.resolution?.matchedBy === "created"
          ? "new contact created"
          : `matched existing contact by ${payload?.resolution?.matchedBy || "name"}`;

      setStatus({
        kind: "ok",
        text: `${payload.contact.name} linked (${matchLabel}).`
      });
      resetContactForm();
      setAddContactModalOpen(false);
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add contact"
      });
    } finally {
      setAddingContact(false);
    }
  }

  function beginEditingContact(link: CompanyRecord["contactLinks"][number]) {
    setEditingContactLinkId(link.id);
    setEditingContactName(link.contact.name);
    setEditingContactTitle(link.title || "");
    setEditingContactRelationshipTitle(link.title || link.contact.title || "");
    setEditingContactEmail(link.contact.email || "");
    setEditingContactPhone(link.contact.phone || "");
    setEditingContactLinkedinUrl(link.contact.linkedinUrl || "");
    setEditingContactRoleType(link.roleType);
    setStatus(null);
  }

  function resetContactForm() {
    setContactName("");
    setContactTitle("");
    setContactRelationshipTitle("");
    setContactEmail("");
    setContactPhone("");
    setContactLinkedinUrl("");
    setContactRoleType("COMPANY_CONTACT");
  }

  function resetEditingContactForm() {
    setEditingContactLinkId(null);
    setEditingContactName("");
    setEditingContactTitle("");
    setEditingContactRelationshipTitle("");
    setEditingContactEmail("");
    setEditingContactPhone("");
    setEditingContactLinkedinUrl("");
    setEditingContactRoleType("COMPANY_CONTACT");
  }

  async function updateContactForSelectedRecord(linkId: string) {
    if (!selectedRecord) return;
    if (!editingContactName.trim()) {
      setStatus({ kind: "error", text: "Contact name is required." });
      return;
    }

    setUpdatingContact(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/companies/${selectedRecord.id}/contacts`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          name: editingContactName,
          title: editingContactTitle,
          relationshipTitle: editingContactRelationshipTitle,
          email: editingContactEmail,
          phone: editingContactPhone,
          linkedinUrl: editingContactLinkedinUrl,
          roleType: editingContactRoleType
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update contact");
      }

      setStatus({ kind: "ok", text: `${payload.link?.contact?.name || editingContactName} updated.` });
      resetEditingContactForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update contact"
      });
    } finally {
      setUpdatingContact(false);
    }
  }

  async function deleteContactFromSelectedRecord(linkId: string, contactName: string) {
    if (!selectedRecord) return;

    const confirmDelete = window.confirm(`Remove ${contactName} from this company?`);
    if (!confirmDelete) return;

    setDeletingContactLinkId(linkId);
    setStatus(null);

    try {
      const res = await fetch(`/api/companies/${selectedRecord.id}/contacts`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete contact");
      }

      if (editingContactLinkId === linkId) {
        resetEditingContactForm();
      }

      setStatus({ kind: "ok", text: `${contactName} removed from contacts.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete contact"
      });
    } finally {
      setDeletingContactLinkId(null);
    }
  }

  function resetHealthSystemLinkForm() {
    setNewHealthSystemLinkId("");
    setNewHealthSystemRelationshipType("CUSTOMER");
    setNewHealthSystemNotes("");
    setNewHealthSystemInvestmentAmountUsd("");
    setNewHealthSystemOwnershipPercent("");
  }

  function beginEditingHealthSystemLink(link: CompanyHealthSystemLink) {
    setEditingHealthSystemLinkId(link.id);
    setEditingHealthSystemRelationshipType(link.relationshipType);
    setEditingHealthSystemNotes(link.notes || "");
    setEditingHealthSystemInvestmentAmountUsd(parseNumber(link.investmentAmountUsd));
    setEditingHealthSystemOwnershipPercent(parseNumber(link.ownershipPercent));
    setStatus(null);
  }

  function resetEditingHealthSystemLinkForm() {
    setEditingHealthSystemLinkId(null);
    setEditingHealthSystemRelationshipType("CUSTOMER");
    setEditingHealthSystemNotes("");
    setEditingHealthSystemInvestmentAmountUsd("");
    setEditingHealthSystemOwnershipPercent("");
  }

  function saveHealthSystemLinkForSelectedRecord(healthSystemId: string, healthSystemName: string) {
    if (!selectedRecord || !detailDraft) return;

    const found = detailDraft.healthSystemLinks.some((link) => link.healthSystemId === healthSystemId);
    if (!found) {
      setStatus({ kind: "error", text: "Health system link not found." });
      return;
    }

    const nextLinks = detailDraft.healthSystemLinks.map((link) =>
      link.healthSystemId === healthSystemId
        ? {
            ...link,
            relationshipType: editingHealthSystemRelationshipType,
            notes: editingHealthSystemNotes,
            investmentAmountUsd: editingHealthSystemInvestmentAmountUsd,
            ownershipPercent: editingHealthSystemOwnershipPercent
          }
        : link
    );

    updateDetailDraft({ healthSystemLinks: nextLinks });
    resetEditingHealthSystemLinkForm();
    setStatus({ kind: "ok", text: `${healthSystemName} link updated.` });
  }

  function deleteHealthSystemLinkFromSelectedRecord(linkId: string, healthSystemId: string, healthSystemName: string) {
    if (!selectedRecord || !detailDraft) return;

    const confirmDelete = window.confirm(`Remove ${healthSystemName} from linked health systems?`);
    if (!confirmDelete) return;

    const nextLinks = detailDraft.healthSystemLinks.filter((link) => link.healthSystemId !== healthSystemId);
    if (nextLinks.length === detailDraft.healthSystemLinks.length) {
      setStatus({ kind: "error", text: "Health system link not found." });
      return;
    }

    updateDetailDraft({ healthSystemLinks: nextLinks });
    if (editingHealthSystemLinkId === linkId) {
      resetEditingHealthSystemLinkForm();
    }
    setStatus({ kind: "ok", text: `${healthSystemName} removed from linked health systems.` });
  }

  function resetCoInvestorLinkForm() {
    setNewCoInvestorId("");
    setNewCoInvestorRelationshipType("INVESTOR");
    setNewCoInvestorNotes("");
    setNewCoInvestorInvestmentAmountUsd("");
  }

  function beginEditingCoInvestorLink(link: CompanyCoInvestorLink) {
    setEditingCoInvestorLinkId(link.id);
    setEditingCoInvestorRelationshipType(link.relationshipType);
    setEditingCoInvestorNotes(link.notes || "");
    setEditingCoInvestorInvestmentAmountUsd(parseNumber(link.investmentAmountUsd));
    setStatus(null);
  }

  function resetEditingCoInvestorLinkForm() {
    setEditingCoInvestorLinkId(null);
    setEditingCoInvestorRelationshipType("INVESTOR");
    setEditingCoInvestorNotes("");
    setEditingCoInvestorInvestmentAmountUsd("");
  }

  function saveCoInvestorLinkForSelectedRecord(coInvestorId: string, coInvestorName: string) {
    if (!selectedRecord || !detailDraft) return;

    const found = detailDraft.coInvestorLinks.some((link) => link.coInvestorId === coInvestorId);
    if (!found) {
      setStatus({ kind: "error", text: "Co-investor link not found." });
      return;
    }

    const nextLinks = detailDraft.coInvestorLinks.map((link) =>
      link.coInvestorId === coInvestorId
        ? {
            ...link,
            relationshipType: editingCoInvestorRelationshipType,
            notes: editingCoInvestorNotes,
            investmentAmountUsd: editingCoInvestorInvestmentAmountUsd
          }
        : link
    );

    updateDetailDraft({ coInvestorLinks: nextLinks });
    resetEditingCoInvestorLinkForm();
    setStatus({ kind: "ok", text: `${coInvestorName} link updated.` });
  }

  function deleteCoInvestorLinkFromSelectedRecord(linkId: string, coInvestorId: string, coInvestorName: string) {
    if (!selectedRecord || !detailDraft) return;

    const confirmDelete = window.confirm(`Remove ${coInvestorName} from linked co-investors?`);
    if (!confirmDelete) return;

    const nextLinks = detailDraft.coInvestorLinks.filter((link) => link.coInvestorId !== coInvestorId);
    if (nextLinks.length === detailDraft.coInvestorLinks.length) {
      setStatus({ kind: "error", text: "Co-investor link not found." });
      return;
    }

    updateDetailDraft({ coInvestorLinks: nextLinks });
    if (editingCoInvestorLinkId === linkId) {
      resetEditingCoInvestorLinkForm();
    }
    setStatus({ kind: "ok", text: `${coInvestorName} removed from linked co-investors.` });
  }

  async function addHealthSystemLinkToSelectedRecord() {
    if (!selectedRecord || !detailDraft) return;
    if (!newHealthSystemLinkId) {
      setStatus({ kind: "error", text: "Select a health system before linking." });
      return;
    }

    setAddingHealthSystemLink(true);
    setStatus(null);

    try {
      if (detailDraft.healthSystemLinks.some((link) => link.healthSystemId === newHealthSystemLinkId)) {
        throw new Error("This health system is already linked to the company.");
      }

      const nextLinks = [
        ...detailDraft.healthSystemLinks,
        {
          healthSystemId: newHealthSystemLinkId,
          relationshipType: newHealthSystemRelationshipType,
          notes: newHealthSystemNotes,
          investmentAmountUsd: newHealthSystemInvestmentAmountUsd,
          ownershipPercent: newHealthSystemOwnershipPercent
        }
      ];
      updateDetailDraft({ healthSystemLinks: nextLinks });
      const linkedName =
        healthSystems.find((system) => system.id === newHealthSystemLinkId)?.name || "Health system";
      setStatus({ kind: "ok", text: `${linkedName} linked.` });
      resetHealthSystemLinkForm();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add health system"
      });
    } finally {
      setAddingHealthSystemLink(false);
    }
  }

  async function addCoInvestorLinkToSelectedRecord() {
    if (!selectedRecord || !detailDraft) return;
    if (!newCoInvestorId) {
      setStatus({ kind: "error", text: "Select a co-investor before linking." });
      return;
    }

    setAddingCoInvestorLink(true);
    setStatus(null);

    try {
      if (detailDraft.coInvestorLinks.some((link) => link.coInvestorId === newCoInvestorId)) {
        throw new Error("This co-investor is already linked to the company.");
      }

      const nextLinks = [
        ...detailDraft.coInvestorLinks,
        {
          coInvestorId: newCoInvestorId,
          relationshipType: newCoInvestorRelationshipType,
          notes: newCoInvestorNotes,
          investmentAmountUsd: newCoInvestorInvestmentAmountUsd
        }
      ];
      updateDetailDraft({ coInvestorLinks: nextLinks });
      const linkedName =
        coInvestors.find((coInvestor) => coInvestor.id === newCoInvestorId)?.name || "Co-investor";
      setStatus({ kind: "ok", text: `${linkedName} linked.` });
      resetCoInvestorLinkForm();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add co-investor"
      });
    } finally {
      setAddingCoInvestorLink(false);
    }
  }

  function updateDetailDraft(patch: Partial<DetailDraft>) {
    setDetailDraft((current) => {
      if (!current || !selectedRecord) {
        return current;
      }

      const next = { ...current, ...patch };
      const changed = Object.entries(patch).some(
        ([key, value]) => (current as Record<string, unknown>)[key] !== value
      );
      if (!changed) {
        return current;
      }

      void saveSelectedRecordEdits(next);
      return next;
    });
  }

  async function saveSelectedRecordEdits(draftToSave: DetailDraft | null = detailDraft) {
    if (!selectedRecord || !draftToSave) return;

    setStatus(null);
    const normalizedHealthSystemLinks = draftToSave.healthSystemLinks.map((link) => ({
      ...link,
      investmentAmountUsd: toNullableNumber(link.investmentAmountUsd),
      ownershipPercent: toNullableNumber(link.ownershipPercent)
    }));
    const normalizedCoInvestorLinks = draftToSave.coInvestorLinks.map((link) => ({
      ...link,
      investmentAmountUsd: toNullableNumber(link.investmentAmountUsd)
    }));

    const intakeStatusForSave =
      draftToSave.intakeStatus === "COMPLETED" || draftToSave.intakeStatus === "SCREENING_EVALUATION"
        ? draftToSave.intakeStatus
        : draftToSave.intakeScheduledAt
          ? "SCHEDULED"
          : "NOT_SCHEDULED";

    try {
      const res = await fetch(`/api/companies/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftToSave.name,
          legalName: draftToSave.legalName,
          website: draftToSave.website,
          headquartersCity: draftToSave.headquartersCity,
          headquartersState: draftToSave.headquartersState,
          headquartersCountry: draftToSave.headquartersCountry,
          companyType: draftToSave.companyType,
          primaryCategory: draftToSave.primaryCategory,
          primaryCategoryOther: draftToSave.primaryCategoryOther,
          declineReason: draftToSave.declineReason === "" ? null : draftToSave.declineReason,
          declineReasonOther: draftToSave.declineReasonOther,
          leadSourceType: draftToSave.leadSourceType,
          leadSourceHealthSystemId:
            draftToSave.leadSourceType === "HEALTH_SYSTEM" ? draftToSave.leadSourceHealthSystemId : null,
          leadSourceNotes: draftToSave.leadSourceNotes,
          description: draftToSave.description,
          atAGlanceProblem: draftToSave.atAGlanceProblem,
          atAGlanceSolution: draftToSave.atAGlanceSolution,
          atAGlanceImpact: draftToSave.atAGlanceImpact,
          atAGlanceKeyStrengths: draftToSave.atAGlanceKeyStrengths,
          atAGlanceKeyConsiderations: draftToSave.atAGlanceKeyConsiderations,
          googleTranscriptUrl: draftToSave.googleTranscriptUrl,
          spinOutOwnershipPercent:
            draftToSave.companyType === "SPIN_OUT" ? toNullableNumber(draftToSave.spinOutOwnershipPercent) : null,
          intakeStatus: intakeStatusForSave,
          leadSourceOther: draftToSave.leadSourceType === "OTHER" ? draftToSave.leadSourceOther : "",
          intakeScheduledAt: intakeStatusForSave === "NOT_SCHEDULED" ? null : draftToSave.intakeScheduledAt,
          screeningEvaluationAt:
            draftToSave.intakeStatus === "SCREENING_EVALUATION" ? new Date().toISOString() : null,
          researchNotes: draftToSave.researchNotes,
          healthSystemLinks: normalizedHealthSystemLinks,
          coInvestorLinks: normalizedCoInvestorLinks
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save changes");

      setStatus({ kind: "ok", text: `Saved changes for ${payload.company.name}.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save changes"
      });
    }
  }

  async function deleteCompany(record: CompanyRecord) {
    const confirmDelete = window.confirm(`Delete ${record.name}? This cannot be undone.`);
    if (!confirmDelete) return;

    setDeletingRecordId(record.id);
    setStatus(null);

    try {
      const res = await fetch(`/api/companies/${record.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete company");
      setStatus({ kind: "ok", text: `${record.name} deleted.` });
      if (selectedRecordId === record.id) {
        setSelectedRecordId(null);
      }
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete company"
      });
    } finally {
      setDeletingRecordId(null);
    }
  }

  React.useEffect(() => {
    loadRecords().catch(() => {
      setStatus({ kind: "error", text: "Failed to load companies." });
    });

    loadHealthSystems().catch(() => {
      setStatus({ kind: "error", text: "Failed to load health systems for lead source." });
    });

    loadCoInvestors().catch(() => {
      setStatus({ kind: "error", text: "Failed to load co-investors." });
    });

    loadLeadSourceOtherOptions().catch(() => {
      setStatus({ kind: "error", text: "Failed to load lead source suggestions." });
    });
  }, []);

  React.useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => {
      loadRecords().catch(() => {
        setStatus({ kind: "error", text: "Failed to refresh companies." });
      });
    }, 7000);
    return () => clearInterval(timer);
  }, [hasPending]);

  React.useEffect(() => {
    if (!matchModalOpen) return;

    if (!shouldOfferCreate || isManualCreationType(newCompanyType)) {
      setMatchModalOpen(false);
      setMatchModalManualMode(false);
      setSearchCandidates([]);
      setCandidateSearchQuery("");
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      setSearchingCandidates(false);
      return;
    }

    const term = query.trim();
    if (!term) return;

    if (matchModalManualMode) {
      return;
    }

    setManualMatchCandidate((prev) => {
      if (prev.name === term) {
        return prev;
      }

      return {
        ...prev,
        name: term
      };
    });

    const cachedCandidates = searchMatchCandidateCache.get(term.toLowerCase());
    if (cachedCandidates) {
      setSearchCandidates(cachedCandidates);
      setCandidateSearchQuery(term);
      setSelectedCandidateIndex(cachedCandidates.length === 1 ? 0 : -1);
      setSearchingCandidates(false);
      setSearchCandidateError(null);
      return;
    }

    searchAbortController?.abort();
    const controller = new AbortController();
    setSearchAbortController(controller);

    let active = true;
    const timeout = setTimeout(async () => {
      setSearchingCandidates(true);
      setSearchCandidateError(null);

      try {
        const candidates = await searchCandidateMatches(term, { signal: controller.signal });
        if (!active) return;
        if (!controller.signal.aborted) {
          searchMatchCandidateCache.set(term.toLowerCase(), candidates);
        }
        setSearchCandidates(candidates);
        setCandidateSearchQuery(term);
        setSelectedCandidateIndex(candidates.length === 1 ? 0 : -1);
      } catch (error) {
        if (!active) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSearchCandidates([]);
        setCandidateSearchQuery(term);
        setSelectedCandidateIndex(-1);
        setSearchCandidateError(error instanceof Error ? error.message : "Failed to search companies.");
      } finally {
        if (active) setSearchingCandidates(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [matchModalOpen, shouldOfferCreate, query, newCompanyType, matchModalManualMode]);

  React.useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedRecordId(null);
      return;
    }

    if (keepListView) return;
    if (!selectedRecordId || !filteredRecords.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(filteredRecords[0].id);
    }
  }, [filteredRecords, selectedRecordId, keepListView]);

  React.useEffect(() => {
    if (!selectedRecord) {
      setDetailDraft(null);
      setDraftRecordId(null);
      setAddContactModalOpen(false);
      resetEditingContactForm();
      resetEditingHealthSystemLinkForm();
      resetEditingCoInvestorLinkForm();
      setDeletingContactLinkId(null);
      return;
    }

    if (selectedRecord.id !== draftRecordId) {
      setDetailDraft(draftFromRecord(selectedRecord));
      setDraftRecordId(selectedRecord.id);
      setActiveDetailTab("overview");
      setAddContactModalOpen(false);
      resetEditingHealthSystemLinkForm();
      resetEditingCoInvestorLinkForm();
      resetHealthSystemLinkForm();
      resetCoInvestorLinkForm();
    }
  }, [selectedRecord, draftRecordId]);

  return (
    <main>
      <section className="hero">
        <h1>Company Pipeline</h1>
        <p>
          Search companies in your CRM list. As you type, the list narrows instantly. If no match exists,
          create a new company and launch research automatically.
        </p>
      </section>

      <div className="grid">
        <section className="panel" aria-label="List panel">
          <label htmlFor="search-company">Search</label>
          <input
            id="search-company"
            placeholder="Type a company name, location, or website"
            value={query}
            onChange={(event) => {
              setKeepListView(false);
              setQuery(event.target.value);
            }}
          />

          {shouldOfferCreate && (
            <div className="create-card">
              <p className="create-title">New Company Relationship</p>
              <div className="row">
                <div>
                  <label>Company Type</label>
                  <select
                    value={newCompanyType}
                    onChange={(event) => {
                      const next = event.target.value as CompanyType;
                      setNewCompanyType(next);
                      if (next !== "SPIN_OUT") {
                        setNewSpinOutOwnershipPercent("");
                      }
                    }}
                  >
                    {companyTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Primary Category</label>
                  <select
                    value={newPrimaryCategory}
                    onChange={(event) => setNewPrimaryCategory(event.target.value as PrimaryCategory)}
                  >
                    {primaryCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {newPrimaryCategory === "OTHER" && (
                <div>
                  <label>Primary Category (Other)</label>
                  <input
                    value={newPrimaryCategoryOther}
                    onChange={(event) => setNewPrimaryCategoryOther(event.target.value)}
                    placeholder="Specify other category"
                  />
                </div>
                )}
              <div className="row">
                <div>
                  <label>Lead Source</label>
                  <select
                    value={newLeadSourceType}
                      onChange={(event) => {
                        const next = event.target.value as LeadSourceType;
                        setNewLeadSourceType(next);
                        if (next === "HEALTH_SYSTEM") {
                          setNewLeadSourceOther("");
                        } else {
                          setNewLeadSourceHealthSystemId("");
                        }
                    }}
                  >
                    {leadSourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {newLeadSourceType === "HEALTH_SYSTEM" ? (
                  <div>
                    <label>Source Health System</label>
                    <EntityLookupInput
                      entityKind="HEALTH_SYSTEM"
                      value={newLeadSourceHealthSystemId}
                      onChange={setNewLeadSourceHealthSystemId}
                      allowEmpty
                      emptyLabel="No health system selected"
                      initialOptions={healthSystems.map((system) => ({ id: system.id, name: system.name }))}
                      placeholder="Search health systems"
                      onEntityCreated={(option) => {
                        setHealthSystems((current) => {
                          if (current.some((entry) => entry.id === option.id)) return current;
                          return [{ id: option.id, name: option.name }, ...current];
                        });
                      }}
                    />
                  </div>
                ) : (
                  <div>
                    <label>Lead Source (Other)</label>
                    <input
                      list="lead-source-suggestions-create"
                      value={newLeadSourceOther}
                      onChange={(event) => setNewLeadSourceOther(event.target.value)}
                      placeholder="Type or choose a source"
                    />
                  </div>
                )}
              </div>
              <datalist id="lead-source-suggestions-create">
                {leadSourceOtherOptions.map((source) => (
                  <option key={`create-${source}`} value={source} />
                ))}
              </datalist>

              {isManualCreationType(newCompanyType) && (
                <>
                <div className="detail-section">
                  <label>Description</label>
                  <RichTextArea
                    value={newDescription}
                    onChange={setNewDescription}
                    rows={10}
                    placeholder="Describe the company"
                  />
                </div>
                <div className="detail-section">
                  <label>Research Notes</label>
                  <RichTextArea
                    value={newResearchNotes}
                    onChange={setNewResearchNotes}
                    rows={10}
                    placeholder="Research notes"
                  />
                </div>
                  <div className="detail-section">
                    <label>Google Transcript Doc URL</label>
                    <input
                      value={newGoogleTranscriptUrl}
                      onChange={(event) => setNewGoogleTranscriptUrl(event.target.value)}
                      placeholder="Paste transcript document URL"
                    />
                  </div>
                  <div className="detail-section">
                    <label>Upload descriptor file</label>
                    <input
                      type="file"
                      accept=".txt,.md,text/plain,text/markdown"
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) {
                          void readDescriptorFileFromUpload(file).catch(() => {
                            setStatus({ kind: "error", text: "Failed to read descriptor file." });
                          });
                        }
                        event.target.value = "";
                      }}
                    />
                  </div>
                  {newCompanyType === "SPIN_OUT" && (
                    <div className="row">
                      <div>
                        <label>Spin-out Ownership %</label>
                        <input
                          value={newSpinOutOwnershipPercent}
                          onChange={(event) => setNewSpinOutOwnershipPercent(event.target.value)}
                          placeholder="Typically 50"
                        />
                      </div>
                    </div>
                  )}
                </>
              )}
              {!isManualCreationType(newCompanyType) ? (
                <div className="actions">
                  <button className="primary" type="button" onClick={openCreateMatchModal} disabled={creatingFromSearch}>
                    Search online
                  </button>
                </div>
              ) : null}
            </div>
          )}

          {shouldOfferCreate && isManualCreationType(newCompanyType) && (
            <div className="create-card">
              <p className="create-title">No companies match "{query.trim()}".</p>
              <p className="muted">Create a new company manually.</p>
              <div className="actions">
                <button
                  className="primary"
                  type="button"
                  onClick={createAndResearchFromSearchTerm}
                  disabled={createButtonDisabled}
                >
                  Create Company
                </button>
              </div>
            </div>
          )}

          <SearchMatchModal
            isOpen={matchModalOpen && !isManualCreationType(newCompanyType)}
            title="Company not found"
            query={query.trim()}
            searching={searchingCandidates}
            candidates={searchCandidates}
            selectedCandidateIndex={selectedCandidateIndex}
            searchError={searchCandidateError}
            manualCandidateEnabled={!searchingCandidates && searchCandidates.length === 0}
            isManualMode={matchModalManualMode}
            onSelectCandidate={setSelectedCandidateIndex}
            manualCandidate={manualMatchCandidate}
            onManualCandidateChange={(candidate) =>
              setManualMatchCandidate((current) => ({
                ...current,
                ...candidate
              }))
            }
            onCreateManually={() => void beginManualMatchEntry()}
            submitLabel={
              createButtonDisabled
                ? searchingCandidates
                  ? "Checking matches..."
                  : "Create + Start Research"
                : "Create + Start Research"
            }
            onSubmit={() => void createAndResearchFromSearchTerm()}
            onClose={() => {
              setMatchModalOpen(false);
              setMatchModalManualMode(false);
            }}
            submitDisabled={createButtonDisabled}
          />

          <div className="list-container">
            {filteredRecords.length === 0 && !shouldOfferCreate && (
              <p className="muted">No companies yet. Start by typing and creating one.</p>
            )}

            {filteredRecords.map((record) => {
              const active = selectedRecordId === record.id;
              return (
                <div
                  key={record.id}
                  className={`list-row ${active ? "active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    setKeepListView(false);
                    setSelectedRecordId(record.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setKeepListView(false);
                      setSelectedRecordId(record.id);
                    }
                  }}
                >
                  <div className="list-row-main">
                    <strong>{record.name}</strong>
                    <span className="muted">{formatLocation(record) || "Location unknown"}</span>
                    <div className="list-row-indicators">
                      <span className="flag-pill alliance">
                        {statusForLeadSourceType(
                          record.leadSourceType,
                          record.leadSourceOther
                        )}
                      </span>
                      <span className="flag-pill">
                        {record.companyType}
                      </span>
                    </div>
                  </div>
                  <div className="list-row-meta">
                    <span className={`status-pill ${intakeStatusClass(record.intakeStatus, record.intakeScheduledAt)}`}>
                      {intakeStatusLabel(record.intakeStatus, record.intakeScheduledAt || "")}
                    </span>
                    <button
                      className="ghost small"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void deleteCompany(record);
                      }}
                      disabled={deletingRecordId === record.id}
                    >
                      {deletingRecordId === record.id ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {status && <p className={`status ${status.kind}`}>{status.text}</p>}
        </section>

        <section className="panel" aria-label="Detail panel">
          {!selectedRecord || !detailDraft ? (
            <p className="muted">Select a company from the list to view details.</p>
          ) : (
            <div className="detail-card">
              <div className="detail-head">
                <h3>{selectedRecord.name}</h3>
              </div>

              <div className="detail-tabs" role="tablist" aria-label="Company detail sections">
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "overview" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "overview"}
                  onClick={() => setActiveDetailTab("overview")}
                >
                  Overview
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "at-a-glance" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "at-a-glance"}
                  onClick={() => setActiveDetailTab("at-a-glance")}
                >
                  At a Glance
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "documents" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "documents"}
                  onClick={() => setActiveDetailTab("documents")}
                >
                  Documents
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "notes" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "notes"}
                  onClick={() => setActiveDetailTab("notes")}
                >
                  Notes
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "contacts" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "contacts"}
                  onClick={() => setActiveDetailTab("contacts")}
                >
                  Contacts
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "relationships" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "relationships"}
                  onClick={() => setActiveDetailTab("relationships")}
                >
                  Relationships
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "pipeline" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "pipeline"}
                  onClick={() => setActiveDetailTab("pipeline")}
                >
                  Pipeline
                </button>
              </div>

              {activeDetailTab === "overview" && (
                <>
              <div className="detail-grid">
                <InlineTextField
                  label="Name"
                  value={detailDraft.name}
                  onSave={(value) => updateDetailDraft({ name: value })}
                />
                <InlineTextField
                  label="Legal Name"
                  value={detailDraft.legalName}
                  onSave={(value) => updateDetailDraft({ legalName: value })}
                />
                <InlineTextField
                  label="Website"
                  value={detailDraft.website}
                  onSave={(value) => updateDetailDraft({ website: value })}
                />
                <InlineTextField
                  label="Google Transcript Doc URL"
                  value={detailDraft.googleTranscriptUrl}
                  onSave={(value) => updateDetailDraft({ googleTranscriptUrl: value })}
                />
                <InlineTextField
                  label="HQ City"
                  value={detailDraft.headquartersCity}
                  onSave={(value) => updateDetailDraft({ headquartersCity: value })}
                />
                <InlineTextField
                  label="HQ State"
                  value={detailDraft.headquartersState}
                  onSave={(value) => updateDetailDraft({ headquartersState: value })}
                />
                <InlineTextField
                  label="HQ Country"
                  value={detailDraft.headquartersCountry}
                  onSave={(value) => updateDetailDraft({ headquartersCountry: value })}
                />
                <InlineSelectField
                  label="Company Type"
                  value={detailDraft.companyType}
                  onSave={(value) => updateDetailDraft({ companyType: value as CompanyType })}
                  options={companyTypeOptions}
                />
                <InlineSelectField
                  label="Primary Category"
                  value={detailDraft.primaryCategory}
                  onSave={(value) => updateDetailDraft({ primaryCategory: value as PrimaryCategory })}
                  options={primaryCategoryOptions}
                />
                {detailDraft.primaryCategory === "OTHER" && (
                  <InlineTextField
                    label="Primary Category (Other)"
                    value={detailDraft.primaryCategoryOther}
                    onSave={(value) => updateDetailDraft({ primaryCategoryOther: value })}
                  />
                )}
                <InlineSelectField
                  label="Decline Reason"
                  value={detailDraft.declineReason}
                  onSave={(value) => updateDetailDraft({ declineReason: value as DeclineReason | "" })}
                  options={declineReasonOptions}
                />
                {detailDraft.declineReason === "OTHER" && (
                  <InlineTextField
                    label="Decline Reason (Other)"
                    value={detailDraft.declineReasonOther}
                    onSave={(value) => updateDetailDraft({ declineReasonOther: value })}
                  />
                )}
                <InlineSelectField
                  label="Lead Source"
                  value={detailDraft.leadSourceType}
                  onSave={(value) =>
                    updateDetailDraft({
                      leadSourceType: value as LeadSourceType,
                      leadSourceHealthSystemId: value === "HEALTH_SYSTEM" ? detailDraft.leadSourceHealthSystemId : "",
                      leadSourceOther: value === "OTHER" ? detailDraft.leadSourceOther : ""
                    })
                  }
                  options={leadSourceOptions}
                />
                {detailDraft.leadSourceType === "HEALTH_SYSTEM" ? (
                  <div>
                    <label>Lead Source Health System</label>
                    <EntityLookupInput
                      entityKind="HEALTH_SYSTEM"
                      value={detailDraft.leadSourceHealthSystemId}
                      onChange={(nextValue) => updateDetailDraft({ leadSourceHealthSystemId: nextValue })}
                      allowEmpty
                      emptyLabel="No health system selected"
                      initialOptions={healthSystems.map((system) => ({ id: system.id, name: system.name }))}
                      placeholder="Search health systems"
                      onEntityCreated={(option) => {
                        setHealthSystems((current) => {
                          if (current.some((entry) => entry.id === option.id)) return current;
                          return [{ id: option.id, name: option.name }, ...current];
                        });
                      }}
                    />
                  </div>
                ) : (
                  <InlineTextField
                    label="Lead Source (Other)"
                    value={detailDraft.leadSourceOther}
                    onSave={(value) => updateDetailDraft({ leadSourceOther: value })}
                  />
                )}
                <datalist id="lead-source-suggestions-detail">
                  {leadSourceOtherOptions.map((source) => (
                    <option key={`detail-${source}`} value={source} />
                  ))}
                </datalist>
                {detailDraft.companyType === "SPIN_OUT" && (
                  <InlineTextField
                    label="Spin-out Ownership %"
                    value={detailDraft.spinOutOwnershipPercent}
                    onSave={(value) => updateDetailDraft({ spinOutOwnershipPercent: value })}
                  />
                )}
                <InlineTextField
                  inputType="date"
                  label="Intake Date"
                  value={detailDraft.intakeScheduledAt}
                  emptyText="Not Scheduled"
                  onSave={(value) => updateDetailDraft({ intakeScheduledAt: value })}
                />
              </div>

              <div className="detail-section">
                <InlineTextareaField
                  multiline
                  label="Description"
                  value={detailDraft.description}
                  rows={12}
                  enableFormatting
                  onSave={(value) => updateDetailDraft({ description: value })}
                />
              </div>

                </>
              )}

              {activeDetailTab === "at-a-glance" && (
                <>
                  <div className="detail-section">
                    <p className="detail-label">At a Glance</p>
                    <InlineTextareaField
                      multiline
                      label="Problem"
                      value={detailDraft.atAGlanceProblem}
                      rows={12}
                      enableFormatting
                      onSave={(value) => updateDetailDraft({ atAGlanceProblem: value })}
                    />
                    <InlineTextareaField
                      multiline
                      label="The Solution"
                      value={detailDraft.atAGlanceSolution}
                      rows={12}
                      enableFormatting
                      onSave={(value) => updateDetailDraft({ atAGlanceSolution: value })}
                    />
                    <InlineTextareaField
                      multiline
                      label="The Impact"
                      value={detailDraft.atAGlanceImpact}
                      rows={12}
                      enableFormatting
                      onSave={(value) => updateDetailDraft({ atAGlanceImpact: value })}
                    />
                    <InlineTextareaField
                      multiline
                      label="Key Strengths"
                      value={detailDraft.atAGlanceKeyStrengths}
                      rows={12}
                      enableFormatting
                      onSave={(value) => updateDetailDraft({ atAGlanceKeyStrengths: value })}
                    />
                    <InlineTextareaField
                      multiline
                      label="Key Considerations"
                      value={detailDraft.atAGlanceKeyConsiderations}
                      rows={12}
                      enableFormatting
                      onSave={(value) => updateDetailDraft({ atAGlanceKeyConsiderations: value })}
                    />
                  </div>
                </>
              )}

              {activeDetailTab === "documents" && (
                <>
                  <EntityDocumentsPane
                    entityPath="companies"
                    entityId={selectedRecord.id}
                    onStatus={setStatus}
                  />
                </>
              )}

              {activeDetailTab === "notes" && (
                <>
              <div className="detail-section">
                <InlineTextareaField
                  multiline
                  label="Notes"
                  value={detailDraft.researchNotes}
                  rows={12}
                  enableFormatting
                  onSave={(value) => updateDetailDraft({ researchNotes: value })}
                />
                <p className="muted">Use notes to capture interaction updates for this company.</p>
              </div>

              {selectedRecord.researchError && (
                <div className="detail-section">
                  <p className="detail-label">Research Error</p>
                  <p>{selectedRecord.researchError}</p>
                </div>
              )}

              <EntityNotesPane
                entityPath="companies"
                entityId={selectedRecord.id}
                onStatus={setStatus}
              />

                </>
              )}

              {activeDetailTab === "contacts" && (
                <>
              <div className="detail-section">
                <p className="detail-label">Contacts</p>
                {isResearchInProgress(selectedRecord.researchStatus) ? (
                  <p className="muted">Research is underway, contact discovery may appear shortly.</p>
                ) : null}
                {selectedRecord.contactLinks.length === 0 ? (
                  <p className="muted">No contacts linked yet.</p>
                ) : (
                  selectedRecord.contactLinks.map((link) => (
                    <div key={link.id} className="detail-list-item">
                      {editingContactLinkId === link.id ? (
                        <div className="detail-card">
                          <div className="detail-grid">
                            <div>
                              <label>Contact Name</label>
                              <input
                                value={editingContactName}
                                onChange={(event) => setEditingContactName(event.target.value)}
                                placeholder="William Smith"
                              />
                            </div>
                            <div>
                              <label>Role Type</label>
                              <select
                                value={editingContactRoleType}
                                onChange={(event) =>
                                  setEditingContactRoleType(
                                    event.target.value as
                                      | "COMPANY_CONTACT"
                                      | "EXECUTIVE"
                                      | "VENTURE_PARTNER"
                                      | "INVESTOR_PARTNER"
                                      | "OTHER"
                                  )
                                }
                              >
                                <option value="COMPANY_CONTACT">Company Contact</option>
                                <option value="EXECUTIVE">Executive</option>
                                <option value="VENTURE_PARTNER">Venture / Innovation</option>
                                <option value="INVESTOR_PARTNER">Investor Partner</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                            <div>
                              <label>Contact Title</label>
                              <input
                                value={editingContactTitle}
                                onChange={(event) => setEditingContactTitle(event.target.value)}
                                placeholder="CIO / Board Member"
                              />
                            </div>
                            <div>
                              <label>Relationship Title</label>
                              <input
                                value={editingContactRelationshipTitle}
                                onChange={(event) => setEditingContactRelationshipTitle(event.target.value)}
                                placeholder="Board Member"
                              />
                            </div>
                            <div>
                              <label>Email</label>
                              <input
                                value={editingContactEmail}
                                onChange={(event) => setEditingContactEmail(event.target.value)}
                                placeholder="name@company.com"
                              />
                            </div>
                            <div>
                              <label>Phone</label>
                              <input
                                value={editingContactPhone}
                                onChange={(event) => setEditingContactPhone(event.target.value)}
                                placeholder="+1 555 555 5555"
                              />
                            </div>
                            <div>
                              <label>LinkedIn URL</label>
                              <input
                                value={editingContactLinkedinUrl}
                                onChange={(event) => setEditingContactLinkedinUrl(event.target.value)}
                                placeholder="https://linkedin.com/in/..."
                              />
                            </div>
                          </div>
                          <div className="actions">
                            <button
                              className="primary"
                              onClick={() => updateContactForSelectedRecord(link.id)}
                              disabled={updatingContact}
                            >
                              {updatingContact ? "Saving..." : "Save Contact"}
                            </button>
                            <button className="ghost small" onClick={resetEditingContactForm} type="button">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{link.contact.name}</strong>
                            {link.title ? `, ${link.title}` : link.contact.title ? `, ${link.contact.title}` : ""}
                            {` | ${link.roleType}`}
                            {link.contact.email ? ` | ${link.contact.email}` : ""}
                            {link.contact.phone ? ` | ${link.contact.phone}` : ""}
                            {link.contact.linkedinUrl && (
                              <>
                                {" "}-{" "}
                                <a href={link.contact.linkedinUrl} target="_blank" rel="noreferrer">
                                  profile
                                </a>
                              </>
                            )}
                          </div>
                          <div className="contact-row-actions">
                            <button
                              className="ghost small"
                              onClick={() => beginEditingContact(link)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="ghost small"
                              onClick={() => deleteContactFromSelectedRecord(link.id, link.contact.name)}
                              disabled={deletingContactLinkId === link.id}
                            >
                              {deletingContactLinkId === link.id ? "Removing..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}

                <div className="actions">
                  <button
                    type="button"
                    className="ghost small contact-add-link"
                    onClick={() => {
                      setStatus(null);
                      setAddContactModalOpen(true);
                    }}
                  >
                    Add Contact
                  </button>
                </div>
                <AddContactModal
                  open={addContactModalOpen}
                  onClose={() => setAddContactModalOpen(false)}
                  onSubmit={addContactToSelectedRecord}
                  addingContact={addingContact}
                  contactName={contactName}
                  onContactNameChange={setContactName}
                  contactRoleType={contactRoleType}
                  onContactRoleTypeChange={(value) =>
                    setContactRoleType(
                      value as "COMPANY_CONTACT" | "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
                    )
                  }
                  roleOptions={[
                    { value: "COMPANY_CONTACT", label: "Company Contact" },
                    { value: "EXECUTIVE", label: "Executive" },
                    { value: "VENTURE_PARTNER", label: "Venture / Innovation" },
                    { value: "INVESTOR_PARTNER", label: "Investor Partner" },
                    { value: "OTHER", label: "Other" }
                  ]}
                  contactTitle={contactTitle}
                  onContactTitleChange={setContactTitle}
                  contactRelationshipTitle={contactRelationshipTitle}
                  onContactRelationshipTitleChange={setContactRelationshipTitle}
                  contactEmail={contactEmail}
                  onContactEmailChange={setContactEmail}
                  contactPhone={contactPhone}
                  onContactPhoneChange={setContactPhone}
                  contactLinkedinUrl={contactLinkedinUrl}
                  onContactLinkedinUrlChange={setContactLinkedinUrl}
                  namePlaceholder="William Smith"
                  titlePlaceholder="CIO / Board Member"
                  relationshipTitlePlaceholder="Board Member"
                  emailPlaceholder="name@company.com"
                  phonePlaceholder="+1 555 555 5555"
                  linkedinPlaceholder="https://linkedin.com/in/..."
                />
              </div>

                </>
              )}

              {activeDetailTab === "relationships" && (
                <>
              <div className="detail-section">
                <p className="detail-label">Linked Health Systems</p>
                {selectedRecord.healthSystemLinks.length === 0 ? (
                  <>
                    <p className="muted">No linked health systems yet.</p>
                    <div className="detail-grid">
                      <div>
                        <label>Existing Health System</label>
                        <EntityLookupInput
                          entityKind="HEALTH_SYSTEM"
                          value={newHealthSystemLinkId}
                          onChange={setNewHealthSystemLinkId}
                          allowEmpty
                          emptyLabel="No health system selected"
                          initialOptions={healthSystems.map((system) => ({ id: system.id, name: system.name }))}
                          placeholder="Search health systems"
                          onEntityCreated={(option) => {
                            setHealthSystems((current) => {
                              if (current.some((entry) => entry.id === option.id)) return current;
                              return [{ id: option.id, name: option.name }, ...current];
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label>Relationship Type</label>
                        <select
                          value={newHealthSystemRelationshipType}
                          onChange={(event) =>
                            setNewHealthSystemRelationshipType(
                              event.target.value as "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
                            )
                          }
                        >
                          {companyHealthSystemRelationshipOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Investment Amount (USD)</label>
                        <input
                          value={newHealthSystemInvestmentAmountUsd}
                          onChange={(event) => setNewHealthSystemInvestmentAmountUsd(event.target.value)}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label>Ownership %</label>
                        <input
                          value={newHealthSystemOwnershipPercent}
                          onChange={(event) => setNewHealthSystemOwnershipPercent(event.target.value)}
                          type="number"
                          min="0"
                          max="100"
                          step="any"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label>Notes</label>
                        <input
                          value={newHealthSystemNotes}
                          onChange={(event) => setNewHealthSystemNotes(event.target.value)}
                          placeholder="Notes"
                        />
                      </div>
                    </div>
                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={() => void addHealthSystemLinkToSelectedRecord()}
                        disabled={
                          addingHealthSystemLink || !newHealthSystemLinkId
                        }
                      >
                        {addingHealthSystemLink ? "Adding..." : "Add Health System"}
                      </button>
                    </div>
                  </>
                ) : (
                  selectedRecord.healthSystemLinks.map((link) => (
                    <div key={link.id} className="detail-list-item">
                      {editingHealthSystemLinkId === link.id ? (
                        <div className="detail-card">
                          <div className="detail-grid">
                            <div>
                              <label>Relationship Type</label>
                              <select
                                value={editingHealthSystemRelationshipType}
                                onChange={(event) =>
                                  setEditingHealthSystemRelationshipType(
                                    event.target.value as "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
                                  )
                                }
                              >
                                {companyHealthSystemRelationshipOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label>Investment Amount (USD)</label>
                              <input
                                value={editingHealthSystemInvestmentAmountUsd}
                                onChange={(event) => setEditingHealthSystemInvestmentAmountUsd(event.target.value)}
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <label>Ownership %</label>
                              <input
                                value={editingHealthSystemOwnershipPercent}
                                onChange={(event) => setEditingHealthSystemOwnershipPercent(event.target.value)}
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <label>Notes</label>
                              <input
                                value={editingHealthSystemNotes}
                                onChange={(event) => setEditingHealthSystemNotes(event.target.value)}
                                placeholder="Notes"
                              />
                            </div>
                          </div>
                          <div className="actions">
                            <button
                              type="button"
                              className="primary"
                              onClick={() =>
                                saveHealthSystemLinkForSelectedRecord(link.healthSystemId, link.healthSystem.name)
                              }
                            >
                              Save Link
                            </button>
                            <button type="button" className="ghost small" onClick={resetEditingHealthSystemLinkForm}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{link.healthSystem.name}</strong> - {link.relationshipType}
                            {link.investmentAmountUsd !== null ? ` | Invested/Allocated: ${link.investmentAmountUsd}` : ""}
                            {link.ownershipPercent !== null ? ` | Ownership: ${link.ownershipPercent}%` : ""}
                          </div>
                          <div className="contact-row-actions">
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => beginEditingHealthSystemLink(link)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() =>
                                deleteHealthSystemLinkFromSelectedRecord(link.id, link.healthSystemId, link.healthSystem.name)
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="detail-section">
                <p className="detail-label">Linked Co-Investors</p>
                {selectedRecord.coInvestorLinks.length === 0 ? (
                  <>
                    <p className="muted">No linked co-investors yet.</p>
                    <div className="detail-grid">
                      <div>
                        <label>Existing Co-Investor</label>
                        <EntityLookupInput
                          entityKind="CO_INVESTOR"
                          value={newCoInvestorId}
                          onChange={setNewCoInvestorId}
                          allowEmpty
                          emptyLabel="No co-investor selected"
                          initialOptions={coInvestors.map((coInvestor) => ({ id: coInvestor.id, name: coInvestor.name }))}
                          placeholder="Search co-investors"
                          onEntityCreated={(option) => {
                            setCoInvestors((current) => {
                              if (current.some((entry) => entry.id === option.id)) return current;
                              return [{ id: option.id, name: option.name }, ...current];
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label>Relationship Type</label>
                        <select
                          value={newCoInvestorRelationshipType}
                          onChange={(event) =>
                            setNewCoInvestorRelationshipType(event.target.value as "INVESTOR" | "PARTNER" | "OTHER")
                          }
                        >
                          {companyCoInvestorRelationshipOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label>Investment Amount (USD)</label>
                        <input
                          value={newCoInvestorInvestmentAmountUsd}
                          onChange={(event) => setNewCoInvestorInvestmentAmountUsd(event.target.value)}
                          type="number"
                          min="0"
                          step="any"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label>Notes</label>
                        <input
                          value={newCoInvestorNotes}
                          onChange={(event) => setNewCoInvestorNotes(event.target.value)}
                          placeholder="Notes"
                        />
                      </div>
                    </div>
                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={() => void addCoInvestorLinkToSelectedRecord()}
                        disabled={
                          addingCoInvestorLink || !newCoInvestorId
                        }
                      >
                        {addingCoInvestorLink ? "Adding..." : "Add Co-Investor"}
                      </button>
                    </div>
                  </>
                ) : (
                  selectedRecord.coInvestorLinks.map((link) => (
                    <div key={link.id} className="detail-list-item">
                      {editingCoInvestorLinkId === link.id ? (
                        <div className="detail-card">
                          <div className="detail-grid">
                            <div>
                              <label>Relationship Type</label>
                              <select
                                value={editingCoInvestorRelationshipType}
                                onChange={(event) =>
                                  setEditingCoInvestorRelationshipType(event.target.value as "INVESTOR" | "PARTNER" | "OTHER")
                                }
                              >
                                {companyCoInvestorRelationshipOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label>Investment Amount (USD)</label>
                              <input
                                value={editingCoInvestorInvestmentAmountUsd}
                                onChange={(event) => setEditingCoInvestorInvestmentAmountUsd(event.target.value)}
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0"
                              />
                            </div>
                            <div>
                              <label>Notes</label>
                              <input
                                value={editingCoInvestorNotes}
                                onChange={(event) => setEditingCoInvestorNotes(event.target.value)}
                                placeholder="Notes"
                              />
                            </div>
                          </div>
                          <div className="actions">
                            <button
                              type="button"
                              className="primary"
                              onClick={() =>
                                saveCoInvestorLinkForSelectedRecord(link.coInvestorId, link.coInvestor.name)
                              }
                            >
                              Save Link
                            </button>
                            <button type="button" className="ghost small" onClick={resetEditingCoInvestorLinkForm}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{link.coInvestor.name}</strong> - {link.relationshipType}
                            {link.investmentAmountUsd !== null ? ` | Investment: ${link.investmentAmountUsd}` : ""}
                          </div>
                          <div className="contact-row-actions">
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => beginEditingCoInvestorLink(link)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() =>
                                deleteCoInvestorLinkFromSelectedRecord(link.id, link.coInvestorId, link.coInvestor.name)
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

                </>
              )}

              {activeDetailTab === "pipeline" && (
                <>
              <CompanyPipelineManager
                companyId={selectedRecord.id}
                healthSystems={healthSystems}
                coInvestors={coInvestors}
                contacts={selectedRecord.contactLinks.map((link) => ({
                  id: link.contact.id,
                  name: link.contact.name,
                  title: link.title || link.contact.title || null
                }))}
              />
                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
