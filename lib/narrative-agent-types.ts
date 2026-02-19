import { z } from "zod";
import {
  companyCoInvestorRelationshipSchema,
  companyPrimaryCategorySchema,
  companyTypeSchema,
  contactRoleTypeSchema
} from "@/lib/schemas";

export const narrativeEntityTypeSchema = z.enum(["HEALTH_SYSTEM", "COMPANY", "CO_INVESTOR"]);
export type NarrativeEntityType = z.infer<typeof narrativeEntityTypeSchema>;

export const narrativeCreateModeSchema = z.enum(["CREATE_FROM_WEB", "CREATE_MANUAL", "USE_EXISTING"]);
export type NarrativeCreateMode = z.infer<typeof narrativeCreateModeSchema>;

export const narrativeEntityMatchSchema = z.object({
  id: z.string().min(1),
  entityType: narrativeEntityTypeSchema,
  name: z.string().min(1),
  website: z.string().optional().nullable(),
  headquartersCity: z.string().optional().nullable(),
  headquartersState: z.string().optional().nullable(),
  headquartersCountry: z.string().optional().nullable(),
  confidence: z.number().min(0).max(1).optional(),
  reason: z.string().optional()
});

export type NarrativeEntityMatch = z.infer<typeof narrativeEntityMatchSchema>;

export const narrativeWebCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  summary: z.string().optional(),
  sourceUrls: z.array(z.string()).default([])
});

export type NarrativeWebCandidate = z.infer<typeof narrativeWebCandidateSchema>;

export const narrativeEntityDraftSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  website: z.string().optional(),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  researchNotes: z.string().optional(),
  isLimitedPartner: z.boolean().optional(),
  isAllianceMember: z.boolean().optional(),
  limitedPartnerInvestmentUsd: z.number().nonnegative().optional().nullable(),
  isSeedInvestor: z.boolean().optional(),
  isSeriesAInvestor: z.boolean().optional(),
  investmentNotes: z.string().optional(),
  companyType: companyTypeSchema.optional(),
  primaryCategory: companyPrimaryCategorySchema.optional(),
  primaryCategoryOther: z.string().optional(),
  leadSourceType: z.enum(["HEALTH_SYSTEM", "OTHER"]).optional(),
  leadSourceHealthSystemName: z.string().optional(),
  leadSourceOther: z.string().optional(),
  description: z.string().optional()
});

export type NarrativeEntityDraft = z.infer<typeof narrativeEntityDraftSchema>;

export const narrativeEntityPatchSchema = z.object({
  name: z.string().optional(),
  legalName: z.string().optional(),
  website: z.string().optional(),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  researchNotes: z.string().optional(),
  investmentNotes: z.string().optional(),
  description: z.string().optional()
});

export type NarrativeEntityPatch = z.infer<typeof narrativeEntityPatchSchema>;

const baseActionSchema = z.object({
  id: z.string().min(1),
  include: z.boolean().default(true),
  rationale: z.string().optional(),
  confidence: z.number().min(0).max(1).optional(),
  issues: z.array(z.string()).default([])
});

export const createEntityActionSchema = baseActionSchema.extend({
  kind: z.literal("CREATE_ENTITY"),
  entityType: narrativeEntityTypeSchema,
  draft: narrativeEntityDraftSchema,
  existingMatches: z.array(narrativeEntityMatchSchema).default([]),
  webCandidates: z.array(narrativeWebCandidateSchema).default([]),
  selection: z
    .object({
      mode: narrativeCreateModeSchema.default("CREATE_FROM_WEB"),
      existingId: z.string().optional(),
      webCandidateIndex: z.number().int().nonnegative().optional()
    })
    .default({ mode: "CREATE_FROM_WEB" })
});

export type CreateEntityAction = z.infer<typeof createEntityActionSchema>;

export const updateEntityActionSchema = baseActionSchema.extend({
  kind: z.literal("UPDATE_ENTITY"),
  entityType: narrativeEntityTypeSchema,
  targetName: z.string().min(1),
  patch: narrativeEntityPatchSchema.default({}),
  targetMatches: z.array(narrativeEntityMatchSchema).default([]),
  selectedTargetId: z.string().optional(),
  linkedCreateActionId: z.string().optional()
});

export type UpdateEntityAction = z.infer<typeof updateEntityActionSchema>;

export const narrativeContactPayloadSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  relationshipTitle: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  linkedinUrl: z.string().optional()
});

export type NarrativeContactPayload = z.infer<typeof narrativeContactPayloadSchema>;

export const addContactActionSchema = baseActionSchema.extend({
  kind: z.literal("ADD_CONTACT"),
  parentType: narrativeEntityTypeSchema,
  parentName: z.string().min(1),
  roleType: contactRoleTypeSchema.default("OTHER"),
  contact: narrativeContactPayloadSchema,
  parentMatches: z.array(narrativeEntityMatchSchema).default([]),
  selectedParentId: z.string().optional(),
  linkedCreateActionId: z.string().optional()
});

export type AddContactAction = z.infer<typeof addContactActionSchema>;

export const linkCompanyCoInvestorActionSchema = baseActionSchema.extend({
  kind: z.literal("LINK_COMPANY_CO_INVESTOR"),
  companyName: z.string().min(1),
  coInvestorName: z.string().min(1),
  relationshipType: companyCoInvestorRelationshipSchema.default("INVESTOR"),
  notes: z.string().optional(),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  companyMatches: z.array(narrativeEntityMatchSchema).default([]),
  coInvestorMatches: z.array(narrativeEntityMatchSchema).default([]),
  selectedCompanyId: z.string().optional(),
  selectedCoInvestorId: z.string().optional(),
  companyCreateActionId: z.string().optional(),
  coInvestorCreateActionId: z.string().optional()
});

export type LinkCompanyCoInvestorAction = z.infer<typeof linkCompanyCoInvestorActionSchema>;

export const narrativeActionSchema = z.discriminatedUnion("kind", [
  createEntityActionSchema,
  updateEntityActionSchema,
  addContactActionSchema,
  linkCompanyCoInvestorActionSchema
]);

export type NarrativeAction = z.infer<typeof narrativeActionSchema>;

export const narrativePlanSchema = z.object({
  narrative: z.string().min(1),
  summary: z.string().default(""),
  modelDigest: z.string().optional(),
  warnings: z.array(z.string()).default([]),
  actions: z.array(narrativeActionSchema).default([])
});

export type NarrativePlan = z.infer<typeof narrativePlanSchema>;

export const narrativePlanRequestSchema = z.object({
  narrative: z.string().min(15)
});

export const narrativeExecuteRequestSchema = z.object({
  plan: narrativePlanSchema
});

export const narrativeExecutionResultSchema = z.object({
  actionId: z.string().min(1),
  kind: z.enum(["CREATE_ENTITY", "UPDATE_ENTITY", "ADD_CONTACT", "LINK_COMPANY_CO_INVESTOR"]),
  status: z.enum(["EXECUTED", "SKIPPED", "FAILED"]),
  message: z.string(),
  record: z
    .object({
      entityType: narrativeEntityTypeSchema.optional(),
      id: z.string().optional(),
      name: z.string().optional()
    })
    .optional()
});

export type NarrativeExecutionResult = z.infer<typeof narrativeExecutionResultSchema>;
