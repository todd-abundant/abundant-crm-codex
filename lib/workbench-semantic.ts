import OpenAI from "openai";
import { z } from "zod";
import { getNarrativeAgentModelDigest, getNarrativeAgentModelNarrative } from "@/lib/model-introspection";
import {
  type NarrativeAction,
  type NarrativeEntityType,
  addContactActionSchema,
  createEntityActionSchema,
  linkCompanyCoInvestorActionSchema,
  updateEntityActionSchema
} from "@/lib/narrative-agent-types";
import { companyCoInvestorRelationshipSchema, contactRoleTypeSchema } from "@/lib/schemas";

const semanticFactsSchema = z.object({
  companyLeadSourceAssignments: z
    .array(
      z.object({
        companyName: z.string().min(1),
        healthSystemName: z.string().min(1),
        notes: z.string().optional()
      })
    )
    .default([]),
  companyCoInvestorLinks: z
    .array(
      z.object({
        companyName: z.string().min(1),
        coInvestorNames: z.array(z.string().min(1)).min(1).default([]),
        relationshipType: z.string().optional(),
        notes: z.string().optional()
      })
    )
    .default([]),
  createEntities: z
    .array(
      z.object({
        entityType: z.enum(["HEALTH_SYSTEM", "COMPANY", "CO_INVESTOR"]),
        name: z.string().min(1),
        notes: z.string().optional()
      })
    )
    .default([]),
  updateEntities: z
    .array(
      z.object({
        entityType: z.enum(["HEALTH_SYSTEM", "COMPANY", "CO_INVESTOR"]),
        targetName: z.string().min(1),
        patch: z.record(z.unknown()).default({}),
        notes: z.string().optional()
      })
    )
    .default([]),
  addContacts: z
    .array(
      z.object({
        parentType: z.enum(["HEALTH_SYSTEM", "COMPANY", "CO_INVESTOR"]),
        parentName: z.string().min(1),
        roleType: z.string().optional(),
        contact: z.object({
          name: z.string().min(1),
          title: z.string().optional(),
          relationshipTitle: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
          linkedinUrl: z.string().optional()
        })
      })
    )
    .default([])
});

const semanticExtractionResultSchema = z.object({
  summary: z.string().default(""),
  unresolvedQuestions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  facts: semanticFactsSchema.default({
    companyLeadSourceAssignments: [],
    companyCoInvestorLinks: [],
    createEntities: [],
    updateEntities: [],
    addContacts: []
  })
});

const semanticExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    unresolvedQuestions: {
      type: "array",
      items: { type: "string" }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    },
    facts: {
      type: "object",
      additionalProperties: false,
      properties: {
        companyLeadSourceAssignments: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              companyName: { type: "string" },
              healthSystemName: { type: "string" },
              notes: { type: "string" }
            },
            required: ["companyName", "healthSystemName"]
          }
        },
        companyCoInvestorLinks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              companyName: { type: "string" },
              coInvestorNames: {
                type: "array",
                items: { type: "string" }
              },
              relationshipType: { type: "string" },
              notes: { type: "string" }
            },
            required: ["companyName", "coInvestorNames"]
          }
        },
        createEntities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              entityType: { type: "string" },
              name: { type: "string" },
              notes: { type: "string" }
            },
            required: ["entityType", "name"]
          }
        },
        updateEntities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              entityType: { type: "string" },
              targetName: { type: "string" },
              patch: {
                type: "object",
                additionalProperties: true
              },
              notes: { type: "string" }
            },
            required: ["entityType", "targetName", "patch"]
          }
        },
        addContacts: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              parentType: { type: "string" },
              parentName: { type: "string" },
              roleType: { type: "string" },
              contact: {
                type: "object",
                additionalProperties: false,
                properties: {
                  name: { type: "string" },
                  title: { type: "string" },
                  relationshipTitle: { type: "string" },
                  email: { type: "string" },
                  phone: { type: "string" },
                  linkedinUrl: { type: "string" }
                },
                required: ["name"]
              }
            },
            required: ["parentType", "parentName", "contact"]
          }
        }
      },
      required: [
        "companyLeadSourceAssignments",
        "companyCoInvestorLinks",
        "createEntities",
        "updateEntities",
        "addContacts"
      ]
    }
  },
  required: ["facts"]
};

export type WorkbenchSemanticFacts = z.infer<typeof semanticFactsSchema>;

export type WorkbenchSemanticExtraction = z.infer<typeof semanticExtractionResultSchema> & {
  source: "ai" | "disabled" | "error";
};

export type WorkbenchSemanticCompilation = {
  actions: NarrativeAction[];
  warnings: string[];
};

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

function cleanNarrativeName(value: unknown): string {
  return cleanText(value)
    .replace(/^[\s"'`“”‘’(),.;:!?-]+/, "")
    .replace(/[\s"'`“”‘’(),.;:!?-]+$/, "")
    .replace(/\s+/g, " ")
    .replace(
      /^(?:a|an|the)\s+(?:company|co[\s-]?investor|health\s*system|healthcare\s*system)\s+(?:called|named)\s+/i,
      ""
    )
    .replace(
      /^(?:company|co[\s-]?investor|health\s*system|healthcare\s*system)\s+(?:called|named)\s+/i,
      ""
    )
    .replace(/^(?:called|named)\s+/i, "")
    .trim();
}

function normalizeLookup(value: string) {
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
    const key = normalizeLookup(cleaned);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
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

function buildActionId(prefix: string, index: number, label: string): string {
  const compact = normalizeLookup(label).replace(/\s+/g, "-").slice(0, 40);
  return compact ? `${prefix}-${index + 1}-${compact}` : `${prefix}-${index + 1}`;
}

function parseRelationshipType(value?: string) {
  const normalized = cleanText(value).toUpperCase().replace(/[^A-Z_]/g, "_").replace(/__+/g, "_");
  const parsed = companyCoInvestorRelationshipSchema.safeParse(normalized);
  if (parsed.success) return parsed.data;
  if (normalized.includes("PARTNER")) return "PARTNER";
  if (normalized.includes("OTHER")) return "OTHER";
  return "INVESTOR";
}

function parseRoleType(value?: string) {
  const normalized = cleanText(value).toUpperCase().replace(/[^A-Z_]/g, "_").replace(/__+/g, "_");
  const parsed = contactRoleTypeSchema.safeParse(normalized);
  if (parsed.success) return parsed.data;
  return "OTHER";
}

function toCreateKey(entityType: NarrativeEntityType, name: string) {
  return `${entityType}:${normalizeLookup(name)}`;
}

function normalizeCoInvestorNames(values: string[]): string[] {
  const expanded: string[] = [];
  for (const value of values) {
    const text = cleanNarrativeName(value);
    if (!text) continue;

    if (/[;,]/.test(text)) {
      expanded.push(
        ...text
          .split(/,|;/)
          .map((entry) => cleanNarrativeName(entry))
          .filter(Boolean)
      );
      continue;
    }

    if (/\band\b/i.test(text) && !/\bventures?\b/i.test(text)) {
      expanded.push(
        ...text
          .split(/\band\b/i)
          .map((entry) => cleanNarrativeName(entry))
          .filter(Boolean)
      );
      continue;
    }

    expanded.push(text);
  }

  return dedupeStrings(expanded);
}

export async function extractWorkbenchSemanticFacts(
  conversation: string
): Promise<WorkbenchSemanticExtraction> {
  const client = getOpenAIClient();
  if (!client) {
    return {
      source: "disabled",
      summary: "OpenAI API key is missing, so semantic extraction did not run.",
      unresolvedQuestions: [],
      warnings: ["Set OPENAI_API_KEY to enable Workbench semantic extraction."],
      facts: {
        companyLeadSourceAssignments: [],
        companyCoInvestorLinks: [],
        createEntities: [],
        updateEntities: [],
        addContacts: []
      }
    };
  }

  const model =
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.OPENAI_SEARCH_MODEL ||
    "gpt-4.1-mini";

  const modelDigest = getNarrativeAgentModelDigest();
  const modelNarrative = getNarrativeAgentModelNarrative();
  const systemPrompt =
    "You are Workbench Analyst, a CRM data analyst converting stakeholder narrative into structured semantic facts. " +
    "Do NOT output execution steps. Output facts only. " +
    "The planner will deterministically compile your facts into execution steps. " +
    "Always extract company-co-investor relationships when the narrative implies investor links (for example, 'add X as co-investor in Y'). " +
    "For multi-name requests, include every entity in coInvestorNames. " +
    "Treat health systems and co-investors as different entity types unless a fund/arm is explicitly named as investor. " +
    "If information is missing, add concise unresolvedQuestions. " +
    "Use plain canonical names and remove filler words like 'a company called'. " +
    "Do not ask for internal IDs or timestamps.";

  const userPrompt =
    `Narrative:\n${conversation}\n\n` +
    `Current data model snapshot:\n${modelDigest}\n\n` +
    `Relationship and business-rules narrative:\n${modelNarrative}\n\n` +
    "Return semantic facts only.";

  try {
    const response = await client.responses.create({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "workbench_semantic_facts",
          schema: semanticExtractionSchema,
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
    const parsed = semanticExtractionResultSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        source: "error",
        summary: "Semantic extraction payload was invalid.",
        unresolvedQuestions: [],
        warnings: ["AI semantic extraction returned an invalid payload."],
        facts: {
          companyLeadSourceAssignments: [],
          companyCoInvestorLinks: [],
          createEntities: [],
          updateEntities: [],
          addContacts: []
        }
      };
    }

    return {
      source: "ai",
      summary: cleanText(parsed.data.summary),
      unresolvedQuestions: dedupeStrings(parsed.data.unresolvedQuestions),
      warnings: dedupeStrings(parsed.data.warnings),
      facts: parsed.data.facts
    };
  } catch (error) {
    console.error("workbench_semantic_extract_error", error);
    return {
      source: "error",
      summary: "Semantic extraction failed for this narrative.",
      unresolvedQuestions: [],
      warnings: ["Semantic extraction failed. Check OpenAI credentials and try again."],
      facts: {
        companyLeadSourceAssignments: [],
        companyCoInvestorLinks: [],
        createEntities: [],
        updateEntities: [],
        addContacts: []
      }
    };
  }
}

export function compileSemanticFactsToActions(
  facts: WorkbenchSemanticFacts
): WorkbenchSemanticCompilation {
  const actions: NarrativeAction[] = [];
  const warnings: string[] = [];
  let index = 0;

  const createdByKey = new Map<string, string>();
  const seenLinks = new Set<string>();
  const seenLeadSourceUpdates = new Set<string>();
  const seenUpdates = new Set<string>();

  const ensureCreateAction = (entityType: NarrativeEntityType, rawName: string): string | undefined => {
    const name = cleanNarrativeName(rawName);
    if (!name) return undefined;
    const key = toCreateKey(entityType, name);
    const existing = createdByKey.get(key);
    if (existing) return existing;

    const parsed = createEntityActionSchema.safeParse({
      id: buildActionId("create-entity", index++, `${entityType}-${name}`),
      include: true,
      kind: "CREATE_ENTITY",
      entityType,
      draft: {
        name
      },
      existingMatches: [],
      webCandidates: [],
      selection: {
        mode: "CREATE_MANUAL"
      },
      issues: []
    });
    if (!parsed.success) {
      warnings.push(`Could not compile create action for ${entityType.toLowerCase()} "${name}".`);
      return undefined;
    }

    actions.push(parsed.data);
    createdByKey.set(key, parsed.data.id);
    return parsed.data.id;
  };

  for (const createFact of facts.createEntities) {
    ensureCreateAction(createFact.entityType, createFact.name);
  }

  for (const updateFact of facts.updateEntities) {
    const targetName = cleanNarrativeName(updateFact.targetName);
    if (!targetName) continue;
    const updateKey = `${updateFact.entityType}:${normalizeLookup(targetName)}:${JSON.stringify(updateFact.patch)}`;
    if (seenUpdates.has(updateKey)) continue;
    seenUpdates.add(updateKey);

    const parsed = updateEntityActionSchema.safeParse({
      id: buildActionId("update-entity", index++, `${updateFact.entityType}-${targetName}`),
      include: true,
      kind: "UPDATE_ENTITY",
      entityType: updateFact.entityType,
      targetName,
      patch: updateFact.patch || {},
      targetMatches: [],
      issues: []
    });

    if (parsed.success) {
      actions.push(parsed.data);
    } else {
      warnings.push(`Could not compile update action for "${targetName}".`);
    }
  }

  for (const leadSourceFact of facts.companyLeadSourceAssignments) {
    const companyName = cleanNarrativeName(leadSourceFact.companyName);
    const healthSystemName = cleanNarrativeName(leadSourceFact.healthSystemName);
    if (!companyName || !healthSystemName) continue;

    const key = `${normalizeLookup(companyName)}::${normalizeLookup(healthSystemName)}`;
    if (seenLeadSourceUpdates.has(key)) continue;
    seenLeadSourceUpdates.add(key);

    const parsed = updateEntityActionSchema.safeParse({
      id: buildActionId("update-company-lead-source", index++, `${companyName}-${healthSystemName}`),
      include: true,
      kind: "UPDATE_ENTITY",
      entityType: "COMPANY",
      targetName: companyName,
      patch: {
        leadSourceType: "HEALTH_SYSTEM",
        leadSourceHealthSystemName: healthSystemName,
        leadSourceNotes:
          cleanOptionalText(leadSourceFact.notes) || `${healthSystemName} is the lead source for ${companyName}.`
      },
      targetMatches: [],
      issues: []
    });

    if (parsed.success) {
      actions.push(parsed.data);
    } else {
      warnings.push(`Could not compile lead-source update for "${companyName}".`);
    }
  }

  for (const linkFact of facts.companyCoInvestorLinks) {
    const companyName = cleanNarrativeName(linkFact.companyName);
    if (!companyName) continue;

    const companyCreateActionId = createdByKey.get(toCreateKey("COMPANY", companyName));
    const coInvestorNames = normalizeCoInvestorNames(linkFact.coInvestorNames);
    for (const coInvestorName of coInvestorNames) {
      const coInvestorCreateActionId = ensureCreateAction("CO_INVESTOR", coInvestorName);
      const linkKey = `${normalizeLookup(companyName)}::${normalizeLookup(coInvestorName)}`;
      if (seenLinks.has(linkKey)) continue;
      seenLinks.add(linkKey);

      const parsed = linkCompanyCoInvestorActionSchema.safeParse({
        id: buildActionId("link-company-co-investor", index++, `${companyName}-${coInvestorName}`),
        include: true,
        kind: "LINK_COMPANY_CO_INVESTOR",
        companyName,
        coInvestorName,
        relationshipType: parseRelationshipType(linkFact.relationshipType),
        notes: cleanOptionalText(linkFact.notes),
        investmentAmountUsd: null,
        companyMatches: [],
        coInvestorMatches: [],
        companyCreateActionId,
        coInvestorCreateActionId,
        issues: []
      });

      if (parsed.success) {
        actions.push(parsed.data);
      } else {
        warnings.push(`Could not compile co-investor link "${companyName} ↔ ${coInvestorName}".`);
      }
    }
  }

  for (const addContactFact of facts.addContacts) {
    const parentName = cleanNarrativeName(addContactFact.parentName);
    const contactName = cleanNarrativeName(addContactFact.contact.name);
    if (!parentName || !contactName) continue;

    const parsed = addContactActionSchema.safeParse({
      id: buildActionId("add-contact", index++, `${parentName}-${contactName}`),
      include: true,
      kind: "ADD_CONTACT",
      parentType: addContactFact.parentType,
      parentName,
      roleType: parseRoleType(addContactFact.roleType),
      contact: {
        name: contactName,
        title: cleanOptionalText(addContactFact.contact.title),
        relationshipTitle: cleanOptionalText(addContactFact.contact.relationshipTitle),
        email: cleanOptionalText(addContactFact.contact.email),
        phone: cleanOptionalText(addContactFact.contact.phone),
        linkedinUrl: cleanOptionalText(addContactFact.contact.linkedinUrl)
      },
      parentMatches: [],
      issues: []
    });

    if (parsed.success) {
      actions.push(parsed.data);
    } else {
      warnings.push(`Could not compile contact add for "${contactName}".`);
    }
  }

  return {
    actions,
    warnings: dedupeStrings(warnings)
  };
}

