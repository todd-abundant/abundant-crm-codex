import { prisma } from "@/lib/db";
import { replaceHealthSystemContactLinks } from "@/lib/contact-links";
import { enrichHealthSystemFromWeb } from "@/lib/research";
import type { HealthSystemSearchCandidate } from "@/lib/schemas";

function parseOptionalDate(value?: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function trimOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeWebsite(value?: string | null) {
  const trimmed = (value || "").trim().toLowerCase();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    const url = new URL(withProtocol);
    const host = url.hostname.replace(/^www\./, "");
    const path = url.pathname.replace(/\/+$/g, "");
    return `${host}${path || ""}`;
  } catch {
    return trimmed
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/\/+$/g, "")
      .replace(/\/+/g, "/");
  }
}

function isLikelyDuplicateCandidate(
  existing: {
    name: string;
    headquartersCity: string | null;
    headquartersState: string | null;
    headquartersCountry: string | null;
    website: string | null;
  },
  candidate: HealthSystemSearchCandidate
) {
  const candidateName = normalizeText(candidate.name);
  const existingName = normalizeText(existing.name);
  if (!candidateName || candidateName !== existingName) return false;

  const candidateWebsite = normalizeWebsite(candidate.website);
  const existingWebsite = normalizeWebsite(existing.website);
  if (candidateWebsite && existingWebsite && candidateWebsite === existingWebsite) return true;

  const candidateCity = normalizeText(candidate.headquartersCity);
  const candidateState = normalizeText(candidate.headquartersState);
  const candidateCountry = normalizeText(candidate.headquartersCountry);
  const existingCity = normalizeText(existing.headquartersCity);
  const existingState = normalizeText(existing.headquartersState);
  const existingCountry = normalizeText(existing.headquartersCountry);

  const locationParts = [
    [candidateCity, existingCity],
    [candidateState, existingState],
    [candidateCountry, existingCountry]
  ] as const;

  const comparableParts = locationParts.filter(([candidateValue, existingValue]) => candidateValue || existingValue);
  if (comparableParts.length === 0) return false;

  return comparableParts.every(([candidateValue, existingValue]) => candidateValue === existingValue);
}

export async function verifyCandidateAndQueueResearch(params: {
  candidate: HealthSystemSearchCandidate;
  isLimitedPartner: boolean;
  isAllianceMember: boolean;
  limitedPartnerInvestmentUsd?: number | null;
}) {
  const { candidate, isLimitedPartner, isAllianceMember, limitedPartnerInvestmentUsd } = params;

  const result = await prisma.$transaction(async (tx) => {
    const existingHealthSystems = await tx.healthSystem.findMany({
      where: { name: { mode: "insensitive", equals: candidate.name } },
      select: {
        id: true,
        name: true,
        headquartersCity: true,
        headquartersState: true,
        headquartersCountry: true,
        website: true
      }
    });

    const duplicate = existingHealthSystems.find((healthSystem) =>
      isLikelyDuplicateCandidate(healthSystem, candidate)
    );

    if (duplicate) {
      throw new Error(
        `Duplicate health system: "${duplicate.name}" already exists for ${formatLocationForDuplicateMessage(duplicate)}.`
      );
    }

    const healthSystem = await tx.healthSystem.create({
      data: {
        name: candidate.name,
        website: trimOrNull(candidate.website),
        headquartersCity: trimOrNull(candidate.headquartersCity),
        headquartersState: trimOrNull(candidate.headquartersState),
        headquartersCountry: trimOrNull(candidate.headquartersCountry),
        isLimitedPartner,
        limitedPartnerInvestmentUsd: isLimitedPartner ? (limitedPartnerInvestmentUsd ?? null) : null,
        isAllianceMember,
        researchStatus: "QUEUED",
        researchNotes: trimOrNull(candidate.summary),
        researchError: null,
        researchUpdatedAt: new Date()
      }
    });

    const job = await tx.healthSystemResearchJob.create({
      data: {
        healthSystemId: healthSystem.id,
        status: "QUEUED",
        searchName: candidate.name,
        selectedCity: trimOrNull(candidate.headquartersCity),
        selectedState: trimOrNull(candidate.headquartersState),
        selectedCountry: trimOrNull(candidate.headquartersCountry),
        selectedWebsite: trimOrNull(candidate.website)
      }
    });

    return { healthSystem, job };
  });

  return result;
}

function formatLocationForDuplicateMessage(candidate: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  const formatted = [
    candidate.headquartersCity,
    candidate.headquartersState,
    candidate.headquartersCountry
  ]
    .filter(Boolean)
    .join(", ");

  return formatted || "same name and website";
}

export async function queueResearchForHealthSystem(healthSystemId: string) {
  const existing = await prisma.healthSystem.findUnique({
    where: { id: healthSystemId }
  });

  if (!existing) {
    throw new Error("Health system not found");
  }

  return prisma.$transaction(async (tx) => {
    const healthSystem = await tx.healthSystem.update({
      where: { id: healthSystemId },
      data: {
        researchStatus: "QUEUED",
        researchError: null,
        researchUpdatedAt: new Date()
      }
    });

    const job = await tx.healthSystemResearchJob.create({
      data: {
        healthSystemId,
        status: "QUEUED",
        searchName: existing.name,
        selectedCity: trimOrNull(existing.headquartersCity),
        selectedState: trimOrNull(existing.headquartersState),
        selectedCountry: trimOrNull(existing.headquartersCountry),
        selectedWebsite: trimOrNull(existing.website)
      }
    });

    return { healthSystem, job };
  });
}

export async function runQueuedResearchJobs(
  maxJobs = 1,
  options?: { healthSystemId?: string }
) {
  const jobs = await prisma.healthSystemResearchJob.findMany({
    where: {
      status: "QUEUED",
      ...(options?.healthSystemId ? { healthSystemId: options.healthSystemId } : {})
    },
    include: { healthSystem: true },
    orderBy: { createdAt: "asc" },
    take: maxJobs
  });

  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    await prisma.healthSystemResearchJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date(), errorMessage: null }
    });

    await prisma.healthSystem.update({
      where: { id: job.healthSystemId },
      data: { researchStatus: "RUNNING", researchError: null }
    });

    try {
      const enriched = await enrichHealthSystemFromWeb({
        name: job.searchName || job.healthSystem.name,
        website: job.selectedWebsite || job.healthSystem.website,
        headquartersCity: job.selectedCity || job.healthSystem.headquartersCity,
        headquartersState: job.selectedState || job.healthSystem.headquartersState,
        headquartersCountry: job.selectedCountry || job.healthSystem.headquartersCountry
      });

      const keepLpFlag = job.healthSystem.isLimitedPartner || enriched.isLimitedPartner;
      const keepAllianceFlag = job.healthSystem.isAllianceMember || enriched.isAllianceMember;

      await prisma.$transaction(async (tx) => {
        await tx.executive.deleteMany({ where: { healthSystemId: job.healthSystemId } });
        await tx.venturePartner.deleteMany({ where: { healthSystemId: job.healthSystemId } });
        await tx.healthSystemInvestment.deleteMany({ where: { healthSystemId: job.healthSystemId } });

        await tx.healthSystem.update({
          where: { id: job.healthSystemId },
          data: {
            name: trimOrNull(enriched.name) || job.healthSystem.name,
            legalName: trimOrNull(enriched.legalName),
            website: trimOrNull(enriched.website) || job.healthSystem.website,
            headquartersCity: trimOrNull(enriched.headquartersCity) || job.healthSystem.headquartersCity,
            headquartersState: trimOrNull(enriched.headquartersState) || job.healthSystem.headquartersState,
            headquartersCountry:
              trimOrNull(enriched.headquartersCountry) || job.healthSystem.headquartersCountry,
            netPatientRevenueUsd: enriched.netPatientRevenueUsd ?? null,
            isLimitedPartner: keepLpFlag,
            limitedPartnerInvestmentUsd: keepLpFlag
              ? (enriched.limitedPartnerInvestmentUsd ?? job.healthSystem.limitedPartnerInvestmentUsd)
              : null,
            isAllianceMember: keepAllianceFlag,
            hasInnovationTeam: enriched.hasInnovationTeam ?? null,
            hasVentureTeam: enriched.hasVentureTeam ?? null,
            ventureTeamSummary: trimOrNull(enriched.ventureTeamSummary),
            researchStatus: "COMPLETED",
            researchError: null,
            researchNotes: trimOrNull(enriched.researchNotes),
            researchUpdatedAt: new Date()
          }
        });

        await tx.healthSystemResearchJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: new Date(), errorMessage: null }
        });

        if (enriched.executives.length > 0) {
          await tx.executive.createMany({
            data: enriched.executives.map((entry) => ({
              healthSystemId: job.healthSystemId,
              name: entry.name,
              title: trimOrNull(entry.title),
              linkedinUrl: trimOrNull(entry.url)
            }))
          });
        }

        if (enriched.venturePartners.length > 0) {
          await tx.venturePartner.createMany({
            data: enriched.venturePartners.map((entry) => ({
              healthSystemId: job.healthSystemId,
              name: entry.name,
              title: trimOrNull(entry.title),
              profileUrl: trimOrNull(entry.url)
            }))
          });
        }

        if (enriched.investments.length > 0) {
          await tx.healthSystemInvestment.createMany({
            data: enriched.investments.map((entry) => ({
              healthSystemId: job.healthSystemId,
              portfolioCompanyName: entry.portfolioCompanyName,
              investmentAmountUsd: entry.investmentAmountUsd ?? null,
              investmentDate: parseOptionalDate(entry.investmentDate),
              leadPartnerName: trimOrNull(entry.leadPartnerName),
              sourceUrl: trimOrNull(entry.sourceUrl)
            }))
          });
        }

        await replaceHealthSystemContactLinks(tx, job.healthSystemId, [
          ...enriched.executives.map((entry) => ({
            name: entry.name,
            title: trimOrNull(entry.title),
            email: trimOrNull(entry.email),
            phone: trimOrNull(entry.phone),
            linkedinUrl: trimOrNull(entry.url),
            roleType: "EXECUTIVE" as const
          })),
          ...enriched.venturePartners.map((entry) => ({
            name: entry.name,
            title: trimOrNull(entry.title),
            email: trimOrNull(entry.email),
            phone: trimOrNull(entry.phone),
            linkedinUrl: trimOrNull(entry.url),
            roleType: "VENTURE_PARTNER" as const
          }))
        ]);
      });
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown research failure";

      await prisma.$transaction([
        prisma.healthSystemResearchJob.update({
          where: { id: job.id },
          data: { status: "FAILED", completedAt: new Date(), errorMessage: message.slice(0, 900) }
        }),
        prisma.healthSystem.update({
          where: { id: job.healthSystemId },
          data: {
            researchStatus: "FAILED",
            researchError: message.slice(0, 900),
            researchUpdatedAt: new Date()
          }
        })
      ]);

      failed += 1;
    }
  }

  return {
    queuedChecked: jobs.length,
    completed,
    failed
  };
}
