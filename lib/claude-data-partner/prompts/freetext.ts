import type { CandidateSet } from '../types';
import { CANDIDATE_SET_SCHEMA_SUMMARY } from './extraction';

/**
 * System prompt for parsing free-text CRM commands into a CandidateSet.
 */
export function buildFreetextPrompt(): string {
  return `You are parsing a natural-language CRM command for the Abundant Venture Partners CRM.

The CRM tracks: Companies (startups/spin-outs), HealthSystems, CoInvestors, Contacts (people), pipeline stages, opportunities, and notes.

Valid enum values:
- CompanyType: STARTUP | SPIN_OUT | DENOVO
- CompanyPrimaryCategory: PATIENT_ACCESS_AND_GROWTH | CARE_DELIVERY_TECH_ENABLED_SERVICES | CLINICAL_WORKFLOW_AND_PRODUCTIVITY | REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS | VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT | AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT | DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION | REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES | DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT | PHARMACY_AND_MEDICATION_ENABLEMENT | SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS | SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE | PROVIDER_EXPERIENCE_AND_DEVELOPMENT | OTHER
- CompanyPipelinePhase: INTAKE | DECLINED | VENTURE_STUDIO_NEGOTIATION | SCREENING | LOI_COLLECTION | COMMERCIAL_NEGOTIATION | PORTFOLIO_GROWTH | CLOSED
- CompanyPipelineCategory: ACTIVE | CLOSED | RE_ENGAGE_LATER
- CompanyPipelineIntakeStage: RECEIVED | INTRO_CALLS | ACTIVE_INTAKE | MANAGEMENT_PRESENTATION
- CompanyIntakeDecision: PENDING | ADVANCE_TO_NEGOTIATION | DECLINE | REVISIT_LATER
- PipelineLeadSourceType: INSIDE_OUT | ALLIANCE_REFERRAL | CO_INVESTOR_REFERRAL | COLD_INBOUND | WARM_INTRO | OTHER
- CompanyHealthSystemRelationship: CUSTOMER | SPIN_OUT_PARTNER | INVESTOR_PARTNER | OTHER
- CompanyHealthSystemPreliminaryInterest: EXPRESSED_INTEREST | REQUESTED_MORE_INFO | INTRO_CALL_SCHEDULED | SCREENING_RECOMMENDED
- CompanyCoInvestorRelationship: INVESTOR | PARTNER | OTHER
- CompanyOpportunityType: SCREENING_LOI | VENTURE_STUDIO_SERVICES | S1_TERM_SHEET | COMMERCIAL_CONTRACT | PROSPECT_PURSUIT
- CompanyOpportunityStage: IDENTIFIED | QUALIFICATION | PROPOSAL | NEGOTIATION | LEGAL | CLOSED_WON | CLOSED_LOST | ON_HOLD

Rules:
- Parse the command and return a CandidateSet JSON with all implied records.
- Include dependent records (e.g. if adding a company to the intake pipeline, include both Company and CompanyPipeline candidates via addToPipeline: true and pipelineFields).
- If the command is ambiguous, make the most reasonable inference and set confidence to MEDIUM or LOW.
- If the command references a known enum value, use the exact enum string.
- For "Add X to intake pipeline" commands: set addToPipeline: true and pipelineFields.phase = "INTAKE".
- For "Move X to CLOSED / PASSED": emit a Company candidate with pipelineFields.phase = "CLOSED".
- For pipeline-only updates (move, update stage/phase): emit a Company with addToPipeline: false but include pipelineFields with the changed fields only.
- For the sourceWindow, use today's date for both start and end.

CandidateSet JSON schema:
${CANDIDATE_SET_SCHEMA_SUMMARY}

Respond ONLY with valid JSON. No preamble or markdown.

Command: [USER_INPUT]`;
}

/**
 * Replaces the [USER_INPUT] placeholder.
 */
export function fillFreetextPrompt(input: string): string {
  return buildFreetextPrompt().replace('[USER_INPUT]', input);
}

/**
 * Parses a Claude response into a CandidateSet.
 */
export function parseFreetextResponse(raw: string): CandidateSet {
  const trimmed = raw.trim();
  const jsonStr = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  return JSON.parse(jsonStr) as CandidateSet;
}
