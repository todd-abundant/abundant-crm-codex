export type ResolutionLlmResult = {
  match: 'EXACT' | 'PROBABLE' | 'NONE';
  matchedId: string | null;
  reasoning: string;
};

/**
 * System prompt for LLM-assisted fuzzy entity resolution.
 * Used when deterministic matching is ambiguous.
 */
export function buildResolutionPrompt(
  candidateJson: string,
  existingRecordsJson: string
): string {
  return `You are helping resolve a candidate CRM record against existing database records for the Abundant Venture Partners CRM.

Candidate:
${candidateJson}

Existing DB records (top matches by name similarity):
${existingRecordsJson}

Determine if the candidate matches any existing record.

Rules:
- EXACT: The candidate clearly refers to the same real-world entity (same name, domain, location, or other unique identifiers).
- PROBABLE: The candidate likely refers to the same entity, but there is some ambiguity.
- NONE: The candidate is a distinct entity from all existing records.

Respond ONLY with valid JSON in this exact shape. No preamble or markdown.
{ "match": "EXACT" | "PROBABLE" | "NONE", "matchedId": string | null, "reasoning": string }`;
}

/**
 * Parses the LLM resolution response.
 */
export function parseResolutionResponse(raw: string): ResolutionLlmResult {
  const trimmed = raw.trim();
  const jsonStr = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
    : trimmed;
  return JSON.parse(jsonStr) as ResolutionLlmResult;
}
