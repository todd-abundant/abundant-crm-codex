import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { buildNarrativePlan, executeNarrativePlan } from "@/lib/narrative-agent";
import {
  compileSemanticFactsToActions,
  extractWorkbenchSemanticFacts
} from "@/lib/workbench-semantic";
import {
  type NarrativeAction,
  type NarrativeEntityMatch,
  type NarrativeEntityType,
  type NarrativePlan,
  createEntityActionSchema,
  linkCompanyCoInvestorActionSchema,
  narrativePlanSchema,
  updateEntityActionSchema
} from "@/lib/narrative-agent-types";
import {
  type WorkbenchClarification,
  type WorkbenchClarificationAnswer,
  type WorkbenchDraft,
  type WorkbenchExecuteResponse,
  type WorkbenchPlanResponse,
  workbenchDraftSchema,
  workbenchExecuteResponseSchema,
  workbenchPlanResponseSchema
} from "@/lib/workbench-v2-types";

const AUTO_MATCH_THRESHOLD = 0.8;
const REVIEW_MATCH_THRESHOLD = 0.6;

function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = cleanText(value);
    if (!cleaned) continue;
    const key = normalizeText(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

function isQuestionLike(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return (
    value.includes("?") ||
    normalized.startsWith("please confirm") ||
    normalized.startsWith("do you want") ||
    normalized.startsWith("should i") ||
    normalized.startsWith("which ")
  );
}

function isNoActionableWarning(value: string): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  return (
    normalized.includes("no actionable items were extracted") ||
    normalized.includes("no actions extracted")
  );
}

function cleanNarrativeNameFragment(value: string): string {
  return value
    .replace(/^[\s"'`“”‘’(),.;:!?-]+/, "")
    .replace(/[\s"'`“”‘’(),.;:!?-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanEntityName(value: string, entityType?: NarrativeEntityType): string {
  const cleaned = cleanNarrativeNameFragment(value);
  if (!cleaned) return "";

  let next = cleaned
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
    next = next.replace(/^(?:a|an|the)\s+company\s+/i, "").replace(/^company\s+/i, "");
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

  return cleanNarrativeNameFragment(next) || cleaned;
}

function normalizeEntityName(value: string, entityType?: NarrativeEntityType): string {
  const cleaned = cleanEntityName(value, entityType);
  if (!cleaned) return "";
  if (entityType === "HEALTH_SYSTEM") {
    const noSuffix = cleanNarrativeNameFragment(
      cleaned.replace(/\b(?:health\s*system|healthcare\s*system)\b$/i, "")
    );
    return normalizeText(noSuffix || cleaned);
  }
  return normalizeText(cleaned);
}

function hasCoInvestorSignals(value: string): boolean {
  const normalized = normalizeText(value);
  return /\b(innovation fund|fund|ventures?|venture arm|venture fund|capital|vc|investor|investments?)\b/.test(
    normalized
  );
}

function hasHealthSystemSignals(value: string): boolean {
  const normalized = normalizeText(value);
  return /\b(health system|healthcare system|hospital|medical center|clinic)\b/.test(normalized);
}

function buildActionId(prefix: string, index: number, label: string): string {
  const compact = normalizeText(label).replace(/\s+/g, "-").slice(0, 36);
  return compact ? `${prefix}-${index + 1}-${compact}` : `${prefix}-${index + 1}`;
}

function scoreNameMatch(query: string, candidate: string): { score: number; reason: string } {
  const normalizedQuery = normalizeText(query);
  const normalizedCandidate = normalizeText(candidate);

  if (!normalizedQuery || !normalizedCandidate) return { score: 0, reason: "No comparable name" };
  if (normalizedQuery === normalizedCandidate) return { score: 0.98, reason: "Exact name match" };
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
    if (candidateTokens.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(queryTokens.size, candidateTokens.size, 1);
  if (ratio >= 0.75) return { score: 0.74, reason: "High token overlap" };
  if (ratio >= 0.5) return { score: 0.64, reason: "Moderate token overlap" };
  return { score: 0.52, reason: "Low confidence name match" };
}

async function fetchEntityMatches(
  entityType: NarrativeEntityType,
  name: string
): Promise<NarrativeEntityMatch[]> {
  const cleanName = cleanEntityName(name, entityType);
  if (!cleanName) return [];

  const normalizedName = cleanEntityName(cleanName, entityType);
  const queryNames = Array.from(new Set([cleanName, normalizedName].filter(Boolean)));
  const whereName = queryNames.flatMap((queryName) => [
    { name: { equals: queryName, mode: "insensitive" as const } },
    { name: { contains: queryName, mode: "insensitive" as const } }
  ]);
  const scoreName = normalizedName || cleanName;

  if (entityType === "HEALTH_SYSTEM") {
    const rows = await prisma.healthSystem.findMany({
      where: { OR: whereName },
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
    return rows
      .map((row) => {
        const scored = scoreNameMatch(scoreName, row.name);
        return {
          id: row.id,
          entityType,
          name: row.name,
          website: row.website,
          headquartersCity: row.headquartersCity,
          headquartersState: row.headquartersState,
          headquartersCountry: row.headquartersCountry,
          confidence: scored.score,
          reason: scored.reason
        };
      })
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  if (entityType === "COMPANY") {
    const rows = await prisma.company.findMany({
      where: { OR: whereName },
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
    return rows
      .map((row) => {
        const scored = scoreNameMatch(scoreName, row.name);
        return {
          id: row.id,
          entityType,
          name: row.name,
          website: row.website,
          headquartersCity: row.headquartersCity,
          headquartersState: row.headquartersState,
          headquartersCountry: row.headquartersCountry,
          confidence: scored.score,
          reason: scored.reason
        };
      })
      .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  }

  const rows = await prisma.coInvestor.findMany({
    where: { OR: whereName },
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
  return rows
    .map((row) => {
      const scored = scoreNameMatch(scoreName, row.name);
      return {
        id: row.id,
        entityType,
        name: row.name,
        website: row.website,
        headquartersCity: row.headquartersCity,
        headquartersState: row.headquartersState,
        headquartersCountry: row.headquartersCountry,
        confidence: scored.score,
        reason: scored.reason
      };
    })
    .sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

type MatchCache = Map<string, Promise<NarrativeEntityMatch[]>>;

function matchCacheKey(entityType: NarrativeEntityType, name: string): string {
  return `${entityType}:${normalizeEntityName(name, entityType)}`;
}

function fetchEntityMatchesCached(
  cache: MatchCache,
  entityType: NarrativeEntityType,
  name: string
): Promise<NarrativeEntityMatch[]> {
  const key = matchCacheKey(entityType, name);
  if (key.endsWith(":")) {
    return Promise.resolve([]);
  }

  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const pending = fetchEntityMatches(entityType, name).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, pending);
  return pending;
}

function actionKeyForCreate(entityType: NarrativeEntityType, name: string): string {
  return `${entityType}:${normalizeEntityName(name, entityType)}`;
}

function createLookup(actions: NarrativeAction[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const action of actions) {
    if (action.kind !== "CREATE_ENTITY") continue;
    map.set(actionKeyForCreate(action.entityType, action.draft.name), action.id);
  }
  return map;
}

async function hydrateAction(
  action: NarrativeAction,
  lookup: Map<string, string>,
  matchCache: MatchCache
): Promise<NarrativeAction> {
  if (action.kind === "CREATE_ENTITY") {
    const matches = await fetchEntityMatchesCached(matchCache, action.entityType, action.draft.name);
    const top = matches[0];
    const issues = [...action.issues];
    let selection = action.selection;

    if (top && (top.confidence || 0) >= AUTO_MATCH_THRESHOLD) {
      selection = {
        mode: "USE_EXISTING",
        existingId: top.id
      };
    } else if (top && (top.confidence || 0) >= REVIEW_MATCH_THRESHOLD) {
      issues.push(
        `Potential existing ${action.entityType.toLowerCase().replace("_", " ")} match found (${Math.round(
          (top.confidence || 0) * 100
        )}%). Confirm use existing vs create new.`
      );
      if (selection.mode === "USE_EXISTING" && !selection.existingId) {
        selection = {
          mode: "CREATE_MANUAL"
        };
      }
    }

    return {
      ...action,
      existingMatches: matches,
      selection,
      issues: dedupeStrings(issues)
    };
  }

  if (action.kind === "UPDATE_ENTITY") {
    const targetMatches = await fetchEntityMatchesCached(
      matchCache,
      action.entityType,
      action.targetName
    );
    const top = targetMatches[0];
    const linkedCreateActionId = lookup.get(actionKeyForCreate(action.entityType, action.targetName));
    const selectedTargetId = (top?.confidence || 0) >= AUTO_MATCH_THRESHOLD ? top?.id : undefined;
    const issues = [...action.issues];

    if (!selectedTargetId && !linkedCreateActionId) {
      if (top) {
        issues.push(
          `Potential update target found (${Math.round((top.confidence || 0) * 100)}%). Confirm target record.`
        );
      } else {
        issues.push("No matching target found for update.");
      }
    }

    let patch = action.patch;
    if (
      action.entityType === "COMPANY" &&
      action.patch.leadSourceType === "HEALTH_SYSTEM" &&
      (action.patch.leadSourceHealthSystemName || action.patch.leadSourceOther)
    ) {
      const leadSourceName = cleanEntityName(
        action.patch.leadSourceHealthSystemName || action.patch.leadSourceOther || "",
        "HEALTH_SYSTEM"
      );

      if (leadSourceName) {
        const leadSourceMatches = await fetchEntityMatchesCached(matchCache, "HEALTH_SYSTEM", leadSourceName);
        const topLeadSource = leadSourceMatches[0];
        if (topLeadSource && (topLeadSource.confidence || 0) >= AUTO_MATCH_THRESHOLD) {
          patch = {
            ...patch,
            leadSourceHealthSystemId: topLeadSource.id,
            leadSourceHealthSystemName: topLeadSource.name,
            leadSourceOther: undefined
          };
          issues.push(
            `Using existing health system record for lead source: ${topLeadSource.name} (${Math.round(
              (topLeadSource.confidence || 0) * 100
            )}%).`
          );
        } else if (topLeadSource) {
          issues.push(
            `Potential lead-source health system match found (${Math.round(
              (topLeadSource.confidence || 0) * 100
            )}%). Confirm lead-source record.`
          );
        } else {
          issues.push(`No matching health system found for lead source "${leadSourceName}".`);
        }
      }
    }

    return {
      ...action,
      patch,
      targetMatches,
      selectedTargetId,
      linkedCreateActionId,
      issues: dedupeStrings(issues)
    };
  }

  if (action.kind === "ADD_CONTACT") {
    const parentMatches = await fetchEntityMatchesCached(matchCache, action.parentType, action.parentName);
    const top = parentMatches[0];
    const linkedCreateActionId = lookup.get(actionKeyForCreate(action.parentType, action.parentName));
    const selectedParentId = (top?.confidence || 0) >= AUTO_MATCH_THRESHOLD ? top?.id : undefined;
    const issues = [...action.issues];

    if (!selectedParentId && !linkedCreateActionId) {
      if (top) {
        issues.push(
          `Potential parent found (${Math.round((top.confidence || 0) * 100)}%). Confirm parent record.`
        );
      } else {
        issues.push("No matching parent record found for contact.");
      }
    }

    return {
      ...action,
      parentMatches,
      selectedParentId,
      linkedCreateActionId,
      issues: dedupeStrings(issues)
    };
  }

  const [companyMatches, coInvestorMatches, healthSystemAliasMatches] = await Promise.all([
    fetchEntityMatchesCached(matchCache, "COMPANY", action.companyName),
    fetchEntityMatchesCached(matchCache, "CO_INVESTOR", action.coInvestorName),
    fetchEntityMatchesCached(matchCache, "HEALTH_SYSTEM", action.coInvestorName)
  ]);
  const topCompany = companyMatches[0];
  const topCoInvestor = coInvestorMatches[0];
  const selectedCompanyId = (topCompany?.confidence || 0) >= AUTO_MATCH_THRESHOLD ? topCompany?.id : undefined;
  const selectedCoInvestorId =
    (topCoInvestor?.confidence || 0) >= AUTO_MATCH_THRESHOLD ? topCoInvestor?.id : undefined;
  const companyCreateActionId = lookup.get(actionKeyForCreate("COMPANY", action.companyName));
  const coInvestorCreateActionId = lookup.get(actionKeyForCreate("CO_INVESTOR", action.coInvestorName));
  const issues = [...action.issues];

  if (!selectedCompanyId && !companyCreateActionId) {
    if (topCompany) {
      issues.push(
        `Potential company match found (${Math.round((topCompany.confidence || 0) * 100)}%). Confirm company.`
      );
    } else {
      issues.push("No matching company found for relationship.");
    }
  }

  if (!selectedCoInvestorId && !coInvestorCreateActionId) {
    if (topCoInvestor) {
      issues.push(
        `Potential co-investor match found (${Math.round(
          (topCoInvestor.confidence || 0) * 100
        )}%). Confirm co-investor.`
      );
    } else if (healthSystemAliasMatches[0]) {
      issues.push(
        `"${action.coInvestorName}" appears to be a health system (${healthSystemAliasMatches[0].name}), not a co-investor.`
      );
    } else {
      issues.push("No matching co-investor found for relationship.");
    }
  }

  return {
    ...action,
    companyMatches,
    coInvestorMatches,
    selectedCompanyId,
    selectedCoInvestorId,
    companyCreateActionId,
    coInvestorCreateActionId,
    issues: dedupeStrings(issues)
  };
}

async function hydrateActions(actions: NarrativeAction[]): Promise<NarrativeAction[]> {
  const lookup = createLookup(actions);
  const matchCache: MatchCache = new Map();
  return Promise.all(actions.map((action) => hydrateAction(action, lookup, matchCache)));
}

function summarizeAction(action: NarrativeAction): string {
  if (action.kind === "CREATE_ENTITY") {
    return `Create ${action.entityType.replace("_", " ").toLowerCase()}: ${action.draft.name}.`;
  }
  if (action.kind === "UPDATE_ENTITY") {
    return `Update ${action.entityType.replace("_", " ").toLowerCase()}: ${action.targetName}.`;
  }
  if (action.kind === "ADD_CONTACT") {
    return `Add contact ${action.contact.name} to ${action.parentName}.`;
  }
  return `Link ${action.companyName} with ${action.coInvestorName}.`;
}

function buildClarificationQueueFromPlan(plan: NarrativePlan): WorkbenchClarification[] {
  const queue: WorkbenchClarification[] = [];
  const seen = new Set<string>();

  const pushQuestion = (question: string, affectedOperationIds: string[] = []) => {
    const cleaned = cleanText(question);
    if (!cleaned) return;
    const key = normalizeText(cleaned);
    if (!key || seen.has(key)) return;
    seen.add(key);
    queue.push({
      id: `q-${queue.length + 1}`,
      question: cleaned,
      affectedOperationIds
    });
  };

  for (const warning of plan.warnings) {
    if (isQuestionLike(warning)) {
      pushQuestion(warning);
    }
  }

  for (const action of plan.actions) {
    for (const issue of action.issues) {
      if (
        issue.includes("Confirm") ||
        issue.includes("confirm") ||
        issue.includes("Select") ||
        issue.includes("select")
      ) {
        pushQuestion(issue, [action.id]);
      }
    }
  }

  return queue;
}

function extractIntroductionSignals(conversation: string): Array<{
  introducer: string;
  company: string;
}> {
  const signals: Array<{ introducer: string; company: string }> = [];
  const pattern =
    /\b(.{2,120}?)\s+introduced\s+(?:us|me|our\s+team|the\s+team)?\s*to\s+(.{2,120}?)(?:[.!?\n]|$)/gi;
  let match: RegExpExecArray | null = pattern.exec(conversation);
  while (match) {
    const introducer = cleanEntityName(cleanText(match[1] || ""), "HEALTH_SYSTEM");
    const company = cleanEntityName(cleanText(match[2] || ""), "COMPANY");
    if (introducer && company) {
      signals.push({ introducer, company });
    }
    match = pattern.exec(conversation);
  }
  return signals;
}

function splitEntityList(raw: string): string[] {
  return raw
    .split(/\band\b|,|;/i)
    .map((entry) => cleanEntityName(entry, "CO_INVESTOR"))
    .filter(Boolean);
}

function extractCoInvestorMentions(conversation: string): string[] {
  const lines = conversation.split(/\r?\n|[.!?]/).map((line) => line.trim()).filter(Boolean);
  const names: string[] = [];
  for (const line of lines) {
    const match = line.match(/\bco[\s-]?investors?\s+(?:include|included|are|were|:)\s+(.+)/i);
    if (!match) continue;
    names.push(...splitEntityList(match[1] || ""));
  }
  return dedupeStrings(names);
}

function extractCompanyCoInvestorAdditions(
  conversation: string
): Array<{ companyName: string; coInvestorNames: string[] }> {
  const additions: Array<{ companyName: string; coInvestorNames: string[] }> = [];
  const seen = new Set<string>();
  const patterns = [
    /\b(?:add|attach|link)\s+(.{2,180}?)\s+as\s+co[\s-]?investors?\s+(?:in|to|for|with)\s+(.{2,140}?)(?:[.!?\n]|$)/gi,
    /\b(?:add|attach|link)\s+co[\s-]?investors?\s+(.{2,180}?)\s+(?:in|to|for|with)\s+(.{2,140}?)(?:[.!?\n]|$)/gi
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(conversation);
    while (match) {
      const coInvestorNames = splitEntityList(match[1] || "");
      const companyName = cleanEntityName(cleanText(match[2] || ""), "COMPANY");
      if (!companyName || coInvestorNames.length === 0) {
        match = pattern.exec(conversation);
        continue;
      }

      const key = `${normalizeEntityName(companyName, "COMPANY")}::${coInvestorNames
        .map((name) => normalizeEntityName(name, "CO_INVESTOR"))
        .join("|")}`;
      if (!key || seen.has(key)) {
        match = pattern.exec(conversation);
        continue;
      }

      seen.add(key);
      additions.push({
        companyName,
        coInvestorNames: dedupeStrings(coInvestorNames)
      });
      match = pattern.exec(conversation);
    }
  }

  return additions;
}

function extractLeadSourceUpdates(conversation: string): Array<{ company: string; healthSystem: string }> {
  const updates: Array<{ company: string; healthSystem: string }> = [];
  const seen = new Set<string>();

  const addUpdate = (companyRaw: string, healthSystemRaw: string) => {
    const company = cleanEntityName(cleanText(companyRaw || ""), "COMPANY");
    const healthSystem = cleanEntityName(cleanText(healthSystemRaw || ""), "HEALTH_SYSTEM");
    if (!company || !healthSystem) return;

    const key = `${normalizeEntityName(company, "COMPANY")}::${normalizeEntityName(
      healthSystem,
      "HEALTH_SYSTEM"
    )}`;
    if (key && !seen.has(key)) {
      seen.add(key);
      updates.push({ company, healthSystem });
    }
  };

  const companyFirstPatterns = [
    /\b(?:modify|update|set)\s+(.{2,140}?)\s+(?:and\s+)?set\s+(?:the\s+)?lead\s+source\s+to\s+(.{2,140}?)(?:[.!?\n]|$)/gi,
    /\bset\s+(?:the\s+)?lead\s+source\s+(?:for|of)\s+(.{2,140}?)\s+to\s+(.{2,140}?)(?:[.!?\n]|$)/gi,
    /\b(?:modify|update)\s+(.{2,140}?)\s+to\s+make\s+(.{2,140}?)\s+(?:the\s+)?lead\s+source(?:[.!?\n]|$)/gi,
    /\bset\s+(.{2,140}?)['’]s\s+(?:lead\s+source|source)\s+to\s+(.{2,140}?)(?:[.!?\n]|$)/gi,
    /\blead\s+source\s+(?:for|of)\s+(.{2,140}?)\s+(?:is|should\s+be|to\s+be)\s+(.{2,140}?)(?:[.!?\n]|$)/gi
  ];

  for (const pattern of companyFirstPatterns) {
    let match: RegExpExecArray | null = pattern.exec(conversation);
    while (match) {
      addUpdate(match[1] || "", match[2] || "");
      match = pattern.exec(conversation);
    }
  }

  const healthSystemFirstPatterns = [
    /\bmake\s+(.{2,140}?)\s+(?:the\s+)?lead\s+source\s+(?:for|of)\s+(.{2,140}?)(?:[.!?\n]|$)/gi
  ];

  for (const pattern of healthSystemFirstPatterns) {
    let match: RegExpExecArray | null = pattern.exec(conversation);
    while (match) {
      addUpdate(match[2] || "", match[1] || "");
      match = pattern.exec(conversation);
    }
  }

  return updates;
}

function buildFallbackOperations(conversation: string): NarrativeAction[] {
  const actions: NarrativeAction[] = [];
  const introSignals = extractIntroductionSignals(conversation);
  const coInvestorMentions = extractCoInvestorMentions(conversation);
  const companyCoInvestorAdditions = extractCompanyCoInvestorAdditions(conversation);
  const leadSourceUpdates = extractLeadSourceUpdates(conversation);
  const createdByKey = new Map<string, string>();
  const leadSourceActionKeys = new Set<string>();
  const coInvestorActionKeys = new Set<string>();
  const coInvestorLinkKeys = new Set<string>();
  let index = 0;

  const companyFromIntro = introSignals[0]?.company;
  const healthSystemFromIntro = introSignals.find((signal) =>
    hasHealthSystemSignals(signal.introducer) && !hasCoInvestorSignals(signal.introducer)
  )?.introducer;

  const pushLeadSourceUpdate = (company: string, healthSystem: string, notes: string) => {
    const key = `${normalizeEntityName(company, "COMPANY")}::${normalizeEntityName(
      healthSystem,
      "HEALTH_SYSTEM"
    )}`;
    if (!key || leadSourceActionKeys.has(key)) return;
    leadSourceActionKeys.add(key);

    const updateParsed = updateEntityActionSchema.safeParse({
      id: buildActionId("update-company-lead-source", index++, company),
      include: true,
      kind: "UPDATE_ENTITY",
      entityType: "COMPANY",
      targetName: company,
      patch: {
        leadSourceType: "HEALTH_SYSTEM",
        leadSourceHealthSystemName: healthSystem,
        leadSourceNotes: notes
      },
      targetMatches: [],
      issues: []
    });
    if (updateParsed.success) {
      actions.push(updateParsed.data);
    }
  };

  for (const update of leadSourceUpdates) {
    pushLeadSourceUpdate(
      update.company,
      update.healthSystem,
      `${update.healthSystem} is the lead source for ${update.company}.`
    );
  }

  if (companyFromIntro && healthSystemFromIntro) {
    pushLeadSourceUpdate(
      companyFromIntro,
      healthSystemFromIntro,
      `${healthSystemFromIntro} introduced us to ${companyFromIntro}.`
    );
  }

  if (companyFromIntro) {
    const companyCreate = createEntityActionSchema.safeParse({
      id: buildActionId("upsert-company", index++, companyFromIntro),
      include: true,
      kind: "CREATE_ENTITY",
      entityType: "COMPANY",
      draft: {
        name: companyFromIntro,
        leadSourceType: healthSystemFromIntro ? "HEALTH_SYSTEM" : "OTHER",
        leadSourceHealthSystemName: healthSystemFromIntro,
        leadSourceOther: healthSystemFromIntro ? undefined : "Narrative intake"
      },
      existingMatches: [],
      webCandidates: [],
      selection: {
        mode: "CREATE_MANUAL"
      },
      issues: []
    });
    if (companyCreate.success) {
      actions.push(companyCreate.data);
      createdByKey.set(actionKeyForCreate("COMPANY", companyFromIntro), companyCreate.data.id);
    }
  }

  const ensureCoInvestorCreate = (coInvestorName: string) => {
    const normalized = normalizeEntityName(coInvestorName, "CO_INVESTOR");
    if (!normalized || coInvestorActionKeys.has(normalized)) return;
    coInvestorActionKeys.add(normalized);

    if (hasHealthSystemSignals(coInvestorName) && !hasCoInvestorSignals(coInvestorName)) {
      return;
    }

    const createCoInvestor = createEntityActionSchema.safeParse({
      id: buildActionId("upsert-co-investor", index++, coInvestorName),
      include: true,
      kind: "CREATE_ENTITY",
      entityType: "CO_INVESTOR",
      draft: {
        name: coInvestorName
      },
      existingMatches: [],
      webCandidates: [],
      selection: {
        mode: "CREATE_MANUAL"
      },
      issues: []
    });

    if (createCoInvestor.success) {
      actions.push(createCoInvestor.data);
      createdByKey.set(actionKeyForCreate("CO_INVESTOR", coInvestorName), createCoInvestor.data.id);
    }
  };

  const pushCompanyCoInvestorLink = (companyName: string, coInvestorName: string, notes: string) => {
    const linkKey = `${normalizeEntityName(companyName, "COMPANY")}::${normalizeEntityName(
      coInvestorName,
      "CO_INVESTOR"
    )}`;
    if (!linkKey || coInvestorLinkKeys.has(linkKey)) return;
    coInvestorLinkKeys.add(linkKey);

    const linkParsed = linkCompanyCoInvestorActionSchema.safeParse({
      id: buildActionId("link-company-investor", index++, `${companyName}-${coInvestorName}`),
      include: true,
      kind: "LINK_COMPANY_CO_INVESTOR",
      companyName,
      coInvestorName,
      relationshipType: "INVESTOR",
      notes,
      investmentAmountUsd: null,
      companyMatches: [],
      coInvestorMatches: [],
      companyCreateActionId: createdByKey.get(actionKeyForCreate("COMPANY", companyName)),
      coInvestorCreateActionId: createdByKey.get(actionKeyForCreate("CO_INVESTOR", coInvestorName)),
      issues: []
    });
    if (linkParsed.success) {
      actions.push(linkParsed.data);
    }
  };

  for (const coInvestorName of coInvestorMentions) {
    ensureCoInvestorCreate(coInvestorName);

    if (companyFromIntro) {
      pushCompanyCoInvestorLink(
        companyFromIntro,
        coInvestorName,
        `${coInvestorName} is listed as a co-investor.`
      );
    }
  }

  for (const addition of companyCoInvestorAdditions) {
    for (const coInvestorName of addition.coInvestorNames) {
      ensureCoInvestorCreate(coInvestorName);
      pushCompanyCoInvestorLink(
        addition.companyName,
        coInvestorName,
        `${coInvestorName} should be linked as a co-investor to ${addition.companyName}.`
      );
    }
  }

  return actions;
}

function composeFinalConversation(params: {
  conversation: string;
  operations: NarrativeAction[];
  clarifications: WorkbenchClarificationAnswer[];
}): string {
  const lines: string[] = [params.conversation.trim()];
  if (params.clarifications.length > 0) {
    lines.push("Clarification answers:");
    for (const answer of params.clarifications) {
      lines.push(`- ${answer.question}`);
      lines.push(`  Answer: ${answer.answer}`);
    }
  }

  if (params.operations.length > 0) {
    lines.push("Candidate operations to refine:");
    for (const action of params.operations.slice(0, 12)) {
      lines.push(`- ${summarizeAction(action)}`);
    }
  }

  lines.push("Stakeholder: Requirements confirmed. Build execution plan.");
  return lines.filter((line) => line.trim()).join("\n");
}

export async function buildWorkbenchDraft(conversation: string): Promise<WorkbenchDraft> {
  const semanticExtraction = await extractWorkbenchSemanticFacts(conversation);
  const semanticCompilation = compileSemanticFactsToActions(semanticExtraction.facts);
  const fallbackOperations = buildFallbackOperations(conversation);
  let operations = semanticCompilation.actions;
  let warnings = dedupeStrings([...semanticExtraction.warnings, ...semanticCompilation.warnings]);
  let summaryFromExtraction = cleanText(semanticExtraction.summary);

  if (operations.length === 0 && fallbackOperations.length > 0) {
    operations = fallbackOperations;
  }

  if (operations.length === 0 && semanticExtraction.source !== "ai") {
    const extracted = await buildNarrativePlan(conversation);
    operations = extracted.actions;
    warnings = dedupeStrings([...warnings, ...extracted.warnings]);
    if (!summaryFromExtraction) {
      summaryFromExtraction = extracted.summary;
    }
  }

  const hydratedOperations = operations.length > 0 ? await hydrateActions(operations) : [];
  const clarificationSeeds = dedupeStrings([
    ...semanticExtraction.unresolvedQuestions,
    ...warnings
  ]);
  const clarifications = buildClarificationQueueFromPlan({
    narrative: conversation,
    phase: "CLARIFICATION",
    summary: summaryFromExtraction,
    warnings: clarificationSeeds,
    actions: hydratedOperations
  });

  const summary =
    summaryFromExtraction ||
    (hydratedOperations.length > 0
      ? `I identified ${hydratedOperations.length} candidate step${hydratedOperations.length === 1 ? "" : "s"}.`
      : "I could not extract actionable steps from this narrative.");

  const nonQuestionWarnings = warnings.filter((warning) => {
    if (isQuestionLike(warning)) return false;
    if (hydratedOperations.length > 0 && isNoActionableWarning(warning)) return false;
    return true;
  });

  return workbenchDraftSchema.parse({
    sessionId: randomUUID(),
    phase: "CLARIFICATION",
    conversation,
    summary,
    warnings: dedupeStrings(nonQuestionWarnings),
    clarifications,
    operations: hydratedOperations
  });
}

export async function buildWorkbenchPlan(params: {
  sessionId: string;
  conversation: string;
  operations: NarrativeAction[];
  clarifications: WorkbenchClarificationAnswer[];
}): Promise<WorkbenchPlanResponse> {
  const composedConversation = composeFinalConversation(params);
  let operations: NarrativeAction[] = params.operations;
  let warnings: string[] = [];
  let summaryFromExtraction = "";
  let modelDigest: string | undefined;
  const fallbackOperations = buildFallbackOperations(composedConversation);

  if (operations.length === 0) {
    const semanticExtraction = await extractWorkbenchSemanticFacts(composedConversation);
    const semanticCompilation = compileSemanticFactsToActions(semanticExtraction.facts);
    operations = semanticCompilation.actions;
    warnings = dedupeStrings([
      ...semanticExtraction.warnings,
      ...semanticExtraction.unresolvedQuestions,
      ...semanticCompilation.warnings
    ]);
    summaryFromExtraction = cleanText(semanticExtraction.summary);
  }

  if (operations.length === 0 && fallbackOperations.length > 0) {
    operations = fallbackOperations;
  }

  if (operations.length === 0) {
    const extracted = await buildNarrativePlan(composedConversation);
    operations = extracted.actions;
    warnings = extracted.warnings;
    summaryFromExtraction = extracted.summary;
    modelDigest = extracted.modelDigest;
  }

  const hydratedOperations = operations.length > 0 ? await hydrateActions(operations) : [];

  const summary =
    summaryFromExtraction ||
    (hydratedOperations.length > 0
      ? `Prepared ${hydratedOperations.length} execution step${hydratedOperations.length === 1 ? "" : "s"}.`
      : "No executable operations were prepared.");

  const plan = narrativePlanSchema.parse({
    narrative: composedConversation,
    phase: "PLAN",
    summary,
    modelDigest,
    warnings: dedupeStrings(
      warnings.filter((warning) => {
        if (isQuestionLike(warning)) return false;
        if (hydratedOperations.length > 0 && isNoActionableWarning(warning)) return false;
        return true;
      })
    ),
    actions: hydratedOperations
  });

  return workbenchPlanResponseSchema.parse({
    sessionId: params.sessionId,
    plan
  });
}

export async function executeWorkbenchPlan(plan: NarrativePlan): Promise<WorkbenchExecuteResponse> {
  const report = await executeNarrativePlan(plan);
  return workbenchExecuteResponseSchema.parse(report);
}
