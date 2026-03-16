import { createHash } from "node:crypto";
import OpenAI from "openai";
import { getCachedLookup } from "@/lib/search-cache";

export type DiscoveredSignal = {
  eventType: string;
  headline: string;
  summary: string;
  suggestedOutreach: string;
  confidenceScore: number | null;
  relevanceScore: number | null;
  signalDate: string | null;
  sourceUrl: string;
  sourceTitle: string;
  sourcePublishedAt: string | null;
  competitors: string[];
};

const SIGNAL_SEARCH_CACHE_TTL_MS = 15 * 60_000;

const signalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    signals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          eventType: { type: "string" },
          headline: { type: "string" },
          summary: { type: "string" },
          suggestedOutreach: { type: "string" },
          confidenceScore: { type: ["number", "null"] },
          relevanceScore: { type: ["number", "null"] },
          signalDate: { type: ["string", "null"] },
          sourceUrl: { type: "string" },
          sourceTitle: { type: "string" },
          sourcePublishedAt: { type: ["string", "null"] },
          competitors: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["eventType", "headline", "summary", "sourceUrl"]
      }
    }
  },
  required: ["signals"]
};

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value: unknown): string {
  const text = trimText(value);
  if (!text) return "";

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/+$/g, "");
    return `https://${host}${path}${parsed.search || ""}`;
  } catch {
    return "";
  }
}

function clampScore(value: unknown, min: number, max: number): number | null {
  const candidate = typeof value === "number" && Number.isFinite(value) ? value : null;
  if (candidate === null) return null;
  if (candidate < min) return min;
  if (candidate > max) return max;
  return candidate;
}

function parseDateOrNull(value: unknown): string | null {
  const text = trimText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractJsonPayload(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  const strictParsed = parseJsonObject(trimmed);
  if (Object.keys(strictParsed).length > 0) {
    return strictParsed;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJsonObject(trimmed.slice(start, end + 1));
  }

  return {};
}

function normalizeSignalCandidate(value: unknown): DiscoveredSignal | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const sourceUrl = normalizeUrl(raw.sourceUrl);
  const headline = trimText(raw.headline);
  const summary = trimText(raw.summary);
  if (!sourceUrl || !headline || !summary) return null;

  const competitors = Array.isArray(raw.competitors)
    ? raw.competitors.map((entry) => trimText(entry)).filter((entry) => Boolean(entry))
    : [];

  return {
    eventType: trimText(raw.eventType).toUpperCase().replace(/\s+/g, "_") || "OTHER",
    headline,
    summary,
    suggestedOutreach: trimText(raw.suggestedOutreach),
    confidenceScore: clampScore(raw.confidenceScore, 0, 1),
    relevanceScore: clampScore(raw.relevanceScore, 1, 100),
    signalDate: parseDateOrNull(raw.signalDate),
    sourceUrl,
    sourceTitle: trimText(raw.sourceTitle),
    sourcePublishedAt: parseDateOrNull(raw.sourcePublishedAt),
    competitors
  };
}

export function normalizeDomain(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function buildSignalDedupeKey(entityId: string, signal: DiscoveredSignal): string {
  const hash = createHash("sha256");
  hash.update(entityId);
  hash.update("\n");
  hash.update(signal.eventType);
  hash.update("\n");
  hash.update(signal.headline.toLowerCase());
  hash.update("\n");
  hash.update(signal.sourceUrl.toLowerCase());
  hash.update("\n");
  hash.update(signal.signalDate || "");
  return hash.digest("hex").slice(0, 40);
}

export async function discoverSignalsViaWebSearch(input: {
  cacheKey: string;
  schemaName: string;
  prompt: string;
  maxSignals: number;
}) {
  const cached = await getCachedLookup(
    input.cacheKey,
    async () => {
      const client = getOpenAIClient();
      if (!client) return [] as DiscoveredSignal[];

      const model = process.env.OPENAI_SIGNAL_MODEL || process.env.OPENAI_SEARCH_MODEL || "gpt-4o-mini";
      const response = await client.responses.create({
        model,
        tools: [{ type: "web_search_preview" }],
        text: {
          format: {
            type: "json_schema",
            name: input.schemaName,
            schema: signalSchema,
            strict: false
          }
        },
        input: [
          {
            role: "system",
            content: [
              {
                type: "input_text",
                text:
                  "You are a CRM signal scout. Return only factual, sourced events from the requested window. Focus on events that justify a congratulatory or strategically useful outreach message. If the entity identity is ambiguous, return no signals."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: input.prompt
              }
            ]
          }
        ]
      } as any);

      const parsed = extractJsonPayload(response.output_text || "{}");
      const rawSignals = Array.isArray(parsed.signals) ? parsed.signals : [];
      return rawSignals
        .map((entry) => normalizeSignalCandidate(entry))
        .filter((entry): entry is DiscoveredSignal => entry !== null)
        .slice(0, input.maxSignals);
    },
    SIGNAL_SEARCH_CACHE_TTL_MS
  );

  return cached.data;
}
