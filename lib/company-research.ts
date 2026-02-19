import OpenAI from "openai";
import {
  CompanyInput,
  companyInputSchema,
  companySearchCandidateSchema,
  type CompanySearchCandidate
} from "@/lib/schemas";
import { getCachedLookup } from "@/lib/search-cache";

export const emptyCompanyDraft: CompanyInput = {
  name: "",
  legalName: "",
  website: "",
  headquartersCity: "",
  headquartersState: "",
  headquartersCountry: "",
  companyType: "STARTUP",
  primaryCategory: "OTHER",
  primaryCategoryOther: "",
  declineReason: null,
  declineReasonOther: "",
  leadSourceType: "OTHER",
  leadSourceHealthSystemId: undefined,
  leadSourceNotes: "",
  description: "",
  googleTranscriptUrl: "",
  spinOutOwnershipPercent: null,
  intakeStatus: "NOT_SCHEDULED",
  intakeScheduledAt: null,
  screeningEvaluationAt: null,
  researchNotes: "",
  contacts: [],
  healthSystemLinks: [],
  coInvestorLinks: []
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

const COMPANY_SEARCH_CACHE_TTL_MS = 5 * 60_000;

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
    companyType: { type: "string" },
    primaryCategory: { type: "string" },
    primaryCategoryOther: { type: "string" },
    declineReason: { type: ["string", "null"] },
    declineReasonOther: { type: "string" },
    leadSourceType: { type: "string" },
    description: { type: "string" },
    googleTranscriptUrl: { type: "string" },
    spinOutOwnershipPercent: { type: ["number", "null"] },
    intakeStatus: { type: "string" },
    researchNotes: { type: "string" },
    healthSystemLinks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          healthSystemId: { type: "string" },
          relationshipType: { type: "string" },
          notes: { type: "string" },
          investmentAmountUsd: { type: ["number", "null"] },
          ownershipPercent: { type: ["number", "null"] }
        },
        required: ["healthSystemId", "relationshipType"]
      }
    },
    coInvestorLinks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          coInvestorId: { type: "string" },
          relationshipType: { type: "string" },
          notes: { type: "string" },
          investmentAmountUsd: { type: ["number", "null"] }
        },
        required: ["coInvestorId", "relationshipType"]
      }
    },
    contacts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          title: { type: "string" },
          relationshipTitle: { type: "string" },
          roleType: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          url: { type: "string" }
        },
        required: ["name"]
      }
    }
  },
  required: ["name", "companyType", "primaryCategory", "leadSourceType"]
};

type MinimalCompany = {
  name: string;
  website?: string | null;
  headquartersCity?: string | null;
  headquartersState?: string | null;
  headquartersCountry?: string | null;
};

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isEmptyValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    !normalized ||
    normalized === "unknown" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "none"
  );
}

function normalizeUrl(value: unknown): string {
  const text = cleanText(value);
  if (!text || isEmptyValue(text)) return "";

  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;

  try {
    const parsed = new URL(withProtocol);
    return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}${parsed.search}${parsed.hash}`.replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function parseNumericString(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") return null;

  const trimmed = cleanText(value);
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase().replace(/,/g, "").trim();
  const lower = normalized.toLowerCase();
  const multiplier = lower.includes("m") ? 1_000_000 : lower.includes("k") ? 1_000 : 1;

  const numberOnly = normalized.replace(/[^0-9.+-]/g, "");
  const parsed = Number.parseFloat(numberOnly);
  if (!Number.isFinite(parsed)) return null;

  return parsed * multiplier;
}

function parsePercent(value: unknown): number | null {
  const parsed = parseNumericString(value);
  if (parsed === null) return null;
  return Math.min(100, Math.max(0, parsed));
}

function normalizeEnumValue(
  value: unknown,
  allowedValues: readonly string[],
  normalize: (candidate: string) => string = (candidate) => candidate
): string | undefined {
  const raw = cleanText(value);
  if (!raw) return undefined;

  const normalized = normalize(raw);
  return allowedValues.includes(normalized) ? normalized : undefined;
}

function normalizeCompanyType(value: unknown): string | undefined {
  return normalizeEnumValue(
    value,
    ["STARTUP", "SPIN_OUT", "DENOVO"],
    (candidate) => {
      const normalized = candidate.trim().toUpperCase();
      if (["START UP", "START-UP", "STARTUP COMPANY"].includes(normalized)) return "STARTUP";
      if (["SPIN OUT", "SPIN-OUT", "SPINOUT", "SPIN_OUT"].includes(normalized)) return "SPIN_OUT";
      if (normalized.includes("DENOVO") || normalized.includes("DE NOVO") || normalized.includes("DE-NOVO")) {
        return "DENOVO";
      }
      return normalized;
    }
  );
}

function normalizePrimaryCategory(value: unknown): string | undefined {
  const raw = cleanText(value);
  if (!raw) return undefined;

  const normalized = raw.toLowerCase();
  const explicit = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "_")
    .replace(/__+/g, "_");

  const known = [
    "PATIENT_ACCESS_AND_GROWTH",
    "CARE_DELIVERY_TECH_ENABLED_SERVICES",
    "CLINICAL_WORKFLOW_AND_PRODUCTIVITY",
    "REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS",
    "VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT",
    "AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT",
    "DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION",
    "REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES",
    "DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT",
    "PHARMACY_AND_MEDICATION_ENABLEMENT",
    "SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS",
    "SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE",
    "PROVIDER_EXPERIENCE_AND_DEVELOPMENT",
    "OTHER"
  ] as const;

  if (known.includes(explicit as (typeof known)[number])) {
    return explicit;
  }

  if (normalized.includes("front door") || normalized.includes("patient access")) return "PATIENT_ACCESS_AND_GROWTH";
  if (normalized.includes("care delivery") || normalized.includes("hospital-at-home") || normalized.includes("hospital at home")) {
    return "CARE_DELIVERY_TECH_ENABLED_SERVICES";
  }
  if (normalized.includes("workflow") || normalized.includes("productivity") || normalized.includes("clinical")) {
    return "CLINICAL_WORKFLOW_AND_PRODUCTIVITY";
  }
  if (normalized.includes("revenue") || normalized.includes("billing") || normalized.includes("rcm")) {
    return "REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS";
  }
  if (normalized.includes("value-based") || normalized.includes("vbc") || normalized.includes("population")) {
    return "VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT";
  }
  if (normalized.includes("ai") || normalized.includes("automation") || normalized.includes("decision")) {
    return "AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT";
  }
  if (normalized.includes("data") || normalized.includes("interop") || normalized.includes("fhir") || normalized.includes("integration")) {
    return "DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION";
  }
  if (normalized.includes("remote") || normalized.includes("monitor") || normalized.includes("connected device")) {
    return "REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES";
  }
  if (normalized.includes("diagnostic") || normalized.includes("imaging") || normalized.includes("testing")) {
    return "DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT";
  }
  if (normalized.includes("pharmacy") || normalized.includes("medication") || normalized.includes("drug")) {
    return "PHARMACY_AND_MEDICATION_ENABLEMENT";
  }
  if (normalized.includes("supply") || normalized.includes("procurement") || normalized.includes("logistics")) {
    return "SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS";
  }
  if (normalized.includes("security") || normalized.includes("privacy") || normalized.includes("compliance") || normalized.includes("cyber")) {
    return "SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE";
  }
  if (normalized.includes("provider") || normalized.includes("burnout") || normalized.includes("retention") || normalized.includes("workforce")) {
    return "PROVIDER_EXPERIENCE_AND_DEVELOPMENT";
  }

  return undefined;
}

function normalizeDeclineReason(value: unknown): string | undefined {
  const raw = cleanText(value);
  if (!raw) return undefined;

  const normalized = raw.toLowerCase();
  if (["product", "weak differentiation", "workflow mismatch"].some((term) => normalized.includes(term))) return "PRODUCT";
  if (["roi", "payback", "return"].some((term) => normalized.includes(term))) return "INSUFFICIENT_ROI";
  if (["competitive", "crowded"].some((term) => normalized.includes(term))) return "HIGHLY_COMPETITIVE_LANDSCAPE";
  if (["out of scope", "thesis", "geography", "out-of-scope", "scope"].some((term) => normalized.includes(term))) {
    return "OUT_OF_INVESTMENT_THESIS_SCOPE";
  }
  if (["too early", "early stage", "lack validation", "traction"].some((term) => normalized.includes(term))) return "TOO_EARLY";
  if (["too mature", "late stage", "valuation", "round size"].some((term) => normalized.includes(term))) {
    return "TOO_MATURE_FOR_SEED_INVESTMENT";
  }
  if (["proof", "evidence", "pilot", "clinical", "regulatory"].some((term) => normalized.includes(term))) return "LACKS_PROOF_POINTS";
  if (["tam", "market size", "too small", "market too small"].some((term) => normalized.includes(term))) return "INSUFFICIENT_TAM";
  if (["team", "leadership", "founder"].some((term) => normalized.includes(term))) return "TEAM";
  if (["health system", "buying", "procurement", "prioritize"].some((term) => normalized.includes(term))) {
    return "HEALTH_SYSTEM_BUYING_PROCESS";
  }
  if (["workflow", "adoption", "friction", "implementation", "integration complexity"].some((term) => normalized.includes(term))) {
    return "WORKFLOW_FRICTION";
  }
  if (["other"].some((term) => normalized.includes(term))) return "OTHER";
  return undefined;
}

function normalizeLeadSourceType(value: unknown): string | undefined {
  const raw = cleanText(value).toUpperCase().replace(/[^A-Z_]/g, "");
  if (raw === "HEALTHSYSTEM" || raw === "HEALTH_SYSTEM") return "HEALTH_SYSTEM";
  if (raw === "OTHER") return "OTHER";
  return undefined;
}

function normalizeHealthSystemRelationship(value: unknown): "CUSTOMER" | "SPIN_OUT_PARTNER" | "INVESTOR_PARTNER" | "OTHER" {
  const raw = cleanText(value).toLowerCase();
  if (raw.includes("spin") && raw.includes("out")) return "SPIN_OUT_PARTNER";
  if (raw.includes("investor")) return "INVESTOR_PARTNER";
  if (raw.includes("customer")) return "CUSTOMER";
  if (raw.includes("partner")) return "INVESTOR_PARTNER";
  return "OTHER";
}

function normalizeCoInvestorRelationship(value: unknown): "PARTNER" | "INVESTOR" | "OTHER" {
  const raw = cleanText(value).toLowerCase();
  if (raw.includes("partner")) return "PARTNER";
  if (raw.includes("investor")) return "INVESTOR";
  return "OTHER";
}

function normalizeEmail(value: unknown): string {
  const text = cleanText(value).toLowerCase();
  if (!text) return "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

function normalizeContactRoleType(
  value: unknown
): "EXECUTIVE" | "VENTURE_PARTNER" | "INVESTOR_PARTNER" | "COMPANY_CONTACT" | "OTHER" | undefined {
  const raw = cleanText(value).toLowerCase();
  if (!raw) return undefined;
  if (raw.includes("executive")) return "EXECUTIVE";
  if (raw.includes("venture") || raw.includes("innovation")) return "VENTURE_PARTNER";
  if (raw.includes("investor")) return "INVESTOR_PARTNER";
  if (raw.includes("board") || raw.includes("advisor") || raw.includes("company")) return "COMPANY_CONTACT";
  if (raw.includes("other")) return "OTHER";
  return undefined;
}

function normalizeInputFromParsed(parsed: Record<string, unknown>): Record<string, unknown> {
  const normalizedHealthSystemLinks = Array.isArray(parsed.healthSystemLinks)
    ? parsed.healthSystemLinks
        .map((entry) => {
          if (!entry || typeof entry !== "object" || entry === null) return null;
          const candidate = entry as Record<string, unknown>;
          const healthSystemId = cleanText(candidate.healthSystemId);
          if (!healthSystemId) return null;
          const ownershipValue = parsePercent(candidate.ownershipPercent);
          const investmentValue = parseNumericString(candidate.investmentAmountUsd);

          return {
            healthSystemId,
            relationshipType: normalizeHealthSystemRelationship(candidate.relationshipType),
            ...(cleanText(candidate.notes) ? { notes: cleanText(candidate.notes) } : {}),
            investmentAmountUsd: investmentValue,
            ownershipPercent: ownershipValue
          };
        })
        .filter((entry) => entry !== null)
    : [];

  const normalizedCoInvestorLinks = Array.isArray(parsed.coInvestorLinks)
    ? parsed.coInvestorLinks
        .map((entry) => {
          if (!entry || typeof entry !== "object" || entry === null) return null;
          const candidate = entry as Record<string, unknown>;
          const coInvestorId = cleanText(candidate.coInvestorId);
          if (!coInvestorId) return null;
          const investmentValue = parseNumericString(candidate.investmentAmountUsd);

          return {
            coInvestorId,
            relationshipType: normalizeCoInvestorRelationship(candidate.relationshipType),
            ...(cleanText(candidate.notes) ? { notes: cleanText(candidate.notes) } : {}),
            investmentAmountUsd: investmentValue
          };
        })
        .filter((entry) => entry !== null)
    : [];

  const normalizedContacts = Array.isArray(parsed.contacts)
    ? parsed.contacts
        .map((entry) => {
          if (!entry || typeof entry !== "object" || entry === null) return null;
          const candidate = entry as Record<string, unknown>;
          const name = cleanText(candidate.name);
          if (!name) return null;

          const roleType = normalizeContactRoleType(candidate.roleType);
          const relationshipTitle = cleanText(candidate.relationshipTitle);
          const title = cleanText(candidate.title);
          const phone = cleanText(candidate.phone);

          return {
            name,
            ...(title ? { title } : {}),
            email: normalizeEmail(candidate.email),
            ...(phone ? { phone } : {}),
            url: normalizeUrl(candidate.url),
            ...(roleType ? { roleType } : {}),
            ...(relationshipTitle ? { relationshipTitle } : {})
          };
        })
        .filter((entry) => entry !== null)
    : [];

  return {
    ...parsed,
    name: cleanText(parsed.name),
    legalName: cleanText(parsed.legalName),
    website: normalizeUrl(parsed.website),
    headquartersCity: cleanText(parsed.headquartersCity),
    headquartersState: cleanText(parsed.headquartersState),
    headquartersCountry: cleanText(parsed.headquartersCountry),
    companyType: normalizeCompanyType(parsed.companyType),
    primaryCategory: normalizePrimaryCategory(parsed.primaryCategory),
    primaryCategoryOther: cleanText(parsed.primaryCategoryOther),
    declineReason: normalizeDeclineReason(parsed.declineReason),
    declineReasonOther: cleanText(parsed.declineReasonOther),
    leadSourceType: normalizeLeadSourceType(parsed.leadSourceType) || "OTHER",
    leadSourceHealthSystemId: cleanText(parsed.leadSourceHealthSystemId) || undefined,
    leadSourceNotes: cleanText(parsed.leadSourceNotes),
    description: cleanText(parsed.description),
    googleTranscriptUrl: normalizeUrl(parsed.googleTranscriptUrl),
    spinOutOwnershipPercent: parsePercent(parsed.spinOutOwnershipPercent),
    intakeStatus: normalizeEnumValue(parsed.intakeStatus, [
      "NOT_SCHEDULED",
      "SCHEDULED",
      "COMPLETED",
      "SCREENING_EVALUATION"
    ]) || "NOT_SCHEDULED",
    contacts: normalizedContacts,
    healthSystemLinks: normalizedHealthSystemLinks,
    coInvestorLinks: normalizedCoInvestorLinks
  };
}

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function mergeDraft(partial: Partial<CompanyInput>): CompanyInput {
  return {
    ...emptyCompanyDraft,
    ...partial,
    contacts: (partial.contacts ?? []).filter((entry) => Boolean(entry.name?.trim())),
    healthSystemLinks: (partial.healthSystemLinks ?? []).filter((entry) =>
      Boolean(entry.healthSystemId?.trim())
    ),
    coInvestorLinks: (partial.coInvestorLinks ?? []).filter((entry) => Boolean(entry.coInvestorId?.trim()))
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

function normalizeCompanyCandidate(candidate: unknown): CompanySearchCandidate | null {
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

  const parsed = companySearchCandidateSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function firstOfNullable<T>(value?: T | null): T | undefined {
  return value ?? undefined;
}

export async function searchCompanyCandidates(query: string): Promise<{
  candidates: CompanySearchCandidate[];
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
        summary:
          "AI web search not configured. Confirm and enqueue research once API key is set.",
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
    `company-candidates:${normalizedQuery}`,
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
            name: "company_candidates",
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
                  "Find up to 6 likely digital health companies that best match the query. Return location and website so results can be disambiguated by location."
              }
            ]
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: `Find up to 6 likely digital health companies that best match the query "${normalizedQuery}".`
              }
            ]
          }
        ]
      } as any);

      const parsed = extractJsonPayload(response.output_text || "{}");
      const rawCandidates = Array.isArray(parsed.candidates) ? parsed.candidates : [];
      const candidates = rawCandidates
        .map((candidate) => normalizeCompanyCandidate(candidate))
        .filter((candidate): candidate is CompanySearchCandidate => candidate !== null)
        .slice(0, 6);

      if (candidates.length === 0) {
        return fallback;
      }

      return { candidates, researchUsed: true };
    },
    COMPANY_SEARCH_CACHE_TTL_MS
  );

  const totalMs = Date.now() - startMs;
  console.log(
    `search_company_candidates latencyMs=${totalMs} cache=${result.fromCache ? "hit" : "miss"} query="${normalizedQuery}"`
  );

  return result.data;
}

export async function enrichCompanyFromWeb(seed: MinimalCompany): Promise<CompanyInput> {
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
        name: "company_enrichment",
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
              "You are enriching a digital health company CRM record. Return structured data in the provided schema. " +
              "Use reputable sources and keep values concise."
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text:
              `Research this company and extract structured CRM data. ` +
              `Name: ${seed.name}. ` +
              `HQ city: ${compactText(seed.headquartersCity) || "unknown"}. ` +
              `HQ state: ${compactText(seed.headquartersState) || "unknown"}. ` +
              `HQ country: ${compactText(seed.headquartersCountry) || "unknown"}. ` +
              `Website: ${compactText(seed.website) || "unknown"}. ` +
              `Capture company type, primary category, description, and whether there is a linked health system source. ` +
              `Capture notable individual contacts (executives, founders, board members) with title, profile URL, and public email/phone when available. ` +
              `If known, note investors or customers and include relationships with known health systems or co-investors by IDs only when certain.`
          }
        ]
      }
    ]
  } as any);

  const parsed = parseJsonObject(response.output_text?.trim() || "{}");
  const normalizedParsed = normalizeInputFromParsed(parsed);
  const validated = companyInputSchema.partial().safeParse(normalizedParsed);

  if (!validated.success) {
    const shortIssues = validated.error.issues
      .slice(0, 2)
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" | ");

    return mergeDraft({
      name: seed.name,
      website: compactText(seed.website),
      headquartersCity: compactText(seed.headquartersCity),
      headquartersState: compactText(seed.headquartersState),
      headquartersCountry: compactText(seed.headquartersCountry),
      researchNotes: shortIssues
        ? `Research ran but structured extraction failed validation. ${shortIssues}`
        : "Research ran but structured extraction failed validation."
    });
  }

  const normalized = validated.data;

  return mergeDraft({
    name: seed.name,
    website: compactText(seed.website),
    headquartersCity: compactText(seed.headquartersCity),
    headquartersState: compactText(seed.headquartersState),
    headquartersCountry: compactText(seed.headquartersCountry),
    ...normalized,
    contacts: normalized.contacts?.map((entry) => ({
      ...entry,
      email: entry.email || "",
      url: entry.url || ""
    })),
    healthSystemLinks: normalized.healthSystemLinks?.map((entry) => ({
      ...entry,
      investmentAmountUsd: firstOfNullable(entry.investmentAmountUsd),
      ownershipPercent: firstOfNullable(entry.ownershipPercent)
    })),
    coInvestorLinks: normalized.coInvestorLinks?.map((entry) => ({
      ...entry,
      investmentAmountUsd: firstOfNullable(entry.investmentAmountUsd)
    }))
  });
}

export async function prefillCompanyFromNaturalLanguage(
  prompt: string
): Promise<{ draft: CompanyInput; researchUsed: boolean }> {
  const { candidates, researchUsed } = await searchCompanyCandidates(prompt);
  const firstCandidate = candidates[0];

  if (!firstCandidate) {
    return {
      draft: mergeDraft({ name: prompt }),
      researchUsed: false
    };
  }

  const draft = await enrichCompanyFromWeb({
    name: firstCandidate.name,
    website: firstCandidate.website,
    headquartersCity: firstCandidate.headquartersCity,
    headquartersState: firstCandidate.headquartersState,
    headquartersCountry: firstCandidate.headquartersCountry
  });

  return { draft, researchUsed };
}
