import type { PrismaClient } from '@prisma/client';
import type {
  CandidateRecord,
  CandidateSet,
  ChangeSet,
  ResolvedRecord,
  WriteLog,
  CandidateContact,
  CandidateCompany,
  CandidateHealthSystem,
  CandidateCoInvestor,
  CandidateLink,
} from './types';
import { resolveContact } from './resolvers/contact';
import { resolveCompany } from './resolvers/company';
import { resolveHealthSystem } from './resolvers/health-system';
import { resolveCoInvestor } from './resolvers/co-investor';
import { resolveOpportunity } from './resolvers/opportunity';
import { resolveLink } from './resolvers/link';
import { plan } from './planner/index';
import { applyChanges } from './writer/index';
import { extractFromFreeText } from './sources/freetext';

// ─── Module configuration ─────────────────────────────────────────────────────

/**
 * Alias table for health system and co-investor name normalization.
 * Keys are lowercase; values are canonical CRM names.
 */
export const ENTITY_ALIASES: Record<string, string> = {
  'innovation institute': 'Inneo',
  'the innovation institute': 'Inneo',
  'inneo health': 'Inneo',
  'medstar': 'MedStar Health',
  'henry ford': 'Henry Ford Health',
  // add more aliases as needed
};

/**
 * Tables the module will never write to (safety guardrail).
 * Writer throws if a PlannedChange targets any of these.
 */
export const READONLY_TABLES = [
  'CompanyResearchJob',
  'HealthSystemResearchJob',
  'CoInvestorResearchJob',
  'CompanySignalEvent',
  'HealthSystemSignalEvent',
  'CoInvestorSignalEvent',
  'ContactSignalEvent',
  'CompanyScreeningSurveySession',
  'CompanyScreeningSurveySubmission',
  'CompanyScreeningSurveyAnswer',
  'CompanyReport',
  'StakeholderSignalsDigestDispatch',
] as const;

// ─── Resolution orchestrator ──────────────────────────────────────────────────

/**
 * Resolves all candidates in a CandidateSet against the live database.
 * Returns a list of ResolvedRecord objects for the planner.
 */
async function resolveCandidates(
  candidateSet: CandidateSet,
  prisma: PrismaClient
): Promise<ResolvedRecord[]> {
  const resolved: ResolvedRecord[] = [];

  // Build a quick name-to-id lookup for entities resolved earlier in this pass
  const nameToId = new Map<string, string>();

  // Sort candidates by dependency tier so we resolve parents before children
  const tierOrder = (c: CandidateRecord): number => {
    if (c.kind === 'HealthSystem' || c.kind === 'CoInvestor') return 0;
    if (c.kind === 'Company') return 1;
    if (c.kind === 'Contact') return 2;
    if (c.kind === 'CompanyHealthSystemLink' || c.kind === 'CompanyCoInvestorLink') return 3;
    if (c.kind === 'CompanyOpportunity') return 4;
    return 5;
  };

  const sorted = [...candidateSet.candidates].sort((a, b) => tierOrder(a) - tierOrder(b));

  for (const candidate of sorted) {
    let result: ResolvedRecord;

    try {
      result = await prisma.$transaction(async (tx) => {
        if (candidate.kind === 'Contact') {
          return resolveContact(candidate as CandidateContact, tx);
        }
        if (candidate.kind === 'Company') {
          return resolveCompany(candidate as CandidateCompany, tx);
        }
        if (candidate.kind === 'HealthSystem') {
          return resolveHealthSystem(candidate as CandidateHealthSystem, tx);
        }
        if (candidate.kind === 'CoInvestor') {
          return resolveCoInvestor(candidate as CandidateCoInvestor, tx);
        }
        if (candidate.kind === 'CompanyHealthSystemLink' || candidate.kind === 'CompanyCoInvestorLink') {
          const c = candidate as CandidateLink;
          const companyId = nameToId.get(`Company:${c.companyName}`) || null;
          const otherEntityId =
            c.kind === 'CompanyHealthSystemLink'
              ? nameToId.get(`HealthSystem:${c.healthSystemName}`) || null
              : nameToId.get(`CoInvestor:${c.coInvestorName}`) || null;
          return resolveLink(c, companyId, otherEntityId, tx);
        }
        if (candidate.kind === 'CompanyOpportunity') {
          const companyId = nameToId.get(`Company:${candidate.companyName}`) || null;
          const healthSystemId = candidate.healthSystemName
            ? nameToId.get(`HealthSystem:${candidate.healthSystemName}`) || null
            : null;
          return resolveOpportunity(candidate, companyId, healthSystemId, tx);
        }
        // EntityNote — always new
        return { candidate, status: 'RESOLVED_NEW' as const };
      });
    } catch (err) {
      // On resolution error, emit as RESOLVED_NEW with a warning note
      result = { candidate, status: 'RESOLVED_NEW' };
      console.error('[claude-data-partner] Resolution error:', err);
    }

    resolved.push(result);

    // Track resolved IDs for FK resolution within the same CandidateSet
    if (result.existingId) {
      if (candidate.kind === 'Company' && 'name' in candidate) {
        nameToId.set(`Company:${candidate.name}`, result.existingId);
      } else if (candidate.kind === 'HealthSystem' && 'name' in candidate) {
        nameToId.set(`HealthSystem:${candidate.name}`, result.existingId);
      } else if (candidate.kind === 'CoInvestor' && 'name' in candidate) {
        nameToId.set(`CoInvestor:${candidate.name}`, result.existingId);
      } else if (candidate.kind === 'Contact' && 'name' in candidate) {
        nameToId.set(`Contact:${candidate.name}`, result.existingId);
      }
    }
  }

  return resolved;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Runs the ambient scan pipeline:
 * 1. Merges CandidateSets from all sources.
 * 2. Resolves all candidates against the live DB.
 * 3. Plans a ChangeSet.
 * Returns the ChangeSet for user review before any writes.
 */
export async function runAmbientScan(opts: {
  candidateSets: CandidateSet[];
  prisma: PrismaClient;
}): Promise<ChangeSet> {
  const { candidateSets, prisma } = opts;

  // Merge all candidate sets into one
  const merged: CandidateSet = {
    candidates: candidateSets.flatMap((s) => s.candidates),
    sourceWindow: {
      start: candidateSets[0]?.sourceWindow.start || new Date().toISOString(),
      end: candidateSets[candidateSets.length - 1]?.sourceWindow.end || new Date().toISOString(),
    },
    extractedAt: new Date().toISOString(),
  };

  const resolved = await resolveCandidates(merged, prisma);
  return plan(resolved);
}

/**
 * Runs the free-text command pipeline:
 * 1. Parses the command into a CandidateSet.
 * 2. Resolves candidates.
 * 3. Plans a ChangeSet.
 */
export async function runFreetextCommand(opts: {
  input: string;
  prisma: PrismaClient;
}): Promise<ChangeSet> {
  const candidateSet = await extractFromFreeText(opts.input);
  const resolved = await resolveCandidates(candidateSet, opts.prisma);
  return plan(resolved);
}

/**
 * Applies an approved ChangeSet to the database.
 */
export async function applyChangeSet(opts: {
  changeSet: ChangeSet;
  prisma: PrismaClient;
  actorId: string;
  actorName: string;
}): Promise<WriteLog> {
  return applyChanges(opts.changeSet, opts.prisma, opts.actorId, opts.actorName);
}
