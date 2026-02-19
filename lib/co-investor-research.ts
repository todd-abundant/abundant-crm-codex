import OpenAI from "openai";
import {
  CoInvestorInput,
  coInvestorInputSchema,
  coInvestorSearchCandidateSchema,
  type CoInvestorSearchCandidate
} from "@/lib/schemas";
import { getCachedLookup } from "@/lib/search-cache";

export const emptyCoInvestorDraft: CoInvestorInput = {
  name: "",
  legalName: "",
  website: "",
  headquartersCity: "",
  headquartersState: "",
  headquartersCountry: "",
  isSeedInvestor: false,
  isSeriesAInvestor: false,
  investmentNotes: "",
  researchNotes: "",
  partners: [],
  investments: []
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

const CO_INVESTOR_SEARCH_CACHE_TTL_MS = 5 * 60_000;

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
    isSeedInvestor: { type: "boolean" },
    isSeriesAInvestor: { type: "boolean" },
    investmentNotes: { type: "string" },
    researchNotes: { type: "string" },
    partners: {
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
          investmentStage: { type: "string" },
          leadPartnerName: { type: "string" },
          sourceUrl: { type: "string" }
        },
        required: ["portfolioCompanyName"]
      }
    }
  },
  required: ["name", "isSeedInvestor", "isSeriesAInvestor", "partners", "investments"]
};

type MinimalCoInvestor = {
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

function mergeDraft(partial: Partial<CoInvestorInput>): CoInvestorInput {
  return {
    ...emptyCoInvestorDraft,
    ...partial,
    partners: (partial.partners ?? []).filter((entry) => Boolean(entry.name?.trim())),
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
  return value.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter((entry) => Boolean(entry));
}

function normalizeCoInvestorCandidate(candidate: unknown): CoInvestorSearchCandidate | null {
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

  const parsed = coInvestorSearchCandidateSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

export async function searchCoInvestorCandidates(query: string): Promise<{
  candidates: CoInvestorSearchCandidate[];
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
    `co-investor-candidates:${normalizedQuery}`,
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
            name: "co_investor_candidates",
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
                  "Search the web to find seed and series A digital health investors that are US based whose name matches the user query. Return up to 6 candidates with location and website so a user can disambiguate by location."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  `Search the web to find seed and series A digital health investors that are US based whose name matches "${normalizedQuery}".  Return up to 6 candidates with location and website so a user can disambiguate by location.`
              }
            ]
          }
        ]
      } as any);

      const parsed = extractJsonPayload(response.output_text || "{}");
      const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
      const candidates = rawCandidates
        .map((candidate) => normalizeCoInvestorCandidate(candidate))
        .filter((candidate): candidate is CoInvestorSearchCandidate => candidate !== null)
        .slice(0, 6);

      if (candidates.length === 0) {
        return fallback;
      }

      return { candidates, researchUsed: true };
    },
    CO_INVESTOR_SEARCH_CACHE_TTL_MS
  );

  const totalMs = Date.now() - startMs;
  console.log(
    `search_co_investor_candidates latencyMs=${totalMs} cache=${result.fromCache ? "hit" : "miss"} query="${normalizedQuery}"`
  );

  return result.data;
}

export async function enrichCoInvestorFromWeb(seed: MinimalCoInvestor): Promise<CoInvestorInput> {
  const client = getOpenAIClient();
  if (!client) {
    return mergeDraft({
      name: seed.name,
      website: compactText(seed.website),
      headquartersCity: compactText(seed.headquartersCity),
      headquartersState: compactText(seed.headquartersState),
      headquartersCountry: compactText(seed.headquartersCountry),
      researchNotes:
        "OPENAI_API_KEY missing. Record was queued but auto-research could not run. Add API key and rerun queued jobs.",
      investmentNotes: ""
    });
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" }],
    text: {
      format: {
        type: "json_schema",
        name: "co_investor_enrichment",
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
              "You are enriching a VC CRM account for a US-based digital health co-investor. Focus on seed and Series A investors. Gather structured details from current reputable sources. Return partners, investments, and whether they are seed and/or Series A investors."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Research this US-based seed and Series A digital health investor and extract structured CRM data. ` +
              `Name: ${seed.name}. ` +
              `HQ city: ${compactText(seed.headquartersCity) || "unknown"}. ` +
              `HQ state: ${compactText(seed.headquartersState) || "unknown"}. ` +
              `HQ country: ${compactText(seed.headquartersCountry) || "unknown"}. ` +
              `Website: ${compactText(seed.website) || "unknown"}. ` +
              `Include partner team and investments (company, amount, date, and stage). ` +
              `When available, include public partner email addresses and phone numbers.`
          }
        ]
      }
    ]
  } as any);

  const parsed = parseJsonObject(response.output_text?.trim() || "{}");
  const validated = coInvestorInputSchema.partial().safeParse(parsed);

  if (!validated.success) {
    return mergeDraft({
      name: seed.name,
      website: compactText(seed.website),
      headquartersCity: compactText(seed.headquartersCity),
      headquartersState: compactText(seed.headquartersState),
      headquartersCountry: compactText(seed.headquartersCountry),
      researchNotes: "Research ran but structured extraction failed validation.",
      investmentNotes: ""
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

export async function prefillCoInvestorFromNaturalLanguage(
  prompt: string
): Promise<{ draft: CoInvestorInput; researchUsed: boolean }> {
  const { candidates, researchUsed } = await searchCoInvestorCandidates(prompt);
  const firstCandidate = candidates[0];

  if (!firstCandidate) {
    return {
      draft: mergeDraft({ name: prompt }),
      researchUsed: false
    };
  }

  const draft = await enrichCoInvestorFromWeb({
    name: firstCandidate.name,
    website: firstCandidate.website,
    headquartersCity: firstCandidate.headquartersCity,
    headquartersState: firstCandidate.headquartersState,
    headquartersCountry: firstCandidate.headquartersCountry
  });

  return { draft, researchUsed };
}
