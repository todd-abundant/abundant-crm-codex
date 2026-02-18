import OpenAI from "openai";
import {
  CoInvestorInput,
  coInvestorInputSchema,
  coInvestorSearchCandidateSchema,
  type CoInvestorSearchCandidate
} from "@/lib/schemas";

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
        required: ["name", "sourceUrls"]
      }
    }
  },
  required: ["candidates"]
};

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

function compactText(value?: string | null): string {
  return value?.trim() || "";
}

export async function searchCoInvestorCandidates(query: string): Promise<{
  candidates: CoInvestorSearchCandidate[];
  researchUsed: boolean;
}> {
  const fallback = {
    candidates: [
      {
        name: query,
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

  const client = getOpenAIClient();
  if (!client) {
    return fallback;
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
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
              "Find likely US and international seed and series A investors in digital health. Return up to 6 candidates with location and website so a user can disambiguate by location."
          }
        ]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `Investor search: ${query}` }]
      }
    ]
  } as any);

  const parsed = parseJsonObject(response.output_text?.trim() || "{}");
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates = rawCandidates
    .map((candidate) => coInvestorSearchCandidateSchema.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data)
    .slice(0, 6);

  if (candidates.length === 0) {
    return fallback;
  }

  return { candidates, researchUsed: true };
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
              "You are enriching a VC CRM account for a digital health co-investor. Focus on seed and Series A investors. Gather structured details from current reputable sources. Return partners, investments, and whether they are seed and/or Series A investors."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Research this investor and extract structured CRM data. ` +
              `Name: ${seed.name}. ` +
              `HQ city: ${compactText(seed.headquartersCity) || "unknown"}. ` +
              `HQ state: ${compactText(seed.headquartersState) || "unknown"}. ` +
              `HQ country: ${compactText(seed.headquartersCountry) || "unknown"}. ` +
              `Website: ${compactText(seed.website) || "unknown"}. ` +
              `Include partner team and investments (company, amount, date, and stage).`
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
