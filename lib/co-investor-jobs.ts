import { prisma } from "@/lib/db";
import { replaceCoInvestorContactLinks } from "@/lib/contact-links";
import { enrichCoInvestorFromWeb } from "@/lib/co-investor-research";
import type { CoInvestorSearchCandidate } from "@/lib/schemas";

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
      .replace(/\/+/, "/");
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
  candidate: CoInvestorSearchCandidate
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
  candidate: CoInvestorSearchCandidate;
  isSeedInvestor: boolean;
  isSeriesAInvestor: boolean;
}) {
  const { candidate, isSeedInvestor, isSeriesAInvestor } = params;

  const result = await prisma.$transaction(async (tx) => {
    const existingCoInvestors = await tx.coInvestor.findMany({
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

    const duplicate = existingCoInvestors.find((coInvestor) => isLikelyDuplicateCandidate(coInvestor, candidate));

    if (duplicate) {
      throw new Error(
        `Duplicate co-investor: "${duplicate.name}" already exists for ${formatLocationForDuplicateMessage(duplicate)}.`
      );
    }

    const coInvestor = await tx.coInvestor.create({
      data: {
        name: candidate.name,
        website: trimOrNull(candidate.website),
        headquartersCity: trimOrNull(candidate.headquartersCity),
        headquartersState: trimOrNull(candidate.headquartersState),
        headquartersCountry: trimOrNull(candidate.headquartersCountry),
        isSeedInvestor,
        isSeriesAInvestor,
        researchStatus: "QUEUED",
        researchNotes: trimOrNull(candidate.summary),
        researchError: null,
        investmentNotes: null,
        researchUpdatedAt: new Date()
      }
    });

    const job = await tx.coInvestorResearchJob.create({
      data: {
        coInvestorId: coInvestor.id,
        status: "QUEUED",
        searchName: candidate.name,
        selectedCity: trimOrNull(candidate.headquartersCity),
        selectedState: trimOrNull(candidate.headquartersState),
        selectedCountry: trimOrNull(candidate.headquartersCountry),
        selectedWebsite: trimOrNull(candidate.website)
      }
    });

    return { coInvestor, job };
  });

  return result;
}

function formatLocationForDuplicateMessage(candidate: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  const formatted = [candidate.headquartersCity, candidate.headquartersState, candidate.headquartersCountry]
    .filter(Boolean)
    .join(", ");

  return formatted || "same name and website";
}

export async function queueResearchForCoInvestor(coInvestorId: string) {
  const existing = await prisma.coInvestor.findUnique({
    where: { id: coInvestorId }
  });

  if (!existing) {
    throw new Error("Co-investor not found");
  }

  return prisma.$transaction(async (tx) => {
    const coInvestor = await tx.coInvestor.update({
      where: { id: coInvestorId },
      data: {
        researchStatus: "QUEUED",
        researchError: null,
        researchUpdatedAt: new Date()
      }
    });

    const job = await tx.coInvestorResearchJob.create({
      data: {
        coInvestorId,
        status: "QUEUED",
        searchName: existing.name,
        selectedCity: trimOrNull(existing.headquartersCity),
        selectedState: trimOrNull(existing.headquartersState),
        selectedCountry: trimOrNull(existing.headquartersCountry),
        selectedWebsite: trimOrNull(existing.website)
      }
    });

    return { coInvestor, job };
  });
}

export async function runQueuedResearchJobs(
  maxJobs = 1,
  options?: { coInvestorId?: string }
) {
  const jobs = await prisma.coInvestorResearchJob.findMany({
    where: {
      status: "QUEUED",
      ...(options?.coInvestorId ? { coInvestorId: options.coInvestorId } : {})
    },
    include: { coInvestor: true },
    orderBy: { createdAt: "asc" },
    take: maxJobs
  });

  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    await prisma.coInvestorResearchJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date(), errorMessage: null }
    });

    await prisma.coInvestor.update({
      where: { id: job.coInvestorId },
      data: { researchStatus: "RUNNING", researchError: null }
    });

    try {
      const enriched = await enrichCoInvestorFromWeb({
        name: job.searchName || job.coInvestor.name,
        website: job.selectedWebsite || job.coInvestor.website,
        headquartersCity: job.selectedCity || job.coInvestor.headquartersCity,
        headquartersState: job.selectedState || job.coInvestor.headquartersState,
        headquartersCountry: job.selectedCountry || job.coInvestor.headquartersCountry
      });

      const keepSeedFlag = job.coInvestor.isSeedInvestor || enriched.isSeedInvestor;
      const keepSeriesAFlag = job.coInvestor.isSeriesAInvestor || enriched.isSeriesAInvestor;

      await prisma.$transaction(async (tx) => {
        await tx.coInvestorPartner.deleteMany({ where: { coInvestorId: job.coInvestorId } });
        await tx.coInvestorInvestment.deleteMany({ where: { coInvestorId: job.coInvestorId } });

        await tx.coInvestor.update({
          where: { id: job.coInvestorId },
          data: {
            name: trimOrNull(enriched.name) || job.coInvestor.name,
            legalName: trimOrNull(enriched.legalName),
            website: trimOrNull(enriched.website) || job.coInvestor.website,
            headquartersCity: trimOrNull(enriched.headquartersCity) || job.coInvestor.headquartersCity,
            headquartersState: trimOrNull(enriched.headquartersState) || job.coInvestor.headquartersState,
            headquartersCountry: trimOrNull(enriched.headquartersCountry) || job.coInvestor.headquartersCountry,
            isSeedInvestor: keepSeedFlag,
            isSeriesAInvestor: keepSeriesAFlag,
            investmentNotes: trimOrNull(enriched.investmentNotes),
            researchStatus: "COMPLETED",
            researchError: null,
            researchNotes: trimOrNull(enriched.researchNotes),
            researchUpdatedAt: new Date()
          }
        });

        await tx.coInvestorResearchJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: new Date(), errorMessage: null }
        });

        if (enriched.partners.length > 0) {
          await tx.coInvestorPartner.createMany({
            data: enriched.partners.map((entry) => ({
              coInvestorId: job.coInvestorId,
              name: entry.name,
              title: trimOrNull(entry.title),
              profileUrl: trimOrNull(entry.url)
            }))
          });
        }

        if (enriched.investments.length > 0) {
          await tx.coInvestorInvestment.createMany({
            data: enriched.investments.map((entry) => ({
              coInvestorId: job.coInvestorId,
              portfolioCompanyName: entry.portfolioCompanyName,
              investmentAmountUsd: entry.investmentAmountUsd ?? null,
              investmentDate: parseOptionalDate(entry.investmentDate),
              investmentStage: trimOrNull(entry.investmentStage),
              leadPartnerName: trimOrNull(entry.leadPartnerName),
              sourceUrl: trimOrNull(entry.sourceUrl)
            }))
          });
        }

        await replaceCoInvestorContactLinks(
          tx,
          job.coInvestorId,
          enriched.partners.map((entry) => ({
            name: entry.name,
            title: trimOrNull(entry.title),
            email: trimOrNull(entry.email),
            phone: trimOrNull(entry.phone),
            linkedinUrl: trimOrNull(entry.url),
            roleType: "INVESTOR_PARTNER" as const
          }))
        );
      });
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown research failure";

      await prisma.$transaction([
        prisma.coInvestorResearchJob.update({
          where: { id: job.id },
          data: { status: "FAILED", completedAt: new Date(), errorMessage: message.slice(0, 900) }
        }),
        prisma.coInvestor.update({
          where: { id: job.coInvestorId },
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
