"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  InlineBooleanField,
  InlineSelectField,
  InlineTextField
} from "./inline-detail-field";
import { SearchMatchModal } from "./search-match-modal";
import { EntityLookupInput } from "./entity-lookup-input";
import { AddContactModal } from "./add-contact-modal";
import { EntityDocumentsPane } from "./entity-documents-pane";
import { EntityNotesPane } from "./entity-notes-pane";
import type { AllianceMemberStatus } from "@/lib/schemas";
import { type CompanyOpportunityStage } from "@prisma/client";

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

type HealthSystemRecord = {
  id: string;
  name: string;
  logoUrl?: string | null;
  legalName?: string | null;
  website?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
  netPatientRevenueUsd?: number | string | null;
  isLimitedPartner: boolean;
  limitedPartnerInvestmentUsd?: number | string | null;
  isAllianceMember: boolean;
  allianceMemberStatus: AllianceMemberStatus;
  researchStatus: "DRAFT" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  researchError?: string | null;
  contactLinks: Array<{
    id: string;
    roleType: "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "COMPANY_CONTACT" | "OTHER";
    title?: string | null;
    isKeyAllianceContact?: boolean;
    isInformedAllianceContact?: boolean;
    contact: {
      id: string;
      name: string;
      title?: string | null;
      email?: string | null;
      phone?: string | null;
      linkedinUrl?: string | null;
    };
  }>;
  investments: Array<{
    id: string;
    portfolioCompanyName: string;
    investmentAmountUsd?: number | string | null;
    investmentDate?: string | null;
    leadPartnerName?: string | null;
    sourceUrl?: string | null;
    companyId?: string | null;
    company?: { id: string; name: string } | null;
  }>;
  customerLinks: Array<{
    id: string;
    relationshipType: "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER";
    notes?: string | null;
    annualContractValueUsd?: number | string | null;
    investmentAmountUsd?: number | string | null;
    ownershipPercent?: number | string | null;
    companyId: string;
    company: {
      id: string;
      name: string;
    };
  }>;
};

type CompanyOption = {
  id: string;
  name: string;
};

type OpportunityStatusFilter = "open" | "closed";

type OpportunitySummary = {
  id: string;
  title: string;
  type: string;
  stage: CompanyOpportunityStage;
  likelihoodPercent: number | null;
  contractPriceUsd: number | null;
  nextSteps: string | null;
  estimatedCloseDate: string | null;
  closedAt: string | null;
  contactCount: number;
  createdAt: string;
  updatedAt: string;
  company: {
    id: string;
    name: string;
  };
  healthSystem: {
    id: string;
    name: string;
  } | null;
};

const companyHealthSystemRelationshipOptions: Array<{ value: "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"; label: string }> = [
  { value: "CUSTOMER", label: "Vendor" },
  { value: "SPIN_OUT_PARTNER", label: "Spin-out Partner" },
  { value: "INVESTOR_PARTNER", label: "Investor Partner" },
  { value: "OTHER", label: "Other" }
];

const allianceMemberStatusOptions: Array<{ value: AllianceMemberStatus; label: string }> = [
  { value: "YES", label: "Yes" },
  { value: "NO", label: "No" },
  { value: "PROSPECT", label: "Prospect" }
];

type DetailDraft = {
  name: string;
  legalName: string;
  website: string;
  headquartersLocation: string;
  netPatientRevenueUsd: string;
  isLimitedPartner: boolean;
  limitedPartnerInvestmentUsd: string;
  allianceMemberStatus: AllianceMemberStatus;
};

type DetailTab = "overview" | "documents" | "notes" | "contacts" | "relationships" | "opportunities";

type HealthSystemApiRecord = {
  id: string;
  name: string;
  logoUrl?: string | null;
  legalName?: string | null;
  website?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
  netPatientRevenueUsd?: number | string | null;
  isLimitedPartner: boolean;
  limitedPartnerInvestmentUsd?: number | string | null;
  isAllianceMember: boolean;
  allianceMemberStatus?: AllianceMemberStatus | null;
  researchStatus: "DRAFT" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  researchError?: string | null;
  contactLinks?: HealthSystemRecord["contactLinks"];
  investments?: HealthSystemRecord["investments"];
  customerLinks?: HealthSystemRecord["customerLinks"];
  companyHealthSystemLinks?: HealthSystemRecord["customerLinks"];
};

function formatLocation(record: {
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
}) {
  return [record.headquartersCity, record.headquartersState, record.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function parseHeadquartersLocation(location: string) {
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (parts.length === 0) {
    return { headquartersCity: "", headquartersState: "", headquartersCountry: "" };
  }

  if (parts.length === 1) {
    return { headquartersCity: parts[0], headquartersState: "", headquartersCountry: "" };
  }

  if (parts.length === 2) {
    return { headquartersCity: parts[0], headquartersState: parts[1], headquartersCountry: "" };
  }

  return {
    headquartersCity: parts[0],
    headquartersState: parts[1],
    headquartersCountry: parts.slice(2).join(", ")
  };
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

function contactNameParts(name: string) {
  const nameParts = name.trim().split(/\s+/).filter(Boolean);
  if (nameParts.length === 0) return { firstName: "", lastName: "", displayName: "" };
  if (nameParts.length === 1) {
    return { firstName: "", lastName: nameParts[0], displayName: nameParts[0] };
  }

  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts.slice(0, -1).join(" ");
  return {
    firstName,
    lastName,
    displayName: `${lastName}, ${firstName}`
  };
}

function findDuplicateRecord(records: HealthSystemRecord[], candidate: SearchCandidate) {
  const candidateName = normalizeForMatch(candidate.name);
  if (!candidateName) return null;

  const candidateWebsite = normalizeWebsiteForMatch(candidate.website);
  return records.find((record) => {
    const recordName = normalizeForMatch(record.name);
    if (recordName !== candidateName) return false;

    const recordWebsite = normalizeWebsiteForMatch(record.website || null);
    if (candidateWebsite && recordWebsite && candidateWebsite === recordWebsite) {
      return true;
    }

    const candidateCity = normalizeForMatch(candidate.headquartersCity);
    const candidateState = normalizeForMatch(candidate.headquartersState);
    const candidateCountry = normalizeForMatch(candidate.headquartersCountry);
    const recordCity = normalizeForMatch(record.headquartersCity);
    const recordState = normalizeForMatch(record.headquartersState);
    const recordCountry = normalizeForMatch(record.headquartersCountry);

    const locationPairs = [
      [candidateCity, recordCity],
      [candidateState, recordState],
      [candidateCountry, recordCountry]
    ] as const;

    const comparableParts = locationPairs.filter(([candidateValue, recordValue]) => candidateValue || recordValue);
    if (comparableParts.length === 0) return false;

    return comparableParts.every(([candidateValue, recordValue]) => candidateValue === recordValue);
  }) || null;
}

function toNullableNumber(value: string): number | null {
  const normalized = value.trim().replace(/[$,\s]/g, "");
  if (!normalized) return null;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function formatUsd(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(numeric);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US");
}

function isClosedOpportunityStage(stage: CompanyOpportunityStage) {
  return stage === "CLOSED_WON" || stage === "CLOSED_LOST";
}

function formatOpportunityDate(value: string | null | undefined) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatOpportunityCurrency(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return "-";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  });
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

function normalizeAllianceMemberStatus(input: {
  allianceMemberStatus?: AllianceMemberStatus | null;
  isAllianceMember?: boolean;
}): AllianceMemberStatus {
  if (
    input.allianceMemberStatus === "YES" ||
    input.allianceMemberStatus === "PROSPECT"
  ) {
    return input.allianceMemberStatus;
  }
  if (input.allianceMemberStatus === "NO" && input.isAllianceMember) {
    return "YES";
  }
  return input.isAllianceMember ? "YES" : "NO";
}

function allianceMemberTagLabel(status: AllianceMemberStatus) {
  if (status === "PROSPECT") return "Alliance Prospect";
  if (status === "YES") return "Alliance";
  return "";
}

function normalizeHealthSystemRecord(record: HealthSystemApiRecord): HealthSystemRecord {
  const allianceMemberStatus = normalizeAllianceMemberStatus({
    allianceMemberStatus: record.allianceMemberStatus,
    isAllianceMember: record.isAllianceMember
  });

  return {
    ...record,
    allianceMemberStatus,
    name: record.name || "",
    logoUrl: record.logoUrl || null,
    legalName: record.legalName || null,
    website: record.website || null,
    headquartersCity: record.headquartersCity || null,
    headquartersState: record.headquartersState || null,
    headquartersCountry: record.headquartersCountry || null,
    netPatientRevenueUsd: record.netPatientRevenueUsd ?? null,
    isAllianceMember: record.isAllianceMember,
    limitedPartnerInvestmentUsd: record.limitedPartnerInvestmentUsd ?? null,
    researchError: record.researchError || null,
    contactLinks: record.contactLinks || [],
    investments: record.investments || [],
    customerLinks: record.customerLinks || record.companyHealthSystemLinks || []
  };
}

function draftFromRecord(record: HealthSystemRecord): DetailDraft {
  return {
    name: record.name || "",
    legalName: record.legalName || "",
    website: record.website || "",
    headquartersLocation: formatLocation(record),
    netPatientRevenueUsd: record.netPatientRevenueUsd?.toString() || "",
    isLimitedPartner: record.isLimitedPartner,
    limitedPartnerInvestmentUsd: record.limitedPartnerInvestmentUsd?.toString() || "",
    allianceMemberStatus: record.allianceMemberStatus
  };
}

export function HealthSystemWorkbench() {
  const [query, setQuery] = useState("");
  const [healthSystemLookupValue, setHealthSystemLookupValue] = useState("");
  const [healthSystemLookupModalSignal, setHealthSystemLookupModalSignal] = useState(0);
  const [records, setRecords] = useState<HealthSystemRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [draftRecordId, setDraftRecordId] = useState<string | null>(null);
  const [detailDraft, setDetailDraft] = useState<DetailDraft | null>(null);
  const [, setRunningAgent] = useState(false);
  const [creatingFromSearch, setCreatingFromSearch] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [newIsLimitedPartner, setNewIsLimitedPartner] = useState(false);
  const [newAllianceMemberStatus, setNewAllianceMemberStatus] = useState<AllianceMemberStatus>("NO");
  const [newLimitedPartnerInvestmentUsd, setNewLimitedPartnerInvestmentUsd] = useState("");
  const [searchCandidates, setSearchCandidates] = useState<SearchCandidate[]>([]);
  const [candidateSearchQuery, setCandidateSearchQuery] = useState("");
  const [searchingCandidates, setSearchingCandidates] = useState(false);
  const [searchCandidateError, setSearchCandidateError] = useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = useState(-1);
  const [matchModalOpen, setMatchModalOpen] = useState(false);
  const [matchModalManualMode, setMatchModalManualMode] = useState(false);
  const [manualMatchCandidate, setManualMatchCandidate] = useState<ManualSearchCandidate>({
    name: "",
    website: "",
    headquartersCity: "",
    headquartersState: "",
    headquartersCountry: ""
  });
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [addContactModalOpen, setAddContactModalOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactRelationshipTitle, setContactRelationshipTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactLinkedinUrl, setContactLinkedinUrl] = useState("");
  const [newIsKeyAllianceContact, setNewIsKeyAllianceContact] = useState(false);
  const [newIsInformedAllianceContact, setNewIsInformedAllianceContact] = useState(false);
  const [contactRoleType, setContactRoleType] = useState<"EXECUTIVE" | "VENTURE_PARTNER" | "OTHER">(
    "EXECUTIVE"
  );
  const [editingContactLinkId, setEditingContactLinkId] = useState<string | null>(null);
  const [editingContactName, setEditingContactName] = useState("");
  const [editingContactTitle, setEditingContactTitle] = useState("");
  const [editingContactRelationshipTitle, setEditingContactRelationshipTitle] = useState("");
  const [editingContactEmail, setEditingContactEmail] = useState("");
  const [editingContactPhone, setEditingContactPhone] = useState("");
  const [editingContactLinkedinUrl, setEditingContactLinkedinUrl] = useState("");
  const [editingIsKeyAllianceContact, setEditingIsKeyAllianceContact] = useState(false);
  const [editingIsInformedAllianceContact, setEditingIsInformedAllianceContact] = useState(false);
  const [editingContactRoleType, setEditingContactRoleType] = useState<
    "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER"
  >("EXECUTIVE");
  const [updatingContact, setUpdatingContact] = useState(false);
  const [deletingContactLinkId, setDeletingContactLinkId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [addingInvestment, setAddingInvestment] = useState(false);
  const [investmentCompanyId, setInvestmentCompanyId] = useState("");
  const [showAddInvestmentLookup, setShowAddInvestmentLookup] = useState(false);
  const [editingInvestmentLinkId, setEditingInvestmentLinkId] = useState<string | null>(null);
  const [editingInvestmentCompanyId, setEditingInvestmentCompanyId] = useState("");
  const [editingInvestmentAmount, setEditingInvestmentAmount] = useState("");
  const [editingInvestmentDate, setEditingInvestmentDate] = useState("");
  const [editingInvestmentLeadPartnerName, setEditingInvestmentLeadPartnerName] = useState("");
  const [editingInvestmentSourceUrl, setEditingInvestmentSourceUrl] = useState("");
  const [updatingInvestment, setUpdatingInvestment] = useState(false);
  const [deletingInvestmentLinkId, setDeletingInvestmentLinkId] = useState<string | null>(null);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [customerCompanyId, setCustomerCompanyId] = useState("");
  const [showAddCustomerLookup, setShowAddCustomerLookup] = useState(false);
  const [editingCustomerLinkId, setEditingCustomerLinkId] = useState<string | null>(null);
  const [editingCustomerCompanyId, setEditingCustomerCompanyId] = useState("");
  const [editingCustomerRelationshipType, setEditingCustomerRelationshipType] = useState<
    "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
  >("CUSTOMER");
  const [editingCustomerNotes, setEditingCustomerNotes] = useState("");
  const [editingCustomerAnnualContractValue, setEditingCustomerAnnualContractValue] = useState("");
  const [updatingCustomer, setUpdatingCustomer] = useState(false);
  const [deletingCustomerLinkId, setDeletingCustomerLinkId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");
  const [keepListView, setKeepListView] = useState(false);
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false);
  const [opportunitiesError, setOpportunitiesError] = useState<string | null>(null);
  const [opportunityStatusFilter, setOpportunityStatusFilter] = useState<OpportunityStatusFilter>("open");
  const candidateSearchCacheRef = useRef<Record<string, SearchCandidate[]>>({});
  const candidateSearchAbortRef = useRef<AbortController | null>(null);

  const hasPending = useMemo(
    () => records.some((record) => record.researchStatus === "QUEUED" || record.researchStatus === "RUNNING"),
    [records]
  );

  const filteredRecords = useMemo(() => {
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
            record.website
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

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedRecordId) || null,
    [records, selectedRecordId]
  );
  const filteredOpportunities = useMemo(
    () =>
      opportunities.filter((opportunity) =>
        opportunityStatusFilter === "open"
          ? !isClosedOpportunityStage(opportunity.stage)
          : isClosedOpportunityStage(opportunity.stage)
      ),
    [opportunities, opportunityStatusFilter]
  );

  const shouldOfferCreate = false;
  const selectedCandidate =
    selectedCandidateIndex >= 0 && selectedCandidateIndex < searchCandidates.length
      ? searchCandidates[selectedCandidateIndex]
      : null;

  const createButtonDisabled =
    creatingFromSearch ||
    (matchModalManualMode
      ? !manualMatchCandidate.name.trim()
      : searchingCandidates ||
        (searchCandidates.length > 1 && selectedCandidate === null) ||
        (searchCandidates.length === 0 && !manualMatchCandidate.name.trim()));

  function beginManualMatchEntry() {
    setMatchModalManualMode(true);
    setSearchingCandidates(false);
    setSearchCandidateError(null);
    setSearchCandidates([]);
    setCandidateSearchQuery(query.trim());
    setSelectedCandidateIndex(-1);
    if (candidateSearchAbortRef.current) {
      candidateSearchAbortRef.current.abort();
      candidateSearchAbortRef.current = null;
    }
  }

  function openCreateMatchModal() {
    const term = query.trim();
    if (!term || !shouldOfferCreate) {
      return;
    }

    setManualMatchCandidate((previous) => {
      if (previous.name === term) {
        return previous;
      }
      return {
        ...previous,
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

  async function loadReferenceRecords() {
    const companyRes = await fetch("/api/companies");
    const companyPayload = await companyRes.json();
    if (!companyRes.ok) {
      throw new Error(companyPayload.error || "Failed to load companies");
    }

    setCompanies((companyPayload.companies || []).map((item: { id: string; name: string }) => ({
      id: item.id,
      name: item.name
    })));
  }

  function getCompanyNameById(id: string) {
    return companies.find((company) => company.id === id)?.name || "";
  }

  function addCompanyOption(option: { id: string; name: string }) {
    setCompanies((current) => {
      if (current.some((entry) => entry.id === option.id)) return current;
      return [{ id: option.id, name: option.name }, ...current];
    });
  }

  async function loadRecords() {
    const res = await fetch("/api/health-systems", { cache: "no-store" });
    const payload = await res.json();
    const healthSystems = (payload.healthSystems || []).map((record: HealthSystemApiRecord) =>
      normalizeHealthSystemRecord(record)
    );
    setRecords(healthSystems);
  }

  async function loadOpportunitiesForSelectedRecord(recordId: string) {
    const res = await fetch(`/api/health-systems/${recordId}/opportunities`, { cache: "no-store" });
    const payload = await res.json();

    if (!res.ok) {
      throw new Error(payload.error || "Failed to load opportunities.");
    }

    return Array.isArray(payload.opportunities) ? payload.opportunities : [];
  }

  async function runQueuedAgent(maxJobs = 2) {
    setRunningAgent(true);
    try {
      await fetch("/api/health-systems/research-jobs/process", {
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
    const searchRes = await fetch("/api/health-systems/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: term }),
      signal: options?.signal
    });

    if (!searchRes.ok) {
      const searchPayload = await searchRes.json().catch(() => ({ error: "Failed to search health systems" }));
      throw new Error(searchPayload.error || "Failed to search health systems");
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
      let candidates = searchCandidates;
      if (!matchModalManualMode && (candidateSearchQuery !== term || candidates.length === 0)) {
        candidates = await searchCandidateMatches(term);
        setSearchCandidates(candidates);
        setCandidateSearchQuery(term);
        setSelectedCandidateIndex(candidates.length === 1 ? 0 : -1);
      }

      if (!matchModalManualMode && candidates.length > 1 && selectedCandidateIndex < 0) {
        throw new Error("Select one matching health system before creating.");
      }

      const candidate = matchModalManualMode
        ? {
            name: manualMatchCandidate.name || term,
            website: manualMatchCandidate.website,
            headquartersCity: manualMatchCandidate.headquartersCity,
            headquartersState: manualMatchCandidate.headquartersState,
            headquartersCountry: manualMatchCandidate.headquartersCountry,
            summary: "Created from manual entry.",
            sourceUrls: []
          }
        : candidates.length > 0
          ? candidates[selectedCandidateIndex >= 0 ? selectedCandidateIndex : 0]
          : buildFallbackCandidate(term);

      const duplicateRecord = findDuplicateRecord(records, candidate);
      if (duplicateRecord) {
        const location = formatLocation(duplicateRecord);
        throw new Error(
          `Duplicate blocked: ${duplicateRecord.name}${location ? ` (${location})` : ""} already exists.`
        );
      }

      const verifyRes = await fetch("/api/health-systems/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate,
          isLimitedPartner: newIsLimitedPartner,
          isAllianceMember: newAllianceMemberStatus === "YES",
          allianceMemberStatus: newAllianceMemberStatus,
          limitedPartnerInvestmentUsd: newIsLimitedPartner
            ? toNullableNumber(newLimitedPartnerInvestmentUsd)
            : null
        })
      });

      const verifyPayload = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyPayload.error || "Failed to create health system");
      }

      const createdHealthSystemId = verifyPayload.healthSystem?.id as string | undefined;

      if (verifyPayload.healthSystem) {
        const createdRecord = normalizeHealthSystemRecord(verifyPayload.healthSystem);
        setRecords((current) => {
          if (current.some((record) => record.id === createdRecord.id)) {
            return current;
          }

          return [createdRecord, ...current];
        });
      }

      if (createdHealthSystemId) {
        setKeepListView(true);
        setSelectedRecordId(createdHealthSystemId);
      }

      setQuery("");

      await loadRecords();

      setStatus({
        kind: "ok",
        text: `${verifyPayload.healthSystem.name} created. Research agent queued.`
      });

      setKeepListView(false);
      setDraftRecordId(null);
      setSearchCandidates([]);
      setCandidateSearchQuery("");
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      setMatchModalOpen(false);
      setMatchModalManualMode(false);
      setNewIsLimitedPartner(false);
      setNewAllianceMemberStatus("NO");
      setNewLimitedPartnerInvestmentUsd("");
      setManualMatchCandidate({
        name: "",
        website: "",
        headquartersCity: "",
        headquartersState: "",
        headquartersCountry: ""
      });
      await runQueuedAgent(1);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create health system"
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
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          title: contactTitle,
          relationshipTitle: contactRelationshipTitle,
          email: contactEmail,
          phone: contactPhone,
          linkedinUrl: contactLinkedinUrl,
          roleType: contactRoleType,
          isKeyAllianceContact: newIsKeyAllianceContact,
          isInformedAllianceContact: newIsInformedAllianceContact
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

  function beginEditingContact(link: HealthSystemRecord["contactLinks"][number]) {
    setEditingContactLinkId(link.id);
    setEditingContactName(link.contact.name);
    setEditingContactTitle(link.title || "");
    setEditingContactRelationshipTitle(link.title || link.contact.title || "");
    setEditingContactEmail(link.contact.email || "");
    setEditingContactPhone(link.contact.phone || "");
    setEditingContactLinkedinUrl(link.contact.linkedinUrl || "");
    setEditingContactRoleType(link.roleType === "EXECUTIVE" || link.roleType === "VENTURE_PARTNER" ? link.roleType : "OTHER");
    setEditingIsKeyAllianceContact(Boolean(link.isKeyAllianceContact));
    setEditingIsInformedAllianceContact(Boolean(link.isInformedAllianceContact));
    setStatus(null);
  }

  function resetContactForm() {
    setContactName("");
    setContactTitle("");
    setContactRelationshipTitle("");
    setContactEmail("");
    setContactPhone("");
    setContactLinkedinUrl("");
    setNewIsKeyAllianceContact(false);
    setNewIsInformedAllianceContact(false);
    setContactRoleType("EXECUTIVE");
  }

  function resetEditingContactForm() {
    setEditingContactLinkId(null);
    setEditingContactName("");
    setEditingContactTitle("");
    setEditingContactRelationshipTitle("");
    setEditingContactEmail("");
    setEditingContactPhone("");
    setEditingContactLinkedinUrl("");
    setEditingIsKeyAllianceContact(false);
    setEditingIsInformedAllianceContact(false);
    setEditingContactRoleType("EXECUTIVE");
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
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/contacts`, {
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
          roleType: editingContactRoleType,
          isKeyAllianceContact: editingIsKeyAllianceContact,
          isInformedAllianceContact: editingIsInformedAllianceContact
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

    const confirmDelete = window.confirm(`Remove ${contactName} from this health system?`);
    if (!confirmDelete) return;

    setDeletingContactLinkId(linkId);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/contacts`, {
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

  function resetInvestmentForm() {
    setInvestmentCompanyId("");
    setShowAddInvestmentLookup(false);
  }

  function resetCustomerForm() {
    setCustomerCompanyId("");
    setShowAddCustomerLookup(false);
  }

  function resetEditingInvestmentForm() {
    setEditingInvestmentLinkId(null);
    setEditingInvestmentCompanyId("");
    setEditingInvestmentAmount("");
    setEditingInvestmentDate("");
    setEditingInvestmentLeadPartnerName("");
    setEditingInvestmentSourceUrl("");
  }

  function resetEditingCustomerForm() {
    setEditingCustomerLinkId(null);
    setEditingCustomerCompanyId("");
    setEditingCustomerRelationshipType("CUSTOMER");
    setEditingCustomerNotes("");
    setEditingCustomerAnnualContractValue("");
  }

  function beginEditingInvestment(investment: HealthSystemRecord["investments"][number]) {
    setEditingInvestmentLinkId(investment.id);
    setEditingInvestmentCompanyId(investment.companyId || "");
    setEditingInvestmentAmount(investment.investmentAmountUsd?.toString() || "");
    setEditingInvestmentDate(investment.investmentDate || "");
    setEditingInvestmentLeadPartnerName(investment.leadPartnerName || "");
    setEditingInvestmentSourceUrl(investment.sourceUrl || "");
    setStatus(null);
  }

  function beginEditingCustomer(link: HealthSystemRecord["customerLinks"][number]) {
    setEditingCustomerLinkId(link.id);
    setEditingCustomerCompanyId(link.company.id);
    setEditingCustomerRelationshipType(link.relationshipType);
    setEditingCustomerNotes(link.notes || "");
    const annualContractValue =
      link.annualContractValueUsd !== undefined
        ? link.annualContractValueUsd
        : link.investmentAmountUsd;
    setEditingCustomerAnnualContractValue(annualContractValue?.toString() || "");
    setStatus(null);
  }

  async function addInvestmentToSelectedRecord(nextCompanyId?: string) {
    if (!selectedRecord) return;
    const companyId = (nextCompanyId ?? investmentCompanyId).trim();
    if (!companyId) {
      setStatus({ kind: "error", text: "Select a company." });
      return;
    }

    setAddingInvestment(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/investments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add investment");
      }

      setStatus({
        kind: "ok",
        text: `${payload.investment?.company?.name || getCompanyNameById(companyId)} linked as investment.`
      });
      resetInvestmentForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add investment"
      });
    } finally {
      setAddingInvestment(false);
    }
  }

  async function updateInvestmentForSelectedRecord(linkId: string) {
    if (!selectedRecord) return;
    if (!editingInvestmentCompanyId) {
      setStatus({ kind: "error", text: "Select a company." });
      return;
    }

    setUpdatingInvestment(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/investments`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          companyId: editingInvestmentCompanyId,
          investmentAmountUsd: toNullableNumber(editingInvestmentAmount),
          investmentDate: editingInvestmentDate || null,
          leadPartnerName: editingInvestmentLeadPartnerName,
          sourceUrl: editingInvestmentSourceUrl
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update investment");
      }

      setStatus({
        kind: "ok",
        text: `${payload.investment?.company?.name || getCompanyNameById(editingInvestmentCompanyId)} updated.`
      });
      resetEditingInvestmentForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update investment"
      });
    } finally {
      setUpdatingInvestment(false);
    }
  }

  async function addCustomerToSelectedRecord(nextCompanyId?: string) {
    if (!selectedRecord) return;
    const companyId = (nextCompanyId ?? customerCompanyId).trim();
    if (!companyId) {
      setStatus({ kind: "error", text: "Select a company." });
      return;
    }

    setAddingCustomer(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          relationshipType: "CUSTOMER"
        })
      });

        const payload = await res.json();
        if (!res.ok) {
        throw new Error(payload.error || "Failed to add vendor link");
      }

      setStatus({
        kind: "ok",
        text: `${payload.link?.company?.name || getCompanyNameById(companyId)} linked as vendor.`
      });
      resetCustomerForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add vendor"
      });
    } finally {
      setAddingCustomer(false);
    }
  }

  async function updateCustomerForSelectedRecord(linkId: string) {
    if (!selectedRecord) return;
    if (!editingCustomerCompanyId) {
      setStatus({ kind: "error", text: "Select a company." });
      return;
    }

    setUpdatingCustomer(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/customers`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          companyId: editingCustomerCompanyId,
          relationshipType: editingCustomerRelationshipType,
          notes: editingCustomerNotes,
          annualContractValueUsd: toNullableNumber(editingCustomerAnnualContractValue)
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update vendor link");
      }

      setStatus({
        kind: "ok",
        text: `${payload.link?.company?.name || getCompanyNameById(editingCustomerCompanyId)} updated.`
      });
      resetEditingCustomerForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update vendor"
      });
    } finally {
      setUpdatingCustomer(false);
    }
  }

  async function deleteCustomerFromSelectedRecord(linkId: string, companyName: string) {
    if (!selectedRecord) return;
    const confirmDelete = window.confirm(`Remove ${companyName} from vendors?`);
    if (!confirmDelete) return;

    setDeletingCustomerLinkId(linkId);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/customers`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete vendor link");
      }

      if (editingCustomerLinkId === linkId) {
        resetEditingCustomerForm();
      }

      setStatus({ kind: "ok", text: `${companyName} removed from vendors.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete vendor"
      });
    } finally {
      setDeletingCustomerLinkId(null);
    }
  }

  async function deleteInvestmentFromSelectedRecord(linkId: string, companyName: string) {
    if (!selectedRecord) return;
    const confirmDelete = window.confirm(`Remove ${companyName} from investments?`);
    if (!confirmDelete) return;

    setDeletingInvestmentLinkId(linkId);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/investments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete investment");
      }

      if (editingInvestmentLinkId === linkId) {
        resetEditingInvestmentForm();
      }

      setStatus({ kind: "ok", text: `${companyName} removed from investments.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete investment"
      });
    } finally {
      setDeletingInvestmentLinkId(null);
    }
  }

  function updateDetailDraft(patch: Partial<DetailDraft>) {
    setDetailDraft((current) => {
      if (!current || !selectedRecord) return current;

      const next = { ...current, ...patch };
      const changed = Object.entries(patch).some(([
        key,
        value
      ]) => (current as Record<string, unknown>)[key] !== value);
      if (!changed) return current;

      void saveSelectedRecordEdits(next);
      return next;
    });
  }

  async function saveSelectedRecordEdits(draftToSave: DetailDraft | null = detailDraft) {
    if (!selectedRecord || !draftToSave) return;

    const parsedLocation = parseHeadquartersLocation(draftToSave.headquartersLocation);

    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftToSave.name,
          legalName: draftToSave.legalName,
          website: draftToSave.website,
          headquartersCity: parsedLocation.headquartersCity,
          headquartersState: parsedLocation.headquartersState,
          headquartersCountry: parsedLocation.headquartersCountry,
          netPatientRevenueUsd: toNullableNumber(draftToSave.netPatientRevenueUsd),
          isLimitedPartner: draftToSave.isLimitedPartner,
          limitedPartnerInvestmentUsd: toNullableNumber(draftToSave.limitedPartnerInvestmentUsd),
          isAllianceMember: draftToSave.allianceMemberStatus === "YES",
          allianceMemberStatus: draftToSave.allianceMemberStatus,
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save changes");

      if (payload.healthSystem?.id) {
        const updatedRecord = normalizeHealthSystemRecord(payload.healthSystem);
        setRecords((current) =>
          current.some((record) => record.id === updatedRecord.id)
            ? current.map((record) => (record.id === updatedRecord.id ? updatedRecord : record))
            : [updatedRecord, ...current]
        );
      }

      setStatus({ kind: "ok", text: `Saved changes for ${payload.healthSystem.name}.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save changes"
      });
    } finally {
      // no-op
    }
  }

  async function deleteHealthSystem(record: HealthSystemRecord) {
    const confirmDelete = window.confirm(
      `Delete ${record.name} and all related research details? This cannot be undone.`
    );

    if (!confirmDelete) return;

    setDeletingRecordId(record.id);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${record.id}`, {
        method: "DELETE"
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete health system");

      setStatus({ kind: "ok", text: `${record.name} deleted.` });
      if (selectedRecordId === record.id) {
        setSelectedRecordId(null);
      }
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete health system"
      });
    } finally {
      setDeletingRecordId(null);
    }
  }

  useEffect(() => {
    Promise.all([loadRecords(), loadReferenceRecords()]).catch(() => {
      setStatus({ kind: "error", text: "Failed to load health systems." });
    });
  }, []);

  useEffect(() => {
    if (!hasPending) return;

    const timer = setInterval(() => {
      loadRecords().catch(() => {
        setStatus({ kind: "error", text: "Failed to refresh health systems." });
      });
    }, 7000);

    return () => clearInterval(timer);
  }, [hasPending]);

  useEffect(() => {
    if (!matchModalOpen) return;

    if (!shouldOfferCreate) {
      setMatchModalOpen(false);
      setMatchModalManualMode(false);
      setSearchCandidates([]);
      setCandidateSearchQuery("");
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      setSearchingCandidates(false);
      if (candidateSearchAbortRef.current) {
        candidateSearchAbortRef.current.abort();
        candidateSearchAbortRef.current = null;
      }
      return;
    }

    const term = query.trim();
    if (!term) return;

    if (matchModalManualMode) {
      return;
    }

    setManualMatchCandidate((previous) => {
      if (previous.name === term) {
        return previous;
      }
      return {
        ...previous,
        name: term
      };
    });

    const cacheKey = term.toLowerCase();
    const cachedCandidates = candidateSearchCacheRef.current[cacheKey];
    if (cachedCandidates) {
      setSearchCandidates(cachedCandidates);
      setCandidateSearchQuery(term);
      setSelectedCandidateIndex(cachedCandidates.length === 1 ? 0 : -1);
      setSearchingCandidates(false);
      setSearchCandidateError(null);
      return;
    }

    if (candidateSearchAbortRef.current) {
      candidateSearchAbortRef.current.abort();
    }
    const controller = new AbortController();
    candidateSearchAbortRef.current = controller;

    let active = true;

    const timeout = setTimeout(async () => {
      setSearchingCandidates(true);
      setSearchCandidateError(null);

      try {
        const candidates = await searchCandidateMatches(term, { signal: controller.signal });
        if (!active) return;
        if (!controller.signal.aborted) {
          candidateSearchCacheRef.current[cacheKey] = candidates;
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
        setSearchCandidateError(
          error instanceof Error ? error.message : "Failed to search health systems."
        );
      } finally {
        if (active) setSearchingCandidates(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
      if (candidateSearchAbortRef.current === controller) {
        candidateSearchAbortRef.current = null;
      }
    };
  }, [matchModalOpen, query, shouldOfferCreate, matchModalManualMode]);

  useEffect(() => {
    if (filteredRecords.length === 0) {
      setSelectedRecordId(null);
      return;
    }

    if (keepListView) {
      return;
    }

    if (!selectedRecordId || !filteredRecords.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(filteredRecords[0].id);
    }
  }, [filteredRecords, selectedRecordId, keepListView]);

  useEffect(() => {
    if (!selectedRecord) {
      setDetailDraft(null);
      setDraftRecordId(null);
      setAddContactModalOpen(false);
      resetEditingContactForm();
      resetInvestmentForm();
      resetEditingInvestmentForm();
      resetCustomerForm();
      resetEditingCustomerForm();
      setDeletingContactLinkId(null);
      setDeletingInvestmentLinkId(null);
      setDeletingCustomerLinkId(null);
      setOpportunities([]);
      setOpportunitiesLoading(false);
      setOpportunitiesError(null);
      setOpportunityStatusFilter("open");
      return;
    }

    if (selectedRecord.id !== draftRecordId) {
      setDetailDraft(draftFromRecord(selectedRecord));
      setDraftRecordId(selectedRecord.id);
      setActiveDetailTab("overview");
      setAddContactModalOpen(false);
      resetInvestmentForm();
      resetCustomerForm();
      setOpportunityStatusFilter("open");
    }
  }, [selectedRecord, draftRecordId]);

  useEffect(() => {
    if (!selectedRecord) {
      setOpportunities([]);
      setOpportunitiesLoading(false);
      setOpportunitiesError(null);
      setOpportunityStatusFilter("open");
      return;
    }

    let cancelled = false;
    const load = async () => {
      setOpportunitiesError(null);
      setOpportunitiesLoading(true);
      setOpportunities([]);
      try {
        const payload = (await loadOpportunitiesForSelectedRecord(selectedRecord.id)) as OpportunitySummary[];
        if (cancelled) return;
        setOpportunities(payload);
      } catch (error) {
        if (cancelled) return;
        setOpportunities([]);
        setOpportunitiesError(error instanceof Error ? error.message : "Failed to load opportunities.");
      } finally {
        if (!cancelled) {
          setOpportunitiesLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [selectedRecord]);

  return (
    <main>
      <div className="grid health-system-workbench-layout">
        <section className="panel health-system-list-panel" aria-label="List panel">
          <div className="health-system-panel-scroll">
            <div className="entity-list-sticky-controls">
              <div className="detail-action-bar">
                <a
                  href="#"
                  className="contact-add-link"
                  onClick={(event) => {
                    event.preventDefault();
                    setHealthSystemLookupModalSignal((current) => current + 1);
                  }}
                >
                  + Add Health System
                </a>
              </div>
              <div className="entity-list-search">
                <input
                  id="search-health-system"
                  aria-label="Search health systems"
                  placeholder="Type a health system name, location, or website"
                  value={query}
                  onChange={(event) => {
                    setKeepListView(false);
                    setQuery(event.target.value);
                  }}
                />
                {query.trim() ? (
                  <button
                    type="button"
                    className="ghost small entity-list-search-clear"
                    onClick={() => {
                      setKeepListView(false);
                      setQuery("");
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          <EntityLookupInput
            entityKind="HEALTH_SYSTEM"
            value={healthSystemLookupValue}
            onChange={(nextValue) => {
              setHealthSystemLookupValue(nextValue);
              if (!nextValue) return;
              setKeepListView(false);
              setQuery("");
              setSelectedRecordId(nextValue);
            }}
            hideLookupField
            onEntityCreated={(option) => {
              setHealthSystemLookupValue(option.id);
              setStatus({ kind: "ok", text: `${option.name} created.` });
              setKeepListView(false);
              void (async () => {
                await loadRecords();
                setSelectedRecordId(option.id);
              })();
            }}
            openAddModalSignal={healthSystemLookupModalSignal}
          />

          {shouldOfferCreate && (
            <div className="create-card">
              <p className="create-title">No health systems match "{query.trim()}".</p>
              <p className="muted">Create a new health system and launch the research agent?</p>
              <div className="chip-row">
                <label className="chip">
                  <input
                    type="checkbox"
                    checked={newIsLimitedPartner}
                    onChange={(event) => {
                      setNewIsLimitedPartner(event.target.checked);
                      if (!event.target.checked) {
                        setNewLimitedPartnerInvestmentUsd("");
                      }
                    }}
                  />
                  Limited Partner
                </label>
                <label className="chip">
                  Alliance Member
                  <select
                    value={newAllianceMemberStatus}
                    onChange={(event) =>
                      setNewAllianceMemberStatus(event.target.value as AllianceMemberStatus)
                    }
                  >
                    {allianceMemberStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {newIsLimitedPartner && (
                <div>
                  <label>LP Investment Amount (USD)</label>
                  <input
                    value={newLimitedPartnerInvestmentUsd}
                    onChange={(event) => setNewLimitedPartnerInvestmentUsd(event.target.value)}
                    placeholder="e.g. 2500000"
                  />
                </div>
              )}
              <div className="actions">
                <button className="primary" type="button" onClick={openCreateMatchModal} disabled={creatingFromSearch}>
                  Search online
                </button>
              </div>
            </div>
          )}

          <SearchMatchModal
            isOpen={matchModalOpen}
            title="Health system not found"
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
            {filteredRecords.length === 0 && (
              <p className="muted">
                {query.trim()
                  ? `No health systems match "${query.trim()}". Use Add Health System above and select Add New.`
                  : "No health systems yet. Use Add Health System above to create your first record."}
              </p>
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
                      {allianceMemberTagLabel(record.allianceMemberStatus) && (
                        <span className="flag-pill alliance">{allianceMemberTagLabel(record.allianceMemberStatus)}</span>
                      )}
                      {record.isLimitedPartner && <span className="flag-pill lp">Limited Partner</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {status && <p className={`status ${status.kind}`}>{status.text}</p>}
          </div>
        </section>

        <section className="panel health-system-detail-panel" aria-label="Detail panel">
          <div className="health-system-panel-scroll">
            {!selectedRecord || !detailDraft ? (
              <p className="muted">Select a health system from the list to view details.</p>
            ) : (
              <div className="detail-card">
    <div className="detail-head detail-head-minimal">
                <div className="health-system-head-main">
                  <h3>{selectedRecord.name}</h3>
                  {(selectedRecord.researchStatus === "QUEUED" || selectedRecord.researchStatus === "RUNNING") && (
                    <div className="list-row-indicators">
                      <span className="flag-pill">Research Underway</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="detail-tabs" role="tablist" aria-label="Health system detail sections">
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
                  className={`detail-tab ${activeDetailTab === "contacts" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "contacts"}
                  onClick={() => setActiveDetailTab("contacts")}
                >
                  Contacts
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "opportunities" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "opportunities"}
                  onClick={() => setActiveDetailTab("opportunities")}
                >
                  Opportunities
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
                  className={`detail-tab ${activeDetailTab === "notes" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "notes"}
                  onClick={() => setActiveDetailTab("notes")}
                >
                  Notes
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
                  label="Net Patient Revenue"
                  value={detailDraft.netPatientRevenueUsd ? formatUsd(detailDraft.netPatientRevenueUsd) : ""}
                  inputType="text"
                  onSave={(value) => updateDetailDraft({ netPatientRevenueUsd: value })}
                />
                <InlineTextField
                  label={
                    <>
                      <span>Location</span>
                      <span className="inline-field-label-suffix">(City, State, Country)</span>
                    </>
                  }
                  value={detailDraft.headquartersLocation}
                  placeholder="City, State, Country"
                  onSave={(value) => updateDetailDraft({ headquartersLocation: value })}
                />
                <InlineBooleanField
                  label="Limited Partner"
                  value={detailDraft.isLimitedPartner}
                  onSave={(nextValue) => {
                    updateDetailDraft({
                      isLimitedPartner: nextValue,
                      limitedPartnerInvestmentUsd: nextValue ? detailDraft.limitedPartnerInvestmentUsd : ""
                    });
                  }}
                  trueLabel="Yes"
                  falseLabel="No"
                />
                {detailDraft.isLimitedPartner && (
                  <InlineTextField
                    label="LP Investment Amount (USD)"
                    value={detailDraft.limitedPartnerInvestmentUsd}
                    inputType="number"
                    onSave={(value) => updateDetailDraft({ limitedPartnerInvestmentUsd: value })}
                  />
                )}
                <InlineSelectField
                  label="Alliance Member"
                  value={detailDraft.allianceMemberStatus}
                  onSave={(value) => updateDetailDraft({ allianceMemberStatus: value as AllianceMemberStatus })}
                  options={allianceMemberStatusOptions}
                />
              </div>

              <div className="detail-section entity-delete-section">
                <div className="actions">
                  <button
                    type="button"
                    className="ghost small danger"
                    onClick={() => void deleteHealthSystem(selectedRecord)}
                    disabled={deletingRecordId === selectedRecord.id}
                  >
                    {deletingRecordId === selectedRecord.id ? "Deleting..." : "Delete Health System"}
                  </button>
                </div>
              </div>

                </>
              )}

              {activeDetailTab === "documents" && (
                <>
                  <EntityDocumentsPane
                    entityPath="health-systems"
                    entityId={selectedRecord.id}
                    onStatus={setStatus}
                  />
                </>
              )}

              {activeDetailTab === "opportunities" && (
                <>
                  <div className="detail-section opportunity-section">
                    <p className="detail-label">Opportunities</p>
                    <div className="opportunity-filter-bar" role="radiogroup" aria-label="Filter opportunities by status">
                      <p className="opportunity-filter-label">Status</p>
                      <div className="opportunity-filter-options">
                        {([
                          { value: "open", label: "Open" },
                          { value: "closed", label: "Closed" }
                        ] as const).map((option) => {
                          const active = opportunityStatusFilter === option.value;
                          return (
                            <label
                              key={option.value}
                              className={`opportunity-filter-option ${active ? "active" : ""}`}
                              htmlFor={`health-system-opportunities-filter-${selectedRecord.id}-${option.value}`}
                            >
                              <span>{option.label}</span>
                              <input
                                id={`health-system-opportunities-filter-${selectedRecord.id}-${option.value}`}
                                type="radio"
                                name={`health-system-opportunities-filter-${selectedRecord.id}`}
                                value={option.value}
                                checked={active}
                                onChange={() => setOpportunityStatusFilter(option.value)}
                              />
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    {opportunitiesLoading ? <p className="muted">Loading opportunities...</p> : null}
                    {opportunitiesError ? <p className="status error">{opportunitiesError}</p> : null}
                    {!opportunitiesLoading &&
                    !opportunitiesError &&
                    filteredOpportunities.length === 0 ? (
                      <p className="muted">
                        {opportunityStatusFilter === "open" ? "No open opportunities." : "No closed opportunities."}
                      </p>
                    ) : null}

                    {!opportunitiesLoading && filteredOpportunities.length > 0 ? (
                      <div className="table-wrap report-table-wrap">
                        <table className="table table-dense report-table">
                          <thead>
                            <tr>
                              <th>Company</th>
                              <th>Opportunity</th>
                              <th>Health System</th>
                              <th>Stage</th>
                              <th>Next Step</th>
                              <th>Likelihood</th>
                              <th>Contract Price</th>
                              <th>Expected Close</th>
                              <th>Contacts</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredOpportunities.map((opportunity) => (
                              <tr key={opportunity.id}>
                                <td>{opportunity.company.name}</td>
                                <td>
                                  <a href={`/pipeline/${opportunity.id}`} className="report-opportunity-link">
                                    {opportunity.title}
                                  </a>
                                </td>
                                <td>{opportunity.healthSystem?.name || "-"}</td>
                                <td>{opportunity.stage}</td>
                                <td>{opportunity.nextSteps || "-"}</td>
                                <td>{opportunity.likelihoodPercent === null ? "-" : `${opportunity.likelihoodPercent}%`}</td>
                                <td>{formatOpportunityCurrency(opportunity.contractPriceUsd)}</td>
                                <td>{formatOpportunityDate(opportunity.estimatedCloseDate)}</td>
                                <td>{opportunity.contactCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null}
                  </div>
                </>
              )}

              {activeDetailTab === "notes" && (
                <>
              {selectedRecord.researchError && (
                <div className="detail-section">
                  <p className="detail-label">Research Error</p>
                  <p>{selectedRecord.researchError}</p>
                </div>
              )}

              <EntityNotesPane
                entityPath="health-systems"
                entityId={selectedRecord.id}
                onStatus={setStatus}
              />

                </>
              )}

              {activeDetailTab === "contacts" && (
                <>
              <div className="detail-section">
                <p className="detail-label">Contacts</p>
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
                {selectedRecord.contactLinks.length === 0 ? (
                  <p className="muted">No contacts linked yet.</p>
                ) : (
                  selectedRecord.contactLinks
                    .slice()
                    .sort((left, right) => {
                      const leftName = contactNameParts(left.contact.name);
                      const rightName = contactNameParts(right.contact.name);
                      const byLast = leftName.lastName.localeCompare(rightName.lastName);
                      if (byLast !== 0) return byLast;
                      const byFirst = leftName.firstName.localeCompare(rightName.firstName);
                      if (byFirst !== 0) return byFirst;
                      return left.contact.name.localeCompare(right.contact.name);
                    })
                    .map((link) => (
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
                                    event.target.value as "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER"
                                  )
                                }
                              >
                                <option value="EXECUTIVE">Executive</option>
                                <option value="VENTURE_PARTNER">Venture Partner</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                            <div>
                              <label>Contact Title</label>
                              <input
                                value={editingContactTitle}
                                onChange={(event) => setEditingContactTitle(event.target.value)}
                                placeholder="Chief Innovation Officer"
                              />
                            </div>
                            <div>
                              <label>Relationship Title</label>
                              <input
                                value={editingContactRelationshipTitle}
                                onChange={(event) => setEditingContactRelationshipTitle(event.target.value)}
                                placeholder="Board Observer"
                              />
                            </div>
                            <div>
                              <label>Email</label>
                              <input
                                value={editingContactEmail}
                                onChange={(event) => setEditingContactEmail(event.target.value)}
                                placeholder="name@org.com"
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
                            <div className="inline-edit-field">
                              <label>Key Alliance Contact</label>
                              <input
                                type="checkbox"
                                checked={editingIsKeyAllianceContact}
                                onChange={(event) => setEditingIsKeyAllianceContact(event.target.checked)}
                              />
                            </div>
                            <div className="inline-edit-field">
                              <label>Informed Alliance Contact</label>
                              <input
                                type="checkbox"
                                checked={editingIsInformedAllianceContact}
                                onChange={(event) => setEditingIsInformedAllianceContact(event.target.checked)}
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
                            <button
                              className="ghost small"
                              onClick={() => {
                                resetEditingContactForm();
                              }}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{contactNameParts(link.contact.name).displayName}</strong>
                            {link.title ? `, ${link.title}` : link.contact.title ? `, ${link.contact.title}` : ""}
                            {link.contact.email ? ` | ${link.contact.email}` : ""}
                            {link.contact.phone ? ` | ${link.contact.phone}` : ""}
                            {(link.isKeyAllianceContact || link.isInformedAllianceContact) ? (
                              <div className="contact-list-inline-flags">
                                {link.isKeyAllianceContact ? (
                                  <span className="flag-pill">Key Alliance Contact</span>
                                ) : null}
                                {link.isInformedAllianceContact ? (
                                  <span className="flag-pill">Informed Alliance Contact</span>
                                ) : null}
                              </div>
                            ) : null}
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
                <AddContactModal
                  open={addContactModalOpen}
                  onClose={() => setAddContactModalOpen(false)}
                  onSubmit={addContactToSelectedRecord}
                  addingContact={addingContact}
                  contactName={contactName}
                  onContactNameChange={setContactName}
                  contactRoleType={contactRoleType}
                  onContactRoleTypeChange={(value) =>
                    setContactRoleType(value as "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER")
                  }
                  roleOptions={[
                    { value: "EXECUTIVE", label: "Executive" },
                    { value: "VENTURE_PARTNER", label: "Venture Partner" },
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
                  contactIsKeyAllianceContact={newIsKeyAllianceContact}
                  onContactIsKeyAllianceContactChange={setNewIsKeyAllianceContact}
                  contactIsInformedAllianceContact={newIsInformedAllianceContact}
                  onContactIsInformedAllianceContactChange={setNewIsInformedAllianceContact}
                  namePlaceholder="William Smith"
                  titlePlaceholder="Chief Innovation Officer"
                  relationshipTitlePlaceholder="Board Observer"
                  emailPlaceholder="name@org.com"
                  phonePlaceholder="+1 555 555 5555"
                  linkedinPlaceholder="https://linkedin.com/in/..."
                />
              </div>

                </>
              )}

              {activeDetailTab === "relationships" && (
                <>
              <div className="detail-section">
                <p className="detail-label">Vendors</p>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost small contact-add-link"
                    onClick={() => {
                      if (showAddCustomerLookup) {
                        resetCustomerForm();
                        return;
                      }
                      setStatus(null);
                      setShowAddCustomerLookup(true);
                    }}
                  >
                    {showAddCustomerLookup ? "Cancel" : "Add Vendor"}
                  </button>
                </div>
                {showAddCustomerLookup ? (
                  <div className="actions relationship-inline-add">
                    <EntityLookupInput
                      entityKind="COMPANY"
                      value={customerCompanyId}
                      onChange={(nextId) => {
                        setCustomerCompanyId(nextId);
                        if (!nextId || addingCustomer) return;
                        void addCustomerToSelectedRecord(nextId);
                      }}
                      initialOptions={companies.map((company) => ({
                        id: company.id,
                        name: company.name
                      }))}
                      className="relationship-inline-lookup"
                      placeholder="Search companies (or Add New)"
                      disabled={addingCustomer}
                      autoOpenCreateOnEnterNoMatch
                      companyCreateDefaults={{
                        companyType: "STARTUP",
                        primaryCategory: "OTHER",
                        leadSourceType: "OTHER",
                        leadSourceOther: "Added from health system vendor"
                      }}
                      onEntityCreated={(option) => addCompanyOption(option)}
                    />
                  </div>
                ) : null}
                {selectedRecord.customerLinks.length === 0 ? (
                  <p className="muted">No vendors linked yet.</p>
                ) : (
                  selectedRecord.customerLinks.map((link) => {
                    const annualContractValue = link.annualContractValueUsd ?? link.investmentAmountUsd;
                    return (
                    <div key={link.id} className="detail-list-item">
                      {editingCustomerLinkId === link.id ? (
                        <div className="detail-card">
                          <div className="detail-grid">
                            <div>
                              <label>Company</label>
                              <EntityLookupInput
                                entityKind="COMPANY"
                                value={editingCustomerCompanyId}
                                onChange={setEditingCustomerCompanyId}
                                initialOptions={companies.map((company) => ({
                                  id: company.id,
                                  name: company.name
                                }))}
                                placeholder="Search companies"
                                autoOpenCreateOnEnterNoMatch
                                companyCreateDefaults={{
                                  companyType: "STARTUP",
                                  primaryCategory: "OTHER",
                                  leadSourceType: "OTHER",
                                  leadSourceOther: "Added from health system vendor"
                                }}
                                onEntityCreated={(option) => addCompanyOption(option)}
                              />
                            </div>
                            <div>
                              <label>Relationship Type</label>
                              <select
                                value={editingCustomerRelationshipType}
                                onChange={(event) =>
                                  setEditingCustomerRelationshipType(
                                    event.target.value as
                                      "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER"
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
                              <label>Notes</label>
                              <input
                                value={editingCustomerNotes}
                                onChange={(event) => setEditingCustomerNotes(event.target.value)}
                                placeholder="Notes"
                              />
                            </div>
                            <div>
                              <label>Annual Contract Value (USD)</label>
                              <input
                                value={editingCustomerAnnualContractValue}
                                onChange={(event) => setEditingCustomerAnnualContractValue(event.target.value)}
                                placeholder="2500000"
                              />
                            </div>
                          </div>
                          <div className="actions">
                            <button
                              className="primary"
                              onClick={() => updateCustomerForSelectedRecord(link.id)}
                              disabled={updatingCustomer}
                            >
                              {updatingCustomer ? "Saving..." : "Save Vendor"}
                            </button>
                            <button className="ghost small" onClick={resetEditingCustomerForm} type="button">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>
                              <a href={`/companies/${link.company.id}`}>{link.company.name}</a>
                            </strong>
                            <p className="muted">
                              Relationship: {link.relationshipType}
                              {annualContractValue !== null && annualContractValue !== undefined
                                ? ` | Annual Contract Value: ${formatUsd(annualContractValue)}`
                                : ""}
                              {link.notes ? ` | ${link.notes}` : ""}
                            </p>
                          </div>
                          <div className="contact-row-actions">
                            <button
                              className="ghost small"
                              onClick={() => beginEditingCustomer(link)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="ghost small"
                              onClick={() => deleteCustomerFromSelectedRecord(link.id, link.company.name)}
                              disabled={deletingCustomerLinkId === link.id}
                            >
                              {deletingCustomerLinkId === link.id ? "Removing..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    );
                  })
                )}
              </div>

              <div className="detail-section">
                <p className="detail-label">Investments</p>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost small contact-add-link"
                    onClick={() => {
                      if (showAddInvestmentLookup) {
                        resetInvestmentForm();
                        return;
                      }
                      setStatus(null);
                      setShowAddInvestmentLookup(true);
                    }}
                  >
                    {showAddInvestmentLookup ? "Cancel" : "Add Investment"}
                  </button>
                </div>
                {showAddInvestmentLookup ? (
                  <div className="actions relationship-inline-add">
                    <EntityLookupInput
                      entityKind="COMPANY"
                      value={investmentCompanyId}
                      onChange={(nextId) => {
                        setInvestmentCompanyId(nextId);
                        if (!nextId || addingInvestment) return;
                        void addInvestmentToSelectedRecord(nextId);
                      }}
                      initialOptions={companies.map((company) => ({
                        id: company.id,
                        name: company.name
                      }))}
                      className="relationship-inline-lookup"
                      placeholder="Search companies (or Add New)"
                      disabled={addingInvestment}
                      autoOpenCreateOnEnterNoMatch
                      companyCreateDefaults={{
                        companyType: "STARTUP",
                        primaryCategory: "OTHER",
                        leadSourceType: "OTHER",
                        leadSourceOther: "Added from health system investment"
                      }}
                      onEntityCreated={(option) => addCompanyOption(option)}
                    />
                  </div>
                ) : null}
                {selectedRecord.investments.length === 0 ? (
                  <p className="muted">No investments captured.</p>
                ) : (
                  selectedRecord.investments.map((investment) => (
                    <div key={investment.id} className="detail-list-item">
                      {editingInvestmentLinkId === investment.id ? (
                        <div className="detail-card">
                          <div className="detail-grid">
                            <div>
                              <label>Company</label>
                              <EntityLookupInput
                                entityKind="COMPANY"
                                value={editingInvestmentCompanyId}
                                onChange={setEditingInvestmentCompanyId}
                                initialOptions={companies.map((company) => ({
                                  id: company.id,
                                  name: company.name
                                }))}
                                placeholder="Search companies"
                                autoOpenCreateOnEnterNoMatch
                                companyCreateDefaults={{
                                  companyType: "STARTUP",
                                  primaryCategory: "OTHER",
                                  leadSourceType: "OTHER",
                                  leadSourceOther: "Added from health system investment"
                                }}
                                onEntityCreated={(option) => addCompanyOption(option)}
                              />
                            </div>
                            <div>
                              <label>Investment Amount (USD)</label>
                              <input
                                value={editingInvestmentAmount}
                                onChange={(event) => setEditingInvestmentAmount(event.target.value)}
                                placeholder="2500000"
                              />
                            </div>
                            <div>
                              <label>Investment Date</label>
                              <input
                                value={editingInvestmentDate}
                                onChange={(event) => setEditingInvestmentDate(event.target.value)}
                                placeholder="YYYY-MM-DD"
                              />
                            </div>
                            <div>
                              <label>Lead Partner</label>
                              <input
                                value={editingInvestmentLeadPartnerName}
                                onChange={(event) => setEditingInvestmentLeadPartnerName(event.target.value)}
                                placeholder="Lead partner name"
                              />
                            </div>
                            <div>
                              <label>Source URL</label>
                              <input
                                value={editingInvestmentSourceUrl}
                                onChange={(event) => setEditingInvestmentSourceUrl(event.target.value)}
                                placeholder="https://source.example.com"
                              />
                            </div>
                          </div>
                          <div className="actions">
                            <button
                              className="primary"
                              onClick={() => updateInvestmentForSelectedRecord(investment.id)}
                              disabled={updatingInvestment}
                            >
                              {updatingInvestment ? "Saving..." : "Save Investment"}
                            </button>
                            <button
                              className="ghost small"
                              onClick={resetEditingInvestmentForm}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="contact-row">
                          <div className="contact-row-details">
                            <strong>{investment.company?.name || investment.portfolioCompanyName}</strong>
                            <p className="muted">
                              Amount: {formatUsd(investment.investmentAmountUsd)} | Date: {formatDate(investment.investmentDate)}{" "}
                              | Lead: {investment.leadPartnerName || "-"}
                              {investment.sourceUrl ? (
                                <>
                                  {" "} |{" "}
                                  <a href={investment.sourceUrl} target="_blank" rel="noreferrer">
                                    Source
                                  </a>
                                </>
                              ) : null}
                            </p>
                          </div>
                          <div className="contact-row-actions">
                            <button
                              className="ghost small"
                              onClick={() => beginEditingInvestment(investment)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="ghost small"
                              onClick={() =>
                                deleteInvestmentFromSelectedRecord(
                                  investment.id,
                                  investment.company?.name || investment.portfolioCompanyName
                                )
                              }
                              disabled={deletingInvestmentLinkId === investment.id}
                            >
                              {deletingInvestmentLinkId === investment.id ? "Removing..." : "Delete"}
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
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
