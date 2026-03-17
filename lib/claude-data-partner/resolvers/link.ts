import type { Prisma } from '@prisma/client';
import type { CandidateLink, ResolvedRecord } from '../types';

export async function resolveLink(
  candidate: CandidateLink,
  companyId: string | null,
  otherEntityId: string | null,
  tx: Prisma.TransactionClient
): Promise<ResolvedRecord> {
  if (!companyId || !otherEntityId) {
    return { candidate, status: 'RESOLVED_NEW' };
  }

  if (candidate.kind === 'CompanyHealthSystemLink') {
    const existing = await tx.companyHealthSystemLink.findFirst({
      where: { companyId, healthSystemId: otherEntityId },
    });

    if (existing) {
      const hasDiffs =
        (candidate.relationshipType && existing.relationshipType !== candidate.relationshipType) ||
        (candidate.preliminaryInterest && existing.preliminaryInterest !== candidate.preliminaryInterest) ||
        (candidate.notes && existing.notes !== candidate.notes);

      if (!hasDiffs) {
        return { candidate, status: 'SKIPPED', existingId: existing.id, existingRecord: existing as object };
      }

      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: existing.id,
        existingRecord: existing as object,
      };
    }

    return { candidate, status: 'RESOLVED_NEW' };
  }

  if (candidate.kind === 'CompanyCoInvestorLink') {
    const existing = await tx.companyCoInvestorLink.findFirst({
      where: { companyId, coInvestorId: otherEntityId },
    });

    if (existing) {
      const hasDiffs =
        (candidate.relationshipType && existing.relationshipType !== candidate.relationshipType) ||
        (candidate.notes && existing.notes !== candidate.notes);

      if (!hasDiffs) {
        return { candidate, status: 'SKIPPED', existingId: existing.id, existingRecord: existing as object };
      }

      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: existing.id,
        existingRecord: existing as object,
      };
    }

    return { candidate, status: 'RESOLVED_NEW' };
  }

  return { candidate, status: 'RESOLVED_NEW' };
}
