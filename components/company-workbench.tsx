"use client";

import * as React from "react";

type SearchCandidate = {
  name: string;
  website?: string;
  headquartersCity?: string;
  headquartersState?: string;
  headquartersCountry?: string;
  summary?: string;
  sourceUrls: string[];
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

const intakeStatusOptions: Array<{ value: IntakeStatus; label: string }> = [
  { value: "NOT_SCHEDULED", label: "Not Scheduled" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "SCREENING_EVALUATION", label: "Screening Evaluation" }
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

function intakeStatusClass(status: IntakeStatus) {
  if (status === "SCREENING_EVALUATION") return "done";
  if (status === "COMPLETED") return "done";
  if (status === "SCHEDULED") return "queued";
  return "draft";
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

function buildFallbackHealthSystemCandidate(term: string) {
  return {
    name: term,
    website: "",
    headquartersCity: "",
    headquartersState: "",
    headquartersCountry: "",
    summary: "Created from company lead source.",
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
  const [selectedRecordId, setSelectedRecordId] = React.useState<string | null>(null);
  const [draftRecordId, setDraftRecordId] = React.useState<string | null>(null);
  const [detailDraft, setDetailDraft] = React.useState<DetailDraft | null>(null);
  const [runningAgent, setRunningAgent] = React.useState(false);
  const [savingEdits, setSavingEdits] = React.useState(false);
  const [creatingFromSearch, setCreatingFromSearch] = React.useState(false);
  const [deletingRecordId, setDeletingRecordId] = React.useState<string | null>(null);
  const [searchCandidates, setSearchCandidates] = React.useState<SearchCandidate[]>([]);
  const [candidateSearchQuery, setCandidateSearchQuery] = React.useState("");
  const [searchingCandidates, setSearchingCandidates] = React.useState(false);
  const [searchCandidateError, setSearchCandidateError] = React.useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = React.useState(-1);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [addingContact, setAddingContact] = React.useState(false);
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
  const [keepListView, setKeepListView] = React.useState(false);
  const [newCompanyType, setNewCompanyType] = React.useState<CompanyType>("STARTUP");
  const [newPrimaryCategory, setNewPrimaryCategory] = React.useState<PrimaryCategory>("OTHER");
  const [newPrimaryCategoryOther, setNewPrimaryCategoryOther] = React.useState("");
  const [newLeadSourceType, setNewLeadSourceType] = React.useState<LeadSourceType>("OTHER");
  const [newLeadSourceHealthSystemId, setNewLeadSourceHealthSystemId] = React.useState("");
  const [newLeadSourceHealthSystemDraftName, setNewLeadSourceHealthSystemDraftName] = React.useState("");
  const [newLeadSourceOther, setNewLeadSourceOther] = React.useState("");
  const [leadSourceOtherOptions, setLeadSourceOtherOptions] = React.useState<string[]>([]);
  const [newDescription, setNewDescription] = React.useState("");
  const [newResearchNotes, setNewResearchNotes] = React.useState("");
  const [newGoogleTranscriptUrl, setNewGoogleTranscriptUrl] = React.useState("");
  const [newSpinOutOwnershipPercent, setNewSpinOutOwnershipPercent] = React.useState("");
  const [creatingLeadSourceForNew, setCreatingLeadSourceForNew] = React.useState(false);
  const [detailLeadSourceHealthSystemDraftName, setDetailLeadSourceHealthSystemDraftName] = React.useState("");
  const [creatingLeadSourceForDetail, setCreatingLeadSourceForDetail] = React.useState(false);

  const hasPending = React.useMemo(
    () => records.some((record) => record.researchStatus === "QUEUED" || record.researchStatus === "RUNNING"),
    [records]
  );

  const filteredRecords = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return records;
    return records.filter((record) => {
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
      (searchingCandidates || (searchCandidates.length > 1 && selectedCandidate === null)));

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

  async function createHealthSystemFromName(name: string): Promise<string> {
    const existing = healthSystems.find((system) => normalizeForMatch(system.name) === normalizeForMatch(name));
    if (existing) {
      return existing.id;
    }

    const candidate = buildFallbackHealthSystemCandidate(name);
    const verifyRes = await fetch("/api/health-systems/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        candidate,
        isLimitedPartner: false,
        isAllianceMember: false
      })
    });

    const verifyPayload = await verifyRes.json();
    if (!verifyRes.ok) {
      if (verifyRes.status === 409) {
        const freshRes = await fetch("/api/health-systems", { cache: "no-store" });
        const freshPayload = await freshRes.json();
        const list = Array.isArray(freshPayload.healthSystems) ? freshPayload.healthSystems : [];
        const found = list.find((system: { id: string; name: string }) => normalizeForMatch(system.name) === normalizeForMatch(name));
        if (found?.id) {
          await loadHealthSystems();
          return found.id;
        }
      }

      throw new Error(verifyPayload.error || "Failed to add health system");
    }

    await loadHealthSystems();
    return verifyPayload.healthSystem.id;
  }

  async function addLeadSourceHealthSystemFromDraftName(
    name: string,
    destination: "new" | "detail"
  ) {
    if (!name.trim()) {
      throw new Error("Enter a health system name.");
    }

    if (destination === "new") {
      setCreatingLeadSourceForNew(true);
    } else {
      setCreatingLeadSourceForDetail(true);
    }

    try {
      const id = await createHealthSystemFromName(name);
      if (destination === "new") {
        setNewLeadSourceHealthSystemId(id);
        setNewLeadSourceHealthSystemDraftName("");
      } else {
        setDetailDraft((prev) => {
          if (!prev) return prev;
          return { ...prev, leadSourceHealthSystemId: id };
        });
        setDetailLeadSourceHealthSystemDraftName("");
      }
    } finally {
      if (destination === "new") {
        setCreatingLeadSourceForNew(false);
      } else {
        setCreatingLeadSourceForDetail(false);
      }
    }
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

  async function searchCandidateMatches(term: string): Promise<SearchCandidate[]> {
    const searchRes = await fetch("/api/companies/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: term })
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
        if (candidateSearchQuery !== term || candidates.length === 0) {
          candidates = await searchCandidateMatches(term);
          setSearchCandidates(candidates);
          setCandidateSearchQuery(term);
          setSelectedCandidateIndex(candidates.length === 1 ? 0 : -1);
        }

        if (candidates.length > 1 && selectedCandidateIndex < 0) {
          throw new Error("Select one matching company before creating.");
        }

        if (candidates.length > 0) {
          candidate = candidates[selectedCandidateIndex >= 0 ? selectedCandidateIndex : 0];
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
      setNewLeadSourceHealthSystemDraftName("");
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
      setContactName("");
      setContactTitle("");
      setContactRelationshipTitle("");
      setContactEmail("");
      setContactPhone("");
      setContactLinkedinUrl("");
      setContactRoleType("COMPANY_CONTACT");
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

  async function saveSelectedRecordEdits() {
    if (!selectedRecord || !detailDraft) return;

    setSavingEdits(true);
    setStatus(null);

    try {
      const intakeScheduledAt = detailDraft.intakeStatus === "SCHEDULED" ? detailDraft.intakeScheduledAt : "";

      const res = await fetch(`/api/companies/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: detailDraft.name,
          legalName: detailDraft.legalName,
          website: detailDraft.website,
          headquartersCity: detailDraft.headquartersCity,
          headquartersState: detailDraft.headquartersState,
          headquartersCountry: detailDraft.headquartersCountry,
          companyType: detailDraft.companyType,
          primaryCategory: detailDraft.primaryCategory,
          primaryCategoryOther: detailDraft.primaryCategoryOther,
          declineReason: detailDraft.declineReason === "" ? null : detailDraft.declineReason,
          declineReasonOther: detailDraft.declineReasonOther,
          leadSourceType: detailDraft.leadSourceType,
          leadSourceHealthSystemId:
            detailDraft.leadSourceType === "HEALTH_SYSTEM" ? detailDraft.leadSourceHealthSystemId : null,
          leadSourceNotes: detailDraft.leadSourceNotes,
          description: detailDraft.description,
          googleTranscriptUrl: detailDraft.googleTranscriptUrl,
          spinOutOwnershipPercent:
            detailDraft.companyType === "SPIN_OUT" ? toNullableNumber(detailDraft.spinOutOwnershipPercent) : null,
          intakeStatus: detailDraft.intakeStatus,
          leadSourceOther:
            detailDraft.leadSourceType === "OTHER" ? detailDraft.leadSourceOther : null,
          intakeScheduledAt: intakeScheduledAt || null,
          screeningEvaluationAt:
            detailDraft.intakeStatus === "SCREENING_EVALUATION" ? new Date().toISOString() : null,
          researchNotes: detailDraft.researchNotes,
          healthSystemLinks: detailDraft.healthSystemLinks,
          coInvestorLinks: detailDraft.coInvestorLinks
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save changes");

      setStatus({ kind: "ok", text: `Saved changes for ${payload.company.name}.` });
      setDraftRecordId(null);
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save changes"
      });
    } finally {
      setSavingEdits(false);
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
    if (!shouldOfferCreate || isManualCreationType(newCompanyType)) {
      setSearchCandidates([]);
      setCandidateSearchQuery("");
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      setSearchingCandidates(false);
      return;
    }

    const term = query.trim();
    if (!term) return;

    let active = true;
    const timeout = setTimeout(async () => {
      setSearchingCandidates(true);
      setSearchCandidateError(null);

      try {
        const candidates = await searchCandidateMatches(term);
        if (!active) return;
        setSearchCandidates(candidates);
        setCandidateSearchQuery(term);
        setSelectedCandidateIndex(candidates.length === 1 ? 0 : -1);
      } catch (error) {
        if (!active) return;
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
    };
  }, [shouldOfferCreate, query, newCompanyType]);

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
      resetEditingContactForm();
      setDeletingContactLinkId(null);
      return;
    }

    if (selectedRecord.id !== draftRecordId) {
      setDetailDraft(draftFromRecord(selectedRecord));
      setDraftRecordId(selectedRecord.id);
      setDetailLeadSourceHealthSystemDraftName("");
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
        <section className="panel">
          <h2>Companies</h2>
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

          {query.trim().length >= 2 && (
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
                        setNewLeadSourceHealthSystemDraftName("");
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
                    <select
                      value={newLeadSourceHealthSystemId}
                      onChange={(event) => setNewLeadSourceHealthSystemId(event.target.value)}
                    >
                      <option value="">Select a health system</option>
                      {healthSystems.map((system) => (
                        <option key={system.id} value={system.id}>
                          {system.name}
                        </option>
                      ))}
                    </select>
                    {!newLeadSourceHealthSystemId && (
                      <div className="detail-section">
                        <label>Add a health system</label>
                        <input
                          value={newLeadSourceHealthSystemDraftName}
                          onChange={(event) => setNewLeadSourceHealthSystemDraftName(event.target.value)}
                          placeholder="Type missing health system name"
                        />
                        <div className="actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() =>
                              void addLeadSourceHealthSystemFromDraftName(
                                newLeadSourceHealthSystemDraftName,
                                "new"
                              ).catch((error) => {
                                setStatus({
                                  kind: "error",
                                  text: error instanceof Error ? error.message : "Failed to add health system"
                                });
                              })
                            }
                            disabled={
                              creatingLeadSourceForNew ||
                              !newLeadSourceHealthSystemDraftName.trim()
                            }
                          >
                            {creatingLeadSourceForNew ? "Adding..." : "Create Health System"}
                          </button>
                        </div>
                      </div>
                    )}
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
                    <textarea
                      value={newDescription}
                      onChange={(event) => setNewDescription(event.target.value)}
                    />
                  </div>
                  <div className="detail-section">
                    <label>Research Notes</label>
                    <textarea
                      value={newResearchNotes}
                      onChange={(event) => setNewResearchNotes(event.target.value)}
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
            </div>
          )}

          {shouldOfferCreate && (
            <div className="create-card">
              <p className="create-title">No companies match "{query.trim()}".</p>
              <p className="muted">
                {isManualCreationType(newCompanyType)
                  ? "Create a new company manually."
                  : "Create a new company and launch the research agent."}
              </p>

              {searchingCandidates && <p className="muted">Searching for possible online matches...</p>}
              {searchCandidateError && <p className="status error">{searchCandidateError}</p>}

              {searchCandidates.length > 0 && (
                <div className="candidate-list">
                  {searchCandidates.length > 1 && <p className="detail-label">Select matching company:</p>}
                  {searchCandidates.map((candidate, index) => {
                    const location = formatLocation(candidate);
                    const isSelected = selectedCandidateIndex === index;
                    return (
                      <label
                        key={`${candidate.name}-${candidate.headquartersCity || "unknown"}-${index}`}
                        className={`candidate-option ${isSelected ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="company-candidate"
                          checked={isSelected}
                          onChange={() => setSelectedCandidateIndex(index)}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        />
                        <div>
                          <div className="candidate-name">{candidate.name}</div>
                          <div className="candidate-location muted">
                            {location || "Location not identified"}
                          </div>
                          {candidate.website && <div className="candidate-location muted">{candidate.website}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}

              <div className="actions">
                <button
                  className="primary"
                  onClick={createAndResearchFromSearchTerm}
                  disabled={createButtonDisabled}
                  title={
                    searchCandidates.length > 1 && selectedCandidate === null ? "Select a match before creating" : undefined
                  }
                >
                  {createButtonDisabled
                    ? creatingFromSearch
                      ? "Creating..."
                      : isManualCreationType(newCompanyType)
                        ? "Create Company"
                        : "Select a match"
                    : isManualCreationType(newCompanyType)
                      ? "Create Company"
                      : "Create + Start Research"}
                </button>
              </div>
            </div>
          )}

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
                    <span className={`status-pill ${intakeStatusClass(record.intakeStatus)}`}>
                      {record.intakeStatus}
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

        <section className="panel">
          <h2>Company Detail</h2>
          {!selectedRecord || !detailDraft ? (
            <p className="muted">Select a company from the list to view details.</p>
          ) : (
            <div className="detail-card">
              <div className="detail-head">
                <h3>{selectedRecord.name}</h3>
              </div>

              <div className="actions">
                <button className="primary" onClick={saveSelectedRecordEdits} disabled={savingEdits}>
                  {savingEdits ? "Saving..." : "Save Changes"}
                </button>
              </div>

              <div className="detail-grid">
                <div>
                  <label>Name</label>
                  <input value={detailDraft.name} onChange={(event) => setDetailDraft({ ...detailDraft, name: event.target.value })} />
                </div>
                <div>
                  <label>Legal Name</label>
                  <input
                    value={detailDraft.legalName}
                    onChange={(event) => setDetailDraft({ ...detailDraft, legalName: event.target.value })}
                  />
                </div>
                <div>
                  <label>Website</label>
                  <input value={detailDraft.website} onChange={(event) => setDetailDraft({ ...detailDraft, website: event.target.value })} />
                </div>
                <div>
                  <label>Google Transcript Doc URL</label>
                  <input
                    value={detailDraft.googleTranscriptUrl}
                    onChange={(event) => setDetailDraft({ ...detailDraft, googleTranscriptUrl: event.target.value })}
                  />
                </div>
                <div>
                  <label>HQ City</label>
                  <input
                    value={detailDraft.headquartersCity}
                    onChange={(event) => setDetailDraft({ ...detailDraft, headquartersCity: event.target.value })}
                  />
                </div>
                <div>
                  <label>HQ State</label>
                  <input
                    value={detailDraft.headquartersState}
                    onChange={(event) => setDetailDraft({ ...detailDraft, headquartersState: event.target.value })}
                  />
                </div>
                <div>
                  <label>HQ Country</label>
                  <input
                    value={detailDraft.headquartersCountry}
                    onChange={(event) => setDetailDraft({ ...detailDraft, headquartersCountry: event.target.value })}
                  />
                </div>
                <div>
                  <label>Company Type</label>
                  <select
                    value={detailDraft.companyType}
                    onChange={(event) =>
                      setDetailDraft({ ...detailDraft, companyType: event.target.value as CompanyType })
                    }
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
                    value={detailDraft.primaryCategory}
                    onChange={(event) =>
                      setDetailDraft({
                        ...detailDraft,
                        primaryCategory: event.target.value as PrimaryCategory
                      })
                    }
                  >
                    {primaryCategoryOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {detailDraft.primaryCategory === "OTHER" && (
                  <div>
                    <label>Primary Category (Other)</label>
                    <input
                      value={detailDraft.primaryCategoryOther}
                      onChange={(event) => setDetailDraft({ ...detailDraft, primaryCategoryOther: event.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label>Decline Reason</label>
                  <select
                    value={detailDraft.declineReason}
                    onChange={(event) =>
                      setDetailDraft({
                        ...detailDraft,
                        declineReason: event.target.value as DeclineReason | ""
                      })
                    }
                  >
                    {declineReasonOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {detailDraft.declineReason === "OTHER" && (
                  <div>
                    <label>Decline Reason (Other)</label>
                    <input
                      value={detailDraft.declineReasonOther}
                      onChange={(event) => setDetailDraft({ ...detailDraft, declineReasonOther: event.target.value })}
                    />
                  </div>
                )}
                <div>
                  <label>Lead Source</label>
                  <select
                    value={detailDraft.leadSourceType}
                    onChange={(event) => {
                      setDetailLeadSourceHealthSystemDraftName("");
                      setDetailDraft({
                        ...detailDraft,
                        leadSourceType: event.target.value as LeadSourceType,
                        leadSourceHealthSystemId:
                          event.target.value === "HEALTH_SYSTEM" ? detailDraft.leadSourceHealthSystemId : "",
                        leadSourceOther: event.target.value === "OTHER" ? detailDraft.leadSourceOther : ""
                      });
                    }}
                  >
                    {leadSourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {detailDraft.leadSourceType === "HEALTH_SYSTEM" ? (
                  <div>
                    <label>Lead Source Health System</label>
                    <select
                      value={detailDraft.leadSourceHealthSystemId}
                      onChange={(event) =>
                        setDetailDraft({ ...detailDraft, leadSourceHealthSystemId: event.target.value })
                      }
                    >
                      <option value="">Select a health system</option>
                      {healthSystems.map((system) => (
                        <option key={system.id} value={system.id}>
                          {system.name}
                        </option>
                      ))}
                    </select>
                    {!detailDraft.leadSourceHealthSystemId && (
                      <div className="detail-section">
                        <label>Add a health system</label>
                        <input
                          value={detailLeadSourceHealthSystemDraftName}
                          onChange={(event) => setDetailLeadSourceHealthSystemDraftName(event.target.value)}
                          placeholder="Type missing health system name"
                        />
                        <div className="actions">
                          <button
                            className="secondary"
                            type="button"
                            onClick={() =>
                              void addLeadSourceHealthSystemFromDraftName(
                                detailLeadSourceHealthSystemDraftName,
                                "detail"
                              )
                                .catch((error) => {
                                  setStatus({
                                    kind: "error",
                                    text: error instanceof Error ? error.message : "Failed to add health system"
                                  });
                                })
                            }
                            disabled={
                              creatingLeadSourceForDetail || !detailLeadSourceHealthSystemDraftName.trim()
                            }
                          >
                            {creatingLeadSourceForDetail ? "Adding..." : "Create Health System"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label>Lead Source (Other)</label>
                    <input
                      list="lead-source-suggestions-detail"
                      value={detailDraft.leadSourceOther}
                      onChange={(event) =>
                        setDetailDraft({ ...detailDraft, leadSourceOther: event.target.value })
                      }
                      placeholder="Type or choose a source"
                    />
                  </div>
                )}
                <datalist id="lead-source-suggestions-detail">
                  {leadSourceOtherOptions.map((source) => (
                    <option key={`detail-${source}`} value={source} />
                  ))}
                </datalist>
                {detailDraft.companyType === "SPIN_OUT" && (
                  <div>
                    <label>Spin-out Ownership %</label>
                    <input
                      value={detailDraft.spinOutOwnershipPercent}
                      onChange={(event) =>
                        setDetailDraft({ ...detailDraft, spinOutOwnershipPercent: event.target.value })
                      }
                      placeholder="Typically 50"
                    />
                  </div>
                )}
                <div>
                  <label>Intake Status</label>
                  <select
                    value={detailDraft.intakeStatus}
                    onChange={(event) => {
                      const next = event.target.value as IntakeStatus;
                      setDetailDraft({ ...detailDraft, intakeStatus: next });
                    }}
                  >
                    {intakeStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                {detailDraft.intakeStatus === "SCHEDULED" && (
                  <div>
                    <label>Intake Scheduled Date</label>
                    <input
                      type="date"
                      value={detailDraft.intakeScheduledAt}
                      onChange={(event) =>
                        setDetailDraft({
                          ...detailDraft,
                          intakeScheduledAt: event.target.value
                        })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="detail-section">
                <label>Description</label>
                <textarea
                  value={detailDraft.description}
                  onChange={(event) => setDetailDraft({ ...detailDraft, description: event.target.value })}
                />
              </div>

              <div className="detail-section">
                <label>Research Notes</label>
                <textarea
                  value={detailDraft.researchNotes}
                  onChange={(event) => setDetailDraft({ ...detailDraft, researchNotes: event.target.value })}
                />
              </div>

              <div className="detail-section">
                <p className="detail-label">Contacts</p>
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
                        <div>
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
                          <div className="actions">
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

                <div className="detail-grid">
                  <div>
                    <label>Contact Name</label>
                    <input
                      value={contactName}
                      onChange={(event) => setContactName(event.target.value)}
                      placeholder="William Smith"
                    />
                  </div>
                  <div>
                    <label>Role Type</label>
                    <select
                      value={contactRoleType}
                      onChange={(event) =>
                        setContactRoleType(
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
                      value={contactTitle}
                      onChange={(event) => setContactTitle(event.target.value)}
                      placeholder="CIO / Board Member"
                    />
                  </div>
                  <div>
                    <label>Relationship Title</label>
                    <input
                      value={contactRelationshipTitle}
                      onChange={(event) => setContactRelationshipTitle(event.target.value)}
                      placeholder="Board Member"
                    />
                  </div>
                  <div>
                    <label>Email</label>
                    <input
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                      placeholder="name@company.com"
                    />
                  </div>
                  <div>
                    <label>Phone</label>
                    <input
                      value={contactPhone}
                      onChange={(event) => setContactPhone(event.target.value)}
                      placeholder="+1 555 555 5555"
                    />
                  </div>
                  <div>
                    <label>LinkedIn URL</label>
                    <input
                      value={contactLinkedinUrl}
                      onChange={(event) => setContactLinkedinUrl(event.target.value)}
                      placeholder="https://linkedin.com/in/..."
                    />
                  </div>
                </div>
                <div className="actions">
                  <button className="secondary" onClick={addContactToSelectedRecord} disabled={addingContact}>
                    {addingContact ? "Adding..." : "Add Contact"}
                  </button>
                </div>
              </div>

              {selectedRecord.healthSystemLinks.length === 0 ? (
                <p className="muted">No linked health systems yet.</p>
              ) : (
                <div className="detail-section">
                  <p className="detail-label">Linked Health Systems</p>
                  {selectedRecord.healthSystemLinks.map((link) => (
                    <div key={link.id} className="detail-list-item">
                      <strong>{link.healthSystem.name}</strong> - {link.relationshipType}
                      {link.investmentAmountUsd !== null ? ` | Invested/Allocated: ${link.investmentAmountUsd}` : ""}
                      {link.ownershipPercent !== null ? ` | Ownership: ${link.ownershipPercent}%` : ""}
                    </div>
                  ))}
                </div>
              )}

              {selectedRecord.coInvestorLinks.length === 0 ? (
                <p className="muted">No linked co-investors yet.</p>
              ) : (
                <div className="detail-section">
                  <p className="detail-label">Linked Co-Investors</p>
                  {selectedRecord.coInvestorLinks.map((link) => (
                    <div key={link.id} className="detail-list-item">
                      <strong>{link.coInvestor.name}</strong> - {link.relationshipType}
                      {link.investmentAmountUsd !== null ? ` | Investment: ${link.investmentAmountUsd}` : ""}
                    </div>
                  ))}
                </div>
              )}

              {selectedRecord.researchError && (
                <div className="detail-section">
                  <p className="detail-label">Research Error</p>
                  <p>{selectedRecord.researchError}</p>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
