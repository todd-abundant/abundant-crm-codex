import type { Prisma } from '@prisma/client';
import type { CandidateCompany, ResolvedRecord } from '../types';

// Strip common legal suffixes before comparison
const LEGAL_SUFFIXES = /\s+(inc\.?|llc\.?|corp\.?|ltd\.?|co\.?|health|technologies|solutions|systems|platform|platforms|ai|bio|medical|medtech|labs|lab|group|global|digital|care)$/gi;

export function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWebsite(value?: string | null): string {
  const trimmed = (value || '').trim().toLowerCase();
  if (!trimmed) return '';
  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/g, '');
    return `${host}${path || ''}`;
  } catch {
    return trimmed
      .replace(/^https?:\/\/(www\.)?/, '')
      .replace(/\/+$/g, '')
      .replace(/\/+/, '/');
  }
}

export async function resolveCompany(
  candidate: CandidateCompany,
  tx: Prisma.TransactionClient
): Promise<ResolvedRecord> {
  const normalizedCandidate = normalizeCompanyName(candidate.name);

  // Pull all companies with similar name (case-insensitive)
  const pool = await tx.company.findMany({
    where: { name: { mode: 'insensitive', contains: normalizedCandidate.split(' ')[0] || candidate.name } },
    select: {
      id: true,
      name: true,
      website: true,
      headquartersCity: true,
      headquartersState: true,
    },
    take: 50,
  });

  for (const existing of pool) {
    const normalizedExisting = normalizeCompanyName(existing.name);
    if (normalizedCandidate !== normalizedExisting) continue;

    // Name matches — check website or location
    const candidateWebsite = normalizeWebsite(candidate.website);
    const existingWebsite = normalizeWebsite(existing.website);
    if (candidateWebsite && existingWebsite && candidateWebsite === existingWebsite) {
      const full = await tx.company.findUnique({ where: { id: existing.id } });
      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: existing.id,
        existingRecord: (full || existing) as object,
      };
    }

    const candidateCity = (candidate.hqCity || '').trim().toLowerCase();
    const candidateState = (candidate.hqState || '').trim().toLowerCase();
    const existingCity = (existing.headquartersCity || '').trim().toLowerCase();
    const existingState = (existing.headquartersState || '').trim().toLowerCase();

    const parts: Array<[string, string]> = [
      [candidateCity, existingCity],
      [candidateState, existingState],
    ].filter(([a, b]) => a || b) as Array<[string, string]>;

    if (parts.length > 0 && parts.every(([a, b]) => a === b)) {
      const full = await tx.company.findUnique({ where: { id: existing.id } });
      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: existing.id,
        existingRecord: (full || existing) as object,
      };
    }

    // Name-only match with no disambiguating info
    if (!candidateWebsite && !candidateCity && !candidateState) {
      const full = await tx.company.findUnique({ where: { id: existing.id } });
      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: existing.id,
        existingRecord: (full || existing) as object,
      };
    }
  }

  return { candidate, status: 'RESOLVED_NEW' };
}
