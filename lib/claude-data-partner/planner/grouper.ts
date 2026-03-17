import type { PlannedChange, ChangeGroup } from '../types';

/**
 * Dependency tier for execution ordering.
 * Lower tier = must be written first.
 */
export const DEPENDENCY_TIERS: Record<string, number> = {
  HealthSystem: 0,
  CoInvestor: 0,
  Company: 1,
  CompanyPipeline: 2,
  Contact: 3,
  CompanyHealthSystemLink: 4,
  CompanyCoInvestorLink: 4,
  ContactHealthSystem: 4,
  ContactCompany: 4,
  ContactCoInvestor: 4,
  CompanyOpportunity: 5,
  HealthSystemOpportunity: 6,
  CompanyOpportunityContact: 6,
  HealthSystemOpportunityContact: 6,
  EntityNote: 7,
  ExternalMessageCapture: 7,
};

function getTier(table: string): number {
  return DEPENDENCY_TIERS[table] ?? 5;
}

/**
 * Groups related PlannedChanges by their top-level entity name,
 * orders them by dependency tier, and sets mustApplyTogether for
 * groups that contain parent/child relationships.
 */
export function groupChanges(changes: PlannedChange[]): ChangeGroup[] {
  // Sort by tier first
  const sorted = [...changes].sort((a, b) => getTier(a.table) - getTier(b.table));

  // Group by entity "anchor" — the label of the top-level entity
  const groupMap = new Map<string, PlannedChange[]>();

  for (const change of sorted) {
    // Derive group key from the candidate
    const candidate = change._candidate;
    let groupKey = change.label;

    if (candidate) {
      if ('kind' in candidate) {
        if (candidate.kind === 'Contact') {
          // Group with parent entity if identifiable
          const parentName =
            'principalEntityName' in candidate
              ? (candidate.principalEntityName ?? change.label)
              : change.label;
          groupKey = parentName;
        } else if (candidate.kind === 'CompanyHealthSystemLink' || candidate.kind === 'CompanyCoInvestorLink') {
          groupKey = candidate.companyName;
        } else if (candidate.kind === 'CompanyOpportunity') {
          groupKey = candidate.companyName;
        } else if (candidate.kind === 'EntityNote') {
          groupKey = candidate.entityName;
        } else if ('name' in candidate) {
          groupKey = (candidate as { name: string }).name;
        }
      }
    }

    const existing = groupMap.get(groupKey) || [];
    existing.push(change);
    groupMap.set(groupKey, existing);
  }

  const groups: ChangeGroup[] = [];
  let groupIdx = 0;

  for (const [key, groupChanges] of groupMap.entries()) {
    const hasInserts = groupChanges.some((c) => c.operation === 'INSERT');
    const hasDependencies = groupChanges.some(
      (c) => getTier(c.table) > 1 && groupChanges.some((p) => getTier(p.table) < getTier(c.table))
    );

    const mustApplyTogether = hasInserts && hasDependencies;

    // Build a human-readable label
    const tables = [...new Set(groupChanges.map((c) => c.table))];
    const label =
      tables.length === 1
        ? `${key} — ${tables[0]}`
        : `${key} — ${tables.slice(0, 3).join(', ')}${tables.length > 3 ? ', …' : ''}`;

    groups.push({
      id: `group-${groupIdx++}`,
      label,
      changes: groupChanges,
      mustApplyTogether,
    });
  }

  return groups;
}
