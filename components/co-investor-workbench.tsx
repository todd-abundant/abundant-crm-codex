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
  const [rerunningResearch, setRerunningResearch] = React.useState(false);
  const [savingEdits, setSavingEdits] = React.useState(false);
  const [creatingFromSearch, setCreatingFromSearch] = React.useState(false);
  const [deletingRecordId, setDeletingRecordId] = React.useState<string | null>(null);
  const [searchCandidates, setSearchCandidates] = React.useState<SearchCandidate[]>([]);
  const [candidateSearchQuery, setCandidateSearchQuery] = React.useState("");
  const [searchingCandidates, setSearchingCandidates] = React.useState(false);
  const [searchCandidateError, setSearchCandidateError] = React.useState<string | null>(null);
  const [selectedCandidateIndex, setSelectedCandidateIndex] = React.useState(-1);
  const [status, setStatus] = React.useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [keepListView, setKeepListView] = React.useState(false);
  const [newIsSeedInvestor, setNewIsSeedInvestor] = React.useState(false);
  const [newIsSeriesAInvestor, setNewIsSeriesAInvestor] = React.useState(false);

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

  const shouldOfferCreate = query.trim().length >= 2 && filteredRecords.length === 0;
  const selectedCandidate =
    selectedCandidateIndex >= 0 && selectedCandidateIndex < searchCandidates.length
      ? searchCandidates[selectedCandidateIndex]
      : null;

  const createButtonDisabled =
    creatingFromSearch ||
    searchingCandidates ||
    (searchCandidates.length > 1 && selectedCandidate === null);

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

  async function searchCandidateMatches(term: string): Promise<SearchCandidate[]> {
    const searchRes = await fetch("/api/co-investors/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: term })
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
      if (candidateSearchQuery !== term || candidates.length === 0) {
        candidates = await searchCandidateMatches(term);
        setSearchCandidates(candidates);
        setCandidateSearchQuery(term);

        if (candidates.length === 1) {
          setSelectedCandidateIndex(0);
        } else {
          setSelectedCandidateIndex(candidates.length > 1 ? -1 : -1);
        }
      }

      if (candidates.length > 1 && selectedCandidateIndex < 0) {
        throw new Error("Select one matching co-investor before creating.");
      }

      const candidate =
        candidates.length > 0
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

  async function saveSelectedRecordEdits() {
    if (!selectedRecord || !detailDraft) return;

    setSavingEdits(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: detailDraft.name,
          legalName: detailDraft.legalName,
          website: detailDraft.website,
          headquartersCity: detailDraft.headquartersCity,
          headquartersState: detailDraft.headquartersState,
          headquartersCountry: detailDraft.headquartersCountry,
          isSeedInvestor: detailDraft.isSeedInvestor,
          isSeriesAInvestor: detailDraft.isSeriesAInvestor,
          investmentNotes: detailDraft.investmentNotes,
          researchNotes: detailDraft.researchNotes
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
    } finally {
      setSavingEdits(false);
    }
  }

  async function rerunResearchForSelectedRecord() {
    if (!selectedRecord) return;

    setRerunningResearch(true);
    setStatus(null);

    try {
      const res = await fetch(`/api/co-investors/${selectedRecord.id}/rerun-research`, {
        method: "POST"
      });

      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to re-run research");

      setStatus({ kind: "ok", text: `Queued research rerun for ${selectedRecord.name}.` });
      await loadRecords();
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to re-run research"
      });
    } finally {
      setRerunningResearch(false);
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
        setSearchCandidateError(
          error instanceof Error ? error.message : "Failed to search co-investors."
        );
      } finally {
        if (active) setSearchingCandidates(false);
      }
    }, 300);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [shouldOfferCreate, query]);

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
      return;
    }

    if (selectedRecord.id !== draftRecordId) {
      setDetailDraft(draftFromRecord(selectedRecord));
      setDraftRecordId(selectedRecord.id);
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
              setKeepListView(false);
              setQuery(event.target.value);
            }}
          />

          {shouldOfferCreate && (
            <div className="create-card">
              <p className="create-title">No co-investors match "{query.trim()}"</p>
              <p className="muted">Create a new co-investor and launch the research agent?</p>

              <div className="row">
                <label>
                  <input
                    type="checkbox"
                    checked={newIsSeedInvestor}
                    onChange={(event) => setNewIsSeedInvestor(event.target.checked)}
                  />
                  Seed Stage Investor
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={newIsSeriesAInvestor}
                    onChange={(event) => setNewIsSeriesAInvestor(event.target.checked)}
                  />
                  Series A Investor
                </label>
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
                  title={
                    searchCandidates.length > 1 && selectedCandidate === null
                      ? "Select a match before creating"
                      : undefined
                  }
                >
                  {createButtonDisabled ? (searchingCandidates ? "Checking matches..." : "Select a match") : "Create + Start Research"}
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
                    <span className={`status-pill ${statusClass(record.researchStatus)}`}>
                      {record.researchStatus}
                    </span>
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
                <span className={`status-pill ${statusClass(selectedRecord.researchStatus)}`}>
                  {selectedRecord.researchStatus}
                </span>
              </div>

              <div className="actions">
                <button className="primary" onClick={saveSelectedRecordEdits} disabled={savingEdits}>
                  {savingEdits ? "Saving..." : "Save Changes"}
                </button>
                <button className="secondary" onClick={rerunResearchForSelectedRecord} disabled={rerunningResearch}>
                  {rerunningResearch ? "Queueing..." : "Re-run Research"}
                </button>
              </div>

              <div className="detail-grid">
                <div>
                  <label>Name</label>
                  <input
                    value={detailDraft.name}
                    onChange={(event) => setDetailDraft({ ...detailDraft, name: event.target.value })}
                  />
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
                  <input
                    value={detailDraft.website}
                    onChange={(event) => setDetailDraft({ ...detailDraft, website: event.target.value })}
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
                  <label>Seed Investor</label>
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={detailDraft.isSeedInvestor}
                      onChange={(event) =>
                        setDetailDraft({ ...detailDraft, isSeedInvestor: event.target.checked })
                      }
                    />
                    Seed
                  </label>
                </div>
                <div>
                  <label>Series A Investor</label>
                  <label className="chip">
                    <input
                      type="checkbox"
                      checked={detailDraft.isSeriesAInvestor}
                      onChange={(event) =>
                        setDetailDraft({ ...detailDraft, isSeriesAInvestor: event.target.checked })
                      }
                    />
                    Series A
                  </label>
                </div>
              </div>

              <div className="detail-section">
                <label>Investment Notes</label>
                <textarea
                  value={detailDraft.investmentNotes}
                  onChange={(event) => setDetailDraft({ ...detailDraft, investmentNotes: event.target.value })}
                />
              </div>

              <div className="detail-section">
                <label>Research Notes</label>
                <textarea
                  value={detailDraft.researchNotes}
                  onChange={(event) => setDetailDraft({ ...detailDraft, researchNotes: event.target.value })}
                />
              </div>

              {selectedRecord.researchError && (
                <div className="detail-section">
                  <p className="detail-label">Research Error</p>
                  <p>{selectedRecord.researchError}</p>
                </div>
              )}

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
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
