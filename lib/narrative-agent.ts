import OpenAI from "openai";
import { Prisma, type ContactRoleType } from "@prisma/client";
import {
  type CompanySearchCandidate,
  type CoInvestorSearchCandidate,
  type HealthSystemSearchCandidate,
  companyCoInvestorRelationshipSchema,
  companyPrimaryCategorySchema,
  companyTypeSchema,
  contactRoleTypeSchema
} from "@/lib/schemas";
import { prisma } from "@/lib/db";
import { searchHealthSystemCandidates } from "@/lib/research";
import { searchCompanyCandidates } from "@/lib/company-research";
import { searchCoInvestorCandidates } from "@/lib/co-investor-research";
import {
  queueResearchForHealthSystem,
  verifyCandidateAndQueueResearch as verifyHealthSystemAndQueueResearch
} from "@/lib/research-jobs";
import {
  queueResearchForCompany,
  verifyCandidateAndQueueResearch as verifyCompanyAndQueueResearch
} from "@/lib/company-jobs";
import {
  queueResearchForCoInvestor,
  verifyCandidateAndQueueResearch as verifyCoInvestorAndQueueResearch
} from "@/lib/co-investor-jobs";
import {
  resolveOrCreateContact,
  upsertCompanyContactLink,
  upsertCoInvestorContactLink,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";
import { getNarrativeAgentModelDigest, getNarrativeAgentModelNarrative } from "@/lib/model-introspection";
import {
  type AddContactAction,
  type CreateEntityAction,
  type LinkCompanyCoInvestorAction,
  type NarrativeAction,
  type NarrativeEntityDraft,
  type NarrativeEntityMatch,
  type NarrativeEntityPatch,
  type NarrativeEntityType,
  type NarrativeExecutionResult,
  type NarrativePlan,
  type NarrativeWebCandidate,
  type UpdateEntityAction,
  addContactActionSchema,
  createEntityActionSchema,
  linkCompanyCoInvestorActionSchema,
  narrativeEntityDraftSchema,
  narrativeEntityPatchSchema,
  narrativeExecutionResultSchema,
  narrativePlanSchema,
  updateEntityActionSchema
} from "@/lib/narrative-agent-types";

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          kind: { type: "string" },
          entityType: { type: "string" },
          targetName: { type: "string" },
          parentType: { type: "string" },
          parentName: { type: "string" },
          companyName: { type: "string" },
          coInvestorName: { type: "string" },
          roleType: { type: "string" },
          relationshipType: { type: "string" },
          confidence: { type: "number" },
          rationale: { type: "string" },
          notes: { type: "string" },
          investmentAmountUsd: { type: ["number", "null"] },
          draft: {
            type: "object",
            additionalProperties: true
          },
          patch: {
            type: "object",
            additionalProperties: true
          },
          contact: {
            type: "object",
            additionalProperties: true
          }
        },
        required: ["kind"]
      }
    }
  },
  required: ["actions"]
};

type CreatedEntityReference = {
  entityType: NarrativeEntityType;
  id: string;
  name: string;
  created: boolean;
};

type NarrativeExecutionReport = {
  summary: string;
  executed: number;
  failed: number;
  skipped: number;
  results: NarrativeExecutionResult[];
  createdEntities: CreatedEntityReference[];
};

const AUTO_MATCH_CONFIDENCE_THRESHOLD = 0.8;
const REQUIREMENTS_LOCK_PHRASES = [
  "build execution plan",
  "create execution plan",
  "draft execution plan",
  "generate execution plan",
  "finalize requirements",
  "requirements are final",
  "requirements confirmed",
  "proceed with plan",
  "go ahead with plan",
  "ready for execution plan",
  "plan is approved"
];

function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function cleanOptionalText(value: unknown): string | undefined {
  const text = cleanText(value);
  return text || undefined;
}

function cleanNumber(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase().replace(/,/g, "");
    if (!normalized) return null;

    const multiplier = normalized.includes("m") ? 1_000_000 : normalized.includes("k") ? 1_000 : 1;
    const numeric = Number.parseFloat(normalized.replace(/[^0-9.+-]/g, ""));
    if (!Number.isFinite(numeric)) return undefined;
    return numeric * multiplier;
  }

  return undefined;
}

function cleanBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (["true", "yes", "1"].includes(normalized)) return true;
  if (["false", "no", "0"].includes(normalized)) return false;
  return undefined;
}

function cleanConfidence(value: unknown): number | undefined {
  const numeric = cleanNumber(value);
  if (numeric === null || numeric === undefined) return undefined;
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeForLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasRequirementsLockSignal(narrative: string): boolean {
  const normalizedNarrative = normalizeForLookup(narrative);
  if (!normalizedNarrative) return false;
  return REQUIREMENTS_LOCK_PHRASES.some((phrase) =>
    normalizedNarrative.includes(normalizeForLookup(phrase))
  );
}

function hasHighConfidenceMatch(match: NarrativeEntityMatch | null | undefined): boolean {
  return (match?.confidence || 0) >= AUTO_MATCH_CONFIDENCE_THRESHOLD;
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

function objectLike(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function parseEntityType(value: unknown): NarrativeEntityType | null {
  const raw = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (["HEALTH_SYSTEM", "HEALTHSYSTEM", "HEALTH_SYSTEMS"].includes(raw)) {
    return "HEALTH_SYSTEM";
  }
  if (["COMPANY", "COMPANIES"].includes(raw)) {
    return "COMPANY";
  }
  if (["CO_INVESTOR", "COINVESTOR", "CO_INVESTORS", "INVESTOR", "CO_INVESTMENT_FIRM"].includes(raw)) {
    return "CO_INVESTOR";
  }

  return null;
}

function inferEntityTypeFromRawKind(value: unknown): NarrativeEntityType | null {
  const raw = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!raw) return null;

  if (raw.includes("HEALTH") && raw.includes("SYSTEM")) {
    return "HEALTH_SYSTEM";
  }
  if (raw.includes("COMPANY")) {
    return "COMPANY";
  }
  if (raw.includes("CO") && raw.includes("INVESTOR")) {
    return "CO_INVESTOR";
  }
  if (raw.includes("INVESTOR")) {
    return "CO_INVESTOR";
  }

  return null;
}

function inferEntityTypeFromActionSource(
  source: Record<string, unknown>,
  actionKind?: NarrativeAction["kind"]
): NarrativeEntityType | null {
  const direct =
    parseEntityType(source.entityType) ||
    parseEntityType(source.parentType) ||
    parseEntityType(source.targetType) ||
    parseEntityType(source.kind);
  if (direct) return direct;

  const fromKind = inferEntityTypeFromRawKind(source.kind);
  if (fromKind) return fromKind;

  const patch = objectLike(source.patch);
  if (cleanText(patch.leadSourceType) || cleanText(patch.leadSourceHealthSystemName)) {
    return "COMPANY";
  }

  if (actionKind === "UPDATE_ENTITY") {
    if (cleanText(source.companyName)) return "COMPANY";
    if (cleanText(source.coInvestorName)) return "CO_INVESTOR";
    if (cleanText(source.healthSystemName)) return "HEALTH_SYSTEM";
  }

  return null;
}

function parseActionKind(value: unknown): NarrativeAction["kind"] | null {
  const raw = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (
    ["ADD_CONTACT", "CREATE_CONTACT", "LINK_CONTACT"].includes(raw) ||
    (raw.includes("CONTACT") && (raw.includes("ADD") || raw.includes("CREATE") || raw.includes("LINK")))
  ) {
    return "ADD_CONTACT";
  }
  if (
    [
      "LINK_COMPANY_CO_INVESTOR",
      "LINK_COMPANY_COINVESTOR",
      "CREATE_INVESTOR_RELATIONSHIP",
      "CREATE_CO_INVESTOR_RELATIONSHIP"
    ].includes(raw)
      || (raw.includes("LINK") && raw.includes("CO") && raw.includes("INVESTOR"))
  ) {
    return "LINK_COMPANY_CO_INVESTOR";
  }
  if (["UPDATE_ENTITY", "UPDATE", "EDIT_ENTITY", "PATCH_ENTITY"].includes(raw) || raw.startsWith("UPDATE_")) {
    return "UPDATE_ENTITY";
  }
  if (
    ["CREATE_ENTITY", "CREATE", "ADD_ENTITY", "NEW_ENTITY"].includes(raw) ||
    raw.startsWith("CREATE_") ||
    raw.startsWith("ADD_")
  ) {
    return "CREATE_ENTITY";
  }

  return null;
}

function isCompanyHealthSystemLinkKind(value: unknown): boolean {
  const raw = cleanText(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!raw) return false;
  return raw.includes("LINK") && raw.includes("COMPANY") && raw.includes("HEALTH") && raw.includes("SYSTEM");
}

function parseRoleType(value: unknown): ContactRoleType {
  const raw = cleanText(value).toUpperCase().replace(/[^A-Z_]/g, "_").replace(/__+/g, "_");
  const parsed = contactRoleTypeSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  return "OTHER";
}

function parseRelationshipType(value: unknown): "INVESTOR" | "PARTNER" | "OTHER" {
  const raw = cleanText(value).toUpperCase().replace(/[^A-Z_]/g, "_").replace(/__+/g, "_");
  const parsed = companyCoInvestorRelationshipSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (raw.includes("PARTNER")) return "PARTNER";
  return "INVESTOR";
}

function buildActionId(kind: NarrativeAction["kind"], index: number, label?: string) {
  const compactLabel = (label || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36);
  const base = `${kind.toLowerCase()}-${index + 1}`;
  return compactLabel ? `${base}-${compactLabel}` : base;
}

function normalizeDraft(
  rawDraft: unknown,
  fallbackName: string,
  entityType?: NarrativeEntityType
): NarrativeEntityDraft | null {
  const draft = objectLike(rawDraft);
  const companyTypeParsed = companyTypeSchema.safeParse(cleanText(draft.companyType).toUpperCase());
  const categoryParsed = companyPrimaryCategorySchema.safeParse(
    cleanText(draft.primaryCategory)
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/__+/g, "_")
  );

  const parsed = narrativeEntityDraftSchema.safeParse({
    name: cleanEntityNameForDraft(cleanText(draft.name) || fallbackName, entityType),
    legalName: cleanOptionalText(draft.legalName),
    website: cleanOptionalText(draft.website),
    headquartersCity: cleanOptionalText(draft.headquartersCity),
    headquartersState: cleanOptionalText(draft.headquartersState),
    headquartersCountry: cleanOptionalText(draft.headquartersCountry),
    researchNotes: cleanOptionalText(draft.researchNotes || draft.notes),
    isLimitedPartner: cleanBoolean(draft.isLimitedPartner),
    isAllianceMember: cleanBoolean(draft.isAllianceMember),
    limitedPartnerInvestmentUsd: cleanNumber(draft.limitedPartnerInvestmentUsd),
    isSeedInvestor: cleanBoolean(draft.isSeedInvestor),
    isSeriesAInvestor: cleanBoolean(draft.isSeriesAInvestor),
    investmentNotes: cleanOptionalText(draft.investmentNotes),
    companyType: companyTypeParsed.success ? companyTypeParsed.data : undefined,
    primaryCategory: categoryParsed.success ? categoryParsed.data : undefined,
    primaryCategoryOther: cleanOptionalText(draft.primaryCategoryOther),
    leadSourceType:
      cleanText(draft.leadSourceType).toUpperCase() === "HEALTH_SYSTEM"
        ? "HEALTH_SYSTEM"
        : cleanText(draft.leadSourceType).toUpperCase() === "OTHER"
          ? "OTHER"
          : undefined,
    leadSourceHealthSystemId: cleanOptionalText(draft.leadSourceHealthSystemId),
    leadSourceHealthSystemName: cleanOptionalText(draft.leadSourceHealthSystemName),
    leadSourceOther: cleanOptionalText(draft.leadSourceOther),
    description: cleanOptionalText(draft.description)
  });

  return parsed.success ? parsed.data : null;
}

function normalizePatch(rawPatch: unknown): NarrativeEntityPatch {
  const patch = objectLike(rawPatch);
  const parsed = narrativeEntityPatchSchema.safeParse({
    name: cleanOptionalText(patch.name),
    legalName: cleanOptionalText(patch.legalName),
    website: cleanOptionalText(patch.website),
    headquartersCity: cleanOptionalText(patch.headquartersCity),
    headquartersState: cleanOptionalText(patch.headquartersState),
    headquartersCountry: cleanOptionalText(patch.headquartersCountry),
    researchNotes: cleanOptionalText(patch.researchNotes || patch.notes),
    investmentNotes: cleanOptionalText(patch.investmentNotes),
    description: cleanOptionalText(patch.description),
    leadSourceType:
      cleanText(patch.leadSourceType).toUpperCase() === "HEALTH_SYSTEM"
        ? "HEALTH_SYSTEM"
        : cleanText(patch.leadSourceType).toUpperCase() === "OTHER"
          ? "OTHER"
          : undefined,
    leadSourceHealthSystemId: cleanOptionalText(patch.leadSourceHealthSystemId),
    leadSourceHealthSystemName: cleanOptionalText(patch.leadSourceHealthSystemName),
    leadSourceOther: cleanOptionalText(patch.leadSourceOther),
    leadSourceNotes: cleanOptionalText(patch.leadSourceNotes)
  });

  if (!parsed.success) {
    return {};
  }
  return parsed.data;
}

function defaultRoleForParent(parentType: NarrativeEntityType): ContactRoleType {
  if (parentType === "HEALTH_SYSTEM") return "EXECUTIVE";
  if (parentType === "COMPANY") return "COMPANY_CONTACT";
  return "INVESTOR_PARTNER";
}

function safeTextForSummary(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  return cleaned.length <= 260 ? cleaned : `${cleaned.slice(0, 257).trimEnd()}...`;
}

function cleanNarrativeNameFragment(value: string): string {
  return value
    .replace(/^[\s"'`“”‘’(),.;:!?-]+/, "")
    .replace(/[\s"'`“”‘’(),.;:!?-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanEntityNameForDraft(value: string, entityType?: NarrativeEntityType): string {
  const cleanValue = cleanNarrativeNameFragment(value);
  if (!cleanValue) return "";

  let next = cleanValue
    .replace(
      /^(?:a|an|the)\s+(?:company|co[\s-]?investor|health\s*system|healthcare\s*system)\s+(?:called|named)\s+/i,
      ""
    )
    .replace(
      /^(?:company|co[\s-]?investor|health\s*system|healthcare\s*system)\s+(?:called|named)\s+/i,
      ""
    )
    .replace(/^(?:called|named)\s+/i, "");

  if (entityType === "COMPANY") {
    next = next
      .replace(/^(?:a|an|the)\s+company\s+/i, "")
      .replace(/^company\s+/i, "");
  }

  if (entityType === "CO_INVESTOR") {
    next = next
      .replace(/^(?:a|an|the)\s+co[\s-]?investor\s+/i, "")
      .replace(/^co[\s-]?investor\s+/i, "")
      .replace(/^(?:a|an|the)\s+investor\s+/i, "")
      .replace(/^investor\s+/i, "");
  }

  if (entityType === "HEALTH_SYSTEM") {
    next = next
      .replace(/^(?:a|an|the)\s+health\s*system\s+/i, "")
      .replace(/^(?:a|an|the)\s+healthcare\s*system\s+/i, "");
  }

  return cleanNarrativeNameFragment(next) || cleanValue;
}

function normalizeEntityNameForLookup(value: string, entityType?: NarrativeEntityType): string {
  const cleaned = cleanEntityNameForDraft(value, entityType);
  if (!cleaned) return "";

  if (entityType === "HEALTH_SYSTEM") {
    const withoutGenericSuffix = cleanNarrativeNameFragment(
      cleaned.replace(/\b(?:health\s*system|healthcare\s*system)\b$/i, "")
    );
    if (withoutGenericSuffix) {
      return normalizeForLookup(withoutGenericSuffix);
    }
  }

  return normalizeForLookup(cleaned);
}

function hasCoInvestorSignals(normalizedValue: string): boolean {
  return /\b(innovation fund|fund|ventures?|venture arm|venture fund|capital|vc|investor|investments?)\b/.test(
    normalizedValue
  );
}

function hasHealthSystemSignals(normalizedValue: string): boolean {
  return /\b(health system|healthcare system|hospital|medical center|clinic)\b/.test(normalizedValue);
}

function looksLikeHealthSystemEntityName(value: string): boolean {
  const normalizedValue = normalizeForLookup(value);
  return Boolean(
    normalizedValue &&
      hasHealthSystemSignals(normalizedValue) &&
      !hasCoInvestorSignals(normalizedValue)
  );
}

function inferIntroducerType(introducerName: string): "HEALTH_SYSTEM" | "CO_INVESTOR" {
  const normalized = normalizeForLookup(introducerName);
  if (!normalized) return "CO_INVESTOR";

  const hasCoInvestorSignal = hasCoInvestorSignals(normalized);
  const hasHealthSystemSignal = hasHealthSystemSignals(normalized);

  if (hasHealthSystemSignal && !hasCoInvestorSignal) {
    return "HEALTH_SYSTEM";
  }

  return "CO_INVESTOR";
}

function inferHealthSystemNameFromIntroducer(introducerName: string): string {
  const cleanIntroducer = cleanNarrativeNameFragment(introducerName).replace(/^the\s+/i, "");
  if (!cleanIntroducer) return "";

  const stripped = cleanIntroducer
    .replace(
      /\b(innovation\s+fund|innovation|ventures?|venture\s+fund|venture\s+arm|capital|vc|fund|investments?|investor|strategic\s+investments?)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();

  return (
    cleanEntityNameForDraft(stripped || cleanIntroducer, "HEALTH_SYSTEM") ||
    cleanEntityNameForDraft(cleanIntroducer, "HEALTH_SYSTEM")
  );
}

type IntroductionSignal = {
  introducerName: string;
  introducerType: "HEALTH_SYSTEM" | "CO_INVESTOR";
  companyName: string;
  healthSystemHint: string;
};

function extractIntroductionSignals(narrative: string): IntroductionSignal[] {
  if (!narrative.trim()) return [];

  const sentenceParts = narrative
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const signals: IntroductionSignal[] = [];
  for (const sentence of sentenceParts) {
    const match = sentence.match(
      /\b(.{2,120}?)\s+introduced\s+(?:us|me|our\s+team|the\s+team)?\s*to\s+(.{2,120})$/i
    );
    if (!match) continue;

    const rawIntroducer = cleanNarrativeNameFragment(match[1] || "");
    const rawCompany = cleanEntityNameForDraft(cleanNarrativeNameFragment(match[2] || ""), "COMPANY");

    if (!rawIntroducer || !rawCompany) continue;
    const introducerType = inferIntroducerType(rawIntroducer);
    const healthSystemHint = inferHealthSystemNameFromIntroducer(rawIntroducer);
    if (!healthSystemHint) continue;

    signals.push({
      introducerName: rawIntroducer,
      introducerType,
      companyName: rawCompany,
      healthSystemHint
    });
  }

  return signals;
}

function applyIntroductionHeuristics(
  narrative: string,
  actions: NarrativeAction[]
): { actions: NarrativeAction[]; warnings: string[] } {
  const signals = extractIntroductionSignals(narrative);
  if (signals.length === 0) {
    return { actions, warnings: [] };
  }

  const nextActions = [...actions];
  let addedActions = 0;

  for (const signal of signals) {
    const normalizedCompany = normalizeEntityNameForLookup(signal.companyName, "COMPANY");
    const normalizedIntroducer =
      signal.introducerType === "HEALTH_SYSTEM"
        ? normalizeEntityNameForLookup(signal.introducerName, "HEALTH_SYSTEM")
        : normalizeEntityNameForLookup(signal.introducerName, "CO_INVESTOR");
    if (!normalizedCompany || !normalizedIntroducer) {
      continue;
    }

    const existingCompanyCreate = nextActions.find(
      (action): action is CreateEntityAction =>
        action.kind === "CREATE_ENTITY" &&
        action.entityType === "COMPANY" &&
        normalizeEntityNameForLookup(action.draft.name, "COMPANY") === normalizedCompany
    );

    if (existingCompanyCreate) {
      existingCompanyCreate.draft.leadSourceType = "HEALTH_SYSTEM";
      existingCompanyCreate.draft.leadSourceHealthSystemName = signal.healthSystemHint;
      existingCompanyCreate.draft.leadSourceOther = undefined;
    } else {
      const createdCompanyAction = createEntityActionSchema.safeParse({
        id: buildActionId("CREATE_ENTITY", nextActions.length + addedActions, signal.companyName),
        include: true,
        rationale: "Added from narrative introduction phrasing.",
        confidence: 0.62,
        issues: [],
        kind: "CREATE_ENTITY",
        entityType: "COMPANY",
        draft: {
          name: signal.companyName,
          leadSourceType: "HEALTH_SYSTEM",
          leadSourceHealthSystemName: signal.healthSystemHint
        },
        existingMatches: [],
        webCandidates: [],
        selection: { mode: "CREATE_FROM_WEB" }
      });
      if (createdCompanyAction.success) {
        nextActions.push(createdCompanyAction.data);
        addedActions += 1;
      }
    }

    if (signal.introducerType === "HEALTH_SYSTEM") {
      continue;
    }

    const existingCoInvestorCreate = nextActions.find(
      (action): action is CreateEntityAction =>
        action.kind === "CREATE_ENTITY" &&
        action.entityType === "CO_INVESTOR" &&
        normalizeEntityNameForLookup(action.draft.name, "CO_INVESTOR") === normalizedIntroducer
    );

    if (!existingCoInvestorCreate) {
      const createdCoInvestorAction = createEntityActionSchema.safeParse({
        id: buildActionId(
          "CREATE_ENTITY",
          nextActions.length + addedActions,
          signal.introducerName
        ),
        include: true,
        rationale: "Added from narrative introduction phrasing.",
        confidence: 0.58,
        issues: [],
        kind: "CREATE_ENTITY",
        entityType: "CO_INVESTOR",
        draft: {
          name: signal.introducerName
        },
        existingMatches: [],
        webCandidates: [],
        selection: { mode: "CREATE_FROM_WEB" }
      });
      if (createdCoInvestorAction.success) {
        nextActions.push(createdCoInvestorAction.data);
        addedActions += 1;
      }
    }

    const introNote = `${signal.introducerName} introduced us to ${signal.companyName}.`;
    const existingLinkAction = nextActions.find(
      (action): action is LinkCompanyCoInvestorAction =>
        action.kind === "LINK_COMPANY_CO_INVESTOR" &&
        normalizeEntityNameForLookup(action.companyName, "COMPANY") === normalizedCompany &&
        normalizeEntityNameForLookup(action.coInvestorName, "CO_INVESTOR") === normalizedIntroducer
    );

    if (existingLinkAction) {
      if (!cleanText(existingLinkAction.notes).toLowerCase().includes("introduced")) {
        existingLinkAction.notes = existingLinkAction.notes
          ? `${existingLinkAction.notes} ${introNote}`.trim()
          : introNote;
      }
      continue;
    }

    const createdLinkAction = linkCompanyCoInvestorActionSchema.safeParse({
      id: buildActionId(
        "LINK_COMPANY_CO_INVESTOR",
        nextActions.length + addedActions,
        `${signal.companyName}-${signal.introducerName}`
      ),
      include: true,
      rationale: "Added from narrative introduction phrasing.",
      confidence: 0.65,
      issues: [],
      kind: "LINK_COMPANY_CO_INVESTOR",
      companyName: signal.companyName,
      coInvestorName: signal.introducerName,
      relationshipType: "INVESTOR",
      notes: introNote,
      investmentAmountUsd: null,
      companyMatches: [],
      coInvestorMatches: []
    });

    if (createdLinkAction.success) {
      nextActions.push(createdLinkAction.data);
      addedActions += 1;
    }
  }

  if (addedActions === 0) {
    return { actions: nextActions, warnings: [] };
  }

  return {
    actions: nextActions,
    warnings: [
      "Applied intro heuristic: mapped 'introduced us to' phrasing into investor relationship and lead-source signals."
    ]
  };
}

function mergeUniqueStrings(...values: Array<string | undefined>): string | undefined {
  const merged = values
    .map((value) => cleanText(value))
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return merged || undefined;
}

function dedupeExtractedActions(actions: NarrativeAction[]): NarrativeAction[] {
  const deduped: NarrativeAction[] = [];
  const indexByKey = new Map<string, number>();

  function actionKey(action: NarrativeAction): string {
    if (action.kind === "CREATE_ENTITY") {
      return `CREATE:${action.entityType}:${normalizeEntityNameForLookup(action.draft.name, action.entityType)}`;
    }

    if (action.kind === "UPDATE_ENTITY") {
      return `UPDATE:${action.entityType}:${normalizeEntityNameForLookup(action.targetName, action.entityType)}`;
    }

    if (action.kind === "ADD_CONTACT") {
      return `CONTACT:${action.parentType}:${normalizeEntityNameForLookup(action.parentName, action.parentType)}:${normalizeEntityNameForLookup(action.contact.name)}`;
    }

    return `LINK:${normalizeEntityNameForLookup(action.companyName, "COMPANY")}:${normalizeEntityNameForLookup(action.coInvestorName, "CO_INVESTOR")}:${action.relationshipType}`;
  }

  for (const action of actions) {
    const key = actionKey(action);
    const existingIndex = indexByKey.get(key);

    if (existingIndex === undefined) {
      deduped.push(action);
      indexByKey.set(key, deduped.length - 1);
      continue;
    }

    const current = deduped[existingIndex];
    if (!current) continue;

    if (current.kind === "CREATE_ENTITY" && action.kind === "CREATE_ENTITY") {
      const mergedDraft: NarrativeEntityDraft = { ...current.draft };
      for (const [fieldKey, fieldValue] of Object.entries(action.draft)) {
        const keyName = fieldKey as keyof NarrativeEntityDraft;
        const currentValue = mergedDraft[keyName];
        const hasCurrentValue =
          currentValue !== undefined &&
          currentValue !== null &&
          (typeof currentValue !== "string" || currentValue.trim() !== "");
        const hasIncomingValue =
          fieldValue !== undefined &&
          fieldValue !== null &&
          (typeof fieldValue !== "string" || fieldValue.trim() !== "");
        if (!hasCurrentValue && hasIncomingValue) {
          mergedDraft[keyName] = fieldValue as never;
        }
      }

      if (!mergedDraft.name || mergedDraft.name.length > action.draft.name.length) {
        mergedDraft.name = cleanEntityNameForDraft(action.draft.name, action.entityType) || mergedDraft.name;
      }

      deduped[existingIndex] = {
        ...current,
        include: current.include || action.include,
        confidence: Math.max(current.confidence || 0, action.confidence || 0),
        rationale: mergeUniqueStrings(current.rationale, action.rationale),
        issues: Array.from(new Set([...current.issues, ...action.issues])),
        draft: mergedDraft
      };
      continue;
    }

    if (current.kind === "UPDATE_ENTITY" && action.kind === "UPDATE_ENTITY") {
      deduped[existingIndex] = {
        ...current,
        include: current.include || action.include,
        confidence: Math.max(current.confidence || 0, action.confidence || 0),
        rationale: mergeUniqueStrings(current.rationale, action.rationale),
        issues: Array.from(new Set([...current.issues, ...action.issues])),
        patch: {
          ...action.patch,
          ...current.patch
        }
      };
      continue;
    }

    if (current.kind === "ADD_CONTACT" && action.kind === "ADD_CONTACT") {
      deduped[existingIndex] = {
        ...current,
        include: current.include || action.include,
        confidence: Math.max(current.confidence || 0, action.confidence || 0),
        rationale: mergeUniqueStrings(current.rationale, action.rationale),
        issues: Array.from(new Set([...current.issues, ...action.issues])),
        contact: {
          ...action.contact,
          ...current.contact
        }
      };
      continue;
    }

    if (current.kind === "LINK_COMPANY_CO_INVESTOR" && action.kind === "LINK_COMPANY_CO_INVESTOR") {
      deduped[existingIndex] = {
        ...current,
        include: current.include || action.include,
        confidence: Math.max(current.confidence || 0, action.confidence || 0),
        rationale: mergeUniqueStrings(current.rationale, action.rationale),
        issues: Array.from(new Set([...current.issues, ...action.issues])),
        notes: mergeUniqueStrings(current.notes, action.notes),
        investmentAmountUsd: current.investmentAmountUsd ?? action.investmentAmountUsd
      };
    }
  }

  return deduped;
}

function summarizeActionRequirement(action: NarrativeAction): string {
  if (action.kind === "CREATE_ENTITY") {
    return `Create ${action.entityType.replace("_", " ").toLowerCase()}: ${action.draft.name}.`;
  }

  if (action.kind === "UPDATE_ENTITY") {
    return `Update ${action.entityType.replace("_", " ").toLowerCase()}: ${action.targetName}.`;
  }

  if (action.kind === "ADD_CONTACT") {
    return `Add contact ${action.contact.name} to ${action.parentName}.`;
  }

  return `Link company ${action.companyName} with co-investor ${action.coInvestorName}.`;
}

function entityTypeLabel(entityType: NarrativeEntityType): string {
  if (entityType === "HEALTH_SYSTEM") return "health system";
  if (entityType === "COMPANY") return "company";
  return "co-investor";
}

function formatConfidencePercent(confidence?: number): string {
  if (confidence === undefined || confidence === null) return "";
  return `${Math.round(confidence * 100)}%`;
}

function hasMatchConfidenceBelowAutoThreshold(
  match: NarrativeEntityMatch | null | undefined
): match is NarrativeEntityMatch {
  if (!match) return false;
  return !hasHighConfidenceMatch(match);
}

function findMatchById(
  matches: NarrativeEntityMatch[],
  id: string | undefined
): NarrativeEntityMatch | undefined {
  if (!id) return undefined;
  return matches.find((match) => match.id === id);
}

function summarizeAutoResolvedMatches(actions: NarrativeAction): string | null {
  if (actions.kind === "CREATE_ENTITY" && actions.selection.mode === "USE_EXISTING") {
    const selectedMatch = findMatchById(actions.existingMatches, actions.selection.existingId)
      || actions.existingMatches[0];
    if (selectedMatch) {
      return `Using existing ${entityTypeLabel(actions.entityType)} record ${selectedMatch.name} (${formatConfidencePercent(
        selectedMatch.confidence
      )}).`;
    }
  }

  if (actions.kind === "UPDATE_ENTITY" && actions.selectedTargetId) {
    const selectedMatch = findMatchById(actions.targetMatches, actions.selectedTargetId);
    if (selectedMatch) {
      return `Update target resolved to existing ${entityTypeLabel(actions.entityType)} ${selectedMatch.name} (${formatConfidencePercent(
        selectedMatch.confidence
      )}).`;
    }
  }

  if (actions.kind === "ADD_CONTACT" && actions.selectedParentId) {
    const selectedMatch = findMatchById(actions.parentMatches, actions.selectedParentId);
    if (selectedMatch) {
      return `Contact parent resolved to existing ${entityTypeLabel(actions.parentType)} ${selectedMatch.name} (${formatConfidencePercent(
        selectedMatch.confidence
      )}).`;
    }
  }

  if (actions.kind === "LINK_COMPANY_CO_INVESTOR") {
    const selectedCompany = findMatchById(actions.companyMatches, actions.selectedCompanyId);
    const selectedCoInvestor = findMatchById(actions.coInvestorMatches, actions.selectedCoInvestorId);
    if (selectedCompany && selectedCoInvestor) {
      return `Relationship resolved to existing company ${selectedCompany.name} and co-investor ${selectedCoInvestor.name}.`;
    }
    if (selectedCompany) {
      return `Relationship company resolved to existing record ${selectedCompany.name} (${formatConfidencePercent(
        selectedCompany.confidence
      )}).`;
    }
    if (selectedCoInvestor) {
      return `Relationship co-investor resolved to existing record ${selectedCoInvestor.name} (${formatConfidencePercent(
        selectedCoInvestor.confidence
      )}).`;
    }
  }

  return null;
}

function buildClarificationSummary(
  extractedSummary: string,
  actions: NarrativeAction[]
): string {
  const candidateCount = actions.length;
  const fallbackSummary = `I identified ${candidateCount} candidate change${
    candidateCount === 1 ? "" : "s"
  }.`;
  const baseSummary = extractedSummary || fallbackSummary;

  const autoResolvedNotes = actions
    .map((action) => summarizeAutoResolvedMatches(action))
    .filter((entry): entry is string => Boolean(entry));
  if (autoResolvedNotes.length === 0) {
    return `${baseSummary} I will confirm one detail at a time before drafting the first execution plan.`;
  }

  const notePreview = autoResolvedNotes.slice(0, 2).join(" ");
  const additionalNotes =
    autoResolvedNotes.length > 2
      ? ` (+${autoResolvedNotes.length - 2} additional auto-match${
          autoResolvedNotes.length === 3 ? "" : "es"
        }).`
      : "";

  return `${baseSummary} I already resolved ${autoResolvedNotes.length} existing match${
    autoResolvedNotes.length === 1 ? "" : "es"
  }. ${notePreview}${additionalNotes}`.trim();
}

function buildActionClarificationQuestion(action: NarrativeAction): string | null {
  if (action.kind === "CREATE_ENTITY") {
    if (action.entityType === "CO_INVESTOR" && looksLikeHealthSystemEntityName(action.draft.name)) {
      return `"${action.draft.name}" looks like a health system, not a co-investor. Should I treat it as a health-system lead source instead of creating a co-investor?`;
    }

    const topExisting = action.existingMatches[0];
    if (hasMatchConfidenceBelowAutoThreshold(topExisting)) {
      return `I found a possible existing ${entityTypeLabel(action.entityType)} for "${action.draft.name}": ${topExisting.name} (${formatConfidencePercent(
        topExisting.confidence
      )}). Should I use this existing record or create a new one?`;
    }

    if (
      action.selection.mode === "CREATE_FROM_WEB" &&
      action.webCandidates.length > 1 &&
      action.selection.webCandidateIndex === undefined
    ) {
      const options = action.webCandidates
        .slice(0, 3)
        .map((candidate) => `"${candidate.name}"`)
        .join(", ");
      return `I found multiple web entities for "${action.draft.name}" (${options}). Which one should I use?`;
    }

    return null;
  }

  if (action.kind === "UPDATE_ENTITY") {
    if (action.selectedTargetId || action.linkedCreateActionId) return null;
    const topMatch = action.targetMatches[0];
    if (hasMatchConfidenceBelowAutoThreshold(topMatch)) {
      return `I found a possible existing ${entityTypeLabel(action.entityType)} update target for "${
        action.targetName
      }": ${topMatch.name} (${formatConfidencePercent(topMatch.confidence)}). Should I update this record?`;
    }
    return `I could not confidently resolve which ${entityTypeLabel(action.entityType)} to update for "${
      action.targetName
    }". Which record should be updated?`;
  }

  if (action.kind === "ADD_CONTACT") {
    if (action.selectedParentId || action.linkedCreateActionId) return null;
    const topMatch = action.parentMatches[0];
    if (hasMatchConfidenceBelowAutoThreshold(topMatch)) {
      return `I found a possible existing ${entityTypeLabel(action.parentType)} for contact "${
        action.contact.name
      }": ${topMatch.name} (${formatConfidencePercent(topMatch.confidence)}). Should I attach the contact there?`;
    }
    return `I could not confidently resolve the parent ${entityTypeLabel(action.parentType)} for contact "${
      action.contact.name
    }". Which record should I use?`;
  }

  const healthSystemIssue = action.issues.find((issue) =>
    normalizeForLookup(issue).includes("appears to be a health system")
  );
  if (healthSystemIssue) {
    return `"${action.coInvestorName}" appears to be a health system. Should I set it as the lead-source health system for "${action.companyName}" and keep co-investor links only for named funds?`;
  }

  if (!action.selectedCompanyId && !action.companyCreateActionId) {
    const topCompany = action.companyMatches[0];
    if (hasMatchConfidenceBelowAutoThreshold(topCompany)) {
      return `I found a possible existing company for this relationship: ${topCompany.name} (${formatConfidencePercent(
        topCompany.confidence
      )}). Should I use it?`;
    }
    return `I could not confidently resolve the company for the relationship "${action.companyName} ↔ ${action.coInvestorName}". Which company should I use?`;
  }

  if (!action.selectedCoInvestorId && !action.coInvestorCreateActionId) {
    const topCoInvestor = action.coInvestorMatches[0];
    if (hasMatchConfidenceBelowAutoThreshold(topCoInvestor)) {
      return `I found a possible existing co-investor for this relationship: ${topCoInvestor.name} (${formatConfidencePercent(
        topCoInvestor.confidence
      )}). Should I use it?`;
    }
    return `I could not confidently resolve the co-investor for "${action.companyName} ↔ ${action.coInvestorName}". Which co-investor should I use?`;
  }

  return null;
}

function isClarificationWarningCandidate(warning: string): boolean {
  const normalized = normalizeForLookup(warning);
  if (!normalized) return false;
  if (normalized.startsWith("candidate requirement")) return false;
  if (normalized.includes("requirement review is in progress")) return false;
  if (normalized.includes("when ready reply with")) return false;
  if (normalized.includes("applied intro heuristic")) return false;
  if (normalized.includes("consolidated duplicate actions")) return false;

  return (
    warning.includes("?") ||
    normalized.startsWith("please confirm") ||
    normalized.startsWith("do you want") ||
    normalized.startsWith("should i") ||
    normalized.startsWith("which ")
  );
}

function isOperationalWarning(warning: string): boolean {
  return !isClarificationWarningCandidate(warning);
}

function buildClarificationQuestionQueue(
  actions: NarrativeAction[],
  extractionWarnings: string[]
): string[] {
  const queued: string[] = [];
  const seen = new Set<string>();

  const pushIfNew = (value: string | null | undefined) => {
    const cleaned = cleanText(value);
    if (!cleaned) return;
    const key = normalizeForLookup(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    queued.push(cleaned);
  };

  for (const action of actions) {
    pushIfNew(buildActionClarificationQuestion(action));
  }

  for (const warning of extractionWarnings) {
    const cleaned = cleanText(warning);
    if (cleaned && isClarificationWarningCandidate(cleaned)) {
      pushIfNew(cleaned);
    }
  }

  return queued;
}

function convertRawExtractionAction(rawAction: unknown, index: number): NarrativeAction | null {
  const source = objectLike(rawAction);
  const kind = parseActionKind(source.kind);
  if (!kind) {
    if (isCompanyHealthSystemLinkKind(source.kind)) {
      const companyName = cleanEntityNameForDraft(
        cleanText(source.companyName) ||
          cleanText(source.targetName) ||
          cleanText(source.parentName) ||
          cleanText(source.name),
        "COMPANY"
      );
      const healthSystemName = cleanEntityNameForDraft(
        cleanText(source.healthSystemName) ||
          cleanText(source.relatedName) ||
          cleanText(source.linkedName) ||
          cleanText(source.counterpartyName) ||
          cleanText(source.otherEntityName),
        "HEALTH_SYSTEM"
      );
      if (!companyName || !healthSystemName) return null;

      const parsedLinkFallback = updateEntityActionSchema.safeParse({
        id: buildActionId("UPDATE_ENTITY", index, companyName),
        include: true,
        rationale: cleanOptionalText(source.rationale),
        confidence: cleanConfidence(source.confidence),
        issues: [
          "Company-health-system link request was mapped to company lead-source update in this Workbench version."
        ],
        kind: "UPDATE_ENTITY",
        entityType: "COMPANY",
        targetName: companyName,
        patch: {
          leadSourceType: "HEALTH_SYSTEM",
          leadSourceHealthSystemName: healthSystemName,
          leadSourceNotes:
            cleanOptionalText(source.notes) ||
            `${healthSystemName} referenced as linked health system for ${companyName}.`
        },
        targetMatches: []
      });
      return parsedLinkFallback.success ? parsedLinkFallback.data : null;
    }
    return null;
  }

  const confidence = cleanConfidence(source.confidence);
  const rationale = cleanOptionalText(source.rationale);

  if (kind === "CREATE_ENTITY") {
    const entityType =
      inferEntityTypeFromActionSource(source, kind) || parseEntityType(source.targetName);

    if (!entityType) return null;

    const fallbackName =
      cleanText(objectLike(source.draft).name) ||
      cleanText(source.targetName) ||
      cleanText(source.parentName) ||
      cleanText(source.companyName) ||
      cleanText(source.coInvestorName);

    const draft = normalizeDraft(source.draft, fallbackName, entityType);
    if (!draft?.name) return null;
    if (entityType === "CO_INVESTOR" && looksLikeHealthSystemEntityName(draft.name)) {
      return null;
    }

    const parsed = createEntityActionSchema.safeParse({
      id: buildActionId(kind, index, draft.name),
      include: true,
      rationale,
      confidence,
      issues: [],
      kind,
      entityType,
      draft,
      existingMatches: [],
      webCandidates: [],
      selection: {
        mode: "CREATE_FROM_WEB"
      }
    });

    return parsed.success ? parsed.data : null;
  }

  if (kind === "UPDATE_ENTITY") {
    const entityType = inferEntityTypeFromActionSource(source, kind);
    if (!entityType) return null;

    const targetName = cleanEntityNameForDraft(
      cleanText(source.targetName) ||
        cleanText(source.companyName) ||
        cleanText(source.coInvestorName) ||
        cleanText(source.healthSystemName) ||
        cleanText(objectLike(source.patch).name) ||
        cleanText(source.parentName) ||
        cleanText(source.name),
      entityType
    );
    if (!targetName) return null;

    const parsed = updateEntityActionSchema.safeParse({
      id: buildActionId(kind, index, targetName),
      include: true,
      rationale,
      confidence,
      issues: [],
      kind,
      entityType,
      targetName,
      patch: normalizePatch(source.patch),
      targetMatches: []
    });

    return parsed.success ? parsed.data : null;
  }

  if (kind === "ADD_CONTACT") {
    const parentType =
      parseEntityType(source.parentType) ||
      parseEntityType(source.entityType) ||
      parseEntityType(source.kind);
    if (!parentType) return null;

    const contactObject = objectLike(source.contact);
    const parentName = cleanEntityNameForDraft(
      cleanText(source.parentName) || cleanText(source.targetName),
      parentType
    );
    const contactName = cleanText(contactObject.name) || cleanText(source.targetName);

    if (!parentName || !contactName) return null;

    const parsed = addContactActionSchema.safeParse({
      id: buildActionId(kind, index, `${parentName}-${contactName}`),
      include: true,
      rationale,
      confidence,
      issues: [],
      kind,
      parentType,
      parentName,
      roleType: parseRoleType(source.roleType),
      contact: {
        name: contactName,
        title: cleanOptionalText(contactObject.title),
        relationshipTitle: cleanOptionalText(contactObject.relationshipTitle),
        email: cleanOptionalText(contactObject.email),
        phone: cleanOptionalText(contactObject.phone),
        linkedinUrl: cleanOptionalText(contactObject.linkedinUrl || contactObject.url)
      },
      parentMatches: []
    });

    return parsed.success ? parsed.data : null;
  }

  const companyName = cleanEntityNameForDraft(cleanText(source.companyName), "COMPANY");
  const coInvestorName = cleanEntityNameForDraft(cleanText(source.coInvestorName), "CO_INVESTOR");
  if (!companyName || !coInvestorName) return null;
  if (looksLikeHealthSystemEntityName(coInvestorName)) return null;

  const parsed = linkCompanyCoInvestorActionSchema.safeParse({
    id: buildActionId(kind, index, `${companyName}-${coInvestorName}`),
    include: true,
    rationale,
    confidence,
    issues: [],
    kind,
    companyName,
    coInvestorName,
    relationshipType: parseRelationshipType(source.relationshipType),
    notes: cleanOptionalText(source.notes),
    investmentAmountUsd: cleanNumber(source.investmentAmountUsd),
    companyMatches: [],
    coInvestorMatches: []
  });

  return parsed.success ? parsed.data : null;
}

function scoreNameMatch(query: string, candidate: string): { score: number; reason: string } {
  const normalizedQuery = normalizeForLookup(query);
  const normalizedCandidate = normalizeForLookup(candidate);

  if (!normalizedQuery || !normalizedCandidate) {
    return { score: 0, reason: "No comparable name" };
  }

  if (normalizedQuery === normalizedCandidate) {
    return { score: 0.98, reason: "Exact name match" };
  }

  if (
    normalizedCandidate.startsWith(normalizedQuery) ||
    normalizedQuery.startsWith(normalizedCandidate)
  ) {
    return { score: 0.86, reason: "Prefix name match" };
  }

  if (normalizedCandidate.includes(normalizedQuery) || normalizedQuery.includes(normalizedCandidate)) {
    return { score: 0.8, reason: "Substring name match" };
  }

  const queryTokens = new Set(normalizedQuery.split(" ").filter(Boolean));
  const candidateTokens = new Set(normalizedCandidate.split(" ").filter(Boolean));
  let overlap = 0;
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1;
    }
  }

  const ratio = overlap / Math.max(queryTokens.size, candidateTokens.size, 1);
  if (ratio >= 0.75) {
    return { score: 0.74, reason: "High token overlap" };
  }
  if (ratio >= 0.5) {
    return { score: 0.64, reason: "Moderate token overlap" };
  }

  return { score: 0.52, reason: "Low confidence name match" };
}

async function fetchEntityMatches(
  entityType: NarrativeEntityType,
  name: string
): Promise<NarrativeEntityMatch[]> {
  const cleanName = cleanNarrativeNameFragment(name);
  if (!cleanName) return [];
  const normalizedName = cleanEntityNameForDraft(cleanName, entityType);
  const queryNames = Array.from(new Set([cleanName, normalizedName].filter(Boolean)));
  const nameWhere = queryNames.flatMap((queryName) => [
    { name: { equals: queryName, mode: "insensitive" as const } },
    { name: { contains: queryName, mode: "insensitive" as const } }
  ]);
  const scoreName = normalizedName || cleanName;

  if (entityType === "HEALTH_SYSTEM") {
    const candidates = await prisma.healthSystem.findMany({
      where: {
        OR: nameWhere
      },
      select: {
        id: true,
        name: true,
        website: true,
        headquartersCity: true,
        headquartersState: true,
        headquartersCountry: true
      },
      take: 8
    });

    return candidates
      .map((candidate) => {
        const scored = scoreNameMatch(scoreName, candidate.name);
        return {
          id: candidate.id,
          entityType,
          name: candidate.name,
          website: candidate.website,
          headquartersCity: candidate.headquartersCity,
          headquartersState: candidate.headquartersState,
          headquartersCountry: candidate.headquartersCountry,
          confidence: scored.score,
          reason: scored.reason
        };
      })
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  if (entityType === "COMPANY") {
    const candidates = await prisma.company.findMany({
      where: {
        OR: nameWhere
      },
      select: {
        id: true,
        name: true,
        website: true,
        headquartersCity: true,
        headquartersState: true,
        headquartersCountry: true
      },
      take: 8
    });

    return candidates
      .map((candidate) => {
        const scored = scoreNameMatch(scoreName, candidate.name);
        return {
          id: candidate.id,
          entityType,
          name: candidate.name,
          website: candidate.website,
          headquartersCity: candidate.headquartersCity,
          headquartersState: candidate.headquartersState,
          headquartersCountry: candidate.headquartersCountry,
          confidence: scored.score,
          reason: scored.reason
        };
      })
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  const candidates = await prisma.coInvestor.findMany({
    where: {
      OR: nameWhere
    },
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
      headquartersCountry: true
    },
    take: 8
  });

  return candidates
    .map((candidate) => {
      const scored = scoreNameMatch(scoreName, candidate.name);
      return {
        id: candidate.id,
        entityType,
        name: candidate.name,
        website: candidate.website,
        headquartersCity: candidate.headquartersCity,
        headquartersState: candidate.headquartersState,
        headquartersCountry: candidate.headquartersCountry,
        confidence: scored.score,
        reason: scored.reason
      };
    })
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

async function resolveHealthSystemLeadSourceId(name: string): Promise<string | null> {
  const cleanName = cleanNarrativeNameFragment(name);
  if (!cleanName) return null;

  const matched = await fetchEntityMatches("HEALTH_SYSTEM", cleanName);
  const topMatch = matched[0];
  if (!topMatch?.id) return null;

  const confidence = topMatch.confidence || 0;
  return confidence >= AUTO_MATCH_CONFIDENCE_THRESHOLD ? topMatch.id : null;
}

type CompanyLeadSourceResolution = {
  leadSourceType: "HEALTH_SYSTEM" | "OTHER";
  leadSourceHealthSystemId: string | null;
  leadSourceOther: string | null;
};

async function resolveCompanyLeadSource(
  draft: NarrativeEntityDraft
): Promise<CompanyLeadSourceResolution> {
  const requestedType = draft.leadSourceType || "OTHER";
  if (requestedType === "HEALTH_SYSTEM") {
    const explicitHealthSystemId = toNullableString(draft.leadSourceHealthSystemId);
    if (explicitHealthSystemId) {
      const existingHealthSystem = await prisma.healthSystem.findUnique({
        where: { id: explicitHealthSystemId },
        select: { id: true }
      });

      if (existingHealthSystem) {
        return {
          leadSourceType: "HEALTH_SYSTEM",
          leadSourceHealthSystemId: existingHealthSystem.id,
          leadSourceOther: null
        };
      }
    }

    const preferredName =
      toNullableString(draft.leadSourceHealthSystemName) ||
      toNullableString(draft.leadSourceOther) ||
      null;

    if (preferredName) {
      const resolvedId = await resolveHealthSystemLeadSourceId(preferredName);
      if (resolvedId) {
        return {
          leadSourceType: "HEALTH_SYSTEM",
          leadSourceHealthSystemId: resolvedId,
          leadSourceOther: null
        };
      }
    }

    return {
      leadSourceType: "OTHER",
      leadSourceHealthSystemId: null,
      leadSourceOther: preferredName || "Narrative intake"
    };
  }

  return {
    leadSourceType: "OTHER",
    leadSourceHealthSystemId: null,
    leadSourceOther: toNullableString(draft.leadSourceOther) || "Narrative intake"
  };
}

async function fetchWebCandidates(
  entityType: NarrativeEntityType,
  query: string
): Promise<NarrativeWebCandidate[]> {
  const searchTerm = query.trim();
  if (!searchTerm) return [];

  try {
    if (entityType === "HEALTH_SYSTEM") {
      const result = await searchHealthSystemCandidates(searchTerm);
      return result.candidates.map((candidate) => ({
        name: candidate.name,
        website: candidate.website || "",
        headquartersCity: candidate.headquartersCity || "",
        headquartersState: candidate.headquartersState || "",
        headquartersCountry: candidate.headquartersCountry || "",
        summary: candidate.summary || "",
        sourceUrls: candidate.sourceUrls || []
      }));
    }

    if (entityType === "COMPANY") {
      const result = await searchCompanyCandidates(searchTerm);
      return result.candidates.map((candidate) => ({
        name: candidate.name,
        website: candidate.website || "",
        headquartersCity: candidate.headquartersCity || "",
        headquartersState: candidate.headquartersState || "",
        headquartersCountry: candidate.headquartersCountry || "",
        summary: candidate.summary || "",
        sourceUrls: candidate.sourceUrls || []
      }));
    }

    const result = await searchCoInvestorCandidates(searchTerm);
    return result.candidates.map((candidate) => ({
      name: candidate.name,
      website: candidate.website || "",
      headquartersCity: candidate.headquartersCity || "",
      headquartersState: candidate.headquartersState || "",
      headquartersCountry: candidate.headquartersCountry || "",
      summary: candidate.summary || "",
      sourceUrls: candidate.sourceUrls || []
    }));
  } catch (error) {
    console.error("narrative_agent_web_candidate_error", error);
    return [];
  }
}

async function extractActionsFromNarrative(params: {
  narrative: string;
  modelDigest: string;
  modelNarrative: string;
}): Promise<{ summary: string; actions: NarrativeAction[]; warnings: string[] }> {
  const client = getOpenAIClient();
  if (!client) {
    return {
      summary: "OpenAI API key is missing, so no AI extraction ran.",
      actions: [],
      warnings: [
        "Set OPENAI_API_KEY to enable narrative extraction and web-assisted disambiguation."
      ]
    };
  }

  const model =
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.OPENAI_SEARCH_MODEL ||
    "gpt-4.1-mini";
  const systemPrompt =
    "You are Workbench Analyst, a senior CRM data analyst working with a stakeholder. " +
    "The input is ongoing conversation context, not just one sentence. " +
    "Before drafting the first execution plan, work conversationally to refine requirements with the stakeholder. " +
    "Your job each turn is to: " +
    "(1) restate confirmed requirements in plain English, " +
    "(2) identify unresolved questions or assumptions in plain English, and " +
    "(3) propose executable CRM actions only for confirmed changes. " +
    "Ask at most one clarification question per turn. " +
    "If clarification is still needed, return actions as an empty array and put only that single question in warnings. " +
    "When requirements are clear, return actions for an execution plan. " +
    "If the stakeholder says 'build execution plan' or 'requirements confirmed', treat that as permission to draft the plan immediately. " +
    "Allowed actions: CREATE_ENTITY, UPDATE_ENTITY, ADD_CONTACT, LINK_COMPANY_CO_INVESTOR. " +
    "For CREATE_ENTITY and UPDATE_ENTITY include entityType as HEALTH_SYSTEM, COMPANY, or CO_INVESTOR. " +
    "Match policy: if an existing CRM record match is at least 80% confidence, assume using existing instead of creating a new record. " +
    "Use the provided data model snapshot as source of truth for supported entities/fields. " +
    "Relationship rules: health systems and co-investors are different entities; a health system is not a co-investor unless the narrative explicitly names an investment arm/fund as the investor. " +
    "If a health system introduced us to a company, model that as company lead source (HEALTH_SYSTEM), not a co-investor relationship. " +
    "When lead source changes are requested for an existing company, use UPDATE_ENTITY on COMPANY and include patch fields leadSourceType plus leadSourceHealthSystemName/leadSourceOther/leadSourceNotes as needed. " +
    "Execution checklist for company-health-system requests: " +
    "(a) resolve canonical company and health-system names, " +
    "(b) emit at least one UPDATE_ENTITY action for the Company lead-source change, " +
    "(c) do not emit unsupported action kinds such as LINK_COMPANY_HEALTH_SYSTEM, " +
    "(d) if optional relationship-link details are unclear, keep the base update action and ask follow-up in warnings instead of returning empty actions. " +
    "If a fund or investment arm is described as an investor, create/link the co-investor relationship to the company. " +
    "Avoid duplicates and aliases (for example 'Vitalize Care' and 'a company called Vitalize Care' are the same company). " +
    "Prefer canonical names; remove filler phrases like 'a company called'. " +
    "Do not ask the stakeholder to provide low-level required schema defaults (timestamps, status enums, internal IDs) when those can be system-defaulted. " +
    "Ask only domain clarifications needed to choose entities, relationships, and intent. " +
    "If a request is ambiguous, do not guess: keep uncertain items out of actions and put specific clarification prompts in warnings. " +
    "If the stakeholder asks for deletes, note that delete execution is not supported in warnings and do not fabricate delete actions. " +
    "Return concise rationales and confidence values between 0 and 1.";

  const userPrompt =
    `Narrative:\n${params.narrative}\n\n` +
    `Current data model snapshot:\n${params.modelDigest}\n\n` +
    `Relationship and business-rules narrative:\n${params.modelNarrative}\n\n` +
    "Return actions that can be executed in the CRM. Do not invent unsupported tables or fields.";

  try {
    const response = await client.responses.create({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "narrative_actions",
          schema: extractionSchema,
          strict: false
        }
      },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: systemPrompt }]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }]
        }
      ]
    } as any);

    const payload = extractJsonPayload(response.output_text || "{}");
    const summary = safeTextForSummary(cleanText(payload.summary));
    const extractedWarnings = Array.isArray(payload.warnings)
      ? payload.warnings.map((entry) => cleanText(entry)).filter(Boolean)
      : [];
    const rawActions = Array.isArray(payload.actions) ? payload.actions : [];
    const converted = rawActions
      .map((rawAction, index) => convertRawExtractionAction(rawAction, index))
      .filter((entry): entry is NarrativeAction => entry !== null);

    return {
      summary,
      actions: converted,
      warnings: extractedWarnings
    };
  } catch (error) {
    console.error("narrative_agent_extract_error", error);
    return {
      summary: "AI extraction failed for this narrative.",
      actions: [],
      warnings: ["The AI extraction call failed. Check OpenAI credentials and try again."]
    };
  }
}

function createActionLookup(actions: NarrativeAction[]) {
  const map = new Map<string, string>();
  for (const action of actions) {
    if (action.kind !== "CREATE_ENTITY") continue;
    const key = `${action.entityType}:${normalizeEntityNameForLookup(action.draft.name, action.entityType)}`;
    map.set(key, action.id);
  }
  return map;
}

function lookupCreateAction(
  createLookup: Map<string, string>,
  entityType: NarrativeEntityType,
  name: string
): string | undefined {
  const key = `${entityType}:${normalizeEntityNameForLookup(name, entityType)}`;
  return createLookup.get(key);
}

async function hydrateAction(
  action: NarrativeAction,
  createLookup: Map<string, string>
): Promise<NarrativeAction> {
  if (action.kind === "CREATE_ENTITY") {
    const existingMatches = await fetchEntityMatches(action.entityType, action.draft.name);
    const webCandidates = await fetchWebCandidates(action.entityType, action.draft.name);

    const nextIssues = [...action.issues];
    let selection = action.selection;
    let nextDraft = action.draft;

    const topExistingMatch = existingMatches[0];
    const topExistingHighConfidence = hasHighConfidenceMatch(topExistingMatch);

    if (topExistingMatch && topExistingHighConfidence) {
      selection = {
        mode: "USE_EXISTING",
        existingId: topExistingMatch.id
      };
      if (existingMatches.length > 1) {
        nextIssues.push(
          `Existing CRM matches found; auto-selecting ${topExistingMatch.name} because confidence is at least ${Math.round(
            AUTO_MATCH_CONFIDENCE_THRESHOLD * 100
          )}%.`
        );
      } else {
        nextIssues.push(
          `High-confidence existing match found (${Math.round(
            (topExistingMatch.confidence || 0) * 100
          )}%). Defaulting to existing record.`
        );
      }
    } else if (webCandidates.length === 1) {
      selection = {
        mode: "CREATE_FROM_WEB",
        webCandidateIndex: 0
      };
    } else if (webCandidates.length > 1) {
      selection = {
        mode: "CREATE_FROM_WEB"
      };
      nextIssues.push("Multiple web matches found. Select the correct entity before execution.");
    } else {
      selection = {
        mode: "CREATE_MANUAL"
      };
      nextIssues.push("No web match found. Manual create is selected.");
    }

    if (topExistingMatch && !topExistingHighConfidence) {
      nextIssues.push(
        `Potential existing match found (${Math.round((topExistingMatch.confidence || 0) * 100)}%), below ${Math.round(
          AUTO_MATCH_CONFIDENCE_THRESHOLD * 100
        )}% auto-select threshold. Confirm whether to use existing or create new.`
      );
    }

    if (action.entityType === "COMPANY" && action.draft.leadSourceType === "HEALTH_SYSTEM") {
      const leadSourceName =
        cleanNarrativeNameFragment(action.draft.leadSourceHealthSystemName || action.draft.leadSourceOther || "") ||
        "";
      if (leadSourceName) {
        const leadSourceMatches = await fetchEntityMatches("HEALTH_SYSTEM", leadSourceName);
        const topLeadSourceMatch = leadSourceMatches[0];

        if (topLeadSourceMatch?.id && hasHighConfidenceMatch(topLeadSourceMatch)) {
          const leadSourceConfidence = topLeadSourceMatch.confidence || 0;
          nextDraft = {
            ...nextDraft,
            leadSourceType: "HEALTH_SYSTEM",
            leadSourceHealthSystemId: topLeadSourceMatch.id,
            leadSourceHealthSystemName: topLeadSourceMatch.name,
            leadSourceOther: undefined
          };

          if (leadSourceMatches.length > 1) {
            nextIssues.push(
              `Multiple lead-source health system matches found. Defaulting to ${topLeadSourceMatch.name}.`
            );
          } else if (leadSourceConfidence >= AUTO_MATCH_CONFIDENCE_THRESHOLD) {
            nextIssues.push(`Lead source matched to existing health system: ${topLeadSourceMatch.name}.`);
          }
        } else if (topLeadSourceMatch) {
          nextDraft = {
            ...nextDraft,
            leadSourceHealthSystemId: undefined
          };
          nextIssues.push(
            `Possible lead-source health system match (${Math.round(
              (topLeadSourceMatch.confidence || 0) * 100
            )}%) is below ${Math.round(
              AUTO_MATCH_CONFIDENCE_THRESHOLD * 100
            )}% threshold. Confirm before execution.`
          );
        } else {
          nextIssues.push(
            `No existing health system match found for lead source "${leadSourceName}".`
          );
        }
      }
    }

    return {
      ...action,
      draft: nextDraft,
      existingMatches,
      webCandidates,
      selection,
      issues: Array.from(new Set(nextIssues))
    };
  }

  if (action.kind === "UPDATE_ENTITY") {
    const targetMatches = await fetchEntityMatches(action.entityType, action.targetName);
    const linkedCreateActionId = lookupCreateAction(createLookup, action.entityType, action.targetName);
    const topTargetMatch = targetMatches[0];
    const selectedTargetId = hasHighConfidenceMatch(topTargetMatch) ? topTargetMatch?.id : undefined;

    const nextIssues = [...action.issues];
    if (targetMatches.length === 0 && !linkedCreateActionId) {
      nextIssues.push("No matching existing record found for update target.");
    } else if (!selectedTargetId && !linkedCreateActionId && topTargetMatch) {
      nextIssues.push(
        `Potential update target match (${Math.round(
          (topTargetMatch.confidence || 0) * 100
        )}%) is below ${Math.round(
          AUTO_MATCH_CONFIDENCE_THRESHOLD * 100
        )}% threshold. Confirm target before execution.`
      );
    }

    return {
      ...action,
      targetMatches,
      selectedTargetId,
      linkedCreateActionId,
      issues: Array.from(new Set(nextIssues))
    };
  }

  if (action.kind === "ADD_CONTACT") {
    const parentMatches = await fetchEntityMatches(action.parentType, action.parentName);
    const linkedCreateActionId = lookupCreateAction(createLookup, action.parentType, action.parentName);
    const topParentMatch = parentMatches[0];
    const selectedParentId = hasHighConfidenceMatch(topParentMatch) ? topParentMatch?.id : undefined;

    const nextIssues = [...action.issues];
    if (parentMatches.length === 0 && !linkedCreateActionId) {
      nextIssues.push("No matching parent record found for contact link.");
    } else if (!selectedParentId && !linkedCreateActionId && topParentMatch) {
      nextIssues.push(
        `Potential parent match (${Math.round((topParentMatch.confidence || 0) * 100)}%) is below ${Math.round(
          AUTO_MATCH_CONFIDENCE_THRESHOLD * 100
        )}% threshold. Confirm parent before execution.`
      );
    }

    return {
      ...action,
      roleType: action.roleType || defaultRoleForParent(action.parentType),
      parentMatches,
      selectedParentId,
      linkedCreateActionId,
      issues: Array.from(new Set(nextIssues))
    };
  }

  const companyMatches = await fetchEntityMatches("COMPANY", action.companyName);
  const coInvestorMatches = await fetchEntityMatches("CO_INVESTOR", action.coInvestorName);
  const healthSystemMatchesForCoInvestor = await fetchEntityMatches("HEALTH_SYSTEM", action.coInvestorName);
  const companyCreateActionId = lookupCreateAction(createLookup, "COMPANY", action.companyName);
  const coInvestorCreateActionId = lookupCreateAction(createLookup, "CO_INVESTOR", action.coInvestorName);
  const topCompanyMatch = companyMatches[0];
  const topCoInvestorMatch = coInvestorMatches[0];
  const selectedCompanyId = hasHighConfidenceMatch(topCompanyMatch) ? topCompanyMatch?.id : undefined;
  const selectedCoInvestorId = hasHighConfidenceMatch(topCoInvestorMatch)
    ? topCoInvestorMatch?.id
    : undefined;

  const nextIssues = [...action.issues];
  if (companyMatches.length === 0 && !companyCreateActionId) {
    nextIssues.push("No matching company record found for relationship.");
  } else if (!selectedCompanyId && !companyCreateActionId && topCompanyMatch) {
    nextIssues.push(
      `Potential company match (${Math.round((topCompanyMatch.confidence || 0) * 100)}%) is below ${Math.round(
        AUTO_MATCH_CONFIDENCE_THRESHOLD * 100
      )}% threshold. Confirm company before execution.`
    );
  }
  if (coInvestorMatches.length === 0 && !coInvestorCreateActionId) {
    const healthSystemAlias = healthSystemMatchesForCoInvestor[0];
    if (healthSystemAlias) {
      nextIssues.push(
        `"${action.coInvestorName}" appears to be a health system (${healthSystemAlias.name}), not a co-investor.`
      );
    } else {
      nextIssues.push("No matching co-investor record found for relationship.");
    }
  } else if (!selectedCoInvestorId && !coInvestorCreateActionId && topCoInvestorMatch) {
    nextIssues.push(
      `Potential co-investor match (${Math.round(
        (topCoInvestorMatch.confidence || 0) * 100
      )}%) is below ${Math.round(
        AUTO_MATCH_CONFIDENCE_THRESHOLD * 100
      )}% threshold. Confirm co-investor before execution.`
    );
  }

  return {
    ...action,
    companyMatches,
    coInvestorMatches,
    selectedCompanyId,
    selectedCoInvestorId,
    companyCreateActionId,
    coInvestorCreateActionId,
    issues: Array.from(new Set(nextIssues))
  };
}

export async function buildNarrativePlan(narrative: string): Promise<NarrativePlan> {
  const modelDigest = getNarrativeAgentModelDigest();
  const modelNarrative = getNarrativeAgentModelNarrative();
  const extraction = await extractActionsFromNarrative({ narrative, modelDigest, modelNarrative });
  const heuristic = applyIntroductionHeuristics(narrative, extraction.actions);
  const dedupedActions = dedupeExtractedActions(heuristic.actions);
  const requirementsLocked = hasRequirementsLockSignal(narrative);

  const createLookup = createActionLookup(dedupedActions);
  const hydratedActions: NarrativeAction[] = [];

  for (const action of dedupedActions) {
    const hydrated = await hydrateAction(action, createLookup);
    hydratedActions.push(hydrated);
  }

  const warnings = [...extraction.warnings, ...heuristic.warnings];
  if (dedupedActions.length < heuristic.actions.length) {
    warnings.push(
      `Consolidated duplicate actions (${heuristic.actions.length} extracted → ${dedupedActions.length} unique).`
    );
  }

  const clarificationQuestions =
    !requirementsLocked && hydratedActions.length > 0
      ? buildClarificationQuestionQueue(hydratedActions, extraction.warnings)
      : [];

  if (!requirementsLocked && hydratedActions.length > 0 && clarificationQuestions.length > 0) {
    const candidatePreview = hydratedActions
      .slice(0, 5)
      .map((action) => summarizeActionRequirement(action))
      .join(" ");

    return narrativePlanSchema.parse({
      narrative,
      phase: "CLARIFICATION",
      summary: [
        buildClarificationSummary(extraction.summary, hydratedActions),
        candidatePreview ? `Candidate requirements so far: ${candidatePreview}` : null
      ]
        .filter(Boolean)
        .join(" "),
      modelDigest,
      warnings: clarificationQuestions,
      actions: hydratedActions
    });
  }

  if (hydratedActions.length === 0) {
    warnings.push("No actionable items were extracted. You can edit the narrative and try again.");
  }

  const summary =
    extraction.summary ||
    (hydratedActions.length > 0
      ? `Extracted ${hydratedActions.length} action${hydratedActions.length === 1 ? "" : "s"}.`
      : "No actions extracted.");

  const planWarnings = Array.from(new Set(warnings.map((warning) => cleanText(warning)).filter(Boolean))).filter(
    (warning) => isOperationalWarning(warning)
  );

  return narrativePlanSchema.parse({
    narrative,
    phase: "PLAN",
    summary,
    modelDigest,
    warnings: planWarnings,
    actions: hydratedActions
  });
}

function toNullableString(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function toRequiredString(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error("Name is required.");
  }
  return trimmed;
}

async function getEntityRecordById(entityType: NarrativeEntityType, id: string) {
  if (entityType === "HEALTH_SYSTEM") {
    return prisma.healthSystem.findUnique({
      where: { id },
      select: { id: true, name: true }
    });
  }

  if (entityType === "COMPANY") {
    return prisma.company.findUnique({
      where: { id },
      select: { id: true, name: true }
    });
  }

  return prisma.coInvestor.findUnique({
    where: { id },
    select: { id: true, name: true }
  });
}

async function executeCreateEntityAction(action: CreateEntityAction): Promise<CreatedEntityReference> {
  const mode = action.selection.mode;

  if (mode === "USE_EXISTING") {
    const existingId = action.selection.existingId || action.existingMatches[0]?.id;
    if (!existingId) {
      throw new Error("Create action is set to use existing record, but no existing record was selected.");
    }

    const existing = await getEntityRecordById(action.entityType, existingId);
    if (!existing) {
      throw new Error("Selected existing record no longer exists.");
    }

    return {
      entityType: action.entityType,
      id: existing.id,
      name: existing.name,
      created: false
    };
  }

  if (mode === "CREATE_FROM_WEB") {
    if (action.webCandidates.length === 0) {
      throw new Error(
        "No web candidates available for this create action. Choose manual create or select an existing record."
      );
    }

    const selectedIndex =
      action.selection.webCandidateIndex === undefined
        ? action.webCandidates.length === 1
          ? 0
          : undefined
        : action.selection.webCandidateIndex;

    if (selectedIndex === undefined) {
      throw new Error("Multiple web candidates found. Select one candidate before execution.");
    }

    const selectedCandidate = action.webCandidates[selectedIndex];
    if (!selectedCandidate) {
      throw new Error("Selected web candidate is invalid. Please choose a valid candidate.");
    }

    if (action.entityType === "HEALTH_SYSTEM") {
      const candidate: HealthSystemSearchCandidate = {
        name: selectedCandidate.name,
        website: selectedCandidate.website,
        headquartersCity: selectedCandidate.headquartersCity,
        headquartersState: selectedCandidate.headquartersState,
        headquartersCountry: selectedCandidate.headquartersCountry,
        summary: selectedCandidate.summary,
        sourceUrls: selectedCandidate.sourceUrls
      };

      const created = await verifyHealthSystemAndQueueResearch({
        candidate,
        isLimitedPartner: action.draft.isLimitedPartner ?? false,
        isAllianceMember: action.draft.isAllianceMember ?? false,
        limitedPartnerInvestmentUsd: action.draft.limitedPartnerInvestmentUsd ?? null
      });

      return {
        entityType: "HEALTH_SYSTEM",
        id: created.healthSystem.id,
        name: created.healthSystem.name,
        created: true
      };
    }

    if (action.entityType === "COMPANY") {
      const leadSource = await resolveCompanyLeadSource(action.draft);
      const candidate: CompanySearchCandidate = {
        name: selectedCandidate.name,
        website: selectedCandidate.website,
        headquartersCity: selectedCandidate.headquartersCity,
        headquartersState: selectedCandidate.headquartersState,
        headquartersCountry: selectedCandidate.headquartersCountry,
        summary: selectedCandidate.summary,
        sourceUrls: selectedCandidate.sourceUrls
      };

      const created = await verifyCompanyAndQueueResearch({
        candidate,
        companyType: action.draft.companyType || "STARTUP",
        primaryCategory: action.draft.primaryCategory || "OTHER",
        primaryCategoryOther: action.draft.primaryCategoryOther,
        leadSourceType: leadSource.leadSourceType,
        leadSourceOther: leadSource.leadSourceOther || undefined,
        leadSourceHealthSystemId: leadSource.leadSourceHealthSystemId
      });

      return {
        entityType: "COMPANY",
        id: created.company.id,
        name: created.company.name,
        created: true
      };
    }

    const candidate: CoInvestorSearchCandidate = {
      name: selectedCandidate.name,
      website: selectedCandidate.website,
      headquartersCity: selectedCandidate.headquartersCity,
      headquartersState: selectedCandidate.headquartersState,
      headquartersCountry: selectedCandidate.headquartersCountry,
      summary: selectedCandidate.summary,
      sourceUrls: selectedCandidate.sourceUrls
    };

    const created = await verifyCoInvestorAndQueueResearch({
      candidate,
      isSeedInvestor: action.draft.isSeedInvestor ?? false,
      isSeriesAInvestor: action.draft.isSeriesAInvestor ?? false
    });

    return {
      entityType: "CO_INVESTOR",
      id: created.coInvestor.id,
      name: created.coInvestor.name,
      created: true
    };
  }

  if (action.entityType === "HEALTH_SYSTEM") {
    const record = await prisma.healthSystem.create({
      data: {
        name: toRequiredString(action.draft.name),
        legalName: toNullableString(action.draft.legalName),
        website: toNullableString(action.draft.website),
        headquartersCity: toNullableString(action.draft.headquartersCity),
        headquartersState: toNullableString(action.draft.headquartersState),
        headquartersCountry: toNullableString(action.draft.headquartersCountry),
        isLimitedPartner: action.draft.isLimitedPartner ?? false,
        isAllianceMember: action.draft.isAllianceMember ?? false,
        limitedPartnerInvestmentUsd:
          action.draft.isLimitedPartner
            ? (action.draft.limitedPartnerInvestmentUsd ?? null)
            : null,
        researchStatus: "DRAFT",
        researchNotes: toNullableString(action.draft.researchNotes),
        researchUpdatedAt: new Date()
      }
    });

    await queueResearchForHealthSystem(record.id);

    return {
      entityType: "HEALTH_SYSTEM",
      id: record.id,
      name: record.name,
      created: true
    };
  }

  if (action.entityType === "COMPANY") {
    const leadSource = await resolveCompanyLeadSource(action.draft);
    const record = await prisma.company.create({
      data: {
        name: toRequiredString(action.draft.name),
        legalName: toNullableString(action.draft.legalName),
        website: toNullableString(action.draft.website),
        headquartersCity: toNullableString(action.draft.headquartersCity),
        headquartersState: toNullableString(action.draft.headquartersState),
        headquartersCountry: toNullableString(action.draft.headquartersCountry),
        companyType: action.draft.companyType || "STARTUP",
        primaryCategory: action.draft.primaryCategory || "OTHER",
        primaryCategoryOther: toNullableString(action.draft.primaryCategoryOther),
        leadSourceType: leadSource.leadSourceType,
        leadSourceHealthSystemId: leadSource.leadSourceHealthSystemId,
        leadSourceOther: leadSource.leadSourceOther,
        description: toNullableString(action.draft.description),
        researchStatus: "DRAFT",
        researchNotes: toNullableString(action.draft.researchNotes),
        researchUpdatedAt: new Date(),
        intakeStatus: "NOT_SCHEDULED"
      }
    });

    await queueResearchForCompany(record.id);

    return {
      entityType: "COMPANY",
      id: record.id,
      name: record.name,
      created: true
    };
  }

  const record = await prisma.coInvestor.create({
    data: {
      name: toRequiredString(action.draft.name),
      legalName: toNullableString(action.draft.legalName),
      website: toNullableString(action.draft.website),
      headquartersCity: toNullableString(action.draft.headquartersCity),
      headquartersState: toNullableString(action.draft.headquartersState),
      headquartersCountry: toNullableString(action.draft.headquartersCountry),
      isSeedInvestor: action.draft.isSeedInvestor ?? false,
      isSeriesAInvestor: action.draft.isSeriesAInvestor ?? false,
      investmentNotes: toNullableString(action.draft.investmentNotes),
      researchStatus: "DRAFT",
      researchNotes: toNullableString(action.draft.researchNotes),
      researchUpdatedAt: new Date()
    }
  });

  await queueResearchForCoInvestor(record.id);

  return {
    entityType: "CO_INVESTOR",
    id: record.id,
    name: record.name,
    created: true
  };
}

function resolveLinkedId(
  explicitId: string | undefined,
  fallbackMatchId: string | undefined,
  linkedCreateActionId: string | undefined,
  createdByActionId: Map<string, CreatedEntityReference>
) {
  if (explicitId) return explicitId;
  if (fallbackMatchId) return fallbackMatchId;
  if (!linkedCreateActionId) return undefined;
  return createdByActionId.get(linkedCreateActionId)?.id;
}

function applyNullableStringPatch(
  patch: NarrativeEntityPatch,
  key: keyof NarrativeEntityPatch
): string | null | undefined {
  if (!(key in patch)) return undefined;
  const value = patch[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function applyRequiredStringPatch(
  patch: NarrativeEntityPatch,
  key: keyof NarrativeEntityPatch
): string | undefined {
  if (!(key in patch)) return undefined;
  const value = patch[key];
  if (typeof value !== "string") {
    throw new Error("Name patch must be a string.");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Name patch cannot be empty.");
  }
  return trimmed;
}

async function executeUpdateEntityAction(
  action: UpdateEntityAction,
  createdByActionId: Map<string, CreatedEntityReference>
): Promise<CreatedEntityReference> {
  const targetId = resolveLinkedId(
    action.selectedTargetId,
    undefined,
    action.linkedCreateActionId,
    createdByActionId
  );

  if (!targetId) {
    throw new Error("No target record selected for update.");
  }

  if (action.entityType === "HEALTH_SYSTEM") {
    const data: Prisma.HealthSystemUpdateInput = {};

    const name = applyRequiredStringPatch(action.patch, "name");
    if (name !== undefined) data.name = name;

    const legalName = applyNullableStringPatch(action.patch, "legalName");
    if (legalName !== undefined) data.legalName = legalName;

    const website = applyNullableStringPatch(action.patch, "website");
    if (website !== undefined) data.website = website;

    const city = applyNullableStringPatch(action.patch, "headquartersCity");
    if (city !== undefined) data.headquartersCity = city;

    const state = applyNullableStringPatch(action.patch, "headquartersState");
    if (state !== undefined) data.headquartersState = state;

    const country = applyNullableStringPatch(action.patch, "headquartersCountry");
    if (country !== undefined) data.headquartersCountry = country;

    const notes = applyNullableStringPatch(action.patch, "researchNotes");
    if (notes !== undefined) data.researchNotes = notes;

    data.researchUpdatedAt = new Date();

    const updated = await prisma.healthSystem.update({
      where: { id: targetId },
      data,
      select: { id: true, name: true }
    });

    return {
      entityType: "HEALTH_SYSTEM",
      id: updated.id,
      name: updated.name,
      created: false
    };
  }

  if (action.entityType === "COMPANY") {
    const data: Prisma.CompanyUpdateInput = {};

    const name = applyRequiredStringPatch(action.patch, "name");
    if (name !== undefined) data.name = name;

    const legalName = applyNullableStringPatch(action.patch, "legalName");
    if (legalName !== undefined) data.legalName = legalName;

    const website = applyNullableStringPatch(action.patch, "website");
    if (website !== undefined) data.website = website;

    const city = applyNullableStringPatch(action.patch, "headquartersCity");
    if (city !== undefined) data.headquartersCity = city;

    const state = applyNullableStringPatch(action.patch, "headquartersState");
    if (state !== undefined) data.headquartersState = state;

    const country = applyNullableStringPatch(action.patch, "headquartersCountry");
    if (country !== undefined) data.headquartersCountry = country;

    const researchNotes = applyNullableStringPatch(action.patch, "researchNotes");
    if (researchNotes !== undefined) data.researchNotes = researchNotes;

    const description = applyNullableStringPatch(action.patch, "description");
    if (description !== undefined) data.description = description;

    const leadSourceTypePatch =
      action.patch.leadSourceType ||
      (action.patch.leadSourceHealthSystemId || action.patch.leadSourceHealthSystemName
        ? "HEALTH_SYSTEM"
        : action.patch.leadSourceOther
          ? "OTHER"
          : undefined);

    if (leadSourceTypePatch === "HEALTH_SYSTEM") {
      const explicitHealthSystemId = toNullableString(action.patch.leadSourceHealthSystemId);
      let resolvedHealthSystemId: string | null = null;

      if (explicitHealthSystemId) {
        const existingHealthSystem = await prisma.healthSystem.findUnique({
          where: { id: explicitHealthSystemId },
          select: { id: true }
        });
        if (existingHealthSystem) {
          resolvedHealthSystemId = existingHealthSystem.id;
        }
      }

      if (!resolvedHealthSystemId) {
        const leadSourceName =
          toNullableString(action.patch.leadSourceHealthSystemName) ||
          toNullableString(action.patch.leadSourceOther) ||
          null;
        if (leadSourceName) {
          resolvedHealthSystemId = await resolveHealthSystemLeadSourceId(leadSourceName);
        }
      }

      if (resolvedHealthSystemId) {
        data.leadSourceType = "HEALTH_SYSTEM";
        data.leadSourceHealthSystem = { connect: { id: resolvedHealthSystemId } };
        data.leadSourceOther = null;
      } else {
        const fallbackOther =
          toNullableString(action.patch.leadSourceHealthSystemName) ||
          toNullableString(action.patch.leadSourceOther) ||
          "Narrative intake";
        data.leadSourceType = "OTHER";
        data.leadSourceHealthSystem = { disconnect: true };
        data.leadSourceOther = fallbackOther;
      }
    } else if (leadSourceTypePatch === "OTHER") {
      data.leadSourceType = "OTHER";
      data.leadSourceHealthSystem = { disconnect: true };
      data.leadSourceOther = toNullableString(action.patch.leadSourceOther) || "Narrative intake";
    }

    const leadSourceNotes = applyNullableStringPatch(action.patch, "leadSourceNotes");
    if (leadSourceNotes !== undefined) data.leadSourceNotes = leadSourceNotes;

    data.researchUpdatedAt = new Date();

    const updated = await prisma.company.update({
      where: { id: targetId },
      data,
      select: { id: true, name: true }
    });

    return {
      entityType: "COMPANY",
      id: updated.id,
      name: updated.name,
      created: false
    };
  }

  const data: Prisma.CoInvestorUpdateInput = {};

  const name = applyRequiredStringPatch(action.patch, "name");
  if (name !== undefined) data.name = name;

  const legalName = applyNullableStringPatch(action.patch, "legalName");
  if (legalName !== undefined) data.legalName = legalName;

  const website = applyNullableStringPatch(action.patch, "website");
  if (website !== undefined) data.website = website;

  const city = applyNullableStringPatch(action.patch, "headquartersCity");
  if (city !== undefined) data.headquartersCity = city;

  const state = applyNullableStringPatch(action.patch, "headquartersState");
  if (state !== undefined) data.headquartersState = state;

  const country = applyNullableStringPatch(action.patch, "headquartersCountry");
  if (country !== undefined) data.headquartersCountry = country;

  const researchNotes = applyNullableStringPatch(action.patch, "researchNotes");
  if (researchNotes !== undefined) data.researchNotes = researchNotes;

  const investmentNotes = applyNullableStringPatch(action.patch, "investmentNotes");
  if (investmentNotes !== undefined) data.investmentNotes = investmentNotes;

  data.researchUpdatedAt = new Date();

  const updated = await prisma.coInvestor.update({
    where: { id: targetId },
    data,
    select: { id: true, name: true }
  });

  return {
    entityType: "CO_INVESTOR",
    id: updated.id,
    name: updated.name,
    created: false
  };
}

async function executeAddContactAction(
  action: AddContactAction,
  createdByActionId: Map<string, CreatedEntityReference>
): Promise<{ parentId: string; contactName: string }> {
  const parentId = resolveLinkedId(
    action.selectedParentId,
    undefined,
    action.linkedCreateActionId,
    createdByActionId
  );

  if (!parentId) {
    throw new Error("No parent record selected for contact action.");
  }

  const contactName = toRequiredString(action.contact.name);

  await prisma.$transaction(async (tx) => {
    const resolved = await resolveOrCreateContact(tx, {
      name: contactName,
      title: toNullableString(action.contact.title),
      relationshipTitle: toNullableString(action.contact.relationshipTitle),
      email: toNullableString(action.contact.email),
      phone: toNullableString(action.contact.phone),
      linkedinUrl: toNullableString(action.contact.linkedinUrl)
    });

    if (action.parentType === "HEALTH_SYSTEM") {
      await upsertHealthSystemContactLink(tx, {
        contactId: resolved.contact.id,
        healthSystemId: parentId,
        roleType: action.roleType,
        title: toNullableString(action.contact.relationshipTitle) || toNullableString(action.contact.title)
      });
      return;
    }

    if (action.parentType === "COMPANY") {
      await upsertCompanyContactLink(tx, {
        contactId: resolved.contact.id,
        companyId: parentId,
        roleType: action.roleType,
        title: toNullableString(action.contact.relationshipTitle) || toNullableString(action.contact.title)
      });
      return;
    }

    await upsertCoInvestorContactLink(tx, {
      contactId: resolved.contact.id,
      coInvestorId: parentId,
      roleType: action.roleType,
      title: toNullableString(action.contact.relationshipTitle) || toNullableString(action.contact.title)
    });
  });

  return {
    parentId,
    contactName
  };
}

function hasIntroductionLanguage(value?: string | null): boolean {
  const normalized = normalizeForLookup(value || "");
  if (!normalized) return false;
  return (
    normalized.includes("introduced us to") ||
    normalized.includes("introduced to") ||
    normalized.includes("intro to") ||
    normalized.includes("referred us to") ||
    normalized.includes("referred to")
  );
}

async function resolveLeadSourceHealthSystemFromIntroducer(
  coInvestorId: string,
  coInvestorName: string
): Promise<{ id: string; name: string } | null> {
  const linkedVenturePartner = await prisma.venturePartner.findFirst({
    where: {
      coInvestorId
    },
    select: {
      healthSystem: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  if (linkedVenturePartner?.healthSystem) {
    return linkedVenturePartner.healthSystem;
  }

  const healthSystemHint = inferHealthSystemNameFromIntroducer(coInvestorName);
  if (!healthSystemHint) return null;

  const resolvedId = await resolveHealthSystemLeadSourceId(healthSystemHint);
  if (!resolvedId) return null;

  const healthSystem = await prisma.healthSystem.findUnique({
    where: { id: resolvedId },
    select: { id: true, name: true }
  });

  return healthSystem;
}

async function executeLinkCompanyCoInvestorAction(
  action: LinkCompanyCoInvestorAction,
  createdByActionId: Map<string, CreatedEntityReference>
): Promise<{ companyId: string; coInvestorId: string }> {
  const companyId = resolveLinkedId(
    action.selectedCompanyId,
    undefined,
    action.companyCreateActionId,
    createdByActionId
  );

  if (!companyId) {
    throw new Error("No company selected for co-investor relationship.");
  }

  const coInvestorId = resolveLinkedId(
    action.selectedCoInvestorId,
    undefined,
    action.coInvestorCreateActionId,
    createdByActionId
  );

  if (!coInvestorId) {
    throw new Error("No co-investor selected for relationship.");
  }

  const existing = await prisma.companyCoInvestorLink.findFirst({
    where: {
      companyId,
      coInvestorId
    },
    select: {
      id: true
    }
  });

  if (existing) {
    await prisma.companyCoInvestorLink.update({
      where: { id: existing.id },
      data: {
        relationshipType: action.relationshipType,
        notes: toNullableString(action.notes),
        investmentAmountUsd: action.investmentAmountUsd ?? null
      }
    });
  } else {
    await prisma.companyCoInvestorLink.create({
      data: {
        companyId,
        coInvestorId,
        relationshipType: action.relationshipType,
        notes: toNullableString(action.notes),
        investmentAmountUsd: action.investmentAmountUsd ?? null
      }
    });
  }

  const introductionSignal = hasIntroductionLanguage(action.notes) || hasIntroductionLanguage(action.rationale);
  if (introductionSignal) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: {
        leadSourceHealthSystemId: true,
        leadSourceOther: true
      }
    });

    if (company) {
      const shouldBackfillLeadSource =
        !company.leadSourceHealthSystemId &&
        (!company.leadSourceOther || normalizeForLookup(company.leadSourceOther) === "narrative intake");

      if (shouldBackfillLeadSource) {
        const resolvedHealthSystem = await resolveLeadSourceHealthSystemFromIntroducer(
          coInvestorId,
          action.coInvestorName
        );

        if (resolvedHealthSystem) {
          await prisma.company.update({
            where: { id: companyId },
            data: {
              leadSourceType: "HEALTH_SYSTEM",
              leadSourceHealthSystemId: resolvedHealthSystem.id,
              leadSourceOther: null,
              leadSourceNotes:
                toNullableString(action.notes) ||
                `Introduced by ${action.coInvestorName} (narrative intake).`
            }
          });
        } else {
          await prisma.company.update({
            where: { id: companyId },
            data: {
              leadSourceType: "OTHER",
              leadSourceHealthSystemId: null,
              leadSourceOther: toNullableString(action.coInvestorName),
              leadSourceNotes:
                toNullableString(action.notes) ||
                `Introduced by ${action.coInvestorName} (narrative intake).`
            }
          });
        }
      }
    }
  }

  return {
    companyId,
    coInvestorId
  };
}

function validateExecutionResult(result: NarrativeExecutionResult): NarrativeExecutionResult {
  const parsed = narrativeExecutionResultSchema.parse(result);
  return parsed;
}

function getDependencyActionIds(action: NarrativeAction): string[] {
  if (action.kind === "UPDATE_ENTITY") {
    if (action.selectedTargetId) return [];
    return action.linkedCreateActionId ? [action.linkedCreateActionId] : [];
  }

  if (action.kind === "ADD_CONTACT") {
    if (action.selectedParentId) return [];
    return action.linkedCreateActionId ? [action.linkedCreateActionId] : [];
  }

  if (action.kind === "LINK_COMPANY_CO_INVESTOR") {
    const dependencyIds: string[] = [];
    if (!action.selectedCompanyId && action.companyCreateActionId) {
      dependencyIds.push(action.companyCreateActionId);
    }
    if (!action.selectedCoInvestorId && action.coInvestorCreateActionId) {
      dependencyIds.push(action.coInvestorCreateActionId);
    }
    return dependencyIds;
  }

  return [];
}

function orderActionsForExecution(actions: NarrativeAction[]): NarrativeAction[] {
  const includedActions = actions.filter((action) => action.include);
  const actionById = new Map(includedActions.map((action) => [action.id, action]));
  const indexById = new Map(actions.map((action, index) => [action.id, index]));

  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();

  for (const action of includedActions) {
    const dependencies = getDependencyActionIds(action).filter((dependencyId) =>
      actionById.has(dependencyId)
    );

    inDegree.set(action.id, dependencies.length);

    for (const dependencyId of dependencies) {
      const current = dependents.get(dependencyId) || [];
      current.push(action.id);
      dependents.set(dependencyId, current);
    }
  }

  const readyQueue = includedActions
    .filter((action) => (inDegree.get(action.id) || 0) === 0)
    .map((action) => action.id)
    .sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));

  const orderedIds: string[] = [];
  while (readyQueue.length > 0) {
    const nextId = readyQueue.shift();
    if (!nextId) break;

    orderedIds.push(nextId);
    const linkedDependents = dependents.get(nextId) || [];

    for (const dependentId of linkedDependents) {
      const nextDegree = (inDegree.get(dependentId) || 0) - 1;
      inDegree.set(dependentId, nextDegree);
      if (nextDegree === 0) {
        readyQueue.push(dependentId);
      }
    }

    readyQueue.sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));
  }

  if (orderedIds.length < includedActions.length) {
    const unresolved = includedActions
      .map((action) => action.id)
      .filter((id) => !orderedIds.includes(id))
      .sort((a, b) => (indexById.get(a) || 0) - (indexById.get(b) || 0));
    orderedIds.push(...unresolved);
  }

  return orderedIds
    .map((id) => actionById.get(id))
    .filter((action): action is NarrativeAction => Boolean(action));
}

function blockedDependencyMessage(action: NarrativeAction, dependencyId: string): string {
  if (action.kind === "UPDATE_ENTITY") {
    return `Cannot update ${action.targetName} because dependency ${dependencyId} did not execute successfully.`;
  }

  if (action.kind === "ADD_CONTACT") {
    return `Cannot link contact ${action.contact.name} because dependency ${dependencyId} did not execute successfully.`;
  }

  if (action.kind === "LINK_COMPANY_CO_INVESTOR") {
    return `Cannot link ${action.companyName} and ${action.coInvestorName} because dependency ${dependencyId} did not execute successfully.`;
  }

  return `Dependency ${dependencyId} did not execute successfully.`;
}

export async function executeNarrativePlan(planInput: NarrativePlan): Promise<NarrativeExecutionReport> {
  const plan = narrativePlanSchema.parse(planInput);
  const createdByActionId = new Map<string, CreatedEntityReference>();
  const statusByActionId = new Map<string, "EXECUTED" | "FAILED" | "SKIPPED">();
  const resultByActionId = new Map<string, NarrativeExecutionResult>();

  for (const action of plan.actions) {
    if (!action.include) {
      const skippedResult = validateExecutionResult({
        actionId: action.id,
        kind: action.kind,
        status: "SKIPPED",
        message: "Action was not selected for execution."
      });
      resultByActionId.set(action.id, skippedResult);
      statusByActionId.set(action.id, "SKIPPED");
    }
  }

  const orderedActions = orderActionsForExecution(plan.actions);
  for (const action of orderedActions) {
    const dependencyIds = getDependencyActionIds(action);
    let blockedByDependency = false;

    for (const dependencyId of dependencyIds) {
      const dependencyAction = plan.actions.find((entry) => entry.id === dependencyId);
      if (!dependencyAction) {
        continue;
      }

      if (!dependencyAction.include) {
        const failedResult = validateExecutionResult({
          actionId: action.id,
          kind: action.kind,
          status: "FAILED",
          message: blockedDependencyMessage(action, dependencyId)
        });
        resultByActionId.set(action.id, failedResult);
        statusByActionId.set(action.id, "FAILED");
        blockedByDependency = true;
        break;
      }

      const dependencyStatus = statusByActionId.get(dependencyId);
      if (dependencyStatus !== "EXECUTED") {
        const failedResult = validateExecutionResult({
          actionId: action.id,
          kind: action.kind,
          status: "FAILED",
          message: blockedDependencyMessage(action, dependencyId)
        });
        resultByActionId.set(action.id, failedResult);
        statusByActionId.set(action.id, "FAILED");
        blockedByDependency = true;
        break;
      }
    }

    if (blockedByDependency) {
      continue;
    }

    try {
      if (action.kind === "CREATE_ENTITY") {
        const reference = await executeCreateEntityAction(action);
        createdByActionId.set(action.id, reference);

        const executedResult = validateExecutionResult({
          actionId: action.id,
          kind: action.kind,
          status: "EXECUTED",
          message: reference.created
            ? `Created ${reference.entityType.replace("_", " ").toLowerCase()} ${reference.name}.`
            : `Using existing ${reference.entityType.replace("_", " ").toLowerCase()} ${reference.name}.`,
          record: {
            entityType: reference.entityType,
            id: reference.id,
            name: reference.name
          }
        });
        resultByActionId.set(action.id, executedResult);
        statusByActionId.set(action.id, "EXECUTED");
        continue;
      }

      if (action.kind === "UPDATE_ENTITY") {
        const updated = await executeUpdateEntityAction(action, createdByActionId);
        const executedResult = validateExecutionResult({
          actionId: action.id,
          kind: action.kind,
          status: "EXECUTED",
          message: `Updated ${updated.entityType.replace("_", " ").toLowerCase()} ${updated.name}.`,
          record: {
            entityType: updated.entityType,
            id: updated.id,
            name: updated.name
          }
        });
        resultByActionId.set(action.id, executedResult);
        statusByActionId.set(action.id, "EXECUTED");
        continue;
      }

      if (action.kind === "ADD_CONTACT") {
        const linked = await executeAddContactAction(action, createdByActionId);
        const executedResult = validateExecutionResult({
          actionId: action.id,
          kind: action.kind,
          status: "EXECUTED",
          message: `Linked contact ${linked.contactName} to ${action.parentType
            .replace("_", " ")
            .toLowerCase()}.`,
          record: {
            entityType: action.parentType,
            id: linked.parentId,
            name: action.parentName
          }
        });
        resultByActionId.set(action.id, executedResult);
        statusByActionId.set(action.id, "EXECUTED");
        continue;
      }

      const linked = await executeLinkCompanyCoInvestorAction(action, createdByActionId);
      const executedResult = validateExecutionResult({
        actionId: action.id,
        kind: action.kind,
        status: "EXECUTED",
        message: "Linked company and co-investor relationship.",
        record: {
          entityType: "COMPANY",
          id: linked.companyId,
          name: action.companyName
        }
      });
      resultByActionId.set(action.id, executedResult);
      statusByActionId.set(action.id, "EXECUTED");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to execute action";
      const failedResult = validateExecutionResult({
        actionId: action.id,
        kind: action.kind,
        status: "FAILED",
        message
      });
      resultByActionId.set(action.id, failedResult);
      statusByActionId.set(action.id, "FAILED");
    }
  }

  const results = plan.actions.map((action) => {
    const existing = resultByActionId.get(action.id);
    if (existing) return existing;

    const fallback = validateExecutionResult({
      actionId: action.id,
      kind: action.kind,
      status: "SKIPPED",
      message: "Action was not selected for execution."
    });
    return fallback;
  });

  const executed = results.filter((entry) => entry.status === "EXECUTED").length;
  const failed = results.filter((entry) => entry.status === "FAILED").length;
  const skipped = results.filter((entry) => entry.status === "SKIPPED").length;

  return {
    summary: `Executed ${executed}, failed ${failed}, skipped ${skipped}.`,
    executed,
    failed,
    skipped,
    results,
    createdEntities: Array.from(createdByActionId.values())
  };
}
