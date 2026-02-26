"use client";

import * as React from "react";

type StatusState =
  | { kind: "ok"; text: string }
  | { kind: "error"; text: string }
  | { kind: "info"; text: string }
  | null;

type LookupResult = {
  ok: boolean;
  upstream: {
    status: number;
    statusText: string;
  };
  request: {
    endpointUrl: string;
    body: Record<string, unknown>;
    usedApiKeyOverride: boolean;
    authHeaders: string[];
  };
  data: unknown;
};

type LookupConfig = {
  defaultEndpointUrl: string;
  hasDefaultApiKey: boolean;
  error?: string;
};

type ValidityCheck = {
  label: string;
  passed: boolean;
};

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function estimateMatchCount(payload: unknown): number | null {
  if (Array.isArray(payload)) return payload.length;
  if (!payload || typeof payload !== "object") return null;

  const objectPayload = payload as Record<string, unknown>;
  const candidateKeys = ["matches", "results", "contacts", "people", "records", "items", "data"];
  for (const key of candidateKeys) {
    const value = objectPayload[key];
    if (Array.isArray(value)) return value.length;
  }
  return null;
}

function formatJson(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function computeValidityChecks(params: {
  result: LookupResult | null;
  name: string;
  organization: string;
  email: string;
}) {
  const checks: ValidityCheck[] = [];
  if (!params.result) return checks;

  const haystack = formatJson(params.result.data).toLowerCase();
  const normalizedName = normalizeText(params.name);
  const normalizedOrganization = normalizeText(params.organization);
  const normalizedEmail = normalizeText(params.email);

  if (normalizedName) {
    checks.push({
      label: "Name appears in response",
      passed: haystack.includes(normalizedName)
    });
  }
  if (normalizedOrganization) {
    checks.push({
      label: "Organization appears in response",
      passed: haystack.includes(normalizedOrganization)
    });
  }
  if (normalizedEmail) {
    checks.push({
      label: "Email appears in response",
      passed: haystack.includes(normalizedEmail)
    });
  }

  return checks;
}

export default function BookYourDataContactLookupTestPage() {
  const [loadingDefaults, setLoadingDefaults] = React.useState(true);
  const [name, setName] = React.useState("");
  const [organization, setOrganization] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [endpointUrl, setEndpointUrl] = React.useState("");
  const [apiKeyOverride, setApiKeyOverride] = React.useState("");
  const [rawBody, setRawBody] = React.useState("");

  const [running, setRunning] = React.useState(false);
  const [status, setStatus] = React.useState<StatusState>(null);
  const [result, setResult] = React.useState<LookupResult | null>(null);
  const [hasDefaultApiKey, setHasDefaultApiKey] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    async function loadDefaults() {
      setLoadingDefaults(true);
      try {
        const res = await fetch("/api/tests/bookyourdata/contact-lookup", { cache: "no-store" });
        const payload = (await res.json()) as LookupConfig;
        if (!res.ok) {
          throw new Error(payload.error || "Failed to load BookYourData test defaults.");
        }
        if (cancelled) return;
        setEndpointUrl(payload.defaultEndpointUrl || "");
        setHasDefaultApiKey(payload.hasDefaultApiKey);
      } catch (error) {
        if (cancelled) return;
        setStatus({
          kind: "error",
          text: error instanceof Error ? error.message : "Failed to load BookYourData test defaults."
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

  const validityChecks = React.useMemo(
    () => computeValidityChecks({ result, name, organization, email }),
    [email, name, organization, result]
  );

  const estimatedMatchCount = React.useMemo(() => estimateMatchCount(result?.data), [result]);

  async function runLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!endpointUrl.trim()) {
      setStatus({ kind: "error", text: "Endpoint URL is required." });
      return;
    }
    if (!rawBody.trim() && !name.trim() && !organization.trim() && !email.trim()) {
      setStatus({
        kind: "error",
        text: "Provide at least one lookup field (name, organization, email) or a raw JSON body override."
      });
      return;
    }

    setRunning(true);
    setStatus({ kind: "info", text: "Running BookYourData contact lookup..." });
    setResult(null);

    try {
      const res = await fetch("/api/tests/bookyourdata/contact-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          organization,
          email,
          endpointUrl,
          apiKeyOverride,
          rawBody
        })
      });

      const payload = (await res.json()) as LookupResult & { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || "BookYourData lookup failed.");
      }

      setResult(payload);
      if (payload.ok) {
        setStatus({ kind: "ok", text: "Lookup completed successfully." });
      } else {
        setStatus({
          kind: "info",
          text: `Lookup completed but upstream returned HTTP ${payload.upstream.status}.`
        });
      }
    } catch (error) {
      setStatus({
        kind: "error",
        text: error instanceof Error ? error.message : "BookYourData lookup failed."
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
        <h1>BookYourData Contact Lookup (Test)</h1>
        <p>
          Enter contact details, run a lookup through the BookYourData API, and inspect response quality before
          wiring into production workflows.
        </p>
      </section>

      <section className="panel">
        <h2>Lookup Input</h2>
        <p className="muted">
          Set `BOOKYOURDATA_API_KEY` and `BOOKYOURDATA_CONTACT_LOOKUP_URL` in `.env` for defaults, or override per
          request here.
        </p>
        {loadingDefaults ? <p className="muted">Loading defaults...</p> : null}
        {!hasDefaultApiKey ? (
          <p className="muted">No default API key detected. Use API Key Override or add `BOOKYOURDATA_API_KEY`.</p>
        ) : null}
        <form onSubmit={runLookup}>
          <div className="row-3">
            <div>
              <label htmlFor="byd-name">Name (optional)</label>
              <input
                id="byd-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Jane Smith"
              />
            </div>
            <div>
              <label htmlFor="byd-organization">Organization (optional)</label>
              <input
                id="byd-organization"
                value={organization}
                onChange={(event) => setOrganization(event.target.value)}
                placeholder="Acme Health"
              />
            </div>
            <div>
              <label htmlFor="byd-email">Email (optional)</label>
              <input
                id="byd-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="jane.smith@acmehealth.com"
              />
            </div>
          </div>

          <div className="row">
            <div>
              <label htmlFor="byd-endpoint">BookYourData Endpoint URL</label>
              <input
                id="byd-endpoint"
                value={endpointUrl}
                onChange={(event) => setEndpointUrl(event.target.value)}
                placeholder="https://app.bookyourdata.com/<your-contact-endpoint>"
                required
              />
            </div>
            <div>
              <label htmlFor="byd-api-key">API Key Override (optional)</label>
              <input
                id="byd-api-key"
                type="password"
                value={apiKeyOverride}
                onChange={(event) => setApiKeyOverride(event.target.value)}
                placeholder="Overrides BOOKYOURDATA_API_KEY for this request"
              />
            </div>
          </div>

          <div>
            <label htmlFor="byd-raw-body">Raw JSON Body Override (optional)</label>
            <textarea
              id="byd-raw-body"
              value={rawBody}
              onChange={(event) => setRawBody(event.target.value)}
              placeholder='Leave blank to send {"name","organization","email"}'
            />
            <p className="muted">Use this when the API expects a different JSON shape than the default test payload.</p>
          </div>

          <div className="actions">
            <button className="primary" type="submit" disabled={running}>
              {running ? "Running..." : "Run Contact Lookup"}
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
          <h2>Lookup Result</h2>
          <div className="chip-row">
            <span className={`status-pill ${result.ok ? "done" : "failed"}`}>
              {result.ok ? "Upstream OK" : "Upstream Non-2xx"}
            </span>
            <span className="flag-pill">
              HTTP {result.upstream.status}
              {result.upstream.statusText ? ` ${result.upstream.statusText}` : ""}
            </span>
            {typeof estimatedMatchCount === "number" ? (
              <span className="flag-pill">Estimated matches: {estimatedMatchCount}</span>
            ) : null}
          </div>

          {validityChecks.length > 0 ? (
            <>
              <p className="section-title">Quick Validity Checks</p>
              <div className="chip-row">
                {validityChecks.map((check) => (
                  <span key={check.label} className={`status-pill ${check.passed ? "done" : "failed"}`}>
                    {check.label}: {check.passed ? "yes" : "no"}
                  </span>
                ))}
              </div>
            </>
          ) : null}

          <div className="candidate-card">
            <div className="candidate-head">
              <h3>Request Body Sent</h3>
            </div>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {formatJson(result.request.body)}
            </pre>
          </div>

          <div className="candidate-card">
            <div className="candidate-head">
              <h3>Raw Response</h3>
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
