"use client";

import * as React from "react";
import {
  InlineBooleanField,
  InlineTextField,
  InlineTextareaField
} from "./inline-detail-field";

type SearchCandidate = {
  name: string;
  website?: string;
  headquartersCity?: string;
  headquartersState?: string;
  headquartersCountry?: string;
  summary?: string;
  sourceUrls: string[];
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

type DetailTab = "overview" | "contacts" | "activity" | "actions" | "network";

type DetailDraft = {
  name: string;
  legalName: string;
  website: string;
  headquartersCity: string;
  headquartersState: string;
  headquartersCountry: string;
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

function statusClass(status: CoInvestorRecord["researchStatus"]) {
  if (status === "COMPLETED") return "done";
  if (status === "FAILED") return "failed";
  if (status === "RUNNING") return "running";
  if (status === "QUEUED") return "queued";
  return "draft";
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
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-US");
}

function toDateInputValue(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
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
    headquartersCity: record.headquartersCity || "",
    headquartersState: record.headquartersState || "",
    headquartersCountry: record.headquartersCountry || "",
    isSeedInvestor: record.isSeedInvestor,
    isSeriesAInvestor: record.isSeriesAInvestor,
    investmentNotes: record.investmentNotes || "",
    researchNotes: record.researchNotes || ""
  };
}

export function CoInvestorWorkbench() {
  const [query, setQuery] = React.useState("");
  const [records, setRecords] = React.useState<CoInvestorRecord[]>([]);
  const [selectedRecordId, setSelectedRecordId] = React.useState<string | null>(null);
  const [detailDraft, setDetailDraft] = React.useState<DetailDraft | null>(null);
  const [draftRecordId, setDraftRecordId] = React.useState<string | null>(null);
  const [runningAgent, setRunningAgent] = React.useState(false);
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
  const [contactRoleType, setContactRoleType] = React.useState<"INVESTOR_PARTNER" | "OTHER">(
    "INVESTOR_PARTNER"
  );
  const [editingContactLinkId, setEditingContactLinkId] = React.useState<string | null>(null);
  const [editingContactName, setEditingContactName] = React.useState("");
  const [editingContactTitle, setEditingContactTitle] = React.useState("");
  const [editingContactRelationshipTitle, setEditingContactRelationshipTitle] = React.useState("");
  const [editingContactEmail, setEditingContactEmail] = React.useState("");
  const [editingContactPhone, setEditingContactPhone] = React.useState("");
  const [editingContactLinkedinUrl, setEditingContactLinkedinUrl] = React.useState("");
  const [editingContactRoleType, setEditingContactRoleType] = React.useState<"INVESTOR_PARTNER" | "OTHER">(
    "INVESTOR_PARTNER"
  );
  const [updatingContact, setUpdatingContact] = React.useState(false);
  const [deletingContactLinkId, setDeletingContactLinkId] = React.useState<string | null>(null);
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

  const candidateSearchCacheRef = React.useRef<Record<string, SearchCandidate[]>>({});
  const candidateSearchAbortRef = React.useRef<AbortController | null>(null);

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
        record.website
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

  const shouldOfferCreate = query.trim().length >= 3 && filteredRecords.length === 0;
  const selectedCandidate =
    selectedCandidateIndex >= 0 && selectedCandidateIndex < searchCandidates.length
      ? searchCandidates[selectedCandidateIndex]
      : null;

  const createButtonDisabled = creatingFromSearch;

  async function loadRecords() {
    const res = await fetch("/api/co-investors", { cache: "no-store" });
    const payload = await res.json();
    setRecords(payload.coInvestors || []);
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

  async function searchCandidateMatches(term: string, signal?: AbortSignal): Promise<SearchCandidate[]> {
    const searchRes = await fetch("/api/co-investors/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: term }),
      signal
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

  async function checkOnlineMatchesForQuery() {
    const term = query.trim();
    if (!term) return;

    const cacheKey = term.toLowerCase();
    const cachedCandidates = candidateSearchCacheRef.current[cacheKey];
    if (cachedCandidates) {
      setSearchCandidates(cachedCandidates);
      setCandidateSearchQuery(term);
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      return;
    }

    setSearchingCandidates(true);
    setSearchCandidateError(null);

    if (candidateSearchAbortRef.current) {
      candidateSearchAbortRef.current.abort();
    }
    const controller = new AbortController();
    candidateSearchAbortRef.current = controller;

    try {
      const candidates = await searchCandidateMatches(term, controller.signal);
      candidateSearchCacheRef.current[cacheKey] = candidates;
      setSearchCandidates(candidates);
      setCandidateSearchQuery(term);
      setSelectedCandidateIndex(-1);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      setSearchCandidates([]);
      setCandidateSearchQuery(term);
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(error instanceof Error ? error.message : "Failed to search co-investors.");
    } finally {
      if (candidateSearchAbortRef.current === controller) {
        candidateSearchAbortRef.current = null;
      }
      setSearchingCandidates(false);
    }
  }

  async function createAndResearchFromSearchTerm() {
    const term = query.trim();
    if (!term) return;

    setCreatingFromSearch(true);
    setStatus(null);
    setKeepListView(false);

    try {
      const hasCurrentMatches = candidateSearchQuery === term && searchCandidates.length > 0;
      const candidate =
        hasCurrentMatches && selectedCandidate
          ? selectedCandidate
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
      setContactRoleType("INVESTOR_PARTNER");
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

    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftToSave.name,
          legalName: draftToSave.legalName,
          website: draftToSave.website,
          headquartersCity: draftToSave.headquartersCity,
          headquartersState: draftToSave.headquartersState,
          headquartersCountry: draftToSave.headquartersCountry,
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
          dueAt: newActionDueAt ? new Date(newActionDueAt).toISOString() : null
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
          dueAt: editingNextActionDueAt ? new Date(editingNextActionDueAt).toISOString() : null
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
    loadRecords().catch(() => {
      setStatus({ kind: "error", text: "Failed to load co-investors." });
    });
  }, []);

  React.useEffect(() => {
    if (!hasPending) return;

    const timer = setInterval(() => {
      loadRecords().catch(() => {
        setStatus({ kind: "error", text: "Failed to refresh co-investors." });
      });
    }, 7000);

    return () => clearInterval(timer);
  }, [hasPending]);

  React.useEffect(() => {
    if (!shouldOfferCreate) {
      setSearchCandidates([]);
      setCandidateSearchQuery("");
      setSelectedCandidateIndex(-1);
      setSearchCandidateError(null);
      setSearchingCandidates(false);
      if (candidateSearchAbortRef.current) {
        candidateSearchAbortRef.current.abort();
        candidateSearchAbortRef.current = null;
      }
    }
  }, [shouldOfferCreate]);

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
      resetEditingContactForm();
      setDeletingContactLinkId(null);
      setEditingInteractionId(null);
      setEditingNextActionId(null);
      setDeletingInteractionId(null);
      setDeletingNextActionId(null);
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
        <h1>Co-Investor Network</h1>
        <p>
          Search co-investors in your CRM list. As you type, the list narrows instantly. If no match
          exists, create a new co-investor and launch research automatically.
        </p>
      </section>

      <div className="grid">
        <section className="panel">
          <h2>Co-Investors</h2>
          <label htmlFor="search-co-investor">Search</label>
          <input
            id="search-co-investor"
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

          {query.trim().length >= 2 && query.trim().length < 3 && filteredRecords.length === 0 && (
            <p className="muted">Type at least 3 characters to check potential external matches.</p>
          )}

          {shouldOfferCreate && (
            <div className="create-card">
              <p className="create-title">No co-investors match "{query.trim()}"</p>
              <p className="muted">Create immediately, then optionally check online matches.</p>

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
                <button
                  className="secondary"
                  onClick={() => void checkOnlineMatchesForQuery()}
                  disabled={searchingCandidates || creatingFromSearch}
                  type="button"
                >
                  {searchingCandidates ? "Checking matches..." : "Check Web Matches"}
                </button>
              </div>

              {searchingCandidates && <p className="muted">Searching for possible online matches...</p>}

              {searchCandidateError && <p className="status error">{searchCandidateError}</p>}

              {searchCandidates.length > 0 && (
                <div className="candidate-list">
                  {searchCandidates.length > 1 && <p className="detail-label">Select the matching investor:</p>}
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
                          name="co-investor-candidate"
                          checked={isSelected}
                          onChange={() => setSelectedCandidateIndex(index)}
                          onClick={(event) => {
                            event.stopPropagation();
                          }}
                        />
                        <div>
                          <div className="candidate-name">{candidate.name}</div>
                          <div className="candidate-location muted">{location || "Location not identified"}</div>
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
                >
                  {createButtonDisabled ? "Creating..." : "Create + Start Research"}
                </button>
              </div>
            </div>
          )}

          <div className="list-container">
            {filteredRecords.length === 0 && !shouldOfferCreate && (
              <p className="muted">No co-investors yet. Start by typing and creating one.</p>
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
                  <div className="list-row-meta">
                    <button
                      className="ghost small"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        void deleteCoInvestor(record);
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
            <h2>Co-Investor Detail</h2>
            {!selectedRecord || !detailDraft ? (
              <p className="muted">Select a co-investor from the list to view details.</p>
            ) : (
              <div className="detail-card">
                <div className="detail-head">
                  <h3>{selectedRecord.name}</h3>
                </div>

                <div className="detail-tabs" role="tablist" aria-label="Co-investor detail sections">
                  <button type="button" className={`detail-tab ${activeDetailTab === "overview" ? "active" : ""}`} aria-selected={activeDetailTab === "overview"} onClick={() => setActiveDetailTab("overview")}>Overview</button>
                  <button type="button" className={`detail-tab ${activeDetailTab === "contacts" ? "active" : ""}`} aria-selected={activeDetailTab === "contacts"} onClick={() => setActiveDetailTab("contacts")}>Contacts</button>
                  <button type="button" className={`detail-tab ${activeDetailTab === "activity" ? "active" : ""}`} aria-selected={activeDetailTab === "activity"} onClick={() => setActiveDetailTab("activity")}>Activity</button>
                  <button type="button" className={`detail-tab ${activeDetailTab === "actions" ? "active" : ""}`} aria-selected={activeDetailTab === "actions"} onClick={() => setActiveDetailTab("actions")}>Next Actions</button>
                  <button type="button" className={`detail-tab ${activeDetailTab === "network" ? "active" : ""}`} aria-selected={activeDetailTab === "network"} onClick={() => setActiveDetailTab("network")}>Network</button>
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
                    onSave={(value) => updateDetailDraft({ investmentNotes: value })}
                  />
                </div>

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
                        setContactRoleType(event.target.value as "INVESTOR_PARTNER" | "OTHER")
                      }
                    >
                      <option value="INVESTOR_PARTNER">Investor Partner</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </div>
                  <div>
                    <label>Contact Title</label>
                    <input
                      value={contactTitle}
                      onChange={(event) => setContactTitle(event.target.value)}
                      placeholder="General Partner"
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
                      placeholder="name@firm.com"
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

                {activeDetailTab === "activity" && (
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
                        {relationshipHighlights.latestInteraction
                          ? relationshipHighlights.latestInteraction.subject || relationshipHighlights.latestInteraction.interactionType
                          : "No interactions"}
                      </strong>
                      {relationshipHighlights.latestInteraction && (
                        <p className="muted">{formatDate(relationshipHighlights.latestInteraction.occurredAt)}</p>
                      )}
                    </div>
                    <div>
                      <p className="muted">Next Open Action</p>
                      <strong>{relationshipHighlights.nextOpenAction?.title || "No open next actions"}</strong>
                      {relationshipHighlights.nextOpenAction?.dueAt && (
                        <p className="muted">Due {formatDate(relationshipHighlights.nextOpenAction.dueAt)}</p>
                      )}
                    </div>
                    <div>
                      <p className="muted">Totals</p>
                      <strong>{relationshipHighlights.totalInteractions} interactions</strong>
                    </div>
                    <div>
                      <p className="muted">Open Next Actions</p>
                      <strong>{relationshipHighlights.openActions}</strong>
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
                  <textarea
                    value={newInteractionSummary}
                    onChange={(event) => setNewInteractionSummary(event.target.value)}
                    placeholder="Key notes from this interaction"
                  />
                </div>
                <div className="actions">
                  <button className="secondary" onClick={addInteractionForSelectedRecord} disabled={addingInteraction}>
                    {addingInteraction ? "Adding..." : "Add Interaction"}
                  </button>
                </div>

                {selectedRecord.interactions.length === 0 ? (
                  <p className="muted">No interactions logged yet.</p>
                ) : (
                  selectedRecord.interactions.map((entry) => (
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
                          <textarea
                            value={editingInteractionSummary}
                            onChange={(event) => setEditingInteractionSummary(event.target.value)}
                            placeholder="Summary"
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

                {activeDetailTab === "actions" && (
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
                    <input
                      type="date"
                      value={newActionDueAt}
                      onChange={(event) => setNewActionDueAt(event.target.value)}
                    />
                  </div>
                </div>
                <div className="actions">
                  <button className="secondary" onClick={addNextActionForSelectedRecord} disabled={addingNextAction}>
                    {addingNextAction ? "Adding..." : "Add Next Action"}
                  </button>
                </div>

                {selectedRecord.nextActions.length === 0 ? (
                  <p className="muted">No open next actions yet.</p>
                ) : (
                  selectedRecord.nextActions.map((item) => (
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
                              <input
                                type="date"
                                value={editingNextActionDueAt}
                                onChange={(event) => setEditingNextActionDueAt(event.target.value)}
                              />
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

                {activeDetailTab === "network" && (
                  <>
              <div className="detail-section">
                <p className="detail-label">Co-Investor Partners</p>
                {selectedRecord.partners.length === 0 ? (
                  <p className="muted">No partners captured.</p>
                ) : (
                  selectedRecord.partners.map((partner) => (
                    <div key={partner.id} className="detail-list-item">
                      <strong>{partner.name}</strong>
                      {partner.title ? `, ${partner.title}` : ""}
                      {partner.profileUrl && (
                        <>
                          {" "}-{" "}
                          <a href={partner.profileUrl} target="_blank" rel="noreferrer">
                            profile
                          </a>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div className="detail-section">
                <p className="detail-label">Investments</p>
                {selectedRecord.investments.length === 0 ? (
                  <p className="muted">No investments captured.</p>
                ) : (
                  selectedRecord.investments.map((investment) => (
                    <div key={investment.id} className="detail-list-item">
                      <strong>{investment.portfolioCompanyName}</strong> | Amount: {formatUsd(investment.investmentAmountUsd)}
                      {" | "}
                      Date: {formatDate(investment.investmentDate)}
                      {" | "}
                      Stage: {investment.investmentStage || "-"}
                      {" | "}
                      Lead: {investment.leadPartnerName || "-"}
                      {investment.sourceUrl && (
                        <>
                          {" "}-{" "}
                          <a href={investment.sourceUrl} target="_blank" rel="noreferrer">
                            source
                          </a>
                        </>
                      )}
                    </div>
                  ))
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
