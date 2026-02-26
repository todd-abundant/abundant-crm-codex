import { NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_SNOV_API_BASE_URL = "https://api.snov.io";
const POLL_INTERVAL_MS = 1200;
const POLL_MAX_ATTEMPTS = 10;

const lookupRequestSchema = z.object({
  name: z.string().optional(),
  organization: z.string().optional(),
  domain: z.string().optional(),
  email: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  clientIdOverride: z.string().optional(),
  clientSecretOverride: z.string().optional()
});

const emailSchema = z.string().email();

class SnovApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "SnovApiError";
    this.status = status;
    this.detail = detail;
  }
}

type PollResult = {
  attempts: number;
  status: string | null;
  payload: unknown;
};

type ExtractedMatch = {
  email: string;
  smtpStatus: string | null;
  personName: string | null;
};

function clean(value?: string | null) {
  return (value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeDomain(value?: string | null) {
  const raw = clean(value).toLowerCase();
  if (!raw) return "";
  const withoutProtocol = raw.replace(/^https?:\/\//, "").replace(/^www\./, "");
  return withoutProtocol.split("/")[0]?.trim() || "";
}

function normalizeApiBaseUrl(value?: string | null) {
  const raw = clean(value) || DEFAULT_SNOV_API_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function parseJsonBody(rawBody: string) {
  if (!rawBody) return null;
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    return rawBody;
  }
}

function splitFullName(name: string) {
  const compact = name
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (compact.length < 2) return null;
  return {
    firstName: compact[0],
    lastName: compact.slice(1).join(" ")
  };
}

function extractTaskHash(payload: unknown) {
  const root = asObject(payload);
  if (!root) return "";
  const direct = clean(typeof root.task_hash === "string" ? root.task_hash : "");
  if (direct) return direct;
  const data = asObject(root.data);
  return clean(data && typeof data.task_hash === "string" ? data.task_hash : "");
}

function extractStatus(payload: unknown) {
  const root = asObject(payload);
  if (!root) return null;
  if (typeof root.status === "string") return root.status;
  const data = asObject(root.data);
  if (data && typeof data.status === "string") return data.status;
  return null;
}

function extractResolvedDomain(payload: unknown) {
  const root = asObject(payload);
  if (!root) return "";
  const rows = Array.isArray(root.data) ? root.data : [];
  for (const row of rows) {
    const rowObject = asObject(row);
    if (!rowObject) continue;
    const result = asObject(rowObject.result);
    if (!result) continue;
    const domain = normalizeDomain(typeof result.domain === "string" ? result.domain : "");
    if (domain) return domain;
  }
  return "";
}

function extractMatches(payload: unknown): ExtractedMatch[] {
  const root = asObject(payload);
  if (!root) return [];

  const rows = Array.isArray(root.data) ? root.data : [];
  const matches: ExtractedMatch[] = [];

  for (const row of rows) {
    const rowObject = asObject(row);
    if (!rowObject) continue;

    const personName = clean(typeof rowObject.people === "string" ? rowObject.people : "") || null;
    const resultRows = Array.isArray(rowObject.result) ? rowObject.result : [];

    for (const resultRow of resultRows) {
      const resultObject = asObject(resultRow);
      if (!resultObject) continue;

      const email = clean(typeof resultObject.email === "string" ? resultObject.email : "");
      if (!email) continue;

      matches.push({
        email,
        smtpStatus: clean(typeof resultObject["smtp status"] === "string" ? resultObject["smtp status"] : "") || null,
        personName
      });
    }
  }

  return matches;
}

function extractTokenMeta(tokenResponse: unknown, expiresIn: number | null) {
  const tokenObject = asObject(tokenResponse);
  const tokenType =
    tokenObject && typeof tokenObject.token_type === "string" ? clean(tokenObject.token_type) || null : null;

  return {
    tokenType,
    expiresInSeconds: Number.isFinite(expiresIn) ? expiresIn : null
  };
}

async function readResponsePayload(response: Response) {
  const rawBody = await response.text();
  return parseJsonBody(rawBody);
}

async function fetchOrThrow(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { cache: "no-store", ...init });
  const payload = await readResponsePayload(response);
  if (!response.ok) {
    throw new SnovApiError("Snov API request failed.", response.status, payload);
  }
  return payload;
}

async function requestAccessToken(params: {
  apiBaseUrl: string;
  clientId: string;
  clientSecret: string;
}) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: params.clientId,
    client_secret: params.clientSecret
  });

  const tokenResponse = await fetchOrThrow(`${params.apiBaseUrl}/v1/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const tokenObject = asObject(tokenResponse);
  const accessToken = clean(tokenObject && typeof tokenObject.access_token === "string" ? tokenObject.access_token : "");
  if (!accessToken) {
    throw new SnovApiError("Snov API token response did not include an access token.", 502, tokenResponse);
  }

  const expiresIn =
    tokenObject && typeof tokenObject.expires_in === "number"
      ? tokenObject.expires_in
      : tokenObject && typeof tokenObject.expires_in === "string"
        ? Number(tokenObject.expires_in)
        : null;

  return { accessToken, expiresIn, tokenResponse };
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollTaskResult(params: {
  apiBaseUrl: string;
  path: string;
  taskHash: string;
  accessToken: string;
}): Promise<PollResult> {
  let lastPayload: unknown = null;
  let lastStatus: string | null = null;

  for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
    const resultPayload = await fetchOrThrow(
      `${params.apiBaseUrl}${params.path}?task_hash=${encodeURIComponent(params.taskHash)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${params.accessToken}`
        }
      }
    );

    lastPayload = resultPayload;
    lastStatus = extractStatus(resultPayload);

    if (lastStatus !== "in_progress") {
      return {
        attempts: attempt,
        status: lastStatus,
        payload: resultPayload
      };
    }

    if (attempt < POLL_MAX_ATTEMPTS) {
      await wait(POLL_INTERVAL_MS);
    }
  }

  return {
    attempts: POLL_MAX_ATTEMPTS,
    status: lastStatus,
    payload: lastPayload
  };
}

async function runDomainLookup(params: {
  apiBaseUrl: string;
  accessToken: string;
  organization: string;
}) {
  const body = new URLSearchParams();
  body.append("names[]", params.organization);

  const startPayload = await fetchOrThrow(`${params.apiBaseUrl}/v2/company-domain-by-name/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const taskHash = extractTaskHash(startPayload);
  if (!taskHash) {
    throw new SnovApiError("Snov domain lookup did not return a task hash.", 502, startPayload);
  }

  const pollResult = await pollTaskResult({
    apiBaseUrl: params.apiBaseUrl,
    path: "/v2/company-domain-by-name/result",
    taskHash,
    accessToken: params.accessToken
  });

  const resolvedDomain = extractResolvedDomain(pollResult.payload);

  return {
    taskHash,
    startPayload,
    pollResult,
    resolvedDomain
  };
}

async function runNameDomainLookup(params: {
  apiBaseUrl: string;
  accessToken: string;
  firstName: string;
  lastName: string;
  domain: string;
}) {
  const startPayload = await fetchOrThrow(`${params.apiBaseUrl}/v2/emails-by-domain-by-name/start`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      rows: [
        {
          first_name: params.firstName,
          last_name: params.lastName,
          domain: params.domain
        }
      ]
    })
  });

  const taskHash = extractTaskHash(startPayload);
  if (!taskHash) {
    throw new SnovApiError("Snov email lookup did not return a task hash.", 502, startPayload);
  }

  const pollResult = await pollTaskResult({
    apiBaseUrl: params.apiBaseUrl,
    path: "/v2/emails-by-domain-by-name/result",
    taskHash,
    accessToken: params.accessToken
  });

  return {
    taskHash,
    startPayload,
    pollResult,
    matches: extractMatches(pollResult.payload)
  };
}

async function runEmailProfileLookup(params: { apiBaseUrl: string; accessToken: string; email: string }) {
  const body = new URLSearchParams({
    access_token: params.accessToken,
    email: params.email
  });

  const payload = await fetchOrThrow(`${params.apiBaseUrl}/v1/get-profile-by-email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  return payload;
}

export async function GET() {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.SNOV_API_BASE_URL || DEFAULT_SNOV_API_BASE_URL);
  return NextResponse.json({
    defaultApiBaseUrl: apiBaseUrl || DEFAULT_SNOV_API_BASE_URL,
    hasDefaultClientId: clean(process.env.SNOV_CLIENT_ID).length > 0,
    hasDefaultClientSecret: clean(process.env.SNOV_CLIENT_SECRET).length > 0
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = lookupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Snov lookup request payload." }, { status: 400 });
    }

    const email = clean(parsed.data.email).toLowerCase();
    const name = clean(parsed.data.name);
    const organization = clean(parsed.data.organization);
    const domainInput = normalizeDomain(parsed.data.domain);

    const apiBaseUrl = normalizeApiBaseUrl(parsed.data.apiBaseUrl || process.env.SNOV_API_BASE_URL);
    if (!apiBaseUrl) {
      return NextResponse.json({ error: "Snov API base URL must be a valid http/https URL." }, { status: 400 });
    }

    const clientId = clean(parsed.data.clientIdOverride) || clean(process.env.SNOV_CLIENT_ID);
    const clientSecret = clean(parsed.data.clientSecretOverride) || clean(process.env.SNOV_CLIENT_SECRET);

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        {
          error:
            "Snov credentials are required. Set SNOV_CLIENT_ID and SNOV_CLIENT_SECRET, or provide overrides in the form."
        },
        { status: 400 }
      );
    }

    if (email && !emailSchema.safeParse(email).success) {
      return NextResponse.json({ error: "Email must be a valid email address." }, { status: 400 });
    }

    if (!email && !name) {
      return NextResponse.json({ error: "Provide an email, or provide a full name for name+domain lookup." }, { status: 400 });
    }

    const { accessToken, expiresIn, tokenResponse } = await requestAccessToken({
      apiBaseUrl,
      clientId,
      clientSecret
    });

    if (email) {
      const emailProfile = await runEmailProfileLookup({
        apiBaseUrl,
        accessToken,
        email
      });

      return NextResponse.json({
        ok: true,
        mode: "email_profile",
        apiBaseUrl,
        summary: {
          tokenExpiresInSeconds: expiresIn
        },
        query: {
          email
        },
        data: {
          token: extractTokenMeta(tokenResponse, expiresIn),
          emailProfile
        }
      });
    }

    const splitName = splitFullName(name);
    if (!splitName) {
      return NextResponse.json(
        { error: "For Snov name lookup, provide a full name with first and last name (for example: Jane Smith)." },
        { status: 400 }
      );
    }

    let resolvedDomain = domainInput;
    let domainResolution: {
      taskHash: string;
      attempts: number;
      status: string | null;
      startPayload: unknown;
      resultPayload: unknown;
    } | null = null;

    if (!resolvedDomain) {
      if (!organization) {
        return NextResponse.json(
          { error: "Provide a company domain, or provide an organization so the app can attempt domain resolution." },
          { status: 400 }
        );
      }

      const lookup = await runDomainLookup({
        apiBaseUrl,
        accessToken,
        organization
      });

      domainResolution = {
        taskHash: lookup.taskHash,
        attempts: lookup.pollResult.attempts,
        status: lookup.pollResult.status,
        startPayload: lookup.startPayload,
        resultPayload: lookup.pollResult.payload
      };

      resolvedDomain = lookup.resolvedDomain;
      if (!resolvedDomain) {
        return NextResponse.json(
          {
            error: "Snov could not resolve a domain from the organization name.",
            domainResolution
          },
          { status: 404 }
        );
      }
    }

    const lookup = await runNameDomainLookup({
      apiBaseUrl,
      accessToken,
      firstName: splitName.firstName,
      lastName: splitName.lastName,
      domain: resolvedDomain
    });

    return NextResponse.json({
      ok: true,
      mode: "name_domain",
      apiBaseUrl,
      summary: {
        tokenExpiresInSeconds: expiresIn,
        resolvedDomain,
        domainResolvedFromOrganization: !domainInput,
        lookupStatus: lookup.pollResult.status,
        matchCount: lookup.matches.length
      },
      query: {
        name,
        firstName: splitName.firstName,
        lastName: splitName.lastName,
        organization: organization || null,
        domainInput: domainInput || null
      },
      data: {
        token: extractTokenMeta(tokenResponse, expiresIn),
        domainResolution,
        emailLookup: {
          taskHash: lookup.taskHash,
          attempts: lookup.pollResult.attempts,
          status: lookup.pollResult.status,
          startPayload: lookup.startPayload,
          resultPayload: lookup.pollResult.payload
        },
        matches: lookup.matches
      }
    });
  } catch (error) {
    if (error instanceof SnovApiError) {
      return NextResponse.json(
        {
          error: error.message,
          upstreamStatus: error.status,
          upstreamDetail: error.detail
        },
        { status: 502 }
      );
    }

    console.error("snov_contact_lookup_error", error);
    return NextResponse.json({ error: "Failed to run Snov contact lookup." }, { status: 500 });
  }
}
