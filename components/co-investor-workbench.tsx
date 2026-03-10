"use client";

import * as React from "react";
import {
  InlineBooleanField,
  InlineTextField,
  InlineTextareaField
} from "./inline-detail-field";
import { DateInputField } from "./date-input-field";
import { SearchMatchModal } from "./search-match-modal";
import { AddContactModal } from "./add-contact-modal";
import { EntityLookupInput } from "./entity-lookup-input";
import { EntityDocumentsPane } from "./entity-documents-pane";
import { EntityNotesPane } from "./entity-notes-pane";
import { RichTextArea } from "./rich-text-area";
import { parseDateInput, toDateInputValue as formatDateInputValue } from "@/lib/date-parse";

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

type CoInvestorInteraction = {
  id: string;
  interactionType: "MEETING" | "EMAIL" | "CALL" | "EVENT" | "INTRO" | "NOTE";
  channel?: string | null;
  subject?: string | null;
  summary?: string | null;
  occurredAt: string;
};

type NextActionItem = {
  id: string;
  title: string;
  details?: string | null;
  ownerName?: string | null;
  dueAt?: string | null;
  status: "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
};

type CoInvestorRecord = {
  id: string;
  name: string;
  legalName?: string | null;
  website?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
  isSeedInvestor: boolean;
  isSeriesAInvestor: boolean;
  investmentNotes?: string | null;
  researchStatus: "DRAFT" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  researchNotes?: string | null;
  researchError?: string | null;
  researchUpdatedAt?: string | null;
  interactions: CoInvestorInteraction[];
  nextActions: NextActionItem[];
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
  partners: Array<{ id: string; name: string; title?: string | null; profileUrl?: string | null }>;
  venturePartners: Array<{
    id: string;
    healthSystemId: string;
    title?: string | null;
    profileUrl?: string | null;
    healthSystem: {
      id: string;
      name: string;
      website?: string | null;
      headquartersCity?: string | null;
      headquartersState?: string | null;
      headquartersCountry?: string | null;
    };
  }>;
  investments: Array<{
    id: string;
    portfolioCompanyName: string;
    investmentAmountUsd?: number | string | null;
    investmentDate?: string | null;
    investmentStage?: string | null;
    leadPartnerName?: string | null;
    sourceUrl?: string | null;
  }>;
};

type DetailTab = "overview" | "documents" | "notes" | "contacts" | "relationships";

type DetailDraft = {
  name: string;
  legalName: string;
  website: string;
  headquartersLocation: string;
  isSeedInvestor: boolean;
  isSeriesAInvestor: boolean;
  investmentNotes: string;
  researchNotes: string;
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
    return trimmed.replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/g, "").replace(/\/+$/g, "/");
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

function findDuplicateRecord(records: CoInvestorRecord[], candidate: SearchCandidate) {
  const candidateName = normalizeForMatch(candidate.name);
  if (!candidateName) return null;

  const candidateWebsite = normalizeWebsiteForMatch(candidate.website);
  return (
    records.find((record) => {
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
    }) || null
  );
}

function summarizeInsightSnapshot(value?: string | null) {
  const clean = (value || "")
    .replace(/\[[^\]]+\]\((https?:\/\/[^\s)]+)\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return "";
  if (clean.length <= 220) return clean;
  return `${clean.slice(0, 217).trimEnd()}...`;
}

function coInvestorInsightPayload(record: CoInvestorRecord) {
  const thesisFit = record.isSeedInvestor || record.isSeriesAInvestor ? "Likely aligned" : "Needs review";
  const roundActivity = record.investments.length > 0 ? "Active" : "Limited evidence";

  const contacts = record.contactLinks
    .flatMap((link) => [link.contact.email || "", link.contact.phone || ""])
    .map((item) => item.trim())
    .filter(Boolean);
  const uniqueContacts = Array.from(new Set(contacts));

  const contactConfidence =
    uniqueContacts.length >= 2 ? "High" : uniqueContacts.length === 1 ? "Medium" : "Low";

  const snapshot =
    summarizeInsightSnapshot(record.researchNotes) ||
    `${record.name} | ${record.investments.length} known investments | ${record.contactLinks.length} linked contacts`;

  return {
    thesisFit,
    roundActivity,
    contactConfidence,
    snapshot,
    keyContacts: uniqueContacts
  };
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
  const parsed = parseDateInput(value);
  if (!parsed || Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US");
}

function toDateInputValue(value: string | null | undefined) {
  return formatDateInputValue(value);
}

function getNextOpenAction(actions: NextActionItem[]) {
  return actions.find((item) => item.status !== "DONE" && item.status !== "CANCELLED") || null;
}

function nextActionStatusClass(status: NextActionItem["status"]) {
  if (status === "DONE") return "done";
  if (status === "IN_PROGRESS") return "running";
  if (status === "BLOCKED") return "failed";
  if (status === "CANCELLED") return "queued";
  return "draft";
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

function draftFromRecord(record: CoInvestorRecord): DetailDraft {
  return {
    name: record.name || "",
    legalName: record.legalName || "",
    website: record.website || "",
    headquartersLocation: formatLocation(record),
    isSeedInvestor: record.isSeedInvestor,
    isSeriesAInvestor: record.isSeriesAInvestor,
    investmentNotes: record.investmentNotes || "",
    researchNotes: record.researchNotes || ""
  };
}

export function CoInvestorWorkbench() {
  const [query, setQuery] = React.useState("");
  const [coInvestorLookupValue, setCoInvestorLookupValue] = React.useState("");
  const [coInvestorLookupModalSignal, setCoInvestorLookupModalSignal] = React.useState(0);
  const [records, setRecords] = React.useState<CoInvestorRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = React.useState<string | null>(null);
  const [detailDraft, setDetailDraft] = React.useState<DetailDraft | null>(null);
  const [draftRecordId, setDraftRecordId] = React.useState<string | null>(null);
  const [, setRunningAgent] = React.useState(false);
  const [creatingFromSearch, setCreatingFromSearch] = React.useState(false);
  const [deletingRecordId, setDeletingRecordId] = React.useState<string | null>(null);
  const [searchCandidates, setSearchCandidates] = React.useState<SearchCandidate[]>([]);
  const [candidateSearchQuery, setCandidateSearchQuery] = React.useState("");
  const [searchingCandidates, setSearchingCandidates] = React.useState(false);
  const [searchCandidateError, setSearchCandidateError] = React.useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = React.useState(-1);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [addingContact, setAddingContact] = React.useState(false);
  const [addContactModalOpen, setAddContactModalOpen] = React.useState(false);
  const [contactName, setContactName] = React.useState("");
  const [contactTitle, setContactTitle] = React.useState("");
  const [contactRelationshipTitle, setContactRelationshipTitle] = React.useState("");
  const [contactEmail, setContactEmail] = React.useState("");
  const [contactPhone, setContactPhone] = React.useState("");
  const [contactLinkedinUrl, setContactLinkedinUrl] = React.useState("");
  const [contactRoleType, setContactRoleType] = React.useState<"INVESTOR_PARTNER" | "OTHER">(
    "INVESTOR_PARTNER"
  );
  const [newIsKeyAllianceContact, setNewIsKeyAllianceContact] = React.useState(false);
  const [newIsInformedAllianceContact, setNewIsInformedAllianceContact] = React.useState(false);
  const [editingContactLinkId, setEditingContactLinkId] = React.useState<string | null>(null);
  const [editingContactName, setEditingContactName] = React.useState("");
  const [editingContactTitle, setEditingContactTitle] = React.useState("");
  const [editingContactRelationshipTitle, setEditingContactRelationshipTitle] = React.useState("");
  const [editingContactEmail, setEditingContactEmail] = React.useState("");
  const [editingContactPhone, setEditingContactPhone] = React.useState("");
  const [editingContactLinkedinUrl, setEditingContactLinkedinUrl] = React.useState("");
  const [editingIsKeyAllianceContact, setEditingIsKeyAllianceContact] = React.useState(false);
  const [editingIsInformedAllianceContact, setEditingIsInformedAllianceContact] = React.useState(false);
  const [editingContactRoleType, setEditingContactRoleType] = React.useState<"INVESTOR_PARTNER" | "OTHER">(
    "INVESTOR_PARTNER"
  );
  const [updatingContact, setUpdatingContact] = React.useState(false);
  const [deletingContactLinkId, setDeletingContactLinkId] = React.useState<string | null>(null);
  const [showAddLimitedPartnerLookup, setShowAddLimitedPartnerLookup] = React.useState(false);
  const [limitedPartnerHealthSystemId, setLimitedPartnerHealthSystemId] = React.useState("");
  const [addingLimitedPartner, setAddingLimitedPartner] = React.useState(false);
  const [showAddInvestmentLookup, setShowAddInvestmentLookup] = React.useState(false);
  const [investmentCompanyId, setInvestmentCompanyId] = React.useState("");
  const [addingInvestment, setAddingInvestment] = React.useState(false);
  const [editingLimitedPartnerLinkId, setEditingLimitedPartnerLinkId] = React.useState<string | null>(null);
  const [editingLimitedPartnerHealthSystemId, setEditingLimitedPartnerHealthSystemId] = React.useState("");
  const [updatingLimitedPartner, setUpdatingLimitedPartner] = React.useState(false);
  const [deletingLimitedPartnerLinkId, setDeletingLimitedPartnerLinkId] = React.useState<string | null>(null);
  const [keepListView, setKeepListView] = React.useState(false);
  const [newIsSeedInvestor, setNewIsSeedInvestor] = React.useState(false);
  const [newIsSeriesAInvestor, setNewIsSeriesAInvestor] = React.useState(false);
  const [newInteractionType, setNewInteractionType] = React.useState<CoInvestorInteraction["interactionType"]>("NOTE");
  const [newInteractionSubject, setNewInteractionSubject] = React.useState("");
  const [newInteractionSummary, setNewInteractionSummary] = React.useState("");
  const [addingInteraction, setAddingInteraction] = React.useState(false);
  const [newActionTitle, setNewActionTitle] = React.useState("");
  const [newActionDueAt, setNewActionDueAt] = React.useState("");
  const [addingNextAction, setAddingNextAction] = React.useState(false);
  const [updatingNextActionId, setUpdatingNextActionId] = React.useState<string | null>(null);
  const [deletingNextActionId, setDeletingNextActionId] = React.useState<string | null>(null);
  const [deletingInteractionId, setDeletingInteractionId] = React.useState<string | null>(null);
  const [editingInteractionId, setEditingInteractionId] = React.useState<string | null>(null);
  const [editingInteractionSubject, setEditingInteractionSubject] = React.useState("");
  const [editingInteractionSummary, setEditingInteractionSummary] = React.useState("");
  const [savingInteractionId, setSavingInteractionId] = React.useState<string | null>(null);
  const [editingNextActionId, setEditingNextActionId] = React.useState<string | null>(null);
  const [editingNextActionTitle, setEditingNextActionTitle] = React.useState("");
  const [editingNextActionDueAt, setEditingNextActionDueAt] = React.useState("");
  const [editingNextActionOwner, setEditingNextActionOwner] = React.useState("");
  const [savingNextActionId, setSavingNextActionId] = React.useState<string | null>(null);
  const [activeDetailTab, setActiveDetailTab] = React.useState<DetailTab>("overview");
  const [matchModalOpen, setMatchModalOpen] = React.useState(false);
  const [matchModalManualMode, setMatchModalManualMode] = React.useState(false);
  const [manualMatchCandidate, setManualMatchCandidate] = React.useState<ManualSearchCandidate>({
    name: "",
    website: "",
    headquartersCity: "",
    headquartersState: "",
    headquartersCountry: ""
  });

  const candidateSearchCacheRef = React.useRef<Record<string, SearchCandidate[]>>({});
  const candidateSearchAbortRef = React.useRef<AbortController | null>(null);

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

  const selectedRecord = React.useMemo(
    () => records.find((record) => record.id === selectedRecordId) || null,
    [records, selectedRecordId]
  );

  const relationshipHighlights = React.useMemo(() => {
    if (!selectedRecord) return null;

    const latestInteraction = selectedRecord.interactions[0] || null;
    const nextOpenAction = getNextOpenAction(selectedRecord.nextActions);

    return {
      latestInteraction,
      nextOpenAction,
      totalInteractions: selectedRecord.interactions.length,
      openActions: selectedRecord.nextActions.filter((item) => item.status !== "DONE" && item.status !== "CANCELLED").length
    };
  }, [selectedRecord]);

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

  async function loadRecords() {
    const res = await fetch("/api/co-investors", { cache: "no-store" });
    const payload = await res
      .json()
      .catch(() => ({ error: "Failed to load co-investors.", coInvestors: [] as CoInvestorRecord[] }));
    if (!res.ok) {
      throw new Error(payload.error || "Failed to load co-investors.");
    }
    setRecords(Array.isArray(payload.coInvestors) ? payload.coInvestors : []);
  }

  async function runQueuedAgent(maxJobs = 2) {
    setRunningAgent(true);
    try {
      await fetch("/api/co-investors/research-jobs/process", {
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
    const searchRes = await fetch("/api/co-investors/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: term }),
      signal: options?.signal
    });

    if (!searchRes.ok) {
      const searchPayload = await searchRes.json().catch(() => ({ error: "Failed to search co-investors" }));
      throw new Error(searchPayload.error || "Failed to search co-investors");
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
        throw new Error("Select one matching co-investor before creating.");
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

      const verifyRes = await fetch("/api/co-investors/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidate,
          isSeedInvestor: newIsSeedInvestor,
          isSeriesAInvestor: newIsSeriesAInvestor
        })
      });

      const verifyPayload = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyPayload.error || "Failed to create co-investor");
      }

      setStatus({
        kind: "ok",
        text: `${verifyPayload.coInvestor.name} created. Research agent queued.`
      });

      setKeepListView(true);
      setSelectedRecordId(null);
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
      setNewIsSeedInvestor(false);
      setNewIsSeriesAInvestor(false);

      await runQueuedAgent(1);
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to create co-investor"
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
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: contactName,
          title: contactTitle,
          relationshipTitle: contactRelationshipTitle,
          email: contactEmail,
          phone: contactPhone,
          linkedinUrl: contactLinkedinUrl,
          isKeyAllianceContact: newIsKeyAllianceContact,
          isInformedAllianceContact: newIsInformedAllianceContact,
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

  function beginEditingContact(link: CoInvestorRecord["contactLinks"][number]) {
    setEditingContactLinkId(link.id);
    setEditingContactName(link.contact.name);
    setEditingContactTitle(link.title || "");
    setEditingContactRelationshipTitle(link.title || link.contact.title || "");
    setEditingContactEmail(link.contact.email || "");
    setEditingContactPhone(link.contact.phone || "");
    setEditingContactLinkedinUrl(link.contact.linkedinUrl || "");
    setEditingContactRoleType(link.roleType === "INVESTOR_PARTNER" ? "INVESTOR_PARTNER" : "OTHER");
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
    setContactRoleType("INVESTOR_PARTNER");
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
    setEditingContactRoleType("INVESTOR_PARTNER");
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
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/contacts`, {
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
          isKeyAllianceContact: editingIsKeyAllianceContact,
          isInformedAllianceContact: editingIsInformedAllianceContact,
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

    const confirmDelete = window.confirm(`Remove ${contactName} from this co-investor?`);
    if (!confirmDelete) return;

    setDeletingContactLinkId(linkId);
    setStatus(null);

    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/contacts`, {
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

  function resetLimitedPartnerForm() {
    setLimitedPartnerHealthSystemId("");
    setShowAddLimitedPartnerLookup(false);
  }

  function resetInvestmentForm() {
    setInvestmentCompanyId("");
    setShowAddInvestmentLookup(false);
  }

  function resetEditingLimitedPartnerForm() {
    setEditingLimitedPartnerLinkId(null);
    setEditingLimitedPartnerHealthSystemId("");
  }

  function beginEditingLimitedPartner(link: CoInvestorRecord["venturePartners"][number]) {
    setEditingLimitedPartnerLinkId(link.id);
    setEditingLimitedPartnerHealthSystemId(link.healthSystemId);
    setStatus(null);
  }

  async function addLimitedPartnerToSelectedRecord(nextHealthSystemId?: string) {
    if (!selectedRecord) return;
    const healthSystemId = (nextHealthSystemId ?? limitedPartnerHealthSystemId).trim();
    if (!healthSystemId) {
      setStatus({ kind: "error", text: "Select a health system." });
      return;
    }

    setAddingLimitedPartner(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/health-systems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ healthSystemId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add health system limited partner");
      }

      const label = payload?.link?.healthSystem?.name || "Health system";
      setStatus({ kind: "ok", text: `${label} linked as a health system limited partner.` });
      resetLimitedPartnerForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add health system limited partner"
      });
    } finally {
      setAddingLimitedPartner(false);
    }
  }

  async function updateLimitedPartnerForSelectedRecord(linkId: string) {
    if (!selectedRecord) return;
    const healthSystemId = editingLimitedPartnerHealthSystemId.trim();
    if (!healthSystemId) {
      setStatus({ kind: "error", text: "Select a health system." });
      return;
    }

    setUpdatingLimitedPartner(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/health-systems`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId, healthSystemId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to update health system limited partner");
      }

      const label = payload?.link?.healthSystem?.name || "Health system";
      setStatus({ kind: "ok", text: `${label} limited partner link updated.` });
      resetEditingLimitedPartnerForm();
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update health system limited partner"
      });
    } finally {
      setUpdatingLimitedPartner(false);
    }
  }

  async function deleteLimitedPartnerFromSelectedRecord(linkId: string, healthSystemName: string) {
    if (!selectedRecord) return;
    const confirmDelete = window.confirm(`Remove ${healthSystemName} as a health system limited partner?`);
    if (!confirmDelete) return;

    setDeletingLimitedPartnerLinkId(linkId);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/health-systems`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkId })
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to delete health system limited partner");
      }

      if (editingLimitedPartnerLinkId === linkId) {
        resetEditingLimitedPartnerForm();
      }

      setStatus({ kind: "ok", text: `${healthSystemName} removed from limited partners.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete health system limited partner"
      });
    } finally {
      setDeletingLimitedPartnerLinkId(null);
    }
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
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/investments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId })
      });

      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload.error || "Failed to add investment");
      }

      const name = payload?.investment?.portfolioCompanyName || "Company";
      setStatus({
        kind: "ok",
        text: payload?.created === false ? `${name} is already in investments.` : `${name} added to investments.`
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

    const parsedHeadquartersLocation = parseHeadquartersLocation(draftToSave.headquartersLocation);

    setStatus(null);

    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftToSave.name,
          legalName: draftToSave.legalName,
          website: draftToSave.website,
          headquartersCity: parsedHeadquartersLocation.headquartersCity,
          headquartersState: parsedHeadquartersLocation.headquartersState,
          headquartersCountry: parsedHeadquartersLocation.headquartersCountry,
          isSeedInvestor: draftToSave.isSeedInvestor,
          isSeriesAInvestor: draftToSave.isSeriesAInvestor,
          investmentNotes: draftToSave.investmentNotes,
          researchNotes: draftToSave.researchNotes
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to save changes");

      setStatus({ kind: "ok", text: `Saved changes for ${payload.coInvestor.name}.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to save changes"
      });
    }
  }

  async function deleteCoInvestor(record: CoInvestorRecord) {
    const confirmDelete = window.confirm(
      `Delete ${record.name} and all related research details? This cannot be undone.`
    );

    if (!confirmDelete) return;

    setDeletingRecordId(record.id);
    setStatus(null);

    try {
      const res = await fetch(`/api/co-investors/${record.id}`, { method: "DELETE" });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete co-investor");

      setStatus({ kind: "ok", text: `${record.name} deleted.` });
      if (selectedRecordId === record.id) {
        setSelectedRecordId(null);
      }
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete co-investor"
      });
    } finally {
      setDeletingRecordId(null);
    }
  }

  async function addInteractionForSelectedRecord() {
    if (!selectedRecord) return;

    const subject = newInteractionSubject.trim();
    const summary = newInteractionSummary.trim();
    if (!subject && !summary) {
      setStatus({ kind: "error", text: "Add a subject or summary for the interaction." });
      return;
    }

    setAddingInteraction(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interactionType: newInteractionType,
          subject,
          summary
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add interaction");

      setNewInteractionSubject("");
      setNewInteractionSummary("");
      setStatus({ kind: "ok", text: "Interaction added." });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add interaction"
      });
    } finally {
      setAddingInteraction(false);
    }
  }

  async function addNextActionForSelectedRecord() {
    if (!selectedRecord) return;

    const title = newActionTitle.trim();
    if (!title) {
      setStatus({ kind: "error", text: "Next action title is required." });
      return;
    }

    setAddingNextAction(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/next-actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          dueAt: newActionDueAt || null
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to add next action");

      setNewActionTitle("");
      setNewActionDueAt("");
      setStatus({ kind: "ok", text: "Next action added." });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to add next action"
      });
    } finally {
      setAddingNextAction(false);
    }
  }

  async function updateNextActionStatus(nextActionId: string, status: NextActionItem["status"]) {
    if (!selectedRecord) return;

    setUpdatingNextActionId(nextActionId);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/next-actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextActionId, status })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update next action");

      setStatus({ kind: "ok", text: "Next action updated." });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update next action"
      });
    } finally {
      setUpdatingNextActionId(null);
    }
  }

  async function deleteNextAction(nextActionId: string) {
    if (!selectedRecord) return;

    setDeletingNextActionId(nextActionId);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/next-actions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextActionId })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete next action");

      setStatus({ kind: "ok", text: "Next action deleted." });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete next action"
      });
    } finally {
      setDeletingNextActionId(null);
    }
  }

  async function deleteInteraction(interactionId: string) {
    if (!selectedRecord) return;

    setDeletingInteractionId(interactionId);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/interactions`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to delete interaction");

      setStatus({ kind: "ok", text: "Interaction deleted." });
      if (editingInteractionId === interactionId) {
        setEditingInteractionId(null);
      }
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to delete interaction"
      });
    } finally {
      setDeletingInteractionId(null);
    }
  }

  function startInteractionEdit(entry: CoInvestorInteraction) {
    setEditingInteractionId(entry.id);
    setEditingInteractionSubject(entry.subject || "");
    setEditingInteractionSummary(entry.summary || "");
  }

  async function saveInteractionEdit(interactionId: string) {
    if (!selectedRecord) return;

    const subject = editingInteractionSubject.trim();
    const summary = editingInteractionSummary.trim();
    if (!subject && !summary) {
      setStatus({ kind: "error", text: "Add a subject or summary for the interaction." });
      return;
    }

    setSavingInteractionId(interactionId);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/interactions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId, subject, summary })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update interaction");

      setEditingInteractionId(null);
      setStatus({ kind: "ok", text: "Interaction updated." });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update interaction"
      });
    } finally {
      setSavingInteractionId(null);
    }
  }

  function startNextActionEdit(item: NextActionItem) {
    setEditingNextActionId(item.id);
    setEditingNextActionTitle(item.title || "");
    setEditingNextActionDueAt(toDateInputValue(item.dueAt));
    setEditingNextActionOwner(item.ownerName || "");
  }

  async function saveNextActionEdit(nextActionId: string) {
    if (!selectedRecord) return;

    const title = editingNextActionTitle.trim();
    if (!title) {
      setStatus({ kind: "error", text: "Next action title is required." });
      return;
    }

    setSavingNextActionId(nextActionId);
    setStatus(null);
    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/next-actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextActionId,
          title,
          ownerName: editingNextActionOwner.trim() || null,
          dueAt: editingNextActionDueAt || null
        })
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update next action");

      setEditingNextActionId(null);
      setStatus({ kind: "ok", text: "Next action updated." });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to update next action"
      });
    } finally {
      setSavingNextActionId(null);
    }
  }

  React.useEffect(() => {
    loadRecords().catch((error) => {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to load co-investors."
      });
    });
  }, []);

  React.useEffect(() => {
    if (!hasPending) return;

    const timer = setInterval(() => {
      loadRecords().catch((error) => {
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to refresh co-investors."
        });
      });
    }, 7000);

    return () => clearInterval(timer);
  }, [hasPending]);

  React.useEffect(() => {
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
        setSearchCandidateError(error instanceof Error ? error.message : "Failed to search co-investors.");
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

  React.useEffect(() => {
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

  React.useEffect(() => {
    if (!selectedRecord) {
      setDetailDraft(null);
      setDraftRecordId(null);
      setAddContactModalOpen(false);
      resetLimitedPartnerForm();
      resetEditingLimitedPartnerForm();
      resetEditingContactForm();
      setDeletingContactLinkId(null);
      setEditingInteractionId(null);
      setEditingNextActionId(null);
      setDeletingInteractionId(null);
      setDeletingNextActionId(null);
      setDeletingLimitedPartnerLinkId(null);
      return;
    }

    if (selectedRecord.id !== draftRecordId) {
      setDetailDraft(draftFromRecord(selectedRecord));
      setDraftRecordId(selectedRecord.id);
      setActiveDetailTab("overview");
      setAddContactModalOpen(false);
      resetLimitedPartnerForm();
      resetEditingLimitedPartnerForm();
    }
  }, [selectedRecord, draftRecordId]);

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
                    setCoInvestorLookupModalSignal((current) => current + 1);
                  }}
                >
                  + Add Co-Investor
                </a>
              </div>
              <div className="entity-list-search">
                <input
                  id="search-co-investor"
                  aria-label="Search co-investors"
                  placeholder="Type a co-investor name, location, or website"
                  value={query}
                  onChange={(event) => {
                    const nextQuery = event.target.value;
                    setKeepListView(false);
                    setQuery(nextQuery);
                    setSearchCandidates([]);
                    setCandidateSearchQuery("");
                    setSelectedCandidateIndex(-1);
                    setSearchCandidateError(null);
                    setSearchingCandidates(false);
                    if (candidateSearchAbortRef.current) {
                      candidateSearchAbortRef.current.abort();
                      candidateSearchAbortRef.current = null;
                    }
                  }}
                />
                {query.trim() ? (
                  <button
                    type="button"
                    className="ghost small entity-list-search-clear"
                    onClick={() => {
                      setKeepListView(false);
                      setQuery("");
                      setSearchCandidates([]);
                      setCandidateSearchQuery("");
                      setSelectedCandidateIndex(-1);
                      setSearchCandidateError(null);
                      setSearchingCandidates(false);
                      if (candidateSearchAbortRef.current) {
                        candidateSearchAbortRef.current.abort();
                        candidateSearchAbortRef.current = null;
                      }
                    }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            </div>
          <EntityLookupInput
            entityKind="CO_INVESTOR"
            value={coInvestorLookupValue}
            onChange={(nextValue) => {
              setCoInvestorLookupValue(nextValue);
              if (!nextValue) return;
              setKeepListView(false);
              setQuery("");
              setSelectedRecordId(nextValue);
            }}
            hideLookupField
            onEntityCreated={(option) => {
              setCoInvestorLookupValue(option.id);
              setStatus({ kind: "ok", text: `${option.name} created.` });
              setKeepListView(false);
              void (async () => {
                await loadRecords();
                setSelectedRecordId(option.id);
              })();
            }}
            openAddModalSignal={coInvestorLookupModalSignal}
          />

          {shouldOfferCreate && (
            <div className="create-card">
              <p className="create-title">No co-investors match "{query.trim()}"</p>
              <p className="muted">Create a new co-investor and launch the research agent?</p>

              <div className="toggle-row" role="group" aria-label="Investor stage flags">
                <button
                  type="button"
                  className={`toggle-chip ${newIsSeedInvestor ? "active" : ""}`}
                  aria-pressed={newIsSeedInvestor}
                  onClick={() => setNewIsSeedInvestor((current) => !current)}
                >
                  Seed Stage Investor
                </button>
                <button
                  type="button"
                  className={`toggle-chip ${newIsSeriesAInvestor ? "active" : ""}`}
                  aria-pressed={newIsSeriesAInvestor}
                  onClick={() => setNewIsSeriesAInvestor((current) => !current)}
                >
                  Series A Investor
                </button>
              </div>

              <div className="actions">
                <button className="primary" type="button" onClick={openCreateMatchModal} disabled={creatingFromSearch}>
                  Search online
                </button>
              </div>
            </div>
          )}

          <SearchMatchModal
            isOpen={matchModalOpen}
            title="Co-investor not found"
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
                  ? `No co-investors match "${query.trim()}". Use Add Co-Investor above and select Add New.`
                  : "No co-investors yet. Use Add Co-Investor above to create your first record."}
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
                      {record.isSeedInvestor && <span className="flag-pill lp">Seed</span>}
                      {record.isSeriesAInvestor && <span className="flag-pill alliance">Series A</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {status && <p className={`status ${status.kind}`}>{status.text}</p>}
          </div>
        </section>

          <section className="panel entity-detail-panel" aria-label="Detail panel">
            {!selectedRecord || !detailDraft ? (
              <p className="muted">Select a co-investor from the list to view details.</p>
            ) : (
              <div className="detail-card">
                <div className="detail-head detail-head-minimal">
                  <h3>{selectedRecord.name}</h3>
                </div>

                <div className="detail-tabs" role="tablist" aria-label="Co-investor detail sections">
                  <button type="button" role="tab" className={`detail-tab ${activeDetailTab === "overview" ? "active" : ""}`} aria-selected={activeDetailTab === "overview"} onClick={() => setActiveDetailTab("overview")}>Overview</button>
                  <button type="button" role="tab" className={`detail-tab ${activeDetailTab === "contacts" ? "active" : ""}`} aria-selected={activeDetailTab === "contacts"} onClick={() => setActiveDetailTab("contacts")}>Contacts</button>
                  <button type="button" role="tab" className={`detail-tab ${activeDetailTab === "relationships" ? "active" : ""}`} aria-selected={activeDetailTab === "relationships"} onClick={() => setActiveDetailTab("relationships")}>Relationships</button>
                  <button type="button" role="tab" className={`detail-tab ${activeDetailTab === "notes" ? "active" : ""}`} aria-selected={activeDetailTab === "notes"} onClick={() => setActiveDetailTab("notes")}>Notes</button>
                  <button type="button" role="tab" className={`detail-tab ${activeDetailTab === "documents" ? "active" : ""}`} aria-selected={activeDetailTab === "documents"} onClick={() => setActiveDetailTab("documents")}>Documents</button>
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
                    label="Seed Investor"
                    value={detailDraft.isSeedInvestor}
                    trueLabel="Yes"
                    falseLabel="No"
                    onSave={(value) => updateDetailDraft({ isSeedInvestor: value })}
                  />
                  <InlineBooleanField
                    label="Series A Investor"
                    value={detailDraft.isSeriesAInvestor}
                    trueLabel="Yes"
                    falseLabel="No"
                    onSave={(value) => updateDetailDraft({ isSeriesAInvestor: value })}
                  />
                </div>

                <div className="detail-section">
                  <InlineTextareaField
                    multiline
                    label="Investment Notes"
                    value={detailDraft.investmentNotes}
                    insight={coInvestorInsightPayload(selectedRecord)}
                    rows={12}
                    enableFormatting
                    onSave={(value) => updateDetailDraft({ investmentNotes: value })}
                  />
                </div>

                <div className="detail-section">
                  <InlineTextareaField
                    multiline
                    label="Research Notes"
                    value={detailDraft.researchNotes}
                    rows={12}
                    enableFormatting
                    onSave={(value) => updateDetailDraft({ researchNotes: value })}
                  />
                </div>

              {selectedRecord.researchError && (
                <div className="detail-section">
                  <p className="detail-label">Research Error</p>
                  <p>{selectedRecord.researchError}</p>
                </div>
              )}

                <div className="detail-section entity-delete-section">
                  <div className="actions">
                    <button
                      type="button"
                      className="ghost small danger"
                      onClick={() => void deleteCoInvestor(selectedRecord)}
                      disabled={deletingRecordId === selectedRecord.id}
                    >
                      {deletingRecordId === selectedRecord.id ? "Deleting..." : "Delete Co-investor"}
                    </button>
                  </div>
                </div>

                  </>
                )}

                {activeDetailTab === "documents" && (
                  <>
                    <EntityDocumentsPane
                      entityPath="co-investors"
                      entityId={selectedRecord.id}
                      onStatus={setStatus}
                    />
                  </>
                )}

                {activeDetailTab === "notes" && (
                  <>
                    <EntityNotesPane
                      entityPath="co-investors"
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
                                    event.target.value as "INVESTOR_PARTNER" | "OTHER"
                                  )
                                }
                              >
                                <option value="INVESTOR_PARTNER">Investor Partner</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </div>
                            <div>
                              <label>Contact Title</label>
                              <input
                                value={editingContactTitle}
                                onChange={(event) => setEditingContactTitle(event.target.value)}
                                placeholder="General Partner"
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
                                placeholder="name@firm.com"
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
                            <button className="ghost small" onClick={resetEditingContactForm} type="button">
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
                  onContactRoleTypeChange={(value) => setContactRoleType(value as "INVESTOR_PARTNER" | "OTHER")}
                  roleOptions={[
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
                  contactIsKeyAllianceContact={newIsKeyAllianceContact}
                  onContactIsKeyAllianceContactChange={setNewIsKeyAllianceContact}
                  contactIsInformedAllianceContact={newIsInformedAllianceContact}
                  onContactIsInformedAllianceContactChange={setNewIsInformedAllianceContact}
                  namePlaceholder="William Smith"
                  titlePlaceholder="General Partner"
                  relationshipTitlePlaceholder="Board Member"
                  emailPlaceholder="name@firm.com"
                  phonePlaceholder="+1 555 555 5555"
                  linkedinPlaceholder="https://linkedin.com/in/..."
                />
              </div>

                  </>
                )}

                {activeDetailTab === "relationships" && false && (
                  <>
              <div className="detail-section">
                <p className="detail-label">Relationship Highlights</p>
                {!relationshipHighlights ? (
                  <p className="muted">No relationship data yet.</p>
                ) : (
                  <div className="detail-grid">
                    <div>
                      <p className="muted">Latest Interaction</p>
                      <strong>
                        {relationshipHighlights?.latestInteraction
                          ? relationshipHighlights?.latestInteraction?.subject || relationshipHighlights?.latestInteraction?.interactionType
                          : "No interactions"}
                      </strong>
                      {relationshipHighlights?.latestInteraction && (
                        <p className="muted">{formatDate(relationshipHighlights?.latestInteraction?.occurredAt)}</p>
                      )}
                    </div>
                    <div>
                      <p className="muted">Next Open Action</p>
                      <strong>{relationshipHighlights?.nextOpenAction?.title || "No open next actions"}</strong>
                      {relationshipHighlights?.nextOpenAction?.dueAt && (
                        <p className="muted">Due {formatDate(relationshipHighlights?.nextOpenAction?.dueAt)}</p>
                      )}
                    </div>
                    <div>
                      <p className="muted">Totals</p>
                      <strong>{relationshipHighlights?.totalInteractions ?? 0} interactions</strong>
                    </div>
                    <div>
                      <p className="muted">Open Next Actions</p>
                      <strong>{relationshipHighlights?.openActions ?? 0}</strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <p className="detail-label">Log Interaction</p>
                <div className="detail-grid">
                  <div>
                    <label>Type</label>
                    <select
                      value={newInteractionType}
                      onChange={(event) =>
                        setNewInteractionType(event.target.value as CoInvestorInteraction["interactionType"])
                      }
                    >
                      <option value="MEETING">Meeting</option>
                      <option value="EMAIL">Email</option>
                      <option value="CALL">Call</option>
                      <option value="EVENT">Event</option>
                      <option value="INTRO">Intro</option>
                      <option value="NOTE">Note</option>
                    </select>
                  </div>
                  <div>
                    <label>Subject</label>
                    <input
                      value={newInteractionSubject}
                      onChange={(event) => setNewInteractionSubject(event.target.value)}
                      placeholder="Intro call with partner"
                    />
                  </div>
                </div>
                <div>
                  <label>Summary</label>
                  <RichTextArea
                    className="co-investor-interaction-textarea"
                    value={newInteractionSummary}
                    onChange={setNewInteractionSummary}
                    placeholder="Key notes from this interaction"
                    rows={10}
                  />
                </div>
                <div className="actions">
                  <button className="secondary" onClick={addInteractionForSelectedRecord} disabled={addingInteraction}>
                    {addingInteraction ? "Adding..." : "Add Interaction"}
                  </button>
                </div>

                {(selectedRecord?.interactions ?? []).length === 0 ? (
                  <p className="muted">No interactions logged yet.</p>
                ) : (
                  (selectedRecord?.interactions || []).map((entry) => (
                    <div key={entry.id} className="detail-list-item">
                      {editingInteractionId === entry.id ? (
                        <>
                          <label>Subject</label>
                          <input
                            value={editingInteractionSubject}
                            onChange={(event) => setEditingInteractionSubject(event.target.value)}
                            placeholder="Subject"
                          />
                          <label>Summary</label>
                          <RichTextArea
                            className="co-investor-interaction-textarea"
                            value={editingInteractionSummary}
                            onChange={setEditingInteractionSummary}
                            placeholder="Summary"
                            rows={10}
                          />
                          <div className="actions">
                            <button
                              className="primary"
                              onClick={() => saveInteractionEdit(entry.id)}
                              disabled={savingInteractionId === entry.id}
                            >
                              {savingInteractionId === entry.id ? "Saving..." : "Save"}
                            </button>
                            <button className="ghost small" onClick={() => setEditingInteractionId(null)}>
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <strong>{entry.interactionType}</strong>
                          {entry.subject ? ` | ${entry.subject}` : ""}
                          {` | ${formatDate(entry.occurredAt)}`}
                          {entry.summary && <p>{entry.summary}</p>}
                          <div className="actions">
                            <button className="ghost small" onClick={() => startInteractionEdit(entry)} type="button">
                              Edit
                            </button>
                            <button
                              className="ghost small"
                              onClick={() => deleteInteraction(entry.id)}
                              disabled={deletingInteractionId === entry.id}
                              type="button"
                            >
                              {deletingInteractionId === entry.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

                  </>
                )}

                {activeDetailTab === "relationships" && false && (
                  <>
              <div className="detail-section">
                <p className="detail-label">Next Actions</p>
                <div className="detail-grid">
                  <div>
                    <label>Title</label>
                    <input
                      value={newActionTitle}
                      onChange={(event) => setNewActionTitle(event.target.value)}
                      placeholder="Send follow-up materials"
                    />
                  </div>
                  <div>
                    <label>Due Date</label>
                    <DateInputField value={newActionDueAt} onChange={setNewActionDueAt} />
                  </div>
                </div>
                <div className="actions">
                  <button className="secondary" onClick={addNextActionForSelectedRecord} disabled={addingNextAction}>
                    {addingNextAction ? "Adding..." : "Add Next Action"}
                  </button>
                </div>

                {(selectedRecord?.nextActions ?? []).length === 0 ? (
                  <p className="muted">No open next actions yet.</p>
                ) : (
                  (selectedRecord?.nextActions || []).map((item) => (
                    <div key={item.id} className="detail-list-item">
                      {editingNextActionId === item.id ? (
                        <>
                          <label>Title</label>
                          <input
                            value={editingNextActionTitle}
                            onChange={(event) => setEditingNextActionTitle(event.target.value)}
                            placeholder="Title"
                          />
                          <div className="detail-grid">
                            <div>
                              <label>Owner</label>
                              <input
                                value={editingNextActionOwner}
                                onChange={(event) => setEditingNextActionOwner(event.target.value)}
                                placeholder="Owner"
                              />
                            </div>
                            <div>
                              <label>Due Date</label>
                              <DateInputField value={editingNextActionDueAt} onChange={setEditingNextActionDueAt} />
                            </div>
                          </div>
                          <div className="actions">
                            <button
                              className="primary"
                              onClick={() => saveNextActionEdit(item.id)}
                              disabled={savingNextActionId === item.id}
                            >
                              {savingNextActionId === item.id ? "Saving..." : "Save"}
                            </button>
                            <button className="ghost small" onClick={() => setEditingNextActionId(null)}>
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <strong>{item.title}</strong>
                          {item.ownerName ? ` | ${item.ownerName}` : ""}
                          {item.dueAt ? ` | Due ${formatDate(item.dueAt)}` : ""}
                          <span className={`status-pill ${nextActionStatusClass(item.status)}`} style={{ marginLeft: 8 }}>
                            {item.status}
                          </span>
                          <div className="actions">
                            {item.status !== "DONE" && (
                              <button
                                className="ghost small"
                                onClick={() => updateNextActionStatus(item.id, "DONE")}
                                disabled={updatingNextActionId === item.id}
                                type="button"
                              >
                                Done
                              </button>
                            )}
                            <button className="ghost small" onClick={() => startNextActionEdit(item)} type="button">
                              Edit
                            </button>
                            <button
                              className="ghost small"
                              onClick={() => deleteNextAction(item.id)}
                              disabled={deletingNextActionId === item.id}
                              type="button"
                            >
                              {deletingNextActionId === item.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

                  </>
                )}

                {activeDetailTab === "relationships" && (
                  <>
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
                      className="relationship-inline-lookup"
                      placeholder="Search companies (or Add New)"
                      autoOpenCreateOnEnterNoMatch
                      disabled={addingInvestment}
                      companyCreateDefaults={{
                        companyType: "STARTUP",
                        primaryCategory: "OTHER",
                        leadSourceType: "OTHER",
                        leadSourceOther: "Added from co-investor investment"
                      }}
                    />
                  </div>
                ) : null}
                {(selectedRecord?.investments ?? []).length === 0 ? (
                  <p className="muted">No investments captured.</p>
                ) : (
                  (selectedRecord?.investments || []).map((investment) => (
                    <div key={investment.id} className="detail-list-item contact-row">
                      <div className="contact-row-details">
                        <strong>{investment.portfolioCompanyName}</strong>
                        <p className="muted">
                          Amount: {formatUsd(investment.investmentAmountUsd)} | Date: {formatDate(investment.investmentDate)}
                          {" | "}Stage: {investment.investmentStage || "-"} | Lead: {investment.leadPartnerName || "-"}
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
                    </div>
                  ))
                )}
              </div>

              <div className="detail-section">
                <p className="detail-label">Health System Limited Partners</p>
                <div className="actions">
                  <button
                    type="button"
                    className="ghost small contact-add-link"
                    onClick={() => {
                      if (showAddLimitedPartnerLookup) {
                        resetLimitedPartnerForm();
                        return;
                      }
                      setStatus(null);
                      setShowAddLimitedPartnerLookup(true);
                    }}
                  >
                    {showAddLimitedPartnerLookup ? "Cancel" : "Add Health System Limited Partner"}
                  </button>
                </div>
                {showAddLimitedPartnerLookup ? (
                  <div className="actions relationship-inline-add">
                    <EntityLookupInput
                      entityKind="HEALTH_SYSTEM"
                      value={limitedPartnerHealthSystemId}
                      onChange={(nextId) => {
                        setLimitedPartnerHealthSystemId(nextId);
                        if (!nextId || addingLimitedPartner) return;
                        void addLimitedPartnerToSelectedRecord(nextId);
                      }}
                      className="relationship-inline-lookup"
                      placeholder="Search health systems (or Add New)"
                      autoOpenCreateOnEnterNoMatch
                      disabled={addingLimitedPartner}
                    />
                  </div>
                ) : null}
                {(selectedRecord?.venturePartners ?? []).length === 0 ? (
                  <p className="muted">No health system limited partners linked yet.</p>
                ) : (
                  (selectedRecord?.venturePartners || []).map((link) => {
                    const location = formatLocation(link.healthSystem);
                    return (
                      <div key={link.id} className="detail-list-item">
                        {editingLimitedPartnerLinkId === link.id ? (
                          <div className="actions relationship-inline-add">
                            <EntityLookupInput
                              entityKind="HEALTH_SYSTEM"
                              value={editingLimitedPartnerHealthSystemId}
                              onChange={setEditingLimitedPartnerHealthSystemId}
                              className="relationship-inline-lookup"
                              placeholder="Search health systems (or Add New)"
                              autoOpenCreateOnEnterNoMatch
                              disabled={updatingLimitedPartner}
                            />
                            <button
                              type="button"
                              className="secondary small"
                              onClick={() => void updateLimitedPartnerForSelectedRecord(link.id)}
                              disabled={!editingLimitedPartnerHealthSystemId || updatingLimitedPartner}
                            >
                              {updatingLimitedPartner ? "Saving..." : "Save"}
                            </button>
                            <button
                              type="button"
                              className="ghost small"
                              onClick={resetEditingLimitedPartnerForm}
                              disabled={updatingLimitedPartner}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="contact-row">
                            <div className="contact-row-details">
                              <strong>
                                <a href={`/health-systems/${link.healthSystem.id}`}>{link.healthSystem.name}</a>
                              </strong>
                              <p className="muted">
                                {location || "Location unknown"}
                                {link.healthSystem.website ? (
                                  <>
                                    {" "} |{" "}
                                    <a href={link.healthSystem.website} target="_blank" rel="noreferrer">
                                      Website
                                    </a>
                                  </>
                                ) : null}
                              </p>
                            </div>
                            <div className="contact-row-actions">
                              <button
                                type="button"
                                className="ghost small"
                                onClick={() => beginEditingLimitedPartner(link)}
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="ghost small"
                                onClick={() =>
                                  deleteLimitedPartnerFromSelectedRecord(link.id, link.healthSystem.name)
                                }
                                disabled={deletingLimitedPartnerLinkId === link.id}
                              >
                                {deletingLimitedPartnerLinkId === link.id ? "Removing..." : "Delete"}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
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
