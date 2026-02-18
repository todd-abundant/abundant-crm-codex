import OpenAI from "openai";
import {
  HealthSystemInput,
  healthSystemInputSchema,
  healthSystemSearchCandidateSchema,
  type HealthSystemSearchCandidate
} from "@/lib/schemas";

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

function compactText(value?: string | null): string {
  return value?.trim() || "";
}

export async function searchHealthSystemCandidates(query: string): Promise<{
  candidates: HealthSystemSearchCandidate[];
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
              "Find likely US health system entities. Return up to 6 candidates with headquarters location and website so a user can disambiguate by location."
          }
        ]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: `Health system search: ${query}` }]
      }
    ]
  } as any);

  const parsed = parseJsonObject(response.output_text?.trim() || "{}");
  const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
  const candidates = rawCandidates
    .map((candidate) => healthSystemSearchCandidateSchema.safeParse(candidate))
    .filter((result) => result.success)
    .map((result) => result.data)
    .slice(0, 6);

  if (candidates.length === 0) {
    return fallback;
  }

  return { candidates, researchUsed: true };
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
              `Include executive team, innovation/venture team presence, venture partners, and venture investments.`
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
