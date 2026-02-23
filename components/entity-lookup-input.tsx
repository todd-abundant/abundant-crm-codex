"use client";

import * as React from "react";

type EntityKind = "HEALTH_SYSTEM" | "COMPANY" | "CO_INVESTOR" | "CONTACT";

type EntityOption = {
  id: string;
  name: string;
  subtitle?: string | null;
};

type SearchCandidate = {
  name: string;
  website?: string;
  headquartersCity?: string;
  headquartersState?: string;
  headquartersCountry?: string;
  summary?: string;
  sourceUrls?: string[];
};

type CompanyCreateDefaults = {
  companyType?: string;
  primaryCategory?: string;
  primaryCategoryOther?: string;
  leadSourceType?: "HEALTH_SYSTEM" | "OTHER";
  leadSourceHealthSystemId?: string | null;
  leadSourceOther?: string;
};

type ContactCreateContext = {
  parentType: "company" | "healthSystem" | "coInvestor";
  parentId: string;
  roleType?: "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "COMPANY_CONTACT" | "OTHER";
};

type EntityLookupInputProps = {
  entityKind: EntityKind;
  value: string;
  onChange: (nextValue: string) => void;
  initialOptions?: EntityOption[];
  placeholder?: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  onEntityCreated?: (option: EntityOption) => void;
  companyCreateDefaults?: CompanyCreateDefaults;
  contactCreateContext?: ContactCreateContext;
  contactSearchHealthSystemId?: string;
  autoOpenCreateOnEnterNoMatch?: boolean;
};

const entityKindLabel: Record<EntityKind, string> = {
  HEALTH_SYSTEM: "health system",
  COMPANY: "company",
  CO_INVESTOR: "co-investor",
  CONTACT: "contact"
};

function normalizeForCompare(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function formatCandidateLocation(candidate: SearchCandidate) {
  return [candidate.headquartersCity, candidate.headquartersState, candidate.headquartersCountry]
    .filter(Boolean)
    .join(", ");
}

function toEntitySearchResultList(payload: unknown): EntityOption[] {
  const list = (payload as { results?: unknown[] })?.results;
  if (!Array.isArray(list)) return [];
  const results: EntityOption[] = [];
  for (const entry of list) {
    const typed = entry as { id?: unknown; name?: unknown; subtitle?: unknown };
    if (typeof typed.id !== "string" || typeof typed.name !== "string") continue;
    results.push({
      id: typed.id,
      name: typed.name,
      subtitle: typeof typed.subtitle === "string" ? typed.subtitle : null
    });
  }
  return results;
}

function buildFallbackCandidate(name: string, manual: {
  website: string;
  headquartersCity: string;
  headquartersState: string;
  headquartersCountry: string;
}): SearchCandidate {
  return {
    name,
    website: manual.website,
    headquartersCity: manual.headquartersCity,
    headquartersState: manual.headquartersState,
    headquartersCountry: manual.headquartersCountry,
    summary: "Created from manual entry.",
    sourceUrls: []
  };
}

function webSearchEndpointForKind(entityKind: EntityKind) {
  if (entityKind === "HEALTH_SYSTEM") return "/api/health-systems/search";
  if (entityKind === "COMPANY") return "/api/companies/search";
  if (entityKind === "CO_INVESTOR") return "/api/co-investors/search";
  return null;
}

function verifyEndpointForKind(entityKind: EntityKind) {
  if (entityKind === "HEALTH_SYSTEM") return "/api/health-systems/verify";
  if (entityKind === "COMPANY") return "/api/companies/verify";
  if (entityKind === "CO_INVESTOR") return "/api/co-investors/verify";
  return null;
}

function contactEndpointForContext(context: ContactCreateContext) {
  if (context.parentType === "company") return `/api/companies/${context.parentId}/contacts`;
  if (context.parentType === "healthSystem") return `/api/health-systems/${context.parentId}/contacts`;
  return `/api/co-investors/${context.parentId}/contacts`;
}

export function EntityLookupInput({
  entityKind,
  value,
  onChange,
  initialOptions = [],
  placeholder,
  emptyLabel = "No selection",
  allowEmpty = false,
  disabled = false,
  className,
  onEntityCreated,
  companyCreateDefaults,
  contactCreateContext,
  contactSearchHealthSystemId,
  autoOpenCreateOnEnterNoMatch = false
}: EntityLookupInputProps) {
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [searchError, setSearchError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<EntityOption[]>([]);
  const [createdOptions, setCreatedOptions] = React.useState<EntityOption[]>([]);

  const [addOpen, setAddOpen] = React.useState(false);
  const [addMode, setAddMode] = React.useState<"WEB" | "MANUAL">("WEB");
  const [addName, setAddName] = React.useState("");
  const [addWebsite, setAddWebsite] = React.useState("");
  const [addCity, setAddCity] = React.useState("");
  const [addState, setAddState] = React.useState("");
  const [addCountry, setAddCountry] = React.useState("");
  const [addTitle, setAddTitle] = React.useState("");
  const [addRelationshipTitle, setAddRelationshipTitle] = React.useState("");
  const [addEmail, setAddEmail] = React.useState("");
  const [addPhone, setAddPhone] = React.useState("");
  const [addLinkedin, setAddLinkedin] = React.useState("");
  const [webCandidates, setWebCandidates] = React.useState<SearchCandidate[]>([]);
  const [selectedWebCandidateIndex, setSelectedWebCandidateIndex] = React.useState(0);
  const [searchingWeb, setSearchingWeb] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const lastSyncedValueRef = React.useRef<string>(value);

  const supportsWebLookup = entityKind !== "CONTACT";

  const allKnownOptions = React.useMemo(() => {
    const map = new Map<string, EntityOption>();
    for (const item of initialOptions) map.set(item.id, item);
    for (const item of createdOptions) map.set(item.id, item);
    for (const item of results) map.set(item.id, item);
    return map;
  }, [initialOptions, createdOptions, results]);

  const selectedOption = value ? allKnownOptions.get(value) || null : null;

  React.useEffect(() => {
    function onDocumentMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", onDocumentMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocumentMouseDown);
    };
  }, []);

  React.useEffect(() => {
    if (value === lastSyncedValueRef.current) return;
    lastSyncedValueRef.current = value;
    if (!value) {
      setQuery("");
      return;
    }

    const label = allKnownOptions.get(value)?.name;
    if (label) {
      setQuery(label);
    }
  }, [value, allKnownOptions]);

  async function runEntitySearch(term: string, limit = 12): Promise<EntityOption[]> {
    const body: Record<string, unknown> = {
      entityType: entityKind,
      query: term,
      limit
    };
    if (entityKind === "CONTACT" && contactSearchHealthSystemId) {
      body.healthSystemId = contactSearchHealthSystemId;
    }

    const res = await fetch("/api/entity-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((payload as { error?: string }).error || `Failed to search ${entityKindLabel[entityKind]}s.`);
    }
    return toEntitySearchResultList(payload);
  }

  React.useEffect(() => {
    if (!open || disabled) return;

    const term = query.trim();
    if (!term) {
      setLoading(false);
      setSearchError(null);
      setResults(initialOptions.slice(0, 12));
      return;
    }

    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setSearchError(null);
      try {
        const res = await fetch("/api/entity-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            entityType: entityKind,
            query: term,
            limit: 12,
            ...(entityKind === "CONTACT" && contactSearchHealthSystemId
              ? { healthSystemId: contactSearchHealthSystemId }
              : {})
          })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((payload as { error?: string }).error || `Failed to search ${entityKindLabel[entityKind]}s.`);
        }
        if (!active) return;
        setResults(toEntitySearchResultList(payload));
      } catch (error) {
        if (!active) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setSearchError(
          error instanceof Error ? error.message : `Failed to search ${entityKindLabel[entityKind]}s.`
        );
      } finally {
        if (active) setLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [open, query, disabled, entityKind, initialOptions, contactSearchHealthSystemId]);

  function selectOption(option: EntityOption) {
    onChange(option.id);
    setQuery(option.name);
    setOpen(false);
    setSearchError(null);
  }

  function openAddModal() {
    const seedName = query.trim() || selectedOption?.name || "";
    setAddOpen(true);
    setAddMode(supportsWebLookup ? "WEB" : "MANUAL");
    setAddError(null);
    setAddName(seedName);
    setAddWebsite("");
    setAddCity("");
    setAddState("");
    setAddCountry("");
    setAddTitle("");
    setAddRelationshipTitle("");
    setAddEmail("");
    setAddPhone("");
    setAddLinkedin("");
    setWebCandidates([]);
    setSelectedWebCandidateIndex(0);
  }

  async function lookupWebCandidates() {
    const searchEndpoint = webSearchEndpointForKind(entityKind);
    if (!searchEndpoint) return;

    const term = addName.trim();
    if (term.length < 2) {
      setAddError(`Enter at least 2 characters to search ${entityKindLabel[entityKind]}s.`);
      return;
    }

    setSearchingWeb(true);
    setAddError(null);
    try {
      const res = await fetch(searchEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: term })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((payload as { error?: string }).error || "Failed to search the web.");
      }

      const candidates = Array.isArray((payload as { candidates?: unknown[] }).candidates)
        ? ((payload as { candidates: SearchCandidate[] }).candidates || [])
        : [];
      setWebCandidates(candidates);
      setSelectedWebCandidateIndex(0);
      if (candidates.length === 0) {
        setAddError("No web matches found. You can still create manually.");
      }
    } catch (error) {
      setWebCandidates([]);
      setAddError(error instanceof Error ? error.message : "Failed to search the web.");
    } finally {
      setSearchingWeb(false);
    }
  }

  function defaultContactRoleTypeFromContext(context: ContactCreateContext) {
    if (context.roleType) return context.roleType;
    if (context.parentType === "company") return "COMPANY_CONTACT" as const;
    if (context.parentType === "coInvestor") return "INVESTOR_PARTNER" as const;
    return "EXECUTIVE" as const;
  }

  async function createEntity(): Promise<EntityOption> {
    if (entityKind === "CONTACT") {
      if (!contactCreateContext?.parentId) {
        throw new Error("Missing contact create context.");
      }

      const endpoint = contactEndpointForContext(contactCreateContext);
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          title: addTitle || undefined,
          relationshipTitle: addRelationshipTitle || undefined,
          email: addEmail || undefined,
          phone: addPhone || undefined,
          linkedinUrl: addLinkedin || undefined,
          roleType: defaultContactRoleTypeFromContext(contactCreateContext)
        })
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((payload as { error?: string }).error || "Failed to add contact.");
      }

      const contact = (payload as { contact?: { id?: string; name?: string; title?: string | null } }).contact;
      if (!contact?.id || !contact?.name) {
        throw new Error("Contact was created but the response was incomplete.");
      }

      return {
        id: contact.id,
        name: contact.name,
        subtitle: contact.title || null
      };
    }

    const verifyEndpoint = verifyEndpointForKind(entityKind);
    if (!verifyEndpoint) {
      throw new Error(`Unsupported entity type ${entityKind}.`);
    }

    const manualCandidate = buildFallbackCandidate(addName.trim(), {
      website: addWebsite.trim(),
      headquartersCity: addCity.trim(),
      headquartersState: addState.trim(),
      headquartersCountry: addCountry.trim()
    });

    let candidate: SearchCandidate = manualCandidate;
    if (addMode === "WEB") {
      let candidates = webCandidates;
      if (candidates.length === 0) {
        const searchEndpoint = webSearchEndpointForKind(entityKind);
        if (!searchEndpoint) {
          throw new Error(`Web lookup is unavailable for ${entityKindLabel[entityKind]}.`);
        }
        const res = await fetch(searchEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: addName.trim() })
        });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error((payload as { error?: string }).error || "Failed to search the web.");
        }
        candidates = Array.isArray((payload as { candidates?: unknown[] }).candidates)
          ? ((payload as { candidates: SearchCandidate[] }).candidates || [])
          : [];
      }

      if (candidates.length > 0) {
        const idx = Math.min(Math.max(selectedWebCandidateIndex, 0), candidates.length - 1);
        candidate = candidates[idx];
      }
    }

    const body: Record<string, unknown> = {};
    if (entityKind === "HEALTH_SYSTEM") {
      body.candidate = candidate;
      body.isAllianceMember = false;
      body.isLimitedPartner = false;
    } else if (entityKind === "CO_INVESTOR") {
      body.candidate = candidate;
      body.isSeedInvestor = false;
      body.isSeriesAInvestor = false;
    } else {
      body.candidate = candidate;
      body.companyType = companyCreateDefaults?.companyType || "STARTUP";
      body.primaryCategory = companyCreateDefaults?.primaryCategory || "OTHER";
      body.primaryCategoryOther = companyCreateDefaults?.primaryCategoryOther;
      body.leadSourceType = companyCreateDefaults?.leadSourceType || "OTHER";
      body.leadSourceHealthSystemId = companyCreateDefaults?.leadSourceHealthSystemId || null;
      body.leadSourceOther = companyCreateDefaults?.leadSourceOther || "Created from lookup";
    }

    const res = await fetch(verifyEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));

    if (!res.ok) {
      if (res.status === 409) {
        const existing = await runEntitySearch(addName.trim(), 5);
        const exact = existing.find(
          (entry) => normalizeForCompare(entry.name) === normalizeForCompare(addName)
        );
        if (exact) {
          return exact;
        }
        if (existing.length > 0) {
          return existing[0];
        }
      }
      throw new Error((payload as { error?: string }).error || `Failed to add ${entityKindLabel[entityKind]}.`);
    }

    if (entityKind === "HEALTH_SYSTEM") {
      const healthSystem = (payload as { healthSystem?: { id?: string; name?: string } }).healthSystem;
      if (!healthSystem?.id || !healthSystem?.name) {
        throw new Error("Health system was created but the response was incomplete.");
      }
      return { id: healthSystem.id, name: healthSystem.name };
    }

    if (entityKind === "CO_INVESTOR") {
      const coInvestor = (payload as { coInvestor?: { id?: string; name?: string } }).coInvestor;
      if (!coInvestor?.id || !coInvestor?.name) {
        throw new Error("Co-investor was created but the response was incomplete.");
      }
      return { id: coInvestor.id, name: coInvestor.name };
    }

    const company = (payload as { company?: { id?: string; name?: string } }).company;
    if (!company?.id || !company?.name) {
      throw new Error("Company was created but the response was incomplete.");
    }
    return { id: company.id, name: company.name };
  }

  async function submitAdd() {
    const name = addName.trim();
    if (!name) {
      setAddError(`Enter a ${entityKindLabel[entityKind]} name.`);
      return;
    }

    setAdding(true);
    setAddError(null);

    try {
      const created = await createEntity();
      setCreatedOptions((current) => {
        if (current.some((entry) => entry.id === created.id)) return current;
        return [created, ...current];
      });
      onEntityCreated?.(created);
      onChange(created.id);
      setQuery(created.name);
      setSearchError(null);
      setOpen(false);
      setAddOpen(false);
    } catch (error) {
      setAddError(
        error instanceof Error ? error.message : `Failed to add ${entityKindLabel[entityKind]}.`
      );
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className={`entity-lookup ${className || ""}`} ref={containerRef}>
      <div className="entity-lookup-controls">
        <input
          value={query}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              autoOpenCreateOnEnterNoMatch &&
              !loading &&
              open &&
              query.trim() &&
              results.length === 0
            ) {
              event.preventDefault();
              openAddModal();
            }
          }}
          onChange={(event) => {
            const nextValue = event.target.value;
            setQuery(nextValue);
            setOpen(true);
            if (value && normalizeForCompare(nextValue) !== normalizeForCompare(selectedOption?.name)) {
              onChange("");
            }
          }}
          placeholder={placeholder || `Search ${entityKindLabel[entityKind]}s`}
          disabled={disabled}
        />
        {allowEmpty && value ? (
          <button
            type="button"
            className="ghost small"
            onClick={() => {
              onChange("");
              setQuery("");
              setOpen(false);
            }}
            disabled={disabled}
          >
            Clear
          </button>
        ) : null}
        <button type="button" className="secondary small" onClick={openAddModal} disabled={disabled}>
          Add New
        </button>
      </div>

      {allowEmpty && !value && !query.trim() ? <p className="muted entity-lookup-meta">{emptyLabel}</p> : null}

      {open ? (
        <div className="entity-lookup-results">
          {loading ? <p className="muted">Searching…</p> : null}
          {searchError ? <p className="status error">{searchError}</p> : null}
          {!loading && !searchError && results.length === 0 ? (
            <p className="muted">No matching {entityKindLabel[entityKind]} found.</p>
          ) : null}
          {!loading && !searchError
            ? results.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={`entity-lookup-option ${value === option.id ? "active" : ""}`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectOption(option)}
                >
                  <span className="entity-lookup-option-name">{option.name}</span>
                  {option.subtitle ? <span className="entity-lookup-option-subtitle">{option.subtitle}</span> : null}
                </button>
              ))
            : null}
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="entity-add-backdrop"
          onMouseDown={() => {
            if (!adding) setAddOpen(false);
          }}
        >
          <div className="entity-add-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="entity-add-header">
              <div>
                <h3>Add {entityKindLabel[entityKind]}</h3>
                <p className="muted">Select lookup mode, then save to link it to this field.</p>
              </div>
              <button
                type="button"
                className="ghost small"
                onClick={() => setAddOpen(false)}
                disabled={adding}
                aria-label="Close add dialog"
              >
                Close
              </button>
            </header>

            {supportsWebLookup ? (
              <div className="toggle-row">
                <button
                  type="button"
                  className={`toggle-chip ${addMode === "WEB" ? "active" : ""}`}
                  onClick={() => setAddMode("WEB")}
                  disabled={adding}
                >
                  Use Web Research
                </button>
                <button
                  type="button"
                  className={`toggle-chip ${addMode === "MANUAL" ? "active" : ""}`}
                  onClick={() => setAddMode("MANUAL")}
                  disabled={adding}
                >
                  Create Manually
                </button>
              </div>
            ) : null}

            <div className="detail-grid">
              <div>
                <label>Name</label>
                <input
                  value={addName}
                  onChange={(event) => setAddName(event.target.value)}
                  placeholder={`Enter ${entityKindLabel[entityKind]} name`}
                />
              </div>

              {entityKind === "CONTACT" ? (
                <div>
                  <label>Title</label>
                  <input
                    value={addTitle}
                    onChange={(event) => setAddTitle(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              ) : null}
            </div>

            {entityKind === "CONTACT" ? (
              <div className="detail-grid">
                <div>
                  <label>Relationship Title</label>
                  <input
                    value={addRelationshipTitle}
                    onChange={(event) => setAddRelationshipTitle(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label>Email</label>
                  <input
                    value={addEmail}
                    onChange={(event) => setAddEmail(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label>Phone</label>
                  <input
                    value={addPhone}
                    onChange={(event) => setAddPhone(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label>LinkedIn URL</label>
                  <input
                    value={addLinkedin}
                    onChange={(event) => setAddLinkedin(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            ) : null}

            {entityKind !== "CONTACT" && addMode === "MANUAL" ? (
              <div className="detail-grid">
                <div>
                  <label>Website</label>
                  <input
                    value={addWebsite}
                    onChange={(event) => setAddWebsite(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label>HQ City</label>
                  <input
                    value={addCity}
                    onChange={(event) => setAddCity(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label>HQ State</label>
                  <input
                    value={addState}
                    onChange={(event) => setAddState(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
                <div>
                  <label>HQ Country</label>
                  <input
                    value={addCountry}
                    onChange={(event) => setAddCountry(event.target.value)}
                    placeholder="Optional"
                  />
                </div>
              </div>
            ) : null}

            {entityKind !== "CONTACT" && addMode === "WEB" ? (
              <div className="detail-section">
                <div className="actions" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => void lookupWebCandidates()}
                    disabled={searchingWeb || adding || addName.trim().length < 2}
                  >
                    {searchingWeb ? "Searching..." : "Find Web Matches"}
                  </button>
                </div>
                {webCandidates.length > 0 ? (
                  <div className="candidate-list candidate-list-modal">
                    {webCandidates.map((candidate, index) => (
                      <label
                        key={`${candidate.name}-${index}`}
                        className={`candidate-option ${selectedWebCandidateIndex === index ? "selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="entity-web-candidate"
                          checked={selectedWebCandidateIndex === index}
                          onChange={() => setSelectedWebCandidateIndex(index)}
                        />
                        <div className="candidate-body">
                          <strong className="candidate-name">{candidate.name}</strong>
                          {formatCandidateLocation(candidate) ? (
                            <p className="muted">{formatCandidateLocation(candidate)}</p>
                          ) : null}
                          {candidate.website ? <p className="muted">{candidate.website}</p> : null}
                        </div>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="muted">No web candidate selected yet. You can still submit and use the typed name.</p>
                )}
              </div>
            ) : null}

            {addError ? <p className="status error">{addError}</p> : null}

            <div className="actions">
              <button type="button" className="ghost" onClick={() => setAddOpen(false)} disabled={adding}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={() => void submitAdd()} disabled={adding}>
                {adding
                  ? "Adding..."
                  : entityKind === "CONTACT"
                    ? "Add Contact"
                    : addMode === "WEB"
                      ? "Add + Queue Research"
                      : "Create"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
