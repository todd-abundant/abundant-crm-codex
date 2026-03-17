import type { Prisma } from '@prisma/client';
import type { CandidateCoInvestor, ResolvedRecord } from '../types';
import { ENTITY_ALIASES } from '../index';

function normalizeCoInvestorName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeWebsite(value?: string | null): string {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(withProtocol);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

export async function resolveCoInvestor(
  candidate: CandidateCoInvestor,
  tx: Prisma.TransactionClient
): Promise<ResolvedRecord> {
  const aliasKey = normalizeCoInvestorName(candidate.name);
  const resolvedName = ENTITY_ALIASES[aliasKey] || candidate.name;

  // 1. Exact normalized name
  const byName = await tx.coInvestor.findFirst({
    where: { name: { mode: 'insensitive', equals: resolvedName } },
  });
  if (byName) {
    return {
      candidate,
      status: 'RESOLVED_EXISTING',
      existingId: byName.id,
      existingRecord: byName as object,
    };
  }

  // 2. Alias variants
  const aliasVariants = Object.entries(ENTITY_ALIASES)
    .filter(([, v]) => v.toLowerCase() === resolvedName.toLowerCase())
    .map(([k]) => k);

  for (const variant of aliasVariants) {
    const byAlias = await tx.coInvestor.findFirst({
      where: { name: { mode: 'insensitive', equals: variant } },
    });
    if (byAlias) {
      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: byAlias.id,
        existingRecord: byAlias as object,
      };
    }
  }

  // 3. Website domain match
  const candidateDomain = normalizeWebsite(candidate.website);
  if (candidateDomain) {
    const pool = await tx.coInvestor.findMany({
      where: { website: { not: null } },
      select: { id: true, name: true, website: true },
      take: 200,
    });
    for (const ci of pool) {
      if (normalizeWebsite(ci.website) === candidateDomain) {
        const full = await tx.coInvestor.findUnique({ where: { id: ci.id } });
        return {
          candidate,
          status: 'RESOLVED_EXISTING',
          existingId: ci.id,
          existingRecord: (full || ci) as object,
        };
      }
    }
  }

  return { candidate, status: 'RESOLVED_NEW' };
}
