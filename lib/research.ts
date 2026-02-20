import OpenAI from "openai";
import {
  HealthSystemInput,
  healthSystemInputSchema,
  healthSystemSearchCandidateSchema,
  type HealthSystemSearchCandidate
} from "@/lib/schemas";
import { getCachedLookup } from "@/lib/search-cache";

export const emptyHealthSystemDraft: HealthSystemInput = {
  name: "",
  legalName: "",
  website: "",
  headquartersCity: "",
  headquartersState: "",
  headquartersCountry: "",
  netPatientRevenueUsd: null,
  isLimitedPartner: false,
  limitedPartnerInvestmentUsd: null,
  isAllianceMember: false,
  hasInnovationTeam: null,
  hasVentureTeam: null,
  ventureTeamSummary: "",
  executives: [],
  venturePartners: [],
  investments: [],
  researchNotes: ""
};

const searchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          website: { type: "string" },
          headquartersCity: { type: "string" },
          headquartersState: { type: "string" },
          headquartersCountry: { type: "string" },
          summary: { type: "string" },
          sourceUrls: {
            type: "array",
            items: { type: "string" }
          }
        },
          required: ["name"]
      }
    }
  },
  required: ["candidates"]
};

const HEALTH_SYSTEM_SEARCH_CACHE_TTL_MS = 5 * 60_000;

const enrichmentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: "string" },
    legalName: { type: "string" },
    website: { type: "string" },
    headquartersCity: { type: "string" },
    headquartersState: { type: "string" },
    headquartersCountry: { type: "string" },
    netPatientRevenueUsd: { type: ["number", "null"] },
    isLimitedPartner: { type: "boolean" },
    limitedPartnerInvestmentUsd: { type: ["number", "null"] },
    isAllianceMember: { type: "boolean" },
    hasInnovationTeam: { type: ["boolean", "null"] },
    hasVentureTeam: { type: ["boolean", "null"] },
    ventureTeamSummary: { type: "string" },
    executives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          url: { type: "string" }
        },
        required: ["name"]
      }
    },
    venturePartners: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          url: { type: "string" }
        },
        required: ["name"]
      }
    },
    investments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          portfolioCompanyName: { type: "string" },
          investmentAmountUsd: { type: ["number", "null"] },
          investmentDate: { type: ["string", "null"] },
          leadPartnerName: { type: "string" },
          sourceUrl: { type: "string" }
        },
        required: ["portfolioCompanyName"]
      }
    },
    researchNotes: { type: "string" }
  },
  required: [
    "name",
    "isLimitedPartner",
    "isAllianceMember",
    "executives",
    "venturePartners",
    "investments"
  ]
};

type MinimalHealthSystem = {
  name: string;
  website?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
};

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function mergeDraft(partial: Partial<HealthSystemInput>): HealthSystemInput {
  return {
    ...emptyHealthSystemDraft,
    ...partial,
    executives: (partial.executives ?? []).filter((entry) => Boolean(entry.name?.trim())),
    venturePartners: (partial.venturePartners ?? []).filter((entry) => Boolean(entry.name?.trim())),
    investments: (partial.investments ?? []).filter((entry) => Boolean(entry.portfolioCompanyName?.trim()))
  };
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
  if (!trimmed) {
    return {};
  }

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

function compactText(value?: string | null): string {
  return value?.trim() || "";
}

function normalizeSearchText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSearchUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => Boolean(entry));
}

function normalizeHealthSystemCandidate(candidate: unknown): HealthSystemSearchCandidate | null {
  if (!candidate || typeof candidate !== "object") {
    return null;
  }

  const rawCandidate = candidate as Record<string, unknown>;
  const normalized = {
    name: normalizeSearchText(rawCandidate.name),
    website: normalizeSearchText(rawCandidate.website),
    headquartersCity: normalizeSearchText(rawCandidate.headquartersCity),
    headquartersState: normalizeSearchText(rawCandidate.headquartersState),
    headquartersCountry: normalizeSearchText(rawCandidate.headquartersCountry),
    summary: normalizeSearchText(rawCandidate.summary),
    sourceUrls: normalizeSearchUrls(rawCandidate.sourceUrls)
  };

  const parsed = healthSystemSearchCandidateSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export async function searchHealthSystemCandidates(query: string): Promise<{
  candidates: HealthSystemSearchCandidate[];
  researchUsed: boolean;
}> {
  const normalizedQuery = query.trim();
  const fallback = {
    candidates: [
      {
        name: normalizedQuery,
        headquartersCity: "",
        headquartersState: "",
        headquartersCountry: "",
        website: "",
        summary: "AI web search not configured. Confirm and enqueue research once API key is set.",
        sourceUrls: []
      }
    ],
    researchUsed: false
  };

  if (!normalizedQuery) {
    return fallback;
  }

  const startMs = Date.now();
  const result = await getCachedLookup(
    `health-system-candidates:${normalizedQuery}`,
    async () => {
      const client = getOpenAIClient();
      if (!client) {
        return fallback;
      }

      const model = process.env.OPENAI_SEARCH_MODEL || "gpt-4o-mini";
      const response = await client.responses.create({
        model,
        tools: [{ type: "web_search_preview" }],
        text: {
          format: {
            type: "json_schema",
            name: "health_system_candidates",
            schema: searchSchema,
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
                  "Find up to 6 likely US-based health system parent organizations that best match the query. Exclude service lines, departments, physician groups, innovation programs, or other sub-brands unless they are clearly independent health systems. Prefer canonical organization records with official websites. Return headquarters city/state/country and website to disambiguate results."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `Find up to 6 US-based health system parent organizations that match "${normalizedQuery}". ` +
                  "Do not return sub-brands or program pages."
              }
            ]
          }
        ]
      } as any);

      const parsed = extractJsonPayload(response.output_text || "{}");
      const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
      const candidates = rawCandidates
        .map((candidate) => normalizeHealthSystemCandidate(candidate))
        .filter((candidate): candidate is HealthSystemSearchCandidate => candidate !== null)
        .slice(0, 6);

      if (candidates.length === 0) {
        return fallback;
      }

      return { candidates, researchUsed: true };
    },
    HEALTH_SYSTEM_SEARCH_CACHE_TTL_MS
  );

  const totalMs = Date.now() - startMs;
  console.log(
    `search_health_system_candidates latencyMs=${totalMs} cache=${result.fromCache ? "hit" : "miss"} query="${normalizedQuery}"`
  );

  return result.data;
}

export async function enrichHealthSystemFromWeb(seed: MinimalHealthSystem): Promise<HealthSystemInput> {
  const client = getOpenAIClient();
  if (!client) {
    return mergeDraft({
      name: seed.name,
      website: compactText(seed.website),
      headquartersCity: compactText(seed.headquartersCity),
      headquartersState: compactText(seed.headquartersState),
      headquartersCountry: compactText(seed.headquartersCountry),
      researchNotes:
        "OPENAI_API_KEY missing. Record was queued but auto-research could not run. Add API key and rerun queued jobs."
    });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    text: {
      format: {
        type: "json_schema",
        name: "health_system_enrichment",
        schema: enrichmentSchema,
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
              "You are enriching a VC CRM account. Focus on a single health system. Gather structured details from current reputable sources. If uncertain, return empty strings or nulls."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Research this health system and extract structured CRM data. ` +
              `Name: ${seed.name}. ` +
              `HQ city: ${compactText(seed.headquartersCity) || "unknown"}. ` +
              `HQ state: ${compactText(seed.headquartersState) || "unknown"}. ` +
              `HQ country: ${compactText(seed.headquartersCountry) || "unknown"}. ` +
              `Website: ${compactText(seed.website) || "unknown"}. ` +
              `Include executive team, innovation/venture team presence, venture partners, and venture investments. ` +
              `When available, include public executive/partner email addresses and phone numbers.`
          }
        ]
      }
    ]
  } as any);

  const parsed = parseJsonObject(response.output_text?.trim() || "{}");
  const validated = healthSystemInputSchema.partial().safeParse(parsed);

  if (!validated.success) {
    return mergeDraft({
      name: seed.name,
      website: compactText(seed.website),
      headquartersCity: compactText(seed.headquartersCity),
      headquartersState: compactText(seed.headquartersState),
      headquartersCountry: compactText(seed.headquartersCountry),
      researchNotes: "Research ran but structured extraction failed validation."
    });
  }

  return mergeDraft({
    name: seed.name,
    website: compactText(seed.website),
    headquartersCity: compactText(seed.headquartersCity),
    headquartersState: compactText(seed.headquartersState),
    headquartersCountry: compactText(seed.headquartersCountry),
    ...validated.data
  });
}

export async function prefillHealthSystemFromNaturalLanguage(
  prompt: string
): Promise<{ draft: HealthSystemInput; researchUsed: boolean }> {
  const { candidates, researchUsed } = await searchHealthSystemCandidates(prompt);
  const firstCandidate = candidates[0];

  if (!firstCandidate) {
    return {
      draft: mergeDraft({ name: prompt }),
      researchUsed: false
    };
  }

  const draft = await enrichHealthSystemFromWeb({
    name: firstCandidate.name,
    website: firstCandidate.website,
    headquartersCity: firstCandidate.headquartersCity,
    headquartersState: firstCandidate.headquartersState,
    headquartersCountry: firstCandidate.headquartersCountry
  });

  return { draft, researchUsed };
}
