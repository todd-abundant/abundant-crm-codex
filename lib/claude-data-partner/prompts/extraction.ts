import type { CandidateSet } from '../types';

/**
 * System prompt for ambient extraction from Gmail/Calendar/Drive content.
 * Returns a template string with [CONTENT] placeholder to be replaced at call time.
 */
export function buildExtractionPrompt(candidateSetSchema: string): string {
  return `You are extracting CRM-relevant signals from the following email/calendar/transcript content for the Abundant Venture Partners CRM.

The CRM tracks: Companies (startups/spin-outs), HealthSystems, CoInvestors, Contacts (people), and relationships between them.

Extract ALL of the following that appear in the content:
- People (name, email, title, organization)
- Organizations (companies, health systems, co-investors)
- Relationships between people and organizations
- Signals about pipeline status (intake, screening, LOI, investment)
- Opportunities or deals
- Notes worthy of recording

IMPORTANT RULES:
- Only extract what is explicitly stated or directly implied. Do not speculate.
- For each extracted entity, record a confidence level: HIGH, MEDIUM, or LOW.
- HIGH = directly stated. MEDIUM = strongly implied. LOW = speculative.
- Ignore internal Abundant team members (@abundantventurepartners.com).
- Do not extract calendar/logistics noise (Uber, airline, restaurant reservations).
- Do not extract signal-event or research-job table data.
- For CandidateCompany: set addToPipeline to true only if there is a clear intake/screening/LOI/investment signal.
- For CandidateNote: only emit if the note is substantive and CRM-relevant (not logistics).

Valid entity kinds for CandidateRecord.kind:
  "Contact" | "Company" | "HealthSystem" | "CoInvestor" | "CompanyHealthSystemLink" | "CompanyCoInvestorLink" | "EntityNote" | "CompanyOpportunity"

Valid confidence levels: "HIGH" | "MEDIUM" | "LOW"

CandidateSet JSON schema:
${candidateSetSchema}

Respond ONLY with a valid JSON CandidateSet object matching the schema above. No preamble, no markdown, no explanation.

Source content:
[CONTENT]`;
}

/**
 * Minimal schema description embedded in the extraction prompt.
 */
export const CANDIDATE_SET_SCHEMA_SUMMARY = `{
  "candidates": [
    // CandidateContact
    { "kind": "Contact", "name": string, "email"?: string, "linkedinUrl"?: string, "title"?: string, "phone"?: string,
      "principalEntityKind"?: "HEALTH_SYSTEM"|"CO_INVESTOR"|"COMPANY", "principalEntityName"?: string,
      "affiliations": [{ "entityKind": "HEALTH_SYSTEM"|"CO_INVESTOR"|"COMPANY", "entityName": string, "roleType": string, "title"?: string }],
      "source": SignalSource, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    // CandidateCompany
    { "kind": "Company", "name": string, "website"?: string, "hqCity"?: string, "hqState"?: string,
      "companyType"?: "STARTUP"|"SPIN_OUT"|"DENOVO", "primaryCategory"?: string, "leadSourceType"?: string,
      "description"?: string, "addToPipeline": boolean, "pipelineFields"?: { "phase"?: string, "category"?: string, ... },
      "source": SignalSource, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    // CandidateHealthSystem
    { "kind": "HealthSystem", "name": string, "website"?: string, "hqCity"?: string, "hqState"?: string,
      "isAllianceMember"?: boolean, "isLimitedPartner"?: boolean, "source": SignalSource, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    // CandidateCoInvestor
    { "kind": "CoInvestor", "name": string, "website"?: string, "isSeedInvestor"?: boolean, "isSeriesAInvestor"?: boolean,
      "investmentNotes"?: string, "source": SignalSource, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    // CandidateLink (CompanyHealthSystemLink)
    { "kind": "CompanyHealthSystemLink", "companyName": string, "healthSystemName": string,
      "relationshipType": "CUSTOMER"|"SPIN_OUT_PARTNER"|"INVESTOR_PARTNER"|"OTHER",
      "preliminaryInterest"?: string, "notes"?: string, "source": SignalSource },
    // CandidateLink (CompanyCoInvestorLink)
    { "kind": "CompanyCoInvestorLink", "companyName": string, "coInvestorName": string,
      "relationshipType": "INVESTOR"|"PARTNER"|"OTHER", "notes"?: string, "source": SignalSource },
    // CandidateNote
    { "kind": "EntityNote", "entityKind": "COMPANY"|"HEALTH_SYSTEM"|"CO_INVESTOR"|"CONTACT", "entityName": string,
      "note": string, "source": SignalSource, "confidence": "HIGH"|"MEDIUM"|"LOW" },
    // CandidateOpportunity
    { "kind": "CompanyOpportunity", "companyName": string, "healthSystemName"?: string,
      "type": "SCREENING_LOI"|"VENTURE_STUDIO_SERVICES"|"S1_TERM_SHEET"|"COMMERCIAL_CONTRACT"|"PROSPECT_PURSUIT",
      "title": string, "stage": "IDENTIFIED"|"QUALIFICATION"|"PROPOSAL"|"NEGOTIATION"|"LEGAL"|"CLOSED_WON"|"CLOSED_LOST"|"ON_HOLD",
      "notes"?: string, "contactNames"?: string[], "source": SignalSource, "confidence": "HIGH"|"MEDIUM"|"LOW" }
  ],
  "sourceWindow": { "start": "ISO8601", "end": "ISO8601" },
  "extractedAt": "ISO8601"
}

SignalSource shapes:
  { "kind": "gmail", "messageId": string, "threadId": string, "subject": string, "date": string }
  { "kind": "calendar", "eventId": string, "summary": string, "date": string }
  { "kind": "drive", "fileId": string, "title": string }
  { "kind": "freetext", "input": string }`;

/**
 * Replaces the [CONTENT] placeholder in the extraction prompt.
 */
export function fillExtractionPrompt(content: string): string {
  return buildExtractionPrompt(CANDIDATE_SET_SCHEMA_SUMMARY).replace('[CONTENT]', content);
}

/**
 * Parses a Claude response string into a CandidateSet.
 * Throws if parsing fails.
 */
export function parseExtractionResponse(raw: string): CandidateSet {
  const trimmed = raw.trim();
  // Strip markdown code fences if present
  const jsonStr = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  return JSON.parse(jsonStr) as CandidateSet;
}
