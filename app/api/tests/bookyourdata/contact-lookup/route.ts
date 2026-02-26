import { NextResponse } from "next/server";
import { z } from "zod";

const lookupRequestSchema = z.object({
  name: z.string().optional(),
  organization: z.string().optional(),
  email: z.string().optional(),
  endpointUrl: z.string().optional(),
  apiKeyOverride: z.string().optional(),
  rawBody: z.string().optional()
});

const emailSchema = z.string().email();
const REQUEST_TIMEOUT_MS = 25_000;

function clean(value?: string | null) {
  return (value || "").trim();
}

function isHttpUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function parseJsonObject(rawBody: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(rawBody);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Raw body override must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

export async function GET() {
  return NextResponse.json({
    defaultEndpointUrl: clean(process.env.BOOKYOURDATA_CONTACT_LOOKUP_URL),
    hasDefaultApiKey: clean(process.env.BOOKYOURDATA_API_KEY).length > 0
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = lookupRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid lookup request payload." }, { status: 400 });
    }

    const name = clean(parsed.data.name);
    const organization = clean(parsed.data.organization);
    const email = clean(parsed.data.email);
    const rawBody = clean(parsed.data.rawBody);
    const endpointUrl = clean(parsed.data.endpointUrl) || clean(process.env.BOOKYOURDATA_CONTACT_LOOKUP_URL);
    const apiKeyOverride = clean(parsed.data.apiKeyOverride);
    const apiKey = apiKeyOverride || clean(process.env.BOOKYOURDATA_API_KEY);

    if (!endpointUrl) {
      return NextResponse.json(
        { error: "Endpoint URL is required. Set BOOKYOURDATA_CONTACT_LOOKUP_URL or provide one in the form." },
        { status: 400 }
      );
    }
    if (!isHttpUrl(endpointUrl)) {
      return NextResponse.json({ error: "Endpoint URL must use http:// or https://." }, { status: 400 });
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required. Set BOOKYOURDATA_API_KEY or provide an API key override in the form." },
        { status: 400 }
      );
    }

    if (email && !emailSchema.safeParse(email).success) {
      return NextResponse.json({ error: "Email must be a valid email address." }, { status: 400 });
    }

    let requestBody: Record<string, unknown>;
    if (rawBody) {
      try {
        requestBody = parseJsonObject(rawBody);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : "Raw body override must be valid JSON." },
          { status: 400 }
        );
      }
    } else {
      requestBody = {
        ...(name ? { name } : {}),
        ...(organization ? { organization } : {}),
        ...(email ? { email } : {})
      };
      if (Object.keys(requestBody).length === 0) {
        return NextResponse.json(
          { error: "Provide at least one lookup field (name, organization, email) or a raw JSON body." },
          { status: 400 }
        );
      }
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let upstreamResponse: Response;
    try {
      upstreamResponse = await fetch(endpointUrl, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-API-Key": apiKey
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
    } catch (error) {
      const abortError = (error as { name?: string } | null)?.name === "AbortError";
      if (abortError) {
        return NextResponse.json(
          { error: `Lookup request timed out after ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds.` },
          { status: 504 }
        );
      }
      console.error("bookyourdata_lookup_network_error", error);
      return NextResponse.json({ error: "Failed to reach the BookYourData endpoint." }, { status: 502 });
    } finally {
      clearTimeout(timeoutHandle);
    }

    const rawUpstreamBody = await upstreamResponse.text();
    let parsedUpstreamBody: unknown = null;
    if (rawUpstreamBody) {
      try {
        parsedUpstreamBody = JSON.parse(rawUpstreamBody);
      } catch {
        parsedUpstreamBody = rawUpstreamBody;
      }
    }

    return NextResponse.json({
      ok: upstreamResponse.ok,
      upstream: {
        status: upstreamResponse.status,
        statusText: upstreamResponse.statusText
      },
      request: {
        endpointUrl,
        body: requestBody,
        usedApiKeyOverride: apiKeyOverride.length > 0,
        authHeaders: ["Authorization: Bearer <redacted>", "X-API-Key: <redacted>"]
      },
      data: parsedUpstreamBody
    });
  } catch (error) {
    console.error("bookyourdata_lookup_error", error);
    return NextResponse.json({ error: "Failed to process contact lookup request." }, { status: 500 });
  }
}
