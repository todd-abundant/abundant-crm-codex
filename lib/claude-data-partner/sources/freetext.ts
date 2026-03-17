import type { CandidateSet } from '../types';
import { fillFreetextPrompt, parseFreetextResponse } from '../prompts/freetext';
import { llmChat } from '../llm';

/**
 * Parses a natural-language CRM command into a CandidateSet.
 */
export async function extractFromFreeText(input: string): Promise<CandidateSet> {
  const prompt = fillFreetextPrompt(input);
  const raw = await llmChat(prompt, 4096);

  try {
    return parseFreetextResponse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse LLM freetext response as CandidateSet: ${err instanceof Error ? err.message : String(err)}\n\nRaw:\n${raw}`
    );
  }
}
