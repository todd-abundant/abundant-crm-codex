import { NextResponse } from "next/server";
import { z } from "zod";

const DEFAULT_DEFINITIVE_API_BASE_URL = "https://api.defhc.com/v4";
const MAX_TOP = 200;

const requestSchema = z.object({
  mode: z.enum(["health_system_lookup", "contact_lookup", "custom"]).default("health_system_lookup"),
  query: z.string().optional(),
  top: z.number().int().min(1).max(MAX_TOP).optional(),
  includeExecutives: z.boolean().optional(),
  odataPath: z.string().optional(),
  apiBaseUrl: z.string().optional(),
  usernameOverride: z.string().optional(),
  passwordOverride: z.string().optional()
});

class DefinitiveApiError extends Error {
  status: number;
  detail: unknown;

  constructor(message: string, status: number, detail: unknown) {
    super(message);
    this.name = "DefinitiveApiError";
    this.status = status;
    this.detail = detail;
  }
}

function clean(value?: string | null) {
  return (value || "").trim();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeApiBaseUrl(value?: string | null) {
  const raw = clean(value) || DEFAULT_DEFINITIVE_API_BASE_URL;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function toJsonOrText(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function readPayload(response: Response) {
  const rawBody = await response.text();
  return toJsonOrText(rawBody);
}

async function fetchOrThrow(input: RequestInfo | URL, init?: RequestInit) {
  const response = await fetch(input, { cache: "no-store", ...init });
  const payload = await readPayload(response);
  if (!response.ok) {
    throw new DefinitiveApiError("Definitive API request failed.", response.status, payload);
  }
  return payload;
}

function buildLookupPath(params: {
  mode: "health_system_lookup" | "contact_lookup" | "custom";
  query: string;
  top: number;
  includeExecutives: boolean;
  odataPath: string;
}) {
  if (params.mode === "custom") {
    const customPath = clean(params.odataPath);
    if (!customPath) {
      throw new Error("odataPath is required in custom mode.");
    }
    if (!customPath.startsWith("/")) {
      throw new Error("odataPath must start with '/'.");
    }
    return {
      path: customPath,
      assumptions: [] as string[]
    };
  }

  const basePath = params.mode === "health_system_lookup" ? "/odata-v4/Hospitals" : "/odata-v4/Executives";
  const url = new URL(`https://placeholder${basePath}`);
  url.searchParams.set("$top", String(params.top));

  const assumptions: string[] = [];
  if (params.mode === "health_system_lookup" && params.includeExecutives) {
    url.searchParams.set("$expand", "Executives");
  }

  if (params.query) {
    // Assumption based on common OData naming and Definitive docs samples.
    const fieldName = params.mode === "health_system_lookup" ? "Name" : "FullName";
    assumptions.push(
      params.mode === "health_system_lookup"
        ? "Health-system lookup assumes hospitals are filterable by Name."
        : "Contact lookup assumes executives are filterable by FullName."
    );
    url.searchParams.set("$filter", `contains(tolower(${fieldName}), '${params.query.toLowerCase()}')`);
  }

  return {
    path: `${url.pathname}${url.search}`,
    assumptions
  };
}

function estimateRowCount(payload: unknown) {
  if (Array.isArray(payload)) return payload.length;
  const objectPayload = asObject(payload);
  if (!objectPayload) return null;
  if (Array.isArray(objectPayload.value)) return objectPayload.value.length;
  if (Array.isArray(objectPayload.data)) return objectPayload.data.length;
  return null;
}

function summarizeMode(mode: "health_system_lookup" | "contact_lookup" | "custom") {
  if (mode === "health_system_lookup") return "hospital_search";
  if (mode === "contact_lookup") return "executive_search";
  return "custom_request";
}

async function requestAccessToken(params: {
  apiBaseUrl: string;
  username: string;
  password: string;
}) {
  const body = new URLSearchParams({
    grant_type: "password",
    username: params.username,
    password: params.password
  });

  const tokenPayload = await fetchOrThrow(`${params.apiBaseUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });

  const tokenObject = asObject(tokenPayload);
  const accessToken = clean(tokenObject && typeof tokenObject.access_token === "string" ? tokenObject.access_token : "");
  if (!accessToken) {
    throw new DefinitiveApiError("Definitive token response did not include access_token.", 502, tokenPayload);
  }

  const tokenType =
    tokenObject && typeof tokenObject.token_type === "string" ? clean(tokenObject.token_type) || "Bearer" : "Bearer";
  const expiresIn =
    tokenObject && typeof tokenObject.expires_in === "number"
      ? tokenObject.expires_in
      : tokenObject && typeof tokenObject.expires_in === "string"
        ? Number(tokenObject.expires_in)
        : null;

  return {
    accessToken,
    tokenMeta: {
      tokenType,
      expiresInSeconds: Number.isFinite(expiresIn) ? expiresIn : null
    }
  };
}

export async function GET() {
  const apiBaseUrl = normalizeApiBaseUrl(process.env.DEFINITIVEHC_API_BASE_URL || DEFAULT_DEFINITIVE_API_BASE_URL);
  return NextResponse.json({
    defaultApiBaseUrl: apiBaseUrl || DEFAULT_DEFINITIVE_API_BASE_URL,
    hasDefaultUsername: clean(process.env.DEFINITIVEHC_USERNAME).length > 0,
    hasDefaultPassword: clean(process.env.DEFINITIVEHC_PASSWORD).length > 0
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid Definitive lookup payload." }, { status: 400 });
    }

    const mode = parsed.data.mode;
    const query = clean(parsed.data.query);
    const includeExecutives = Boolean(parsed.data.includeExecutives);
    const top = Math.min(Math.max(parsed.data.top || 25, 1), MAX_TOP);
    const apiBaseUrl = normalizeApiBaseUrl(parsed.data.apiBaseUrl || process.env.DEFINITIVEHC_API_BASE_URL);
    const username = clean(parsed.data.usernameOverride) || clean(process.env.DEFINITIVEHC_USERNAME);
    const password = clean(parsed.data.passwordOverride) || clean(process.env.DEFINITIVEHC_PASSWORD);

    if (!apiBaseUrl) {
      return NextResponse.json({ error: "Definitive API base URL must be a valid http/https URL." }, { status: 400 });
    }

    if (!username || !password) {
      return NextResponse.json(
        {
          error:
            "Definitive credentials are required. Set DEFINITIVEHC_USERNAME and DEFINITIVEHC_PASSWORD, or provide overrides."
        },
        { status: 400 }
      );
    }

    const lookupPathResult = buildLookupPath({
      mode,
      query,
      top,
      includeExecutives,
      odataPath: clean(parsed.data.odataPath)
    });

    const { accessToken, tokenMeta } = await requestAccessToken({
      apiBaseUrl,
      username,
      password
    });

    let payload: unknown = null;
    let requestedPath = lookupPathResult.path;
    const warnings: string[] = [...lookupPathResult.assumptions];
    let fallbackAttempted = false;
    let fallbackError: unknown = null;

    try {
      payload = await fetchOrThrow(`${apiBaseUrl}${lookupPathResult.path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json"
        }
      });
    } catch (error) {
      // If likely filter mismatch, retry unfiltered once for non-custom lookups.
      if (
        mode !== "custom" &&
        query &&
        error instanceof DefinitiveApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        fallbackAttempted = true;
        try {
          const fallbackPathResult = buildLookupPath({
            mode,
            query: "",
            top,
            includeExecutives,
            odataPath: ""
          });
          requestedPath = fallbackPathResult.path;
          payload = await fetchOrThrow(`${apiBaseUrl}${fallbackPathResult.path}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: "application/json"
            }
          });
          warnings.push(
            "Initial filtered lookup failed; returned unfiltered results. Check field names in your tenant and use custom mode."
          );
        } catch (fallbackLookupError) {
          fallbackError = fallbackLookupError instanceof DefinitiveApiError ? fallbackLookupError.detail : null;
          throw error;
        }
      } else {
        throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: summarizeMode(mode),
      query: query || null,
      request: {
        apiBaseUrl,
        requestedPath,
        includeExecutives,
        top,
        usedUsernameOverride: clean(parsed.data.usernameOverride).length > 0,
        usedPasswordOverride: clean(parsed.data.passwordOverride).length > 0
      },
      summary: {
        estimatedRowCount: estimateRowCount(payload),
        token: tokenMeta,
        fallbackAttempted
      },
      warnings,
      data: payload,
      debug: fallbackError ? { fallbackError } : undefined
    });
  } catch (error) {
    if (error instanceof DefinitiveApiError) {
      return NextResponse.json(
        {
          error: error.message,
          upstreamStatus: error.status,
          upstreamDetail: error.detail
        },
        { status: 502 }
      );
    }

    console.error("definitive_lookup_error", error);
    return NextResponse.json({ error: "Failed to run Definitive lookup." }, { status: 500 });
  }
}
