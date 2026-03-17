import type { Prisma } from '@prisma/client';
import type { CandidateContact, ResolvedRecord } from '../types';

function normalizeForComparison(value?: string | null): string {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeEmail(value?: string | null): string | null {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : null;
}

function normalizeLinkedinUrl(value?: string | null): string | null {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/+$/g, '');
    return `https://${host}${path || ''}`;
  } catch {
    return trimmed.toLowerCase().replace(/\/+$/g, '');
  }
}

const nicknameGroups = [
  ['william', ['bill', 'billy', 'will', 'willy', 'liam']],
  ['robert', ['bob', 'bobby', 'rob', 'robbie']],
  ['richard', ['rick', 'ricky', 'rich', 'dick']],
  ['margaret', ['maggie', 'meg', 'peggy']],
  ['elizabeth', ['liz', 'beth', 'lizzie', 'eliza']],
  ['james', ['jim', 'jimmy']],
  ['joseph', ['joe', 'joey']],
  ['michael', ['mike', 'mikey']],
  ['andrew', ['andy', 'drew']],
  ['katherine', ['kate', 'katie', 'kathy', 'kat']],
  ['christopher', ['chris']],
  ['daniel', ['dan', 'danny']],
  ['anthony', ['tony']],
  ['steven', ['steve']],
  ['thomas', ['tom', 'tommy']],
  ['alexander', ['alex', 'xander']],
  ['john', ['johnny', 'jack']],
  ['edward', ['ed', 'eddie', 'ted', 'teddy']],
] as const;

const nicknameMap = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of nicknameGroups) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(alias, canonical);
    }
  }
  return map;
})();

function canonicalizeFirstName(name: string): string {
  return nicknameMap.get(name) || name;
}

type ParsedName = {
  normalizedFull: string;
  firstName: string;
  lastName: string;
  canonicalFirstName: string;
};

function parseName(input: string): ParsedName {
  const normalizedFull = normalizeForComparison(input);
  const parts = normalizedFull.split(' ').filter(Boolean);
  const firstName = parts[0] || '';
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const canonicalFirstName = canonicalizeFirstName(firstName);
  return { normalizedFull, firstName, lastName, canonicalFirstName };
}

function scoreNameMatch(candidate: ParsedName, existingName: string | null | undefined): number {
  if (!existingName) return 0;
  const existing = parseName(existingName);
  if (!candidate.normalizedFull || !existing.normalizedFull) return 0;
  if (candidate.normalizedFull === existing.normalizedFull) return 0.95;

  const lastMatches = candidate.lastName && existing.lastName && candidate.lastName === existing.lastName;
  const firstMatches = candidate.firstName && existing.firstName && candidate.firstName === existing.firstName;
  const canonicalFirstMatches =
    candidate.canonicalFirstName && existing.canonicalFirstName && candidate.canonicalFirstName === existing.canonicalFirstName;
  const initialMatches =
    candidate.firstName && existing.firstName && candidate.firstName.charAt(0) === existing.firstName.charAt(0);

  if (lastMatches && firstMatches) return 0.93;
  if (lastMatches && canonicalFirstMatches) return 0.88;
  if (lastMatches && initialMatches) return 0.8;
  if (canonicalFirstMatches && candidate.lastName && !existing.lastName) return 0.74;
  if (canonicalFirstMatches) return 0.7;
  return 0;
}

function scoreTitleMatch(candidateTitle: string | null | undefined, existingTitle: string | null | undefined): number {
  const a = normalizeForComparison(candidateTitle);
  const b = normalizeForComparison(existingTitle);
  if (!a || !b) return 0;
  if (a === b) return 0.08;
  const tokensA = new Set(a.split(' ').filter(Boolean));
  const tokensB = new Set(b.split(' ').filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }
  const ratio = overlap / Math.max(tokensA.size, tokensB.size);
  return ratio >= 0.5 ? 0.05 : 0;
}

export async function resolveContact(
  candidate: CandidateContact,
  tx: Prisma.TransactionClient
): Promise<ResolvedRecord> {
  const email = normalizeEmail(candidate.email);
  const linkedinUrl = normalizeLinkedinUrl(candidate.linkedinUrl);

  // 1. Exact match by LinkedIn URL
  if (linkedinUrl) {
    const match = await tx.contact.findFirst({ where: { linkedinUrl } });
    if (match) {
      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: match.id,
        existingRecord: match as object,
      };
    }
  }

  // 2. Exact match by email
  if (email) {
    const match = await tx.contact.findFirst({ where: { email } });
    if (match) {
      return {
        candidate,
        status: 'RESOLVED_EXISTING',
        existingId: match.id,
        existingRecord: match as object,
      };
    }
  }

  // 3. Fuzzy name match
  const parsed = parseName(candidate.name);
  if (!parsed.normalizedFull) {
    return { candidate, status: 'RESOLVED_NEW' };
  }

  const pool = await tx.contact.findMany({
    where: {
      OR: [
        { name: { equals: candidate.name, mode: 'insensitive' } },
        ...(parsed.lastName ? [{ name: { contains: parsed.lastName, mode: 'insensitive' as const } }] : []),
        { name: { contains: parsed.firstName, mode: 'insensitive' } },
      ],
    },
    take: 50,
  });

  let best: { record: (typeof pool)[number]; score: number } | null = null;
  for (const existing of pool) {
    const nameScore = scoreNameMatch(parsed, existing.name);
    if (nameScore <= 0) continue;
    const titleScore = scoreTitleMatch(candidate.title, existing.title);
    const score = nameScore + titleScore;
    if (!best || score > best.score) {
      best = { record: existing, score };
    }
  }

  if (!best) return { candidate, status: 'RESOLVED_NEW' };

  // Multiple plausible matches → AMBIGUOUS
  const plausible = pool.filter((p) => {
    const s = scoreNameMatch(parsed, p.name) + scoreTitleMatch(candidate.title, p.title);
    return s > 0.5 && p.id !== best!.record.id;
  });

  if (plausible.length > 0 && best.score < 0.88) {
    return {
      candidate,
      status: 'AMBIGUOUS',
      ambiguousCandidates: [
        { id: best.record.id, label: `${best.record.name}${best.record.title ? ` — ${best.record.title}` : ''}` },
        ...plausible.map((p) => ({
          id: p.id,
          label: `${p.name}${p.title ? ` — ${p.title}` : ''}`,
        })),
      ],
    };
  }

  if (best.score >= 0.75) {
    return {
      candidate,
      status: 'RESOLVED_EXISTING',
      existingId: best.record.id,
      existingRecord: best.record as object,
    };
  }

  return { candidate, status: 'RESOLVED_NEW' };
}
