import type { ConfidenceLevel, PlannedChange, SignalSource } from '../types';

/**
 * Determines whether a PlannedChange should be approved by default in the UI.
 * LOW confidence changes are unchecked by default.
 */
export function defaultUserApproved(confidence: ConfidenceLevel, operation: PlannedChange['operation']): boolean {
  if (operation === 'SKIP') return false;
  return confidence !== 'LOW';
}

/**
 * Derives confidence from the signal source and extraction-level confidence.
 * The extraction LLM assigns confidence; this function may downgrade based on
 * operation type or field-level heuristics.
 */
export function deriveFieldConfidence(
  baseConfidence: ConfidenceLevel,
  source: SignalSource,
  fieldName: string
): ConfidenceLevel {
  // Enum defaults / category guesses are always at most MEDIUM
  const speculativeFields = new Set(['primaryCategory', 'companyType', 'leadSourceType', 'category', 'phase']);
  if (speculativeFields.has(fieldName) && baseConfidence === 'HIGH') {
    return 'MEDIUM';
  }

  // Drive-sourced data is inherently less reliable than direct email/calendar data
  if (source.kind === 'drive' && baseConfidence === 'HIGH') {
    return 'MEDIUM';
  }

  return baseConfidence;
}
