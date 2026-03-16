import { prisma } from "@/lib/db";
import {
  buildSignalDedupeKey,
  discoverSignalsViaWebSearch,
  normalizeDomain
} from "@/lib/signal-discovery";

type MinimalHealthSystem = {
  id: string;
  name: string;
  website: string | null;
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
  isAllianceMember: boolean;
  isLimitedPartner: boolean;
  hasInnovationTeam: boolean | null;
  hasVentureTeam: boolean | null;
  executives: Array<{
    name: string;
    title: string | null;
  }>;
  investments: Array<{
    portfolioCompanyName: string;
  }>;
};

async function discoverSignalsForHealthSystem(input: {
  healthSystem: MinimalHealthSystem;
  maxSignalsPerEntity: number;
  lookbackDays: number;
}) {
  const { healthSystem, maxSignalsPerEntity, lookbackDays } = input;
  const executiveNames = healthSystem.executives
    .map((entry) => `${entry.name}${entry.title ? ` (${entry.title})` : ""}`)
    .slice(0, 6);
  const investmentNames = healthSystem.investments.map((entry) => entry.portfolioCompanyName).slice(0, 6);

  return discoverSignalsViaWebSearch({
    cacheKey: ["health-system-signals", healthSystem.id, maxSignalsPerEntity, lookbackDays].join(":"),
    schemaName: "health_system_signals",
    maxSignals: maxSignalsPerEntity,
    prompt:
      `Find up to ${maxSignalsPerEntity} high-value signals from the last ${lookbackDays} days for this health system.\n` +
      `Name: ${healthSystem.name}\n` +
      `Website: ${healthSystem.website || "unknown"}\n` +
      `HQ: ${[healthSystem.headquartersCity, healthSystem.headquartersState, healthSystem.headquartersCountry]
        .filter(Boolean)
        .join(", ") || "unknown"}\n` +
      `Alliance member: ${healthSystem.isAllianceMember ? "yes" : "no"}\n` +
      `Limited partner: ${healthSystem.isLimitedPartner ? "yes" : "no"}\n` +
      `Innovation team: ${healthSystem.hasInnovationTeam === null ? "unknown" : healthSystem.hasInnovationTeam ? "yes" : "no"}\n` +
      `Venture team: ${healthSystem.hasVentureTeam === null ? "unknown" : healthSystem.hasVentureTeam ? "yes" : "no"}\n` +
      `Known executives: ${executiveNames.join(", ") || "unknown"}\n` +
      `Known investments: ${investmentNames.join(", ") || "unknown"}\n` +
      "Prefer events such as LEADERSHIP_CHANGE, MAJOR_PARTNERSHIP, AI_ADOPTION, EXPANSION, FINANCIAL_UPDATE, INVESTMENT_ACTIVITY, MERGER, and COMPETITOR_MOVE.\n" +
      "Focus on items that would help a relationship owner send congratulations or a strategically useful note."
  });
}

export async function runHealthSystemSignalsSweep(input?: {
  maxHealthSystems?: number;
  maxSignalsPerEntity?: number;
  lookbackDays?: number;
}) {
  const startedAtMs = Date.now();
  const maxHealthSystems = Math.min(Math.max(input?.maxHealthSystems ?? 10, 1), 100);
  const maxSignalsPerEntity = Math.min(Math.max(input?.maxSignalsPerEntity ?? 4, 1), 10);
  const lookbackDays = Math.min(Math.max(input?.lookbackDays ?? 14, 1), 30);

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "OPENAI_API_KEY is not configured",
      maxHealthSystems,
      maxSignalsPerEntity,
      lookbackDays,
      processed: 0,
      discovered: 0,
      persisted: 0,
      failed: 0,
      durationMs: Date.now() - startedAtMs
    };
  }

  const healthSystems = await prisma.healthSystem.findMany({
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true,
      isAllianceMember: true,
      isLimitedPartner: true,
      hasInnovationTeam: true,
      hasVentureTeam: true,
      executives: {
        select: {
          name: true,
          title: true
        },
        orderBy: { createdAt: "desc" },
        take: 6
      },
      investments: {
        select: { portfolioCompanyName: true },
        orderBy: { createdAt: "desc" },
        take: 6
      }
    },
    orderBy: { updatedAt: "desc" },
    take: maxHealthSystems
  });

  const perHealthSystem: Array<{
    healthSystemId: string;
    name: string;
    discovered: number;
    persisted: number;
    error: string | null;
  }> = [];

  let discovered = 0;
  let persisted = 0;
  let failed = 0;

  for (const healthSystem of healthSystems) {
    try {
      const signals = await discoverSignalsForHealthSystem({
        healthSystem,
        maxSignalsPerEntity,
        lookbackDays
      });
      discovered += signals.length;

      const createManyResult = signals.length
        ? await prisma.healthSystemSignalEvent.createMany({
            data: signals.map((signal) => ({
              healthSystemId: healthSystem.id,
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
              dedupeKey: buildSignalDedupeKey(healthSystem.id, signal),
              metadataJson: signal.competitors.length > 0 ? { competitors: signal.competitors } : undefined
            })),
            skipDuplicates: true
          })
        : { count: 0 };

      persisted += createManyResult.count;
      perHealthSystem.push({
        healthSystemId: healthSystem.id,
        name: healthSystem.name,
        discovered: signals.length,
        persisted: createManyResult.count,
        error: null
      });
    } catch (error) {
      failed += 1;
      perHealthSystem.push({
        healthSystemId: healthSystem.id,
        name: healthSystem.name,
        discovered: 0,
        persisted: 0,
        error: error instanceof Error ? error.message : "Unknown signal processing error"
      });
      console.error("health_system_signal_sweep_error", {
        healthSystemId: healthSystem.id,
        error
      });
    }
  }

  return {
    ok: true,
    maxHealthSystems,
    maxSignalsPerEntity,
    lookbackDays,
    processed: healthSystems.length,
    discovered,
    persisted,
    failed,
    durationMs: Date.now() - startedAtMs,
    perHealthSystem
  };
}
