import { prisma } from "@/lib/db";
import {
  buildSignalDedupeKey,
  discoverSignalsViaWebSearch,
  normalizeDomain
} from "@/lib/signal-discovery";

type MinimalCompany = {
  id: string;
  name: string;
  website: string | null;
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
  companyType: string;
  primaryCategory: string;
  description: string | null;
  healthSystemLinks: Array<{
    healthSystem: {
      name: string;
    };
  }>;
  coInvestorLinks: Array<{
    coInvestor: {
      name: string;
    };
  }>;
  fundraises: Array<{
    roundLabel: string;
    status: string;
  }>;
};

async function discoverSignalsForCompany(input: {
  company: MinimalCompany;
  maxSignalsPerEntity: number;
  lookbackDays: number;
}) {
  const { company, maxSignalsPerEntity, lookbackDays } = input;
  const healthSystems = company.healthSystemLinks.map((entry) => entry.healthSystem.name).slice(0, 6);
  const coInvestors = company.coInvestorLinks.map((entry) => entry.coInvestor.name).slice(0, 6);
  const fundraiseRounds = company.fundraises
    .map((entry) => `${entry.roundLabel} (${entry.status})`)
    .slice(0, 4);

  return discoverSignalsViaWebSearch({
    cacheKey: ["company-signals", company.id, maxSignalsPerEntity, lookbackDays].join(":"),
    schemaName: "company_signals",
    maxSignals: maxSignalsPerEntity,
    prompt:
      `Find up to ${maxSignalsPerEntity} high-value signals from the last ${lookbackDays} days for this company.\n` +
      `Name: ${company.name}\n` +
      `Website: ${company.website || "unknown"}\n` +
      `HQ: ${[company.headquartersCity, company.headquartersState, company.headquartersCountry]
        .filter(Boolean)
        .join(", ") || "unknown"}\n` +
      `Type: ${company.companyType}\n` +
      `Primary category: ${company.primaryCategory}\n` +
      `Description: ${company.description || "unknown"}\n` +
      `Related health systems: ${healthSystems.join(", ") || "unknown"}\n` +
      `Related co-investors: ${coInvestors.join(", ") || "unknown"}\n` +
      `Known fundraise context: ${fundraiseRounds.join(", ") || "unknown"}\n` +
      "Prefer events such as FUNDRAISE, CUSTOMER_WIN, MAJOR_PARTNERSHIP, PRODUCT_LAUNCH, REGULATORY, EXECUTIVE_HIRE, ACQUISITION, and COMPETITOR_MOVE.\n" +
      "Focus on items that would help a relationship owner send congratulations or a strategically useful market update."
  });
}

export async function runCompanySignalsSweep(input?: {
  maxCompanies?: number;
  maxSignalsPerEntity?: number;
  lookbackDays?: number;
}) {
  const startedAtMs = Date.now();
  const maxCompanies = Math.min(Math.max(input?.maxCompanies ?? 10, 1), 100);
  const maxSignalsPerEntity = Math.min(Math.max(input?.maxSignalsPerEntity ?? 4, 1), 10);
  const lookbackDays = Math.min(Math.max(input?.lookbackDays ?? 14, 1), 30);

  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      reason: "OPENAI_API_KEY is not configured",
      maxCompanies,
      maxSignalsPerEntity,
      lookbackDays,
      processed: 0,
      discovered: 0,
      persisted: 0,
      failed: 0,
      durationMs: Date.now() - startedAtMs
    };
  }

  const companies = await prisma.company.findMany({
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true,
      companyType: true,
      primaryCategory: true,
      description: true,
      healthSystemLinks: {
        select: {
          healthSystem: {
            select: {
              name: true
            }
          }
        },
        take: 6
      },
      coInvestorLinks: {
        select: {
          coInvestor: {
            select: {
              name: true
            }
          }
        },
        take: 6
      },
      fundraises: {
        select: {
          roundLabel: true,
          status: true
        },
        orderBy: { createdAt: "desc" },
        take: 4
      }
    },
    orderBy: { updatedAt: "desc" },
    take: maxCompanies
  });

  const perCompany: Array<{
    companyId: string;
    name: string;
    discovered: number;
    persisted: number;
    error: string | null;
  }> = [];

  let discovered = 0;
  let persisted = 0;
  let failed = 0;

  for (const company of companies) {
    try {
      const signals = await discoverSignalsForCompany({
        company,
        maxSignalsPerEntity,
        lookbackDays
      });
      discovered += signals.length;

      const createManyResult = signals.length
        ? await prisma.companySignalEvent.createMany({
            data: signals.map((signal) => ({
              companyId: company.id,
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
              dedupeKey: buildSignalDedupeKey(company.id, signal),
              metadataJson: signal.competitors.length > 0 ? { competitors: signal.competitors } : undefined
            })),
            skipDuplicates: true
          })
        : { count: 0 };

      persisted += createManyResult.count;
      perCompany.push({
        companyId: company.id,
        name: company.name,
        discovered: signals.length,
        persisted: createManyResult.count,
        error: null
      });
    } catch (error) {
      failed += 1;
      perCompany.push({
        companyId: company.id,
        name: company.name,
        discovered: 0,
        persisted: 0,
        error: error instanceof Error ? error.message : "Unknown signal processing error"
      });
      console.error("company_signal_sweep_error", {
        companyId: company.id,
        error
      });
    }
  }

  return {
    ok: true,
    maxCompanies,
    maxSignalsPerEntity,
    lookbackDays,
    processed: companies.length,
    discovered,
    persisted,
    failed,
    durationMs: Date.now() - startedAtMs,
    perCompany
  };
}
