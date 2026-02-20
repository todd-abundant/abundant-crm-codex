import { randomUUID } from "crypto";
import { prisma } from "@/lib/db";
import { buildNarrativePlan, executeNarrativePlan } from "@/lib/narrative-agent";
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
  lookup: Map<string, string>
): Promise<NarrativeAction> {
  if (action.kind === "CREATE_ENTITY") {
    const matches = await fetchEntityMatches(action.entityType, action.draft.name);
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
    const targetMatches = await fetchEntityMatches(action.entityType, action.targetName);
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

    return {
      ...action,
      targetMatches,
      selectedTargetId,
      linkedCreateActionId,
      issues: dedupeStrings(issues)
    };
  }

  if (action.kind === "ADD_CONTACT") {
    const parentMatches = await fetchEntityMatches(action.parentType, action.parentName);
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

  const companyMatches = await fetchEntityMatches("COMPANY", action.companyName);
  const coInvestorMatches = await fetchEntityMatches("CO_INVESTOR", action.coInvestorName);
  const healthSystemAliasMatches = await fetchEntityMatches("HEALTH_SYSTEM", action.coInvestorName);
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
  const hydrated: NarrativeAction[] = [];
  for (const action of actions) {
    hydrated.push(await hydrateAction(action, lookup));
  }
  return hydrated;
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

function buildFallbackOperations(conversation: string): NarrativeAction[] {
  const actions: NarrativeAction[] = [];
  const introSignals = extractIntroductionSignals(conversation);
  const coInvestorMentions = extractCoInvestorMentions(conversation);
  const createdByKey = new Map<string, string>();
  let index = 0;

  const companyFromIntro = introSignals[0]?.company;
  const healthSystemFromIntro = introSignals.find((signal) =>
    hasHealthSystemSignals(signal.introducer) && !hasCoInvestorSignals(signal.introducer)
  )?.introducer;

  if (companyFromIntro && healthSystemFromIntro) {
    const updateParsed = updateEntityActionSchema.safeParse({
      id: buildActionId("update-company", index++, companyFromIntro),
      include: true,
      kind: "UPDATE_ENTITY",
      entityType: "COMPANY",
      targetName: companyFromIntro,
      patch: {
        leadSourceType: "HEALTH_SYSTEM",
        leadSourceHealthSystemName: healthSystemFromIntro,
        leadSourceNotes: `${healthSystemFromIntro} introduced us to ${companyFromIntro}.`
      },
      targetMatches: [],
      issues: []
    });
    if (updateParsed.success) {
      actions.push(updateParsed.data);
    }
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

  for (const coInvestorName of coInvestorMentions) {
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

    if (companyFromIntro) {
      const linkParsed = linkCompanyCoInvestorActionSchema.safeParse({
        id: buildActionId("link-company-investor", index++, `${companyFromIntro}-${coInvestorName}`),
        include: true,
        kind: "LINK_COMPANY_CO_INVESTOR",
        companyName: companyFromIntro,
        coInvestorName,
        relationshipType: "INVESTOR",
        notes: `${coInvestorName} is listed as a co-investor.`,
        investmentAmountUsd: null,
        companyMatches: [],
        coInvestorMatches: [],
        companyCreateActionId: createdByKey.get(actionKeyForCreate("COMPANY", companyFromIntro)),
        coInvestorCreateActionId: createdByKey.get(actionKeyForCreate("CO_INVESTOR", coInvestorName)),
        issues: []
      });
      if (linkParsed.success) {
        actions.push(linkParsed.data);
      }
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
  const extracted = await buildNarrativePlan(conversation);
  let operations = extracted.actions;
  if (operations.length === 0) {
    operations = buildFallbackOperations(conversation);
  }
  const hydratedOperations = await hydrateActions(operations);
  const clarifications = buildClarificationQueueFromPlan({
    ...extracted,
    actions: hydratedOperations
  });

  const summary =
    extracted.summary ||
    (hydratedOperations.length > 0
      ? `I identified ${hydratedOperations.length} candidate step${hydratedOperations.length === 1 ? "" : "s"}.`
      : "I could not extract actionable steps from this narrative.");

  const nonQuestionWarnings = extracted.warnings.filter((warning) => !isQuestionLike(warning));

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
  const extracted = await buildNarrativePlan(composedConversation);

  let operations = extracted.actions;
  if (operations.length === 0) {
    operations = params.operations;
  }
  if (operations.length === 0) {
    operations = buildFallbackOperations(composedConversation);
  }
  const hydratedOperations = await hydrateActions(operations);

  const summary =
    extracted.summary ||
    (hydratedOperations.length > 0
      ? `Prepared ${hydratedOperations.length} execution step${hydratedOperations.length === 1 ? "" : "s"}.`
      : "No executable operations were prepared.");

  const plan = narrativePlanSchema.parse({
    narrative: composedConversation,
    phase: "PLAN",
    summary,
    modelDigest: extracted.modelDigest,
    warnings: dedupeStrings(extracted.warnings.filter((warning) => !isQuestionLike(warning))),
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
