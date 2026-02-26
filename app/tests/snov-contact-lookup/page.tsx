"use client";

import * as React from "react";

type StatusState =
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string }
  | { kind: "info"; text: string }
  | null;

type SnovDefaults = {
  defaultApiBaseUrl: string;
  hasDefaultClientId: boolean;
  hasDefaultClientSecret: boolean;
  error?: string;
};

type SnovLookupResult = {
  ok: boolean;
  mode: "email_profile" | "name_domain";
  apiBaseUrl: string;
  summary?: {
    tokenExpiresInSeconds?: number | null;
    resolvedDomain?: string | null;
    domainResolvedFromOrganization?: boolean;
    lookupStatus?: string | null;
    matchCount?: number | null;
  };
  query?: Record<string, unknown>;
  data?: {
    token?: unknown;
    emailProfile?: unknown;
    domainResolution?: unknown;
    emailLookup?: unknown;
    matches?: Array<{
      email: string;
      smtpStatus: string | null;
      personName: string | null;
    }>;
  };
  error?: string;
  upstreamStatus?: number;
  upstreamDetail?: unknown;
};

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function hasNameDomainInputs(name: string, domain: string, organization: string) {
  return name.trim().length > 0 && (domain.trim().length > 0 || organization.trim().length > 0);
}

export default function SnovContactLookupTestPage() {
  const [loadingDefaults, setLoadingDefaults] = React.useState(true);
  const [name, setName] = React.useState("");
  const [organization, setOrganization] = React.useState("");
  const [domain, setDomain] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [apiBaseUrl, setApiBaseUrl] = React.useState("https://api.snov.io");
  const [clientIdOverride, setClientIdOverride] = React.useState("");
  const [clientSecretOverride, setClientSecretOverride] = React.useState("");

  const [hasDefaultClientId, setHasDefaultClientId] = React.useState(false);
  const [hasDefaultClientSecret, setHasDefaultClientSecret] = React.useState(false);

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState<StatusState>(null);
  const [result, setResult] = React.useState<SnovLookupResult | null>(null);

  React.useEffect(() => {
    let cancelled = false;

    async function loadDefaults() {
      setLoadingDefaults(true);
      try {
        const response = await fetch("/api/tests/snov/contact-lookup", { cache: "no-store" });
        const payload = (await response.json()) as SnovDefaults;
        if (!response.ok) {
          throw new Error(payload.error || "Failed to load Snov test defaults.");
        }
        if (cancelled) return;

        setApiBaseUrl(payload.defaultApiBaseUrl || "https://api.snov.io");
        setHasDefaultClientId(Boolean(payload.hasDefaultClientId));
        setHasDefaultClientSecret(Boolean(payload.hasDefaultClientSecret));
      } catch (error) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load Snov test defaults."
        });
      } finally {
        if (!cancelled) {
          setLoadingDefaults(false);
        }
      }
    }

    loadDefaults();
    return () => {
      cancelled = true;
    };
  }, []);

  const usingEmailMode = email.trim().length > 0;

  async function runLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = email.trim();
    const normalizedName = name.trim();
    const normalizedDomain = domain.trim();
    const normalizedOrganization = organization.trim();

    if (!normalizedEmail && !hasNameDomainInputs(normalizedName, normalizedDomain, normalizedOrganization)) {
      setStatus({
        kind: "error",
        text:
          "Provide an email for profile lookup, or provide full name plus company domain (or organization name for domain resolution)."
      });
      return;
    }

    setRunning(true);
    setResult(null);
    setStatus({
      kind: "info",
      text: normalizedEmail
        ? "Running Snov profile lookup by email..."
        : "Running Snov lookup by name and domain..."
    });

    try {
      const response = await fetch("/api/tests/snov/contact-lookup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: normalizedName || undefined,
          organization: normalizedOrganization || undefined,
          domain: normalizedDomain || undefined,
          email: normalizedEmail || undefined,
          apiBaseUrl: apiBaseUrl.trim() || undefined,
          clientIdOverride: clientIdOverride.trim() || undefined,
          clientSecretOverride: clientSecretOverride.trim() || undefined
        })
      });

      const payload = (await response.json()) as SnovLookupResult;
      if (!response.ok) {
        throw new Error(
          payload.error ||
            (payload.upstreamStatus
              ? `Snov request failed with upstream status ${payload.upstreamStatus}.`
              : "Snov lookup failed.")
        );
      }

      setResult(payload);
      setStatus({
        kind: "ok",
        text:
          payload.mode === "email_profile"
            ? "Snov email-profile lookup completed."
            : `Snov name-domain lookup completed. ${payload.summary?.matchCount ?? 0} match(es) found.`
      });
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "Snov lookup failed."
      });
    } finally {
      setRunning(false);
    }
  }

  function clearResult() {
    setResult(null);
    setStatus(null);
  }

  return (
    <main>
      <section className="hero">
        <h1>Snov.io Contact Lookup (Test)</h1>
        <p>
          Test low-volume contact lookup with Snov. Use email for direct profile lookup, or use full name + domain
          (with optional organization-to-domain resolution).
        </p>
      </section>

      <section className="panel">
        <h2>Lookup Input</h2>
        <p className="muted">
          Configure `SNOV_CLIENT_ID` and `SNOV_CLIENT_SECRET` in `.env` for defaults, or enter overrides below.
        </p>
        {loadingDefaults ? <p className="muted">Loading defaults...</p> : null}
        {!hasDefaultClientId || !hasDefaultClientSecret ? (
          <p className="muted">
            Default credentials are incomplete. You can still test by entering Client ID/Secret overrides.
          </p>
        ) : null}

        <form onSubmit={runLookup}>
          <div className="row">
            <div>
              <label htmlFor="snov-email">Email (preferred if known)</label>
              <input
                id="snov-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jane.smith@company.com"
              />
            </div>
            <div>
              <label htmlFor="snov-name">Full name (for name+domain lookup)</label>
              <input
                id="snov-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Jane Smith"
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label htmlFor="snov-domain">Company domain (recommended)</label>
              <input
                id="snov-domain"
                value={domain}
                onChange={(event) => setDomain(event.target.value)}
                placeholder="acmehealth.com"
              />
            </div>
            <div>
              <label htmlFor="snov-organization">Organization name (fallback for domain resolution)</label>
              <input
                id="snov-organization"
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                placeholder="Acme Health"
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label htmlFor="snov-api-base-url">Snov API base URL</label>
              <input
                id="snov-api-base-url"
                value={apiBaseUrl}
                onChange={(event) => setApiBaseUrl(event.target.value)}
                placeholder="https://api.snov.io"
              />
            </div>
            <div>
              <label htmlFor="snov-client-id">Client ID override (optional)</label>
              <input
                id="snov-client-id"
                value={clientIdOverride}
                onChange={(event) => setClientIdOverride(event.target.value)}
                placeholder="Uses SNOV_CLIENT_ID when empty"
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label htmlFor="snov-client-secret">Client Secret override (optional)</label>
              <input
                id="snov-client-secret"
                type="password"
                value={clientSecretOverride}
                onChange={(event) => setClientSecretOverride(event.target.value)}
                placeholder="Uses SNOV_CLIENT_SECRET when empty"
              />
            </div>
            <div>
              <label>Lookup mode</label>
              <p className="muted">
                {usingEmailMode
                  ? "Email profile mode (email field is set)"
                  : "Name+domain mode (email empty, requires full name + domain or organization)"}
              </p>
            </div>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={running}>
              {running ? "Running..." : "Run Snov Lookup"}
            </button>
            <button className="secondary" type="button" onClick={clearResult} disabled={running}>
              Clear Result
            </button>
          </div>
        </form>

        {status ? (
          <p className={`status ${status.kind === "ok" ? "ok" : status.kind === "error" ? "error" : ""}`}>
            {status.text}
          </p>
        ) : null}
      </section>

      {result ? (
        <section className="panel">
          <h2>Snov Result</h2>
          <div className="chip-row">
            <span className={`status-pill ${result.ok ? "done" : "failed"}`}>{result.ok ? "Request OK" : "Failed"}</span>
            <span className="flag-pill">Mode: {result.mode}</span>
            {result.summary?.resolvedDomain ? <span className="flag-pill">Domain: {result.summary.resolvedDomain}</span> : null}
            {typeof result.summary?.matchCount === "number" ? (
              <span className="flag-pill">Matches: {result.summary.matchCount}</span>
            ) : null}
            {result.summary?.lookupStatus ? <span className="flag-pill">Lookup status: {result.summary.lookupStatus}</span> : null}
          </div>

          {Array.isArray(result.data?.matches) && result.data?.matches.length > 0 ? (
            <div className="table-wrap" style={{ marginBottom: 12 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>SMTP status</th>
                    <th>Person</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.matches.map((match) => (
                    <tr key={`${match.email}:${match.personName || ""}`}>
                      <td>{match.email}</td>
                      <td>{match.smtpStatus || "N/A"}</td>
                      <td>{match.personName || "N/A"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <div className="candidate-card">
            <div className="candidate-head">
              <h3>Summary</h3>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {formatJson({
                apiBaseUrl: result.apiBaseUrl,
                mode: result.mode,
                summary: result.summary,
                query: result.query
              })}
            </pre>
          </div>

          <div className="candidate-card">
            <div className="candidate-head">
              <h3>Raw Response Data</h3>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {formatJson(result.data)}
            </pre>
          </div>
        </section>
      ) : null}
    </main>
  );
}
