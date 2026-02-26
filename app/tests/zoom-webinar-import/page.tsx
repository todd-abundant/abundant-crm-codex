"use client";

import * as React from "react";

type CompanyOption = {
  id: string;
  name: string;
};

type HealthSystemOption = {
  id: string;
  name: string;
  website: string | null;
};

type DomainOverride = {
  domain: string;
  healthSystemId: string;
};

type ImportResult = {
  dryRun: boolean;
  company: {
    id: string;
    name: string;
  };
  webinar: {
    id: string;
    title: string;
    startTime: string | null;
  };
  screeningEvent: {
    id: string;
    title: string;
    type: "WEBINAR";
    scheduledAt: string | null;
    completedAt: string | null;
  } | null;
  summary: {
    participantsFetched: number;
    registrantsFetched: number;
    registrantsAvailable: boolean;
    dedupedAttendees: number;
    matchedAttendees: number;
    unresolvedAttendees: number;
    importedAttendees: number;
    failedImports: number;
  };
  warnings: string[];
  matched: Array<{
    attendeeName: string;
    attendeeEmail: string | null;
    organization: string | null;
    title: string | null;
    joinTime: string | null;
    leaveTime: string | null;
    durationMinutes: number | null;
    healthSystemId: string;
    healthSystemName: string;
    healthSystemStrategy: string;
    healthSystemConfidence: number;
    existingContactId: string | null;
    existingContactName: string | null;
  }>;
  unresolved: Array<{
    name: string;
    email: string | null;
    organization: string | null;
    reason: string;
  }>;
  imported: Array<{
    attendeeName: string;
    attendeeEmail: string | null;
    healthSystemName: string;
    participantId: string;
    contactId: string;
    contactName: string;
    contactResolution: {
      matchedBy: "created" | "email" | "linkedin" | "name";
      confidence: number;
      wasCreated: boolean;
    };
  }>;
  importErrors: Array<{
    attendeeName: string;
    attendeeEmail: string | null;
    reason: string;
  }>;
};

type StatusState =
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string }
  | { kind: "info"; text: string }
  | null;

function uniqueOverrides(overrides: DomainOverride[]) {
  const seen = new Set<string>();
  const deduped: DomainOverride[] = [];
  for (const entry of overrides) {
    const normalizedDomain = entry.domain.trim().toLowerCase();
    if (!normalizedDomain || !entry.healthSystemId) continue;
    const key = `${normalizedDomain}:${entry.healthSystemId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ domain: normalizedDomain, healthSystemId: entry.healthSystemId });
  }
  return deduped;
}

function formatDateTime(value: string | null) {
  if (!value) return "N/A";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export default function ZoomWebinarImportTestPage() {
  const [loadingOptions, setLoadingOptions] = React.useState(true);
  const [companies, setCompanies] = React.useState<CompanyOption[]>([]);
  const [healthSystems, setHealthSystems] = React.useState<HealthSystemOption[]>([]);

  const [companyId, setCompanyId] = React.useState("");
  const [webinarId, setWebinarId] = React.useState("");
  const [webinarTitleOverride, setWebinarTitleOverride] = React.useState("");
  const [fallbackHealthSystemId, setFallbackHealthSystemId] = React.useState("");
  const [dryRun, setDryRun] = React.useState(true);

  const [pendingDomain, setPendingDomain] = React.useState("");
  const [pendingDomainHealthSystemId, setPendingDomainHealthSystemId] = React.useState("");
  const [domainOverrides, setDomainOverrides] = React.useState<DomainOverride[]>([]);

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState<StatusState>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function loadOptions() {
      setLoadingOptions(true);
      try {
        const res = await fetch("/api/tests/zoom-webinars/options", { cache: "no-store" });
        const payload = (await res.json()) as {
          companies?: CompanyOption[];
          healthSystems?: HealthSystemOption[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load options.");
        }

        if (cancelled) return;
        const companyOptions = Array.isArray(payload.companies) ? payload.companies : [];
        const healthSystemOptions = Array.isArray(payload.healthSystems) ? payload.healthSystems : [];

        setCompanies(companyOptions);
        setHealthSystems(healthSystemOptions);
        setCompanyId((current) => current || companyOptions[0]?.id || "");
      } catch (error) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load options."
        });
      } finally {
        if (!cancelled) {
          setLoadingOptions(false);
        }
      }
    }

    loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  const healthSystemNameById = React.useMemo(() => {
    return new Map(healthSystems.map((entry) => [entry.id, entry.name]));
  }, [healthSystems]);

  function addDomainOverride() {
    const domain = pendingDomain.trim().toLowerCase();
    if (!domain || !pendingDomainHealthSystemId) {
      setStatus({ kind: "error", text: "Choose a domain and alliance health system before adding." });
      return;
    }

    setDomainOverrides((current) =>
      uniqueOverrides([...current, { domain, healthSystemId: pendingDomainHealthSystemId }])
    );
    setPendingDomain("");
    setPendingDomainHealthSystemId("");
    setStatus(null);
  }

  function removeDomainOverride(index: number) {
    setDomainOverrides((current) => current.filter((_, idx) => idx !== index));
  }

  async function runImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) {
      setStatus({ kind: "error", text: "Select a company first." });
      return;
    }
    if (!webinarId.trim()) {
      setStatus({ kind: "error", text: "Webinar ID is required." });
      return;
    }

    setRunning(true);
    setStatus({ kind: "info", text: dryRun ? "Running preview..." : "Importing attendees..." });
    setResult(null);

    try {
      const res = await fetch("/api/tests/zoom-webinars/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          webinarId: webinarId.trim(),
          webinarTitleOverride: webinarTitleOverride.trim() || undefined,
          fallbackHealthSystemId: fallbackHealthSystemId || undefined,
          dryRun,
          domainOverrides
        })
      });

      const payload = (await res.json()) as ImportResult & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "Failed to run Zoom webinar import.");
      }

      setResult(payload);
      if (dryRun) {
        setStatus({
          kind: "ok",
          text: `Preview complete. ${payload.summary.matchedAttendees} matched, ${payload.summary.unresolvedAttendees} unresolved.`
        });
      } else {
        setStatus({
          kind: payload.summary.failedImports > 0 ? "info" : "ok",
          text:
            payload.summary.failedImports > 0
              ? `Import completed with issues. Imported ${payload.summary.importedAttendees}, failed ${payload.summary.failedImports}.`
              : `Import completed. Imported ${payload.summary.importedAttendees} attendees.`
        });
      }
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Failed to run Zoom webinar import."
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <h1>Zoom Webinar Import (MVP)</h1>
        <p>
          Pull attendees from a past Zoom webinar, auto-match health systems and contacts, then preview or import
          into screening participants.
        </p>
      </section>

      <section className="panel">
        <h2>Run Import</h2>
        <p className="muted">
          If webinar registration was not enabled, this tool still imports attendees from Zoom participant report.
          Registrant data will be used when available.
        </p>

        <form onSubmit={runImport}>
          <div className="row">
            <div>
              <label htmlFor="zoom-import-company">Company</label>
              <select
                id="zoom-import-company"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                disabled={loadingOptions || running}
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="zoom-import-webinar-id">Webinar ID or UUID</label>
              <input
                id="zoom-import-webinar-id"
                value={webinarId}
                onChange={(event) => setWebinarId(event.target.value)}
                placeholder="e.g. 12345678901"
                disabled={running}
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label htmlFor="zoom-import-title-override">Webinar Title Override (optional)</label>
              <input
                id="zoom-import-title-override"
                value={webinarTitleOverride}
                onChange={(event) => setWebinarTitleOverride(event.target.value)}
                placeholder="Optional custom screening event title"
                disabled={running}
              />
            </div>
            <div>
              <label htmlFor="zoom-import-fallback-health-system">Fallback Health System (optional)</label>
              <select
                id="zoom-import-fallback-health-system"
                value={fallbackHealthSystemId}
                onChange={(event) => setFallbackHealthSystemId(event.target.value)}
                disabled={loadingOptions || running}
              >
                <option value="">None</option>
                {healthSystems.map((healthSystem) => (
                  <option key={healthSystem.id} value={healthSystem.id}>
                    {healthSystem.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="create-card">
            <p className="create-title">Domain Overrides (optional)</p>
            <p className="muted">
              Use this when attendee email domains do not match health system websites.
            </p>
            <div className="row">
              <div>
                <label htmlFor="zoom-import-domain">Email domain</label>
                <input
                  id="zoom-import-domain"
                  value={pendingDomain}
                  onChange={(event) => setPendingDomain(event.target.value)}
                  placeholder="examplehealth.org"
                  disabled={running}
                />
              </div>
              <div>
                <label htmlFor="zoom-import-domain-health-system">Alliance health system</label>
                <select
                  id="zoom-import-domain-health-system"
                  value={pendingDomainHealthSystemId}
                  onChange={(event) => setPendingDomainHealthSystemId(event.target.value)}
                  disabled={loadingOptions || running}
                >
                  <option value="">Select health system</option>
                  {healthSystems.map((healthSystem) => (
                    <option key={healthSystem.id} value={healthSystem.id}>
                      {healthSystem.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="actions">
              <button className="secondary" type="button" onClick={addDomainOverride} disabled={running}>
                Add domain override
              </button>
            </div>

            {domainOverrides.length > 0 ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Domain</th>
                      <th>Health System</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {domainOverrides.map((entry, index) => (
                      <tr key={`${entry.domain}:${entry.healthSystemId}:${index}`}>
                        <td>{entry.domain}</td>
                        <td>{healthSystemNameById.get(entry.healthSystemId) || entry.healthSystemId}</td>
                        <td>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => removeDomainOverride(index)}
                            disabled={running}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="chip-row">
            <label className="chip">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(event) => setDryRun(event.target.checked)}
                disabled={running}
              />
              Preview only (no database writes)
            </label>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={running || loadingOptions}>
              {running ? "Running..." : dryRun ? "Run Preview" : "Import Attendees"}
            </button>
          </div>
        </form>

        {status ? <p className={`status ${status.kind === "error" ? "error" : status.kind === "ok" ? "ok" : ""}`}>{status.text}</p> : null}
      </section>

      {result ? (
        <>
          <section className="panel">
            <h2>Summary</h2>
            <p className="muted">
              Webinar: <strong>{result.webinar.title}</strong> ({result.webinar.id})<br />
              Company: <strong>{result.company.name}</strong><br />
              Webinar start: <strong>{formatDateTime(result.webinar.startTime)}</strong>
            </p>

            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <th>Zoom participants fetched</th>
                    <td>{result.summary.participantsFetched}</td>
                  </tr>
                  <tr>
                    <th>Zoom registrants fetched</th>
                    <td>{result.summary.registrantsFetched}</td>
                  </tr>
                  <tr>
                    <th>Registrant data available</th>
                    <td>{result.summary.registrantsAvailable ? "Yes" : "No"}</td>
                  </tr>
                  <tr>
                    <th>Matched attendees</th>
                    <td>{result.summary.matchedAttendees}</td>
                  </tr>
                  <tr>
                    <th>Unresolved attendees</th>
                    <td>{result.summary.unresolvedAttendees}</td>
                  </tr>
                  <tr>
                    <th>Imported attendees</th>
                    <td>{result.summary.importedAttendees}</td>
                  </tr>
                  <tr>
                    <th>Failed imports</th>
                    <td>{result.summary.failedImports}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {result.warnings.length > 0 ? (
              <div className="create-card">
                <p className="create-title">Warnings</p>
                {result.warnings.map((warning, index) => (
                  <p key={`${warning}-${index}`} className="muted">
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}
          </section>

          {result.matched.length > 0 ? (
            <section className="panel">
              <h2>Matched Attendees</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Health System</th>
                      <th>Strategy</th>
                      <th>Confidence</th>
                      <th>Existing Contact</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.matched.map((row, index) => (
                      <tr key={`${row.attendeeName}:${row.attendeeEmail || "no-email"}:${index}`}>
                        <td>{row.attendeeName}</td>
                        <td>{row.attendeeEmail || "N/A"}</td>
                        <td>{row.healthSystemName}</td>
                        <td>{row.healthSystemStrategy}</td>
                        <td>{formatPercent(row.healthSystemConfidence)}</td>
                        <td>{row.existingContactName || "New/unknown"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {result.unresolved.length > 0 ? (
            <section className="panel">
              <h2>Unresolved Attendees</h2>
              <p className="muted">These rows were skipped. Add domain overrides or a fallback health system, then rerun.</p>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Organization</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.unresolved.map((row, index) => (
                      <tr key={`${row.name}:${row.email || "no-email"}:${index}`}>
                        <td>{row.name}</td>
                        <td>{row.email || "N/A"}</td>
                        <td>{row.organization || "N/A"}</td>
                        <td>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {!result.dryRun && result.imported.length > 0 ? (
            <section className="panel">
              <h2>Imported Attendees</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Health System</th>
                      <th>Contact</th>
                      <th>Resolution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.imported.map((row) => (
                      <tr key={row.participantId}>
                        <td>{row.attendeeName}</td>
                        <td>{row.attendeeEmail || "N/A"}</td>
                        <td>{row.healthSystemName}</td>
                        <td>{row.contactName}</td>
                        <td>{`${row.contactResolution.matchedBy} (${formatPercent(row.contactResolution.confidence)})`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {!result.dryRun && result.importErrors.length > 0 ? (
            <section className="panel">
              <h2>Import Errors</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.importErrors.map((row, index) => (
                      <tr key={`${row.attendeeName}:${row.attendeeEmail || "no-email"}:${index}`}>
                        <td>{row.attendeeName}</td>
                        <td>{row.attendeeEmail || "N/A"}</td>
                        <td>{row.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
