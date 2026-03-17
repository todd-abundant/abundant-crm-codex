import type { PrismaClient } from '@prisma/client';
import type { ChangeSet, WriteLog, WriteResult, PlannedChange } from '../types';
import { READONLY_TABLES } from '../index';
import { writeExternalMessageCaptures } from './audit';
import { DEPENDENCY_TIERS } from '../planner/grouper';

/**
 * Returns all PlannedChanges from a ChangeSet in dependency-tier order.
 * Respects userApproved flag — only returns approved, non-SKIP changes.
 */
function getApprovedChangesOrdered(changeSet: ChangeSet): PlannedChange[] {
  const all: PlannedChange[] = [];
  for (const group of changeSet.groups) {
    for (const change of group.changes) {
      if (change.userApproved && change.operation !== 'SKIP') {
        all.push(change);
      }
    }
  }
  return all.sort((a, b) => (DEPENDENCY_TIERS[a.table] ?? 5) - (DEPENDENCY_TIERS[b.table] ?? 5));
}

/**
 * Executes approved PlannedChanges against the database via Prisma.
 */
export async function applyChanges(
  changeSet: ChangeSet,
  prisma: PrismaClient,
  actorId: string,
  actorName: string
): Promise<WriteLog> {
  const results: WriteResult[] = [];
  const changes = getApprovedChangesOrdered(changeSet);

  // Map from a "name key" to the newly written record id
  // Used to resolve FK dependencies within the same ChangeSet
  const nameToId = new Map<string, string>(); // e.g. "Company:Systole Health" → "cuid..."
  const noteIdMap = new Map<string, string>(); // changeId → written entityId

  for (const group of changeSet.groups) {
    if (!group.mustApplyTogether) continue;

    const groupChanges = group.changes.filter((c) => c.userApproved && c.operation !== 'SKIP');
    if (groupChanges.length === 0) continue;

    try {
      await prisma.$transaction(async (tx) => {
        for (const change of groupChanges) {
          await applyChange(change, tx as unknown as PrismaClient, nameToId, noteIdMap, actorId, actorName, results);
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      for (const change of groupChanges) {
        results.push({ changeId: change.id, success: false, error: msg });
      }
    }
  }

  // Non-grouped changes applied individually
  const ungroupedChanges = changes.filter(
    (c) => !changeSet.groups.some((g) => g.mustApplyTogether && g.changes.includes(c))
  );

  for (const change of ungroupedChanges) {
    // Skip if already processed as part of a group
    if (results.some((r) => r.changeId === change.id)) continue;
    await applyChange(change, prisma, nameToId, noteIdMap, actorId, actorName, results);
  }

  // Write ExternalMessageCapture for Gmail-sourced notes
  const noteChanges = changes.filter((c) => c.table === 'EntityNote' && c.source.kind === 'gmail');
  if (noteChanges.length > 0) {
    try {
      await prisma.$transaction(async (tx) => {
        await writeExternalMessageCaptures(noteChanges, noteIdMap, actorId, tx as never);
      });
    } catch {
      // Non-fatal
    }
  }

  return { results, appliedAt: new Date().toISOString() };
}

async function applyChange(
  change: PlannedChange,
  prisma: PrismaClient,
  nameToId: Map<string, string>,
  noteIdMap: Map<string, string>,
  actorId: string,
  actorName: string,
  results: WriteResult[]
): Promise<void> {
  // Safety check: never write to readonly tables
  if (READONLY_TABLES.includes(change.table as never)) {
    results.push({
      changeId: change.id,
      success: false,
      error: `Write to readonly table "${change.table}" is not permitted.`,
    });
    return;
  }

  try {
    const recordId = await writeRecord(change, prisma, nameToId, actorId, actorName);
    results.push({ changeId: change.id, success: true, recordId });

    // Track by label key for FK resolution
    if (change.operation === 'INSERT' && recordId) {
      nameToId.set(`${change.table}:${change.label}`, recordId);
      // Also track the primary entity name without parenthetical suffix
      const baseName = change.label.replace(/\s*\([^)]+\)$/, '').trim();
      nameToId.set(`${change.table}:${baseName}`, recordId);
    }

    if (change.table === 'EntityNote' && recordId) {
      noteIdMap.set(change.id, recordId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ changeId: change.id, success: false, error: msg });
  }
}

function diffToData(diffs: PlannedChange['diffs']): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const diff of diffs) {
    data[diff.field] = diff.now;
  }
  return data;
}

async function writeRecord(
  change: PlannedChange,
  prisma: PrismaClient,
  nameToId: Map<string, string>,
  actorId: string,
  actorName: string
): Promise<string> {
  const data = diffToData(change.diffs);
  const candidate = change._candidate;

  // ── Company ──────────────────────────────────────────────────────────────
  if (change.table === 'Company') {
    if (change.operation === 'INSERT') {
      const created = await (prisma as never as {
        company: { create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }> };
      }).company.create({
        data: {
          ...data,
          companyType: (data.companyType as string) || 'STARTUP',
          primaryCategory: (data.primaryCategory as string) || 'OTHER',
          leadSourceType: (data.leadSourceType as string) || 'OTHER',
          intakeStatus: 'NOT_SCHEDULED',
          researchStatus: 'DRAFT',
          researchUpdatedAt: new Date(),
        },
        select: { id: true },
      });
      return created.id;
    }
    if (change.operation === 'UPDATE' && change.existingId) {
      const updated = await (prisma.company as never as {
        update: (args: { where: { id: string }; data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>;
      }).update({ where: { id: change.existingId }, data, select: { id: true } });
      return updated.id;
    }
  }

  // ── CompanyPipeline ───────────────────────────────────────────────────────
  if (change.table === 'CompanyPipeline') {
    // Resolve companyId from the just-written Company
    const baseName = change.label.replace(/\s*—\s*Pipeline$/, '').trim();
    const companyId =
      change._resolvedId ||
      nameToId.get(`Company:${baseName}`) ||
      nameToId.get(`Company:${baseName} (Company)`);

    if (!companyId) throw new Error(`Cannot find parent company for pipeline: ${change.label}`);

    if (change.operation === 'INSERT') {
      const created = await (prisma as never as {
        companyPipeline: {
          create: (args: {
            data: Record<string, unknown>;
            select: { id: true };
          }) => Promise<{ id: string }>;
        };
      }).companyPipeline.create({
        data: {
          companyId,
          phase: (data.phase as string) || 'INTAKE',
          category: (data.category as string) || 'ACTIVE',
          ownerName: (data.ownerName as string) || null,
          leadSourceType: (data.leadSourceType as string) || null,
        },
        select: { id: true },
      });
      return created.id;
    }
    if (change.operation === 'UPDATE' && change.existingId) {
      const updated = await (prisma as never as {
        companyPipeline: {
          update: (args: {
            where: { companyId: string };
            data: Record<string, unknown>;
            select: { id: true };
          }) => Promise<{ id: string }>;
        };
      }).companyPipeline.update({
        where: { companyId },
        data,
        select: { id: true },
      });
      return updated.id;
    }
  }

  // ── HealthSystem ──────────────────────────────────────────────────────────
  if (change.table === 'HealthSystem') {
    if (change.operation === 'INSERT') {
      const created = await (prisma as never as {
        healthSystem: { create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }> };
      }).healthSystem.create({
        data: {
          ...data,
          isAllianceMember: (data.isAllianceMember as boolean) || false,
          isLimitedPartner: (data.isLimitedPartner as boolean) || false,
          researchStatus: 'DRAFT',
          researchUpdatedAt: new Date(),
        },
        select: { id: true },
      });
      return created.id;
    }
    if (change.operation === 'UPDATE' && change.existingId) {
      const updated = await (prisma.healthSystem as never as {
        update: (args: { where: { id: string }; data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>;
      }).update({ where: { id: change.existingId }, data, select: { id: true } });
      return updated.id;
    }
  }

  // ── CoInvestor ────────────────────────────────────────────────────────────
  if (change.table === 'CoInvestor') {
    if (change.operation === 'INSERT') {
      const created = await (prisma as never as {
        coInvestor: { create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }> };
      }).coInvestor.create({
        data: {
          ...data,
          isSeedInvestor: (data.isSeedInvestor as boolean) || false,
          isSeriesAInvestor: (data.isSeriesAInvestor as boolean) || false,
          researchStatus: 'DRAFT',
          researchUpdatedAt: new Date(),
        },
        select: { id: true },
      });
      return created.id;
    }
    if (change.operation === 'UPDATE' && change.existingId) {
      const updated = await (prisma.coInvestor as never as {
        update: (args: { where: { id: string }; data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>;
      }).update({ where: { id: change.existingId }, data, select: { id: true } });
      return updated.id;
    }
  }

  // ── Contact ───────────────────────────────────────────────────────────────
  if (change.table === 'Contact') {
    if (change.operation === 'INSERT') {
      const created = await (prisma.contact as never as {
        create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>;
      }).create({ data, select: { id: true } });

      // If candidate has affiliations, write contact links
      if (candidate && candidate.kind === 'Contact' && candidate.affiliations.length > 0) {
        for (const aff of candidate.affiliations) {
          const entityId = nameToId.get(`${aff.entityKind === 'HEALTH_SYSTEM' ? 'HealthSystem' : aff.entityKind === 'CO_INVESTOR' ? 'CoInvestor' : 'Company'}:${aff.entityName}`);
          if (!entityId) continue;
          if (aff.entityKind === 'HEALTH_SYSTEM') {
            await (prisma.contactHealthSystem as never as {
              upsert: (args: object) => Promise<unknown>;
            }).upsert({
              where: { contactId_healthSystemId_roleType: { contactId: created.id, healthSystemId: entityId, roleType: aff.roleType || 'EXECUTIVE' } },
              create: { contactId: created.id, healthSystemId: entityId, roleType: aff.roleType || 'EXECUTIVE', title: aff.title || null, isKeyAllianceContact: false, isInformedAllianceContact: false },
              update: { title: aff.title || null },
            });
          } else if (aff.entityKind === 'COMPANY') {
            await (prisma.contactCompany as never as {
              upsert: (args: object) => Promise<unknown>;
            }).upsert({
              where: { contactId_companyId_roleType: { contactId: created.id, companyId: entityId, roleType: aff.roleType || 'COMPANY_CONTACT' } },
              create: { contactId: created.id, companyId: entityId, roleType: aff.roleType || 'COMPANY_CONTACT', title: aff.title || null, isKeyAllianceContact: false, isInformedAllianceContact: false },
              update: { title: aff.title || null },
            });
          } else if (aff.entityKind === 'CO_INVESTOR') {
            await (prisma.contactCoInvestor as never as {
              upsert: (args: object) => Promise<unknown>;
            }).upsert({
              where: { contactId_coInvestorId_roleType: { contactId: created.id, coInvestorId: entityId, roleType: aff.roleType || 'PARTNER' } },
              create: { contactId: created.id, coInvestorId: entityId, roleType: aff.roleType || 'PARTNER', title: aff.title || null, isKeyAllianceContact: false, isInformedAllianceContact: false },
              update: { title: aff.title || null },
            });
          }
        }
      }

      return created.id;
    }
    if (change.operation === 'UPDATE' && change.existingId) {
      const updated = await (prisma.contact as never as {
        update: (args: { where: { id: string }; data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>;
      }).update({ where: { id: change.existingId }, data, select: { id: true } });
      return updated.id;
    }
  }

  // ── CompanyHealthSystemLink ───────────────────────────────────────────────
  if (change.table === 'CompanyHealthSystemLink' && candidate && candidate.kind === 'CompanyHealthSystemLink') {
    const companyId =
      change._resolvedId ||
      nameToId.get(`Company:${candidate.companyName}`) ||
      nameToId.get(`Company:${candidate.companyName} (Company)`);
    const healthSystemId =
      nameToId.get(`HealthSystem:${candidate.healthSystemName}`) ||
      nameToId.get(`HealthSystem:${candidate.healthSystemName} (Health System)`);

    if (!companyId || !healthSystemId) {
      throw new Error(`Cannot resolve IDs for link: ${candidate.companyName} ↔ ${candidate.healthSystemName}`);
    }

    // No @@unique on (companyId, healthSystemId) — use find-then-create/update
    const existingLink = await (prisma as never as {
      companyHealthSystemLink: { findFirst: (args: object) => Promise<{ id: string } | null> };
    }).companyHealthSystemLink.findFirst({ where: { companyId, healthSystemId } });

    if (existingLink) {
      await (prisma as never as {
        companyHealthSystemLink: { update: (args: object) => Promise<{ id: string }> };
      }).companyHealthSystemLink.update({
        where: { id: existingLink.id },
        data: {
          relationshipType: candidate.relationshipType || undefined,
          preliminaryInterest: candidate.preliminaryInterest || undefined,
          notes: candidate.notes || undefined,
        },
      });
      return existingLink.id;
    }

    const result = await (prisma as never as {
      companyHealthSystemLink: { create: (args: object) => Promise<{ id: string }> };
    }).companyHealthSystemLink.create({
      data: {
        companyId,
        healthSystemId,
        relationshipType: candidate.relationshipType || 'OTHER',
        preliminaryInterest: candidate.preliminaryInterest || null,
        notes: candidate.notes || null,
      },
    });
    return result.id;
  }

  // ── CompanyCoInvestorLink ─────────────────────────────────────────────────
  if (change.table === 'CompanyCoInvestorLink' && candidate && candidate.kind === 'CompanyCoInvestorLink') {
    const companyId =
      change._resolvedId ||
      nameToId.get(`Company:${candidate.companyName}`) ||
      nameToId.get(`Company:${candidate.companyName} (Company)`);
    const coInvestorId =
      nameToId.get(`CoInvestor:${candidate.coInvestorName}`) ||
      nameToId.get(`CoInvestor:${candidate.coInvestorName} (Co-Investor)`);

    if (!companyId || !coInvestorId) {
      throw new Error(`Cannot resolve IDs for link: ${candidate.companyName} ↔ ${candidate.coInvestorName}`);
    }

    // No @@unique on (companyId, coInvestorId) — use find-then-create/update
    const existingCiLink = await (prisma as never as {
      companyCoInvestorLink: { findFirst: (args: object) => Promise<{ id: string } | null> };
    }).companyCoInvestorLink.findFirst({ where: { companyId, coInvestorId } });

    if (existingCiLink) {
      await (prisma as never as {
        companyCoInvestorLink: { update: (args: object) => Promise<{ id: string }> };
      }).companyCoInvestorLink.update({
        where: { id: existingCiLink.id },
        data: {
          relationshipType: candidate.relationshipType || undefined,
          notes: candidate.notes || undefined,
        },
      });
      return existingCiLink.id;
    }

    const result = await (prisma as never as {
      companyCoInvestorLink: { create: (args: object) => Promise<{ id: string }> };
    }).companyCoInvestorLink.create({
      data: {
        companyId,
        coInvestorId,
        relationshipType: candidate.relationshipType || 'OTHER',
        notes: candidate.notes || null,
      },
    });
    return result.id;
  }

  // ── EntityNote ────────────────────────────────────────────────────────────
  if (change.table === 'EntityNote' && candidate && candidate.kind === 'EntityNote') {
    const entityKindMap: Record<string, string> = {
      COMPANY: 'COMPANY',
      HEALTH_SYSTEM: 'HEALTH_SYSTEM',
      CO_INVESTOR: 'CO_INVESTOR',
      CONTACT: 'CONTACT',
    };
    const entityKind = entityKindMap[candidate.entityKind];
    if (!entityKind) throw new Error(`Invalid entityKind: ${candidate.entityKind}`);

    // Try to find the entity id
    const tableForKind: Record<string, string> = {
      COMPANY: 'Company',
      HEALTH_SYSTEM: 'HealthSystem',
      CO_INVESTOR: 'CoInvestor',
      CONTACT: 'Contact',
    };
    const tableKey = tableForKind[candidate.entityKind];
    const entityId =
      nameToId.get(`${tableKey}:${candidate.entityName}`) ||
      nameToId.get(`${tableKey}:${candidate.entityName} (${tableKey})`);

    if (!entityId) throw new Error(`Cannot find entity id for note target: ${candidate.entityName}`);

    const created = await (prisma.entityNote as never as {
      create: (args: { data: Record<string, unknown>; select: { id: true } }) => Promise<{ id: string }>;
    }).create({
      data: {
        entityKind,
        entityId,
        note: candidate.note,
        affiliations: candidate.affiliationsJson || null,
        createdByUserId: actorId,
        createdByName: actorName,
      },
      select: { id: true },
    });
    return created.id;
  }

  // ── CompanyOpportunity ────────────────────────────────────────────────────
  if (change.table === 'CompanyOpportunity' && candidate && candidate.kind === 'CompanyOpportunity') {
    const companyId =
      change._resolvedId ||
      nameToId.get(`Company:${candidate.companyName}`) ||
      nameToId.get(`Company:${candidate.companyName} (Company)`);
    const healthSystemId = candidate.healthSystemName
      ? (nameToId.get(`HealthSystem:${candidate.healthSystemName}`) ||
         nameToId.get(`HealthSystem:${candidate.healthSystemName} (Health System)`) ||
         null)
      : null;

    if (!companyId) throw new Error(`Cannot find company for opportunity: ${candidate.companyName}`);

    const newId = crypto.randomUUID();

    if (change.operation === 'INSERT') {
      await (prisma as never as {
        companyOpportunity: { create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }> };
      }).companyOpportunity.create({
        data: {
          id: newId,
          companyId,
          healthSystemId,
          title: candidate.title,
          type: candidate.type || 'PROSPECT_PURSUIT',
          stage: candidate.stage || 'IDENTIFIED',
          notes: candidate.notes || null,
        },
      });

      // Mirror to HealthSystemOpportunity
      await (prisma as never as {
        healthSystemOpportunity: { upsert: (args: object) => Promise<unknown> };
      }).healthSystemOpportunity.upsert({
        where: { id: newId },
        create: {
          id: newId,
          legacyCompanyOpportunityId: newId,
          companyId,
          healthSystemId,
          type: candidate.type || 'PROSPECT_PURSUIT',
          title: candidate.title,
          stage: candidate.stage || 'IDENTIFIED',
          notes: candidate.notes || null,
        },
        update: {
          legacyCompanyOpportunityId: newId,
          companyId,
          healthSystemId,
          type: candidate.type || 'PROSPECT_PURSUIT',
          title: candidate.title,
          stage: candidate.stage || 'IDENTIFIED',
          notes: candidate.notes || null,
        },
      });

      return newId;
    }

    if (change.operation === 'UPDATE' && change.existingId) {
      await (prisma as never as {
        companyOpportunity: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<{ id: string }> };
      }).companyOpportunity.update({ where: { id: change.existingId }, data });

      // Mirror update
      await (prisma as never as {
        healthSystemOpportunity: { update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown> };
      }).healthSystemOpportunity.update({ where: { id: change.existingId }, data }).catch(() => undefined);

      return change.existingId;
    }
  }

  throw new Error(`Unhandled table/operation: ${change.table} / ${change.operation}`);
}
