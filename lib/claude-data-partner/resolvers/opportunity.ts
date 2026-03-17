import type { Prisma } from '@prisma/client';
import type { CandidateOpportunity, ResolvedRecord } from '../types';

export async function resolveOpportunity(
  candidate: CandidateOpportunity,
  companyId: string | null,
  healthSystemId: string | null,
  tx: Prisma.TransactionClient
): Promise<ResolvedRecord> {
  if (!companyId) {
    return { candidate, status: 'RESOLVED_NEW' };
  }

  // Match on (companyId, healthSystemId, type) — logical unique key
  const existing = await tx.companyOpportunity.findFirst({
    where: {
      companyId,
      ...(healthSystemId ? { healthSystemId } : {}),
      type: candidate.type as never,
    },
  });

  if (existing) {
    return {
      candidate,
      status: 'RESOLVED_EXISTING',
      existingId: existing.id,
      existingRecord: existing as object,
    };
  }

  return { candidate, status: 'RESOLVED_NEW' };
}
