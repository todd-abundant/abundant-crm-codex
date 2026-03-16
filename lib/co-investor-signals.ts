import { prisma } from "@/lib/db";
import {
  buildSignalDedupeKey,
  discoverSignalsViaWebSearch,
  normalizeDomain
} from "@/lib/signal-discovery";

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

async function discoverSignalsForCoInvestor(input: {
  coInvestor: MinimalCoInvestor;
  maxSignalsPerCoInvestor: number;
  lookbackDays: number;
}) {
  const { coInvestor, maxSignalsPerCoInvestor, lookbackDays } = input;
  const investmentNames = coInvestor.investments
    .map((entry) => entry.portfolioCompanyName)
    .filter((entry) => Boolean(entry))
    .slice(0, 6);

  return discoverSignalsViaWebSearch({
    cacheKey: ["co-investor-signals", coInvestor.id, maxSignalsPerCoInvestor, lookbackDays].join(":"),
    schemaName: "co_investor_signals",
    maxSignals: maxSignalsPerCoInvestor,
    prompt:
      `Find up to ${maxSignalsPerCoInvestor} high-value signals from the last ${lookbackDays} days for this co-investor.\n` +
      `Name: ${coInvestor.name}\n` +
      `Website: ${coInvestor.website || "unknown"}\n` +
      `HQ: ${[coInvestor.headquartersCity, coInvestor.headquartersState, coInvestor.headquartersCountry]
        .filter(Boolean)
        .join(", ") || "unknown"}\n` +
      `Investor profile: ${coInvestor.isSeedInvestor ? "Seed" : ""}${coInvestor.isSeedInvestor && coInvestor.isSeriesAInvestor ? ", " : ""}${coInvestor.isSeriesAInvestor ? "Series A" : ""}\n` +
      `Recent portfolio names: ${investmentNames.join(", ") || "unknown"}\n` +
      "Prefer events such as NEW_FUND, NEW_INVESTMENT, FOLLOW_ON, EXIT, MAJOR_HIRE, MAJOR_PARTNERSHIP, REGULATORY, and COMPETITOR_MOVE.\n" +
      "For each event, include a concise summary and a one-sentence suggestedOutreach."
  });
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
          dedupeKey: buildSignalDedupeKey(coInvestor.id, signal),
          metadataJson: signal.competitors.length > 0 ? { competitors: signal.competitors } : undefined
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
