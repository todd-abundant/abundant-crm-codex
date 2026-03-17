import type {
  ResolvedRecord,
  PlannedChange,
  ChangeSet,
  FieldDiff,
  ConfidenceLevel,
  CandidateRecord,
} from '../types';
import { defaultUserApproved } from './confidence';
import { groupChanges } from './grouper';

/**
 * Computes field diffs between a candidate and an existing DB record snapshot.
 * Only emits diffs where the candidate has a non-null value that differs from existing.
 */
function computeDiffs(
  candidateFields: Record<string, unknown>,
  existingRecord: object
): FieldDiff[] {
  const existing = existingRecord as Record<string, unknown>;
  const diffs: FieldDiff[] = [];

  for (const [field, nowValue] of Object.entries(candidateFields)) {
    if (nowValue === null || nowValue === undefined) continue;
    const wasValue = existing[field] ?? null;
    if (wasValue !== nowValue) {
      diffs.push({ field, was: wasValue, now: nowValue });
    }
  }

  return diffs;
}

/**
 * Extracts the flat field map from a candidate record for diff computation.
 */
function candidateToFieldMap(candidate: CandidateRecord): Record<string, unknown> {
  const fields: Record<string, unknown> = {};

  if (candidate.kind === 'Contact') {
    if (candidate.email) fields.email = candidate.email;
    if (candidate.linkedinUrl) fields.linkedinUrl = candidate.linkedinUrl;
    if (candidate.title) fields.title = candidate.title;
    if (candidate.phone) fields.phone = candidate.phone;
    fields.name = candidate.name;
  } else if (candidate.kind === 'Company') {
    fields.name = candidate.name;
    if (candidate.website) fields.website = candidate.website;
    if (candidate.hqCity) fields.headquartersCity = candidate.hqCity;
    if (candidate.hqState) fields.headquartersState = candidate.hqState;
    if (candidate.companyType) fields.companyType = candidate.companyType;
    if (candidate.primaryCategory) fields.primaryCategory = candidate.primaryCategory;
    if (candidate.description) fields.description = candidate.description;
    if (candidate.leadSourceType) fields.leadSourceType = candidate.leadSourceType;
  } else if (candidate.kind === 'HealthSystem') {
    fields.name = candidate.name;
    if (candidate.website) fields.website = candidate.website;
    if (candidate.hqCity) fields.headquartersCity = candidate.hqCity;
    if (candidate.hqState) fields.headquartersState = candidate.hqState;
    if (candidate.isAllianceMember !== undefined) fields.isAllianceMember = candidate.isAllianceMember;
    if (candidate.isLimitedPartner !== undefined) fields.isLimitedPartner = candidate.isLimitedPartner;
  } else if (candidate.kind === 'CoInvestor') {
    fields.name = candidate.name;
    if (candidate.website) fields.website = candidate.website;
    if (candidate.isSeedInvestor !== undefined) fields.isSeedInvestor = candidate.isSeedInvestor;
    if (candidate.isSeriesAInvestor !== undefined) fields.isSeriesAInvestor = candidate.isSeriesAInvestor;
    if (candidate.investmentNotes) fields.investmentNotes = candidate.investmentNotes;
  } else if (candidate.kind === 'CompanyHealthSystemLink') {
    if (candidate.relationshipType) fields.relationshipType = candidate.relationshipType;
    if (candidate.preliminaryInterest) fields.preliminaryInterest = candidate.preliminaryInterest;
    if (candidate.notes) fields.notes = candidate.notes;
  } else if (candidate.kind === 'CompanyCoInvestorLink') {
    if (candidate.relationshipType) fields.relationshipType = candidate.relationshipType;
    if (candidate.notes) fields.notes = candidate.notes;
  } else if (candidate.kind === 'EntityNote') {
    fields.note = candidate.note;
  } else if (candidate.kind === 'CompanyOpportunity') {
    fields.title = candidate.title;
    if (candidate.type) fields.type = candidate.type;
    if (candidate.stage) fields.stage = candidate.stage;
    if (candidate.notes) fields.notes = candidate.notes;
  }

  return fields;
}

function getConfidence(candidate: CandidateRecord): ConfidenceLevel {
  if ('confidence' in candidate) return candidate.confidence;
  return 'MEDIUM';
}

function getLabelForRecord(candidate: CandidateRecord): string {
  if (candidate.kind === 'Contact') {
    const entityName = candidate.principalEntityName || candidate.affiliations[0]?.entityName;
    const at = entityName ? ` at ${entityName}` : '';
    return `${candidate.name} (Contact)${at}`;
  }
  if (candidate.kind === 'Company') return `${candidate.name} (Company)`;
  if (candidate.kind === 'HealthSystem') return `${candidate.name} (Health System)`;
  if (candidate.kind === 'CoInvestor') return `${candidate.name} (Co-Investor)`;
  if (candidate.kind === 'CompanyHealthSystemLink') return `${candidate.companyName} ↔ ${candidate.healthSystemName}`;
  if (candidate.kind === 'CompanyCoInvestorLink') return `${candidate.companyName} ↔ ${candidate.coInvestorName}`;
  if (candidate.kind === 'EntityNote') return `Note on ${candidate.entityName}`;
  if (candidate.kind === 'CompanyOpportunity') return `${candidate.title} (Opportunity)`;
  return 'Unknown';
}

function getTableForRecord(candidate: CandidateRecord): string {
  if (candidate.kind === 'Contact') return 'Contact';
  if (candidate.kind === 'Company') return 'Company';
  if (candidate.kind === 'HealthSystem') return 'HealthSystem';
  if (candidate.kind === 'CoInvestor') return 'CoInvestor';
  if (candidate.kind === 'CompanyHealthSystemLink') return 'CompanyHealthSystemLink';
  if (candidate.kind === 'CompanyCoInvestorLink') return 'CompanyCoInvestorLink';
  if (candidate.kind === 'EntityNote') return 'EntityNote';
  if (candidate.kind === 'CompanyOpportunity') return 'CompanyOpportunity';
  return 'Unknown';
}

// ─── Deduplication ────────────────────────────────────────────────────────────

function normalizeEntityName(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function getDedupeKey(candidate: CandidateRecord): string | null {
  if (candidate.kind === 'HealthSystem') return `HealthSystem:${normalizeEntityName(candidate.name)}`;
  if (candidate.kind === 'CoInvestor') return `CoInvestor:${normalizeEntityName(candidate.name)}`;
  if (candidate.kind === 'Company') return `Company:${normalizeEntityName(candidate.name)}`;
  if (candidate.kind === 'Contact') return `Contact:${normalizeEntityName(candidate.name)}`;
  return null; // links, notes, opportunities — no dedup
}

/**
 * Deduplicates resolved records by (kind, normalizedName) and detects
 * cross-table conflicts where the same name appears as both HealthSystem
 * and CoInvestor.
 */
function deduplicateResolved(resolved: ResolvedRecord[]): ResolvedRecord[] {
  const seen = new Map<string, true>();
  const result: ResolvedRecord[] = [];
  const healthSystemNames = new Set<string>();
  const coInvestorNames = new Set<string>();

  for (const record of resolved) {
    const key = getDedupeKey(record.candidate);

    if (record.candidate.kind === 'HealthSystem') healthSystemNames.add(normalizeEntityName(record.candidate.name));
    if (record.candidate.kind === 'CoInvestor') coInvestorNames.add(normalizeEntityName(record.candidate.name));

    if (!key) {
      result.push(record);
      continue;
    }

    if (!seen.has(key)) {
      seen.set(key, true);
      result.push(record);
    }
    // else: duplicate — silently dropped (same entity seen from another source)
  }

  // Detect cross-table conflicts: same name as both HealthSystem and CoInvestor
  const conflicts = new Set([...healthSystemNames].filter((n) => coInvestorNames.has(n)));
  if (conflicts.size === 0) return result;

  return result.map((r) => {
    if (r.candidate.kind !== 'HealthSystem' && r.candidate.kind !== 'CoInvestor') return r;
    if (!('name' in r.candidate)) return r;
    if (conflicts.has(normalizeEntityName(r.candidate.name))) {
      return { ...r, status: 'AMBIGUOUS' as const, ambiguousCandidates: [
        { id: 'hs', label: 'Add as Health System' },
        { id: 'ci', label: 'Add as Co-Investor' },
      ]};
    }
    return r;
  });
}

// ─── Planner ──────────────────────────────────────────────────────────────────

/**
 * Converts resolved records into a ChangeSet ready for UI display and writing.
 */
export function plan(resolved: ResolvedRecord[]): ChangeSet {
  resolved = deduplicateResolved(resolved);
  const changes: PlannedChange[] = [];

  for (const record of resolved) {
    const { candidate, status, existingId, existingRecord } = record;
    const confidence = getConfidence(candidate);
    const table = getTableForRecord(candidate);
    const label = getLabelForRecord(candidate);

    if (status === 'SKIPPED') {
      changes.push({
        id: crypto.randomUUID(),
        operation: 'SKIP',
        table,
        label,
        existingId,
        diffs: [],
        source: candidate.kind !== 'CompanyHealthSystemLink' && candidate.kind !== 'CompanyCoInvestorLink'
          ? (candidate as { source: CandidateRecord['source'] }).source
          : (candidate as { source: CandidateRecord['source'] }).source,
        confidence,
        userApproved: false,
        _candidate: candidate,
        _resolvedId: existingId,
      });
      continue;
    }

    if (status === 'AMBIGUOUS') {
      const isConflict = record.ambiguousCandidates?.some((c) => c.id === 'hs' || c.id === 'ci');
      const ambigLabel = isConflict
        ? `${label} — ⚠ same name found as Health System AND Co-Investor, please add manually`
        : `${label} — ⚠ multiple possible matches, please add manually`;
      changes.push({
        id: crypto.randomUUID(),
        operation: 'SKIP',
        table,
        label: ambigLabel,
        diffs: [],
        source: (candidate as { source: CandidateRecord['source'] }).source ?? { kind: 'freetext', input: '' },
        confidence: 'LOW',
        userApproved: false,
        _candidate: candidate,
      });
      continue;
    }

    if (status === 'RESOLVED_NEW') {
      const fieldMap = candidateToFieldMap(candidate);
      const diffs: FieldDiff[] = Object.entries(fieldMap).map(([field, now]) => ({
        field,
        was: null,
        now,
      }));

      changes.push({
        id: crypto.randomUUID(),
        operation: 'INSERT',
        table,
        label,
        diffs,
        source: (candidate as { source: CandidateRecord['source'] }).source ?? { kind: 'freetext', input: '' },
        confidence,
        userApproved: defaultUserApproved(confidence, 'INSERT'),
        _candidate: candidate,
      });

      // If it's a Company with addToPipeline: true, also plan a CompanyPipeline INSERT
      if (candidate.kind === 'Company' && candidate.addToPipeline) {
        const pf = candidate.pipelineFields || {};
        const pipelineDiffs: FieldDiff[] = [
          { field: 'phase', was: null, now: pf.phase || 'INTAKE' },
          { field: 'category', was: null, now: pf.category || 'ACTIVE' },
        ];
        if (pf.ownerName) pipelineDiffs.push({ field: 'ownerName', was: null, now: pf.ownerName });
        if (pf.leadSourceType) pipelineDiffs.push({ field: 'leadSourceType', was: null, now: pf.leadSourceType });

        changes.push({
          id: crypto.randomUUID(),
          operation: 'INSERT',
          table: 'CompanyPipeline',
          label: `${candidate.name} — Pipeline`,
          diffs: pipelineDiffs,
          source: candidate.source,
          confidence,
          userApproved: defaultUserApproved(confidence, 'INSERT'),
          _candidate: candidate,
        });
      }
    }

    if (status === 'RESOLVED_EXISTING' && existingRecord) {
      const fieldMap = candidateToFieldMap(candidate);
      const diffs = computeDiffs(fieldMap, existingRecord);

      if (diffs.length === 0) {
        // No-op — skip silently (no card)
        continue;
      }

      changes.push({
        id: crypto.randomUUID(),
        operation: 'UPDATE',
        table,
        label,
        existingId,
        diffs,
        source: (candidate as { source: CandidateRecord['source'] }).source ?? { kind: 'freetext', input: '' },
        confidence,
        userApproved: defaultUserApproved(confidence, 'UPDATE'),
        _candidate: candidate,
        _resolvedId: existingId,
      });
    }
  }

  const groups = groupChanges(changes);

  return {
    groups,
    totalChanges: changes.filter((c) => c.operation !== 'SKIP').length,
    generatedAt: new Date().toISOString(),
  };
}
