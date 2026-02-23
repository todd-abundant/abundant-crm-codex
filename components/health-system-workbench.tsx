"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  InlineBooleanField,
  InlineSelectField,
  InlineTextField,
  InlineTextareaField
} from "./inline-detail-field";
import { SearchMatchModal } from "./search-match-modal";
import { EntityLookupInput } from "./entity-lookup-input";

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
  legalName?: string | null;
  website?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
  netPatientRevenueUsd?: number | string | null;
  isLimitedPartner: boolean;
  limitedPartnerInvestmentUsd?: number | string | null;
  isAllianceMember: boolean;
  hasInnovationTeam?: boolean | null;
  hasVentureTeam?: boolean | null;
  ventureTeamSummary?: string | null;
  researchStatus: "DRAFT" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  researchNotes?: string | null;
  researchError?: string | null;
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
  venturePartners: Array<{
    id: string;
    name: string;
    title?: string | null;
    profileUrl?: string | null;
    coInvestorId?: string | null;
    coInvestor?: { id: string; name: string } | null;
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
};

type CoInvestorOption = {
  id: string;
  name: string;
};

type CompanyOption = {
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
  netPatientRevenueUsd: string;
  isLimitedPartner: boolean;
  limitedPartnerInvestmentUsd: string;
  isAllianceMember: boolean;
  hasInnovationTeam: "null" | "true" | "false";
  hasVentureTeam: "null" | "true" | "false";
  ventureTeamSummary: string;
  researchNotes: string;
};

type DetailTab = "overview" | "actions" | "contacts" | "venture-partners" | "investments";

function formatLocation(record: {
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
}) {
  return [record.headquartersCity, record.headquartersState, record.headquartersCountry]
    .filter(Boolean)
    .join(", ");
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

function statusClass(status: HealthSystemRecord["researchStatus"]) {
  if (status === "COMPLETED") return "done";
  if (status === "FAILED") return "failed";
  if (status === "RUNNING") return "running";
  if (status === "QUEUED") return "queued";
  return "draft";
}

function toNullableBoolean(value: "null" | "true" | "false") {
  if (value === "null") return null;
  return value === "true";
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

function draftFromRecord(record: HealthSystemRecord): DetailDraft {
  return {
    name: record.name || "",
    legalName: record.legalName || "",
    website: record.website || "",
    headquartersCity: record.headquartersCity || "",
    headquartersState: record.headquartersState || "",
    headquartersCountry: record.headquartersCountry || "",
    netPatientRevenueUsd: record.netPatientRevenueUsd?.toString() || "",
    isLimitedPartner: record.isLimitedPartner,
    limitedPartnerInvestmentUsd: record.limitedPartnerInvestmentUsd?.toString() || "",
    isAllianceMember: record.isAllianceMember,
    hasInnovationTeam:
      record.hasInnovationTeam === null || record.hasInnovationTeam === undefined
        ? "null"
        : record.hasInnovationTeam
          ? "true"
          : "false",
    hasVentureTeam:
      record.hasVentureTeam === null || record.hasVentureTeam === undefined
        ? "null"
        : record.hasVentureTeam
          ? "true"
          : "false",
    ventureTeamSummary: record.ventureTeamSummary || "",
    researchNotes: record.researchNotes || ""
  };
}

export function HealthSystemWorkbench() {
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<HealthSystemRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [draftRecordId, setDraftRecordId] = useState<string | null>(null);
  const [detailDraft, setDetailDraft] = useState<DetailDraft | null>(null);
  const [runningAgent, setRunningAgent] = useState(false);
  const [creatingFromSearch, setCreatingFromSearch] = useState(false);
  const [deletingRecordId, setDeletingRecordId] = useState<string | null>(null);
  const [newIsLimitedPartner, setNewIsLimitedPartner] = useState(false);
  const [newIsAllianceMember, setNewIsAllianceMember] = useState(false);
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
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactRelationshipTitle, setContactRelationshipTitle] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactLinkedinUrl, setContactLinkedinUrl] = useState("");
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
  const [editingContactRoleType, setEditingContactRoleType] = useState<
    "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER"
  >("EXECUTIVE");
  const [updatingContact, setUpdatingContact] = useState(false);
  const [deletingContactLinkId, setDeletingContactLinkId] = useState<string | null>(null);
  const [coInvestors, setCoInvestors] = useState<CoInvestorOption[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [addingVenturePartner, setAddingVenturePartner] = useState(false);
  const [venturePartnerCoInvestorId, setVenturePartnerCoInvestorId] = useState("");
  const [venturePartnerTitle, setVenturePartnerTitle] = useState("");
  const [editingVenturePartnerLinkId, setEditingVenturePartnerLinkId] = useState<string | null>(null);
  const [editingVenturePartnerCoInvestorId, setEditingVenturePartnerCoInvestorId] = useState("");
  const [editingVenturePartnerTitle, setEditingVenturePartnerTitle] = useState("");
  const [updatingVenturePartner, setUpdatingVenturePartner] = useState(false);
  const [deletingVenturePartnerLinkId, setDeletingVenturePartnerLinkId] = useState<string | null>(null);
  const [addingInvestment, setAddingInvestment] = useState(false);
  const [investmentCompanyId, setInvestmentCompanyId] = useState("");
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [investmentDate, setInvestmentDate] = useState("");
  const [investmentLeadPartnerName, setInvestmentLeadPartnerName] = useState("");
  const [investmentSourceUrl, setInvestmentSourceUrl] = useState("");
  const [editingInvestmentLinkId, setEditingInvestmentLinkId] = useState<string | null>(null);
  const [editingInvestmentCompanyId, setEditingInvestmentCompanyId] = useState("");
  const [editingInvestmentAmount, setEditingInvestmentAmount] = useState("");
  const [editingInvestmentDate, setEditingInvestmentDate] = useState("");
  const [editingInvestmentLeadPartnerName, setEditingInvestmentLeadPartnerName] = useState("");
  const [editingInvestmentSourceUrl, setEditingInvestmentSourceUrl] = useState("");
  const [updatingInvestment, setUpdatingInvestment] = useState(false);
  const [deletingInvestmentLinkId, setDeletingInvestmentLinkId] = useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>("overview");
  const [keepListView, setKeepListView] = useState(false);
  const candidateSearchCacheRef = useRef<Record<string, SearchCandidate[]>>({});
  const candidateSearchAbortRef = useRef<AbortController | null>(null);

  const hasPending = useMemo(
    () => records.some((record) => record.researchStatus === "QUEUED" || record.researchStatus === "RUNNING"),
    [records]
  );

  const filteredRecords = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return records;

    return records.filter((record) => {
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
  }, [records, query]);

  const selectedRecord = useMemo(
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
    const [coInvestorRes, companyRes] = await Promise.all([fetch("/api/co-investors"), fetch("/api/companies")]);

    const coInvestorPayload = await coInvestorRes.json();
    const companyPayload = await companyRes.json();

    if (!coInvestorRes.ok) {
      throw new Error(coInvestorPayload.error || "Failed to load co-investors");
    }
    if (!companyRes.ok) {
      throw new Error(companyPayload.error || "Failed to load companies");
    }

    setCoInvestors((coInvestorPayload.coInvestors || []).map((item: { id: string; name: string }) => ({
      id: item.id,
      name: item.name
    })));
    setCompanies((companyPayload.companies || []).map((item: { id: string; name: string }) => ({
      id: item.id,
      name: item.name
    })));
  }

  function getCoInvestorNameById(id: string) {
    return coInvestors.find((coInvestor) => coInvestor.id === id)?.name || "";
  }

  function getCompanyNameById(id: string) {
    return companies.find((company) => company.id === id)?.name || "";
  }

  function addCoInvestorOption(option: { id: string; name: string }) {
    setCoInvestors((current) => {
      if (current.some((entry) => entry.id === option.id)) return current;
      return [{ id: option.id, name: option.name }, ...current];
    });
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
    setRecords(payload.healthSystems || []);
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
          isAllianceMember: newIsAllianceMember,
          limitedPartnerInvestmentUsd: newIsLimitedPartner
            ? toNullableNumber(newLimitedPartnerInvestmentUsd)
            : null
        })
      });

      const verifyPayload = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyPayload.error || "Failed to create health system");
      }

      setStatus({
        kind: "ok",
        text: `${verifyPayload.healthSystem.name} created. Research agent queued.`
      });

      setKeepListView(true);
      setSelectedRecordId(null);
      setDraftRecordId(null);
      setQuery("");
      setSearchCandidates([]);
      setCandidateSearchQuery("");
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      setMatchModalOpen(false);
      setMatchModalManualMode(false);
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
    setStatus(null);
  }

  function resetContactForm() {
    setContactName("");
    setContactTitle("");
    setContactRelationshipTitle("");
    setContactEmail("");
    setContactPhone("");
    setContactLinkedinUrl("");
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

  function resetVenturePartnerForm() {
    setVenturePartnerCoInvestorId("");
    setVenturePartnerTitle("");
  }

  function resetEditingVenturePartnerForm() {
    setEditingVenturePartnerLinkId(null);
    setEditingVenturePartnerCoInvestorId("");
    setEditingVenturePartnerTitle("");
  }

  function beginEditingVenturePartner(partner: HealthSystemRecord["venturePartners"][number]) {
    setEditingVenturePartnerLinkId(partner.id);
    setEditingVenturePartnerCoInvestorId(partner.coInvestorId || "");
    setEditingVenturePartnerTitle(partner.title || "");
    setStatus(null);
  }

  async function addVenturePartnerToSelectedRecord() {
    if (!selectedRecord) return;
    if (!venturePartnerCoInvestorId) {
      setStatus({ kind: "error", text: "Select a venture partner." });
      return;
    }

    setAddingVenturePartner(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/venture-partners`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coInvestorId: venturePartnerCoInvestorId,
          title: venturePartnerTitle
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add venture partner");
      }

      setStatus({
        kind: "ok",
        text: `${payload.partner?.coInvestor?.name || "Venture partner"} linked.`
      });
      resetVenturePartnerForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add venture partner"
      });
    } finally {
      setAddingVenturePartner(false);
    }
  }

  async function updateVenturePartnerForSelectedRecord(linkId: string) {
    if (!selectedRecord) return;
    if (!editingVenturePartnerCoInvestorId) {
      setStatus({ kind: "error", text: "Select a venture partner." });
      return;
    }

    setUpdatingVenturePartner(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/venture-partners`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId,
          coInvestorId: editingVenturePartnerCoInvestorId,
          title: editingVenturePartnerTitle
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update venture partner");
      }

      setStatus({
        kind: "ok",
        text: `${payload.partner?.coInvestor?.name || "Venture partner"} updated.`
      });
      resetEditingVenturePartnerForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update venture partner"
      });
    } finally {
      setUpdatingVenturePartner(false);
    }
  }

  async function deleteVenturePartnerFromSelectedRecord(linkId: string, partnerName: string) {
    if (!selectedRecord) return;
    const confirmDelete = window.confirm(`Remove ${partnerName} from this health system?`);
    if (!confirmDelete) return;

    setDeletingVenturePartnerLinkId(linkId);
    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}/venture-partners`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete venture partner");
      }

      if (editingVenturePartnerLinkId === linkId) {
        resetEditingVenturePartnerForm();
      }

      setStatus({ kind: "ok", text: `${partnerName} removed from venture partners.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete venture partner"
      });
    } finally {
      setDeletingVenturePartnerLinkId(null);
    }
  }

  function resetInvestmentForm() {
    setInvestmentCompanyId("");
    setInvestmentAmount("");
    setInvestmentDate("");
    setInvestmentLeadPartnerName("");
    setInvestmentSourceUrl("");
  }

  function resetEditingInvestmentForm() {
    setEditingInvestmentLinkId(null);
    setEditingInvestmentCompanyId("");
    setEditingInvestmentAmount("");
    setEditingInvestmentDate("");
    setEditingInvestmentLeadPartnerName("");
    setEditingInvestmentSourceUrl("");
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

  async function addInvestmentToSelectedRecord() {
    if (!selectedRecord) return;
    if (!investmentCompanyId) {
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
          companyId: investmentCompanyId,
          investmentAmountUsd: toNullableNumber(investmentAmount),
          investmentDate: investmentDate || null,
          leadPartnerName: investmentLeadPartnerName,
          sourceUrl: investmentSourceUrl
        })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add investment");
      }

      setStatus({
        kind: "ok",
        text: `${payload.investment?.company?.name || getCompanyNameById(investmentCompanyId)} linked as investment.`
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

    setStatus(null);

    try {
      const res = await fetch(`/api/health-systems/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftToSave.name,
          legalName: draftToSave.legalName,
          website: draftToSave.website,
          headquartersCity: draftToSave.headquartersCity,
          headquartersState: draftToSave.headquartersState,
          headquartersCountry: draftToSave.headquartersCountry,
          netPatientRevenueUsd: toNullableNumber(draftToSave.netPatientRevenueUsd),
          isLimitedPartner: draftToSave.isLimitedPartner,
          limitedPartnerInvestmentUsd: toNullableNumber(draftToSave.limitedPartnerInvestmentUsd),
          isAllianceMember: draftToSave.isAllianceMember,
          hasInnovationTeam: toNullableBoolean(draftToSave.hasInnovationTeam),
          hasVentureTeam: toNullableBoolean(draftToSave.hasVentureTeam),
          ventureTeamSummary: draftToSave.ventureTeamSummary,
          researchNotes: draftToSave.researchNotes
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save changes");

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
      resetEditingContactForm();
      resetVenturePartnerForm();
      resetEditingVenturePartnerForm();
      resetInvestmentForm();
      resetEditingInvestmentForm();
      setDeletingContactLinkId(null);
      setDeletingVenturePartnerLinkId(null);
      setDeletingInvestmentLinkId(null);
      return;
    }

    if (selectedRecord.id !== draftRecordId) {
      setDetailDraft(draftFromRecord(selectedRecord));
      setDraftRecordId(selectedRecord.id);
      setActiveDetailTab("overview");
    }
  }, [selectedRecord, draftRecordId]);

  return (
    <main>
      <section className="hero">
        <h1>Abundant CRM</h1>
        <p>
          Search health systems in your CRM list. As you type, the list narrows instantly. If no match
          exists, create a new health system and launch research automatically.
        </p>
      </section>

      <div className="grid">
        <section className="panel" aria-label="List panel">
          <label htmlFor="search-health-system">Search</label>
          <input
            id="search-health-system"
            placeholder="Type a health system name, location, or website"
            value={query}
            onChange={(event) => {
              setKeepListView(false);
              setQuery(event.target.value);
            }}
          />

          {query.trim().length >= 2 && (
            <div className="create-card">
              <p className="create-title">New Health System Relationship</p>
              <p className="muted">
                If this search becomes a new health system, set these flags before creating.
              </p>
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
                  <input
                    type="checkbox"
                    checked={newIsAllianceMember}
                    onChange={(event) => setNewIsAllianceMember(event.target.checked)}
                  />
                  Alliance Member
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
            </div>
          )}

          {shouldOfferCreate && (
            <div className="create-card">
              <p className="create-title">No health systems match "{query.trim()}".</p>
              <p className="muted">Create a new health system and launch the research agent?</p>
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
            {filteredRecords.length === 0 && !shouldOfferCreate && (
              <p className="muted">No health systems yet. Start by typing and creating one.</p>
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
                      {record.isAllianceMember && <span className="flag-pill alliance">Alliance</span>}
                      {record.isLimitedPartner && <span className="flag-pill lp">Limited Partner</span>}
                    </div>
                  </div>
                  <div className="list-row-meta">
                    <button
                      className="ghost small"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void deleteHealthSystem(record);
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
            <p className="muted">Select a health system from the list to view details.</p>
          ) : (
            <div className="detail-card">
              <div className="detail-head">
                <h3>{selectedRecord.name}</h3>
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
                  className={`detail-tab ${activeDetailTab === "actions" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "actions"}
                  onClick={() => setActiveDetailTab("actions")}
                >
                  Actions
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
                  className={`detail-tab ${activeDetailTab === "venture-partners" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "venture-partners"}
                  onClick={() => setActiveDetailTab("venture-partners")}
                >
                  Venture Partners
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`detail-tab ${activeDetailTab === "investments" ? "active" : ""}`}
                  aria-selected={activeDetailTab === "investments"}
                  onClick={() => setActiveDetailTab("investments")}
                >
                  Investments
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
                  label="Net Patient Revenue (USD)"
                  value={detailDraft.netPatientRevenueUsd}
                  inputType="number"
                  onSave={(value) => updateDetailDraft({ netPatientRevenueUsd: value })}
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
                <InlineBooleanField
                  label="Alliance Member"
                  value={detailDraft.isAllianceMember}
                  onSave={(value) => updateDetailDraft({ isAllianceMember: value })}
                  trueLabel="Yes"
                  falseLabel="No"
                />
                <InlineSelectField
                  label="Innovation Team"
                  value={detailDraft.hasInnovationTeam}
                  onSave={(value) =>
                    updateDetailDraft({ hasInnovationTeam: value as "null" | "true" | "false" })
                  }
                  options={[
                    { value: "null", label: "Unknown" },
                    { value: "true", label: "Yes" },
                    { value: "false", label: "No" }
                  ]}
                />
                <InlineSelectField
                  label="Venture Team"
                  value={detailDraft.hasVentureTeam}
                  onSave={(value) =>
                    updateDetailDraft({ hasVentureTeam: value as "null" | "true" | "false" })
                  }
                  options={[
                    { value: "null", label: "Unknown" },
                    { value: "true", label: "Yes" },
                    { value: "false", label: "No" }
                  ]}
                />
              </div>

              <div className="detail-section">
                <InlineTextareaField
                  multiline
                  label="Venture Team Summary"
                  value={detailDraft.ventureTeamSummary}
                  onSave={(value) => updateDetailDraft({ ventureTeamSummary: value })}
                />
              </div>

                </>
              )}

              {activeDetailTab === "actions" && (
                <>
              <div className="detail-section">
                <InlineTextareaField
                  multiline
                  label="Research Notes"
                  value={detailDraft.researchNotes}
                  onSave={(value) => updateDetailDraft({ researchNotes: value })}
                />
              </div>

              {selectedRecord.researchError && (
                <div className="detail-section">
                  <p className="detail-label">Research Error</p>
                  <p>{selectedRecord.researchError}</p>
                </div>
              )}

                </>
              )}

              {activeDetailTab === "contacts" && (
                <>
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
                        setContactRoleType(event.target.value as "EXECUTIVE" | "VENTURE_PARTNER" | "OTHER")
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
                      value={contactTitle}
                      onChange={(event) => setContactTitle(event.target.value)}
                      placeholder="Chief Innovation Officer"
                    />
                  </div>
                  <div>
                    <label>Relationship Title</label>
                    <input
                      value={contactRelationshipTitle}
                      onChange={(event) => setContactRelationshipTitle(event.target.value)}
                      placeholder="Board Observer"
                    />
                  </div>
                  <div>
                    <label>Email</label>
                    <input
                      value={contactEmail}
                      onChange={(event) => setContactEmail(event.target.value)}
                      placeholder="name@org.com"
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

                </>
              )}

              {activeDetailTab === "venture-partners" && (
                <>
              <div className="detail-section">
                <p className="detail-label">Venture Partners</p>
                {selectedRecord.venturePartners.length === 0 ? (
                  <p className="muted">No venture partners captured.</p>
                ) : (
                  selectedRecord.venturePartners.map((partner) => (
                    <div key={partner.id} className="detail-list-item">
                      {editingVenturePartnerLinkId === partner.id ? (
                        <div className="detail-card">
                          <div className="detail-grid">
                            <div>
                              <label>Co-Investor</label>
                              <EntityLookupInput
                                entityKind="CO_INVESTOR"
                                value={editingVenturePartnerCoInvestorId}
                                onChange={setEditingVenturePartnerCoInvestorId}
                                initialOptions={coInvestors.map((coInvestor) => ({
                                  id: coInvestor.id,
                                  name: coInvestor.name
                                }))}
                                placeholder="Search co-investors"
                                onEntityCreated={(option) => addCoInvestorOption(option)}
                              />
                            </div>
                            <div>
                              <label>Title</label>
                              <input
                                value={editingVenturePartnerTitle}
                                onChange={(event) => setEditingVenturePartnerTitle(event.target.value)}
                                placeholder="Investment partner"
                              />
                            </div>
                          </div>
                          <div className="actions">
                            <button
                              className="primary"
                              onClick={() => updateVenturePartnerForSelectedRecord(partner.id)}
                              disabled={updatingVenturePartner}
                            >
                              {updatingVenturePartner ? "Saving..." : "Save Venture Partner"}
                            </button>
                            <button
                              className="ghost small"
                              onClick={resetEditingVenturePartnerForm}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <strong>{partner.coInvestor?.name || partner.name}</strong>
                          {partner.title ? `, ${partner.title}` : ""}
                          {partner.profileUrl && (
                            <>
                              {" "}-{" "}
                              <a href={partner.profileUrl} target="_blank" rel="noreferrer">
                                profile
                              </a>
                            </>
                          )}
                          <div className="actions">
                            <button
                              className="ghost small"
                              onClick={() => beginEditingVenturePartner(partner)}
                              type="button"
                            >
                              Edit
                            </button>
                            <button
                              className="ghost small"
                              onClick={() =>
                                deleteVenturePartnerFromSelectedRecord(
                                  partner.id,
                                  partner.coInvestor?.name || partner.name
                                )
                              }
                              disabled={deletingVenturePartnerLinkId === partner.id}
                            >
                              {deletingVenturePartnerLinkId === partner.id ? "Removing..." : "Delete"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div className="detail-grid">
                  <div>
                    <label>Co-Investor</label>
                    <EntityLookupInput
                      entityKind="CO_INVESTOR"
                      value={venturePartnerCoInvestorId}
                      onChange={setVenturePartnerCoInvestorId}
                      initialOptions={coInvestors.map((coInvestor) => ({
                        id: coInvestor.id,
                        name: coInvestor.name
                      }))}
                      placeholder="Search co-investors"
                      onEntityCreated={(option) => addCoInvestorOption(option)}
                    />
                  </div>
                  <div>
                    <label>Title</label>
                    <input
                      value={venturePartnerTitle}
                      onChange={(event) => setVenturePartnerTitle(event.target.value)}
                      placeholder="Investment partner"
                    />
                  </div>
                </div>
                <div className="actions">
                  <button
                    className="secondary"
                    onClick={addVenturePartnerToSelectedRecord}
                    disabled={addingVenturePartner}
                  >
                    {addingVenturePartner ? "Adding..." : "Add Venture Partner"}
                  </button>
                </div>
              </div>

                </>
              )}

              {activeDetailTab === "investments" && (
                <>
              <div className="detail-section">
                <p className="detail-label">Investments</p>
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
                        <div>
                          <strong>{investment.company?.name || investment.portfolioCompanyName}</strong> | Amount:
                          {" "}
                          {formatUsd(investment.investmentAmountUsd)} | Date: {formatDate(investment.investmentDate)}
                          {" "}| Lead: {investment.leadPartnerName || "-"}
                          {investment.sourceUrl && (
                            <>
                              {" "}-{" "}
                              <a href={investment.sourceUrl} target="_blank" rel="noreferrer">
                                source
                              </a>
                            </>
                          )}
                          <div className="actions">
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
                <div className="detail-grid">
                  <div>
                    <label>Company</label>
                    <EntityLookupInput
                      entityKind="COMPANY"
                      value={investmentCompanyId}
                      onChange={setInvestmentCompanyId}
                      initialOptions={companies.map((company) => ({
                        id: company.id,
                        name: company.name
                      }))}
                      placeholder="Search companies"
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
                      value={investmentAmount}
                      onChange={(event) => setInvestmentAmount(event.target.value)}
                      placeholder="2500000"
                    />
                  </div>
                  <div>
                    <label>Investment Date</label>
                    <input
                      value={investmentDate}
                      onChange={(event) => setInvestmentDate(event.target.value)}
                      placeholder="YYYY-MM-DD"
                    />
                  </div>
                  <div>
                    <label>Lead Partner</label>
                    <input
                      value={investmentLeadPartnerName}
                      onChange={(event) => setInvestmentLeadPartnerName(event.target.value)}
                      placeholder="Lead partner name"
                    />
                  </div>
                  <div>
                    <label>Source URL</label>
                    <input
                      value={investmentSourceUrl}
                      onChange={(event) => setInvestmentSourceUrl(event.target.value)}
                      placeholder="https://source.example.com"
                    />
                  </div>
                </div>
                <div className="actions">
                  <button className="secondary" onClick={addInvestmentToSelectedRecord} disabled={addingInvestment}>
                    {addingInvestment ? "Adding..." : "Add Investment"}
                  </button>
                </div>
              </div>

                </>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
