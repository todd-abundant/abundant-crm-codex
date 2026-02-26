import { z } from "zod";

export const personSchema = z.object({
  name: z.string().min(1),
  title: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  url: z.string().url().optional().or(z.literal(""))
});

export const contactRoleTypeSchema = z.enum([
  "EXECUTIVE",
  "VENTURE_PARTNER",
  "INVESTOR_PARTNER",
  "COMPANY_CONTACT",
  "OTHER"
]);
export type ContactRoleType = z.infer<typeof contactRoleTypeSchema>;

export const companyContactSchema = personSchema.extend({
  roleType: contactRoleTypeSchema.optional(),
  relationshipTitle: z.string().optional()
});

export const investmentSchema = z.object({
  portfolioCompanyName: z.string().min(1),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  investmentDate: z.string().optional().nullable(),
  leadPartnerName: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal(""))
});

export const coInvestorInvestmentSchema = z.object({
  portfolioCompanyName: z.string().min(1),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  investmentDate: z.string().optional().nullable(),
  investmentStage: z.string().optional(),
  leadPartnerName: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal(""))
});

export const healthSystemInputSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  netPatientRevenueUsd: z.number().nonnegative().optional().nullable(),
  isLimitedPartner: z.boolean().default(false),
  limitedPartnerInvestmentUsd: z.number().nonnegative().optional().nullable(),
  isAllianceMember: z.boolean().default(false),
  hasInnovationTeam: z.boolean().optional().nullable(),
  hasVentureTeam: z.boolean().optional().nullable(),
  ventureTeamSummary: z.string().optional(),
  executives: z.array(personSchema).default([]),
  venturePartners: z.array(personSchema).default([]),
  investments: z.array(investmentSchema).default([]),
  researchNotes: z.string().optional()
});

export type HealthSystemInput = z.infer<typeof healthSystemInputSchema>;

export const healthSystemUpdateSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  netPatientRevenueUsd: z.number().nonnegative().optional().nullable(),
  isLimitedPartner: z.boolean().default(false),
  limitedPartnerInvestmentUsd: z.number().nonnegative().optional().nullable(),
  isAllianceMember: z.boolean().default(false),
  hasInnovationTeam: z.boolean().optional().nullable(),
  hasVentureTeam: z.boolean().optional().nullable(),
  ventureTeamSummary: z.string().optional(),
  researchNotes: z.string().optional()
});

export type HealthSystemUpdateInput = z.infer<typeof healthSystemUpdateSchema>;

export const healthSystemSearchCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  summary: z.string().optional(),
  sourceUrls: z.array(z.string()).default([])
});

export type HealthSystemSearchCandidate = z.infer<typeof healthSystemSearchCandidateSchema>;

export const healthSystemSearchRequestSchema = z.object({
  query: z.string().min(2)
});

export const verifyCandidateRequestSchema = z.object({
  candidate: healthSystemSearchCandidateSchema,
  isLimitedPartner: z.boolean().optional().default(false),
  isAllianceMember: z.boolean().optional().default(false),
  limitedPartnerInvestmentUsd: z.number().nonnegative().optional().nullable()
});

export const processResearchJobsRequestSchema = z.object({
  maxJobs: z.number().int().positive().max(10).optional().default(1)
});

export const prefillRequestSchema = z.object({
  prompt: z.string().min(5)
});

export const coInvestorInputSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  isSeedInvestor: z.boolean().default(false),
  isSeriesAInvestor: z.boolean().default(false),
  investmentNotes: z.string().optional(),
  researchNotes: z.string().optional(),
  partners: z.array(personSchema).default([]),
  investments: z.array(coInvestorInvestmentSchema).default([])
});

export type CoInvestorInput = z.infer<typeof coInvestorInputSchema>;

export const coInvestorUpdateSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  isSeedInvestor: z.boolean().default(false),
  isSeriesAInvestor: z.boolean().default(false),
  investmentNotes: z.string().optional(),
  researchNotes: z.string().optional()
});

export type CoInvestorUpdateInput = z.infer<typeof coInvestorUpdateSchema>;

export const coInvestorSearchCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  summary: z.string().optional(),
  sourceUrls: z.array(z.string()).default([])
});

export type CoInvestorSearchCandidate = z.infer<typeof coInvestorSearchCandidateSchema>;

export const coInvestorSearchRequestSchema = z.object({
  query: z.string().min(2)
});

export const coInvestorVerifyRequestSchema = z.object({
  candidate: coInvestorSearchCandidateSchema,
  isSeedInvestor: z.boolean().optional().default(false),
  isSeriesAInvestor: z.boolean().optional().default(false)
});

export const companyTypeSchema = z.enum(["STARTUP", "SPIN_OUT", "DENOVO"]);
export type CompanyType = z.infer<typeof companyTypeSchema>;

export const companyPrimaryCategorySchema = z.enum([
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
]);
export type CompanyPrimaryCategory = z.infer<typeof companyPrimaryCategorySchema>;

export const companyDeclineReasonSchema = z.enum([
  "PRODUCT",
  "INSUFFICIENT_ROI",
  "HIGHLY_COMPETITIVE_LANDSCAPE",
  "OUT_OF_INVESTMENT_THESIS_SCOPE",
  "TOO_EARLY",
  "TOO_MATURE_FOR_SEED_INVESTMENT",
  "LACKS_PROOF_POINTS",
  "INSUFFICIENT_TAM",
  "TEAM",
  "HEALTH_SYSTEM_BUYING_PROCESS",
  "WORKFLOW_FRICTION",
  "OTHER"
]);
export type CompanyDeclineReason = z.infer<typeof companyDeclineReasonSchema>;

export const companyIntakeStatusSchema = z.enum([
  "NOT_SCHEDULED",
  "SCHEDULED",
  "COMPLETED",
  "SCREENING_EVALUATION"
]);
export type CompanyIntakeStatus = z.infer<typeof companyIntakeStatusSchema>;

export const companyLeadSourceTypeSchema = z.enum(["HEALTH_SYSTEM", "OTHER"]);
export type CompanyLeadSourceType = z.infer<typeof companyLeadSourceTypeSchema>;

export const companyHealthSystemRelationshipSchema = z.enum([
  "CUSTOMER",
  "SPIN_OUT_PARTNER",
  "INVESTOR_PARTNER",
  "OTHER"
]);
export type CompanyHealthSystemRelationship = z.infer<typeof companyHealthSystemRelationshipSchema>;

export const companyCoInvestorRelationshipSchema = z.enum(["INVESTOR", "PARTNER", "OTHER"]);
export type CompanyCoInvestorRelationship = z.infer<typeof companyCoInvestorRelationshipSchema>;

export const companyInputSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  companyType: companyTypeSchema.default("STARTUP"),
  primaryCategory: companyPrimaryCategorySchema.default("OTHER"),
  primaryCategoryOther: z.string().optional(),
  declineReason: companyDeclineReasonSchema.optional().nullable(),
  declineReasonOther: z.string().optional(),
  leadSourceType: companyLeadSourceTypeSchema.default("OTHER"),
  leadSourceHealthSystemId: z.string().optional().nullable(),
  leadSourceOther: z.string().optional(),
  leadSourceNotes: z.string().optional(),
  description: z.string().optional(),
  atAGlanceProblem: z.string().optional(),
  atAGlanceSolution: z.string().optional(),
  atAGlanceImpact: z.string().optional(),
  atAGlanceKeyStrengths: z.string().optional(),
  atAGlanceKeyConsiderations: z.string().optional(),
  googleTranscriptUrl: z.string().url().optional().or(z.literal("")),
  spinOutOwnershipPercent: z.number().nonnegative().max(100).optional().nullable(),
  intakeStatus: companyIntakeStatusSchema.default("NOT_SCHEDULED"),
  intakeScheduledAt: z.string().optional().nullable(),
  screeningEvaluationAt: z.string().optional().nullable(),
  researchNotes: z.string().optional(),
  contacts: z.array(companyContactSchema).default([]),
  healthSystemLinks: z
    .array(
      z.object({
        healthSystemId: z.string().min(1),
        relationshipType: companyHealthSystemRelationshipSchema.default("CUSTOMER"),
        notes: z.string().optional(),
        investmentAmountUsd: z.number().nonnegative().optional().nullable(),
        ownershipPercent: z.number().nonnegative().max(100).optional().nullable()
      })
    )
    .default([]),
  coInvestorLinks: z
    .array(
      z.object({
        coInvestorId: z.string().min(1),
        relationshipType: companyCoInvestorRelationshipSchema.default("INVESTOR"),
        notes: z.string().optional(),
        investmentAmountUsd: z.number().nonnegative().optional().nullable()
      })
    )
    .default([])
});

export type CompanyInput = z.infer<typeof companyInputSchema>;

export const companyUpdateSchema = z.object({
  name: z.string().min(1),
  legalName: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  companyType: companyTypeSchema.default("STARTUP"),
  primaryCategory: companyPrimaryCategorySchema.default("OTHER"),
  primaryCategoryOther: z.string().optional(),
  declineReason: companyDeclineReasonSchema.optional().nullable(),
  declineReasonOther: z.string().optional(),
  leadSourceType: companyLeadSourceTypeSchema.default("OTHER"),
  leadSourceHealthSystemId: z.string().optional().nullable(),
  leadSourceOther: z.string().optional(),
  leadSourceNotes: z.string().optional(),
  description: z.string().optional(),
  atAGlanceProblem: z.string().optional(),
  atAGlanceSolution: z.string().optional(),
  atAGlanceImpact: z.string().optional(),
  atAGlanceKeyStrengths: z.string().optional(),
  atAGlanceKeyConsiderations: z.string().optional(),
  googleTranscriptUrl: z.string().url().optional().or(z.literal("")),
  spinOutOwnershipPercent: z.number().nonnegative().max(100).optional().nullable(),
  intakeStatus: companyIntakeStatusSchema.default("NOT_SCHEDULED"),
  intakeScheduledAt: z.string().optional().nullable(),
  screeningEvaluationAt: z.string().optional().nullable(),
  researchNotes: z.string().optional(),
  healthSystemLinks: z
    .array(
      z.object({
        healthSystemId: z.string().min(1),
        relationshipType: companyHealthSystemRelationshipSchema.default("CUSTOMER"),
        notes: z.string().optional(),
        investmentAmountUsd: z.number().nonnegative().optional().nullable(),
        ownershipPercent: z.number().nonnegative().max(100).optional().nullable()
      })
    )
    .default([]),
  coInvestorLinks: z
    .array(
      z.object({
        coInvestorId: z.string().min(1),
        relationshipType: companyCoInvestorRelationshipSchema.default("INVESTOR"),
        notes: z.string().optional(),
        investmentAmountUsd: z.number().nonnegative().optional().nullable()
      })
    )
    .default([])
});

export type CompanyUpdateInput = z.infer<typeof companyUpdateSchema>;

export const companySearchCandidateSchema = z.object({
  name: z.string().min(1),
  website: z.string().optional(),
  headquartersCity: z.string().optional(),
  headquartersState: z.string().optional(),
  headquartersCountry: z.string().optional(),
  summary: z.string().optional(),
  sourceUrls: z.array(z.string()).default([])
});

export type CompanySearchCandidate = z.infer<typeof companySearchCandidateSchema>;

export const companySearchRequestSchema = z.object({
  query: z.string().min(2)
});

export const companyVerifyRequestSchema = z.object({
  candidate: companySearchCandidateSchema,
  companyType: companyTypeSchema.default("STARTUP"),
  primaryCategory: companyPrimaryCategorySchema.default("OTHER"),
  primaryCategoryOther: z.string().optional(),
  leadSourceType: companyLeadSourceTypeSchema.default("OTHER"),
  leadSourceHealthSystemId: z.string().optional().nullable(),
  leadSourceOther: z.string().optional()
});

export const companyIdParamsSchema = z.object({
  id: z.string().min(1)
});
