import { createHash } from "node:crypto";
import OpenAI from "openai";
import { prisma } from "@/lib/db";
import { getCachedLookup } from "@/lib/search-cache";

type CoInvestorSignalCandidate = {
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

type MinimalCoInvestor = {
  id: string;
  name: string;
  website: string | null;
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
  isSeedInvestor: boolean;
  isSeriesAInvestor: boolean;
  investments: Array<{
    portfolioCompanyName: string;
  }>;
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
    const query = parsed.search || "";
    return `https://${host}${path}${query}`;
  } catch {
    return "";
  }
}

function normalizeDomain(value: string): string {
  try {
    const parsed = new URL(value);
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
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

function normalizeSignalCandidate(value: unknown): CoInvestorSignalCandidate | null {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const sourceUrl = normalizeUrl(raw.sourceUrl);
  const headline = trimText(raw.headline);
  const summary = trimText(raw.summary);
  if (!sourceUrl || !headline || !summary) return null;

  const competitors = Array.isArray(raw.competitors)
    ? raw.competitors.map((entry) => trimText(entry)).filter((entry) => Boolean(entry))
    : [];

  const normalized: CoInvestorSignalCandidate = {
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

  return normalized;
}

function buildDedupeKey(coInvestorId: string, signal: CoInvestorSignalCandidate): string {
  const hash = createHash("sha256");
  hash.update(coInvestorId);
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

async function discoverSignalsForCoInvestor(input: {
  coInvestor: MinimalCoInvestor;
  maxSignalsPerCoInvestor: number;
  lookbackDays: number;
}): Promise<CoInvestorSignalCandidate[]> {
  const { coInvestor, maxSignalsPerCoInvestor, lookbackDays } = input;
  const cacheKey = [
    "co-investor-signals",
    coInvestor.id,
    maxSignalsPerCoInvestor,
    lookbackDays
  ].join(":");

  const cached = await getCachedLookup(
    cacheKey,
    async () => {
      const client = getOpenAIClient();
      if (!client) return [] as CoInvestorSignalCandidate[];

      const model = process.env.OPENAI_SIGNAL_MODEL || process.env.OPENAI_SEARCH_MODEL || "gpt-4o-mini";
      const investmentNames = coInvestor.investments
        .map((entry) => entry.portfolioCompanyName)
        .filter((entry) => Boolean(entry))
        .slice(0, 6);

      const response = await client.responses.create({
        model,
        tools: [{ type: "web_search_preview" }],
        text: {
          format: {
            type: "json_schema",
            name: "co_investor_signals",
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
                  "You are a CRM signal scout for venture relationships. Return only factual, sourced events from the requested window. Focus on events that justify a congratulatory or strategic outreach message."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `Find up to ${maxSignalsPerCoInvestor} high-value signals from the last ${lookbackDays} days for this co-investor.\n` +
                  `Name: ${coInvestor.name}\n` +
                  `Website: ${coInvestor.website || "unknown"}\n` +
                  `HQ: ${[coInvestor.headquartersCity, coInvestor.headquartersState, coInvestor.headquartersCountry]
                    .filter(Boolean)
                    .join(", ") || "unknown"}\n` +
                  `Investor profile: ${coInvestor.isSeedInvestor ? "Seed" : ""}${coInvestor.isSeedInvestor && coInvestor.isSeriesAInvestor ? ", " : ""}${coInvestor.isSeriesAInvestor ? "Series A" : ""}\n` +
                  `Recent portfolio names: ${investmentNames.join(", ") || "unknown"}\n` +
                  "Event types to prefer: NEW_FUND, NEW_INVESTMENT, FOLLOW_ON, EXIT, MAJOR_HIRE, MAJOR_PARTNERSHIP, REGULATORY, COMPETITOR_MOVE.\n" +
                  "For each event, include sourceUrl, concise summary, and a one-sentence suggestedOutreach."
              }
            ]
          }
        ]
      } as any);

      const parsed = extractJsonPayload(response.output_text || "{}");
      const rawSignals = Array.isArray(parsed.signals) ? parsed.signals : [];
      return rawSignals
        .map((entry) => normalizeSignalCandidate(entry))
        .filter((entry): entry is CoInvestorSignalCandidate => entry !== null)
        .slice(0, maxSignalsPerCoInvestor);
    },
    SIGNAL_SEARCH_CACHE_TTL_MS
  );

  return cached.data;
}

export async function runCoInvestorSignalsSweep(input?: {
  maxCoInvestors?: number;
  maxSignalsPerCoInvestor?: number;
  lookbackDays?: number;
}) {
  const startedAtMs = Date.now();
  const maxCoInvestors = Math.min(Math.max(input?.maxCoInvestors ?? 10, 1), 100);
  const maxSignalsPerCoInvestor = Math.min(Math.max(input?.maxSignalsPerCoInvestor ?? 4, 1), 10);
  const lookbackDays = Math.min(Math.max(input?.lookbackDays ?? 14, 1), 30);

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "OPENAI_API_KEY is not configured",
      maxCoInvestors,
      maxSignalsPerCoInvestor,
      lookbackDays,
      processed: 0,
      discovered: 0,
      persisted: 0,
      failed: 0,
      durationMs: Date.now() - startedAtMs
    };
  }

  const coInvestors = await prisma.coInvestor.findMany({
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true,
      isSeedInvestor: true,
      isSeriesAInvestor: true,
      investments: {
        select: { portfolioCompanyName: true },
        orderBy: { createdAt: "desc" },
        take: 6
      }
    },
    orderBy: { updatedAt: "desc" },
    take: maxCoInvestors
  });

  const perCoInvestor: Array<{
    coInvestorId: string;
    name: string;
    discovered: number;
    persisted: number;
    error: string | null;
  }> = [];

  let discovered = 0;
  let persisted = 0;
  let failed = 0;

  for (const coInvestor of coInvestors) {
    try {
      const signals = await discoverSignalsForCoInvestor({
        coInvestor,
        maxSignalsPerCoInvestor,
        lookbackDays
      });
      discovered += signals.length;

      if (signals.length === 0) {
        perCoInvestor.push({
          coInvestorId: coInvestor.id,
          name: coInvestor.name,
          discovered: 0,
          persisted: 0,
          error: null
        });
        continue;
      }

      const createManyResult = await prisma.coInvestorSignalEvent.createMany({
        data: signals.map((signal) => ({
          coInvestorId: coInvestor.id,
          eventType: signal.eventType,
          headline: signal.headline,
          summary: signal.summary,
          suggestedOutreach: signal.suggestedOutreach || null,
          confidenceScore: signal.confidenceScore,
          relevanceScore: signal.relevanceScore,
          signalDate: signal.signalDate ? new Date(signal.signalDate) : null,
          sourceUrl: signal.sourceUrl,
          sourceDomain: normalizeDomain(signal.sourceUrl) || null,
          sourceTitle: signal.sourceTitle || null,
          sourcePublishedAt: signal.sourcePublishedAt ? new Date(signal.sourcePublishedAt) : null,
          dedupeKey: buildDedupeKey(coInvestor.id, signal),
          metadataJson:
            signal.competitors.length > 0 ? { competitors: signal.competitors } : undefined
        })),
        skipDuplicates: true
      });

      persisted += createManyResult.count;
      perCoInvestor.push({
        coInvestorId: coInvestor.id,
        name: coInvestor.name,
        discovered: signals.length,
        persisted: createManyResult.count,
        error: null
      });
    } catch (error) {
      failed += 1;
      perCoInvestor.push({
        coInvestorId: coInvestor.id,
        name: coInvestor.name,
        discovered: 0,
        persisted: 0,
        error: error instanceof Error ? error.message : "Unknown signal processing error"
      });
      console.error("co_investor_signal_sweep_error", {
        coInvestorId: coInvestor.id,
        error
      });
    }
  }

  return {
    ok: true,
    maxCoInvestors,
    maxSignalsPerCoInvestor,
    lookbackDays,
    processed: coInvestors.length,
    discovered,
    persisted,
    failed,
    durationMs: Date.now() - startedAtMs,
    perCoInvestor
  };
}

export async function listRecentCoInvestorSignals(input?: {
  coInvestorId?: string;
  days?: number;
  limit?: number;
}) {
  const limit = Math.min(Math.max(input?.limit ?? 50, 1), 200);
  const days = Math.min(Math.max(input?.days ?? 7, 1), 60);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return prisma.coInvestorSignalEvent.findMany({
    where: {
      ...(input?.coInvestorId ? { coInvestorId: input.coInvestorId } : {}),
      OR: [
        { sourcePublishedAt: { gte: cutoff } },
        { sourcePublishedAt: null, createdAt: { gte: cutoff } }
      ]
    },
    include: {
      coInvestor: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: [{ sourcePublishedAt: "desc" }, { createdAt: "desc" }],
    take: limit
  });
}
