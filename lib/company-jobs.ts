import { prisma } from "@/lib/db";
import { replaceCompanyContactLinks } from "@/lib/contact-links";
import { enrichCompanyFromWeb } from "@/lib/company-research";
import { type CompanySearchCandidate } from "@/lib/schemas";

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
  candidate: CompanySearchCandidate
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

export async function verifyCandidateAndQueueResearch(params: {
  candidate: CompanySearchCandidate;
  companyType: "STARTUP" | "SPIN_OUT" | "DENOVO";
  primaryCategory:
    | "PATIENT_ACCESS_AND_GROWTH"
    | "CARE_DELIVERY_TECH_ENABLED_SERVICES"
    | "CLINICAL_WORKFLOW_AND_PRODUCTIVITY"
    | "REVENUE_CYCLE_AND_FINANCIAL_OPERATIONS"
    | "VALUE_BASED_CARE_AND_POPULATION_HEALTH_ENABLEMENT"
    | "AI_ENABLED_AUTOMATION_AND_DECISION_SUPPORT"
    | "DATA_PLATFORM_INTEROPERABILITY_AND_INTEGRATION"
    | "REMOTE_PATIENT_MONITORING_AND_CONNECTED_DEVICES"
    | "DIAGNOSTICS_IMAGING_AND_TESTING_ENABLEMENT"
    | "PHARMACY_AND_MEDICATION_ENABLEMENT"
    | "SUPPLY_CHAIN_PROCUREMENT_AND_ASSET_OPERATIONS"
    | "SECURITY_PRIVACY_AND_COMPLIANCE_INFRASTRUCTURE"
    | "PROVIDER_EXPERIENCE_AND_DEVELOPMENT"
    | "OTHER";
  primaryCategoryOther?: string;
  leadSourceType: "HEALTH_SYSTEM" | "OTHER";
  leadSourceHealthSystemId?: string | null;
  leadSourceOther?: string;
}) {
  const {
    candidate,
    companyType,
    primaryCategory,
    primaryCategoryOther,
    leadSourceType,
    leadSourceHealthSystemId,
    leadSourceOther
  } = params;

  const result = await prisma.$transaction(async (tx) => {
    const existingCompanies = await tx.company.findMany({
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

    const duplicate = existingCompanies.find((company) => isLikelyDuplicateCandidate(company, candidate));

    if (duplicate) {
      throw new Error(
        `Duplicate company: "${duplicate.name}" already exists for ${formatLocationForDuplicateMessage(duplicate)}.`
      );
    }

    const company = await tx.company.create({
      data: {
        name: candidate.name,
        website: trimOrNull(candidate.website),
        headquartersCity: trimOrNull(candidate.headquartersCity),
        headquartersState: trimOrNull(candidate.headquartersState),
        headquartersCountry: trimOrNull(candidate.headquartersCountry),
        companyType,
        primaryCategory,
        primaryCategoryOther: trimOrNull(primaryCategoryOther),
        leadSourceType,
        leadSourceHealthSystemId:
          leadSourceType === "HEALTH_SYSTEM" ? trimOrNull(leadSourceHealthSystemId) : null,
        leadSourceOther: leadSourceType === "OTHER" ? trimOrNull(leadSourceOther) : null,
        researchStatus: "QUEUED",
        researchNotes: trimOrNull(candidate.summary),
        researchError: null,
        researchUpdatedAt: new Date(),
        intakeStatus: "NOT_SCHEDULED"
      }
    });

    const job = await tx.companyResearchJob.create({
      data: {
        companyId: company.id,
        status: "QUEUED",
        searchName: candidate.name,
        selectedCity: trimOrNull(candidate.headquartersCity),
        selectedState: trimOrNull(candidate.headquartersState),
        selectedCountry: trimOrNull(candidate.headquartersCountry),
        selectedWebsite: trimOrNull(candidate.website)
      }
    });

    return { company, job };
  });

  return result;
}

export async function queueResearchForCompany(companyId: string) {
  const existing = await prisma.company.findUnique({
    where: { id: companyId }
  });

  if (!existing) {
    throw new Error("Company not found");
  }

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.update({
      where: { id: companyId },
      data: {
        researchStatus: "QUEUED",
        researchError: null,
        researchUpdatedAt: new Date()
      }
    });

    const job = await tx.companyResearchJob.create({
      data: {
        companyId,
        status: "QUEUED",
        searchName: existing.name,
        selectedCity: trimOrNull(existing.headquartersCity),
        selectedState: trimOrNull(existing.headquartersState),
        selectedCountry: trimOrNull(existing.headquartersCountry),
        selectedWebsite: trimOrNull(existing.website)
      }
    });

    return { company, job };
  });
}

export async function runQueuedResearchJobs(
  maxJobs = 1,
  options?: { companyId?: string }
) {
  const jobs = await prisma.companyResearchJob.findMany({
    where: {
      status: "QUEUED",
      ...(options?.companyId ? { companyId: options.companyId } : {})
    },
    include: { company: true },
    orderBy: { createdAt: "asc" },
    take: maxJobs
  });

  let completed = 0;
  let failed = 0;

  for (const job of jobs) {
    await prisma.companyResearchJob.update({
      where: { id: job.id },
      data: { status: "RUNNING", startedAt: new Date(), errorMessage: null }
    });

    await prisma.company.update({
      where: { id: job.companyId },
      data: { researchStatus: "RUNNING", researchError: null }
    });

    try {
      const enriched = await enrichCompanyFromWeb({
        name: job.searchName || job.company.name,
        website: job.selectedWebsite || job.company.website,
        headquartersCity: job.selectedCity || job.company.headquartersCity,
        headquartersState: job.selectedState || job.company.headquartersState,
        headquartersCountry: job.selectedCountry || job.company.headquartersCountry
      });

      await prisma.$transaction(async (tx) => {
        await tx.company.update({
          where: { id: job.companyId },
          data: {
            name: trimOrNull(enriched.name) || job.company.name,
            legalName: trimOrNull(enriched.legalName),
            website: trimOrNull(enriched.website) || job.company.website,
            headquartersCity: trimOrNull(enriched.headquartersCity) || job.company.headquartersCity,
            headquartersState: trimOrNull(enriched.headquartersState) || job.company.headquartersState,
            headquartersCountry: trimOrNull(enriched.headquartersCountry) || job.company.headquartersCountry,
            companyType: enriched.companyType || job.company.companyType,
            primaryCategory: enriched.primaryCategory || job.company.primaryCategory,
            primaryCategoryOther: trimOrNull(enriched.primaryCategoryOther),
            declineReason: enriched.declineReason || null,
            declineReasonOther: trimOrNull(enriched.declineReasonOther),
            leadSourceType: job.company.leadSourceType,
            leadSourceHealthSystemId:
              job.company.leadSourceType === "HEALTH_SYSTEM" ? job.company.leadSourceHealthSystemId : null,
            leadSourceNotes: trimOrNull(enriched.leadSourceNotes),
            description: trimOrNull(enriched.description),
            googleTranscriptUrl: trimOrNull(enriched.googleTranscriptUrl),
            spinOutOwnershipPercent:
              job.company.companyType === "SPIN_OUT"
                ? (enriched.spinOutOwnershipPercent ?? job.company.spinOutOwnershipPercent)
                : null,
            researchStatus: "COMPLETED",
            researchError: null,
            researchNotes: trimOrNull(enriched.researchNotes),
            researchUpdatedAt: new Date()
          }
        });

        await tx.companyResearchJob.update({
          where: { id: job.id },
          data: { status: "COMPLETED", completedAt: new Date(), errorMessage: null }
        });

        if (enriched.healthSystemLinks.length > 0) {
          const mappedHealthSystems = enriched.healthSystemLinks
            .map((entry) => {
              const parsedRelationship =
                entry.relationshipType === "INVESTOR_PARTNER" ||
                entry.relationshipType === "SPIN_OUT_PARTNER" ||
                entry.relationshipType === "CUSTOMER" ||
                entry.relationshipType === "OTHER"
                  ? entry.relationshipType
                  : "OTHER";

              return {
                companyId: job.companyId,
                healthSystemId: trimOrNull(entry.healthSystemId),
                relationshipType: parsedRelationship,
                notes: trimOrNull(entry.notes),
                investmentAmountUsd: entry.investmentAmountUsd ?? null,
                ownershipPercent: entry.ownershipPercent ?? null
              };
            })
            .filter(
              (entry): entry is (typeof entry & { healthSystemId: string }) =>
                entry.healthSystemId !== null && entry.healthSystemId !== undefined
            );

          if (mappedHealthSystems.length > 0) {
            await tx.companyHealthSystemLink.createMany({
              data: mappedHealthSystems.map((entry) => ({
                companyId: entry.companyId,
                healthSystemId: entry.healthSystemId,
                relationshipType: entry.relationshipType,
                notes: entry.notes,
                investmentAmountUsd: entry.investmentAmountUsd,
                ownershipPercent: entry.ownershipPercent
              }))
            });
          }
        }

        if (enriched.coInvestorLinks.length > 0) {
          const mappedCoInvestors = enriched.coInvestorLinks
            .map((entry) => {
              const parsedRelationship =
                entry.relationshipType === "PARTNER" ||
                entry.relationshipType === "INVESTOR" ||
                entry.relationshipType === "OTHER"
                  ? entry.relationshipType
                  : "OTHER";

              return {
                companyId: job.companyId,
                coInvestorId: trimOrNull(entry.coInvestorId),
                relationshipType: parsedRelationship,
                notes: trimOrNull(entry.notes),
                investmentAmountUsd: entry.investmentAmountUsd ?? null
              };
            })
            .filter(
              (entry): entry is (typeof entry & { coInvestorId: string }) =>
                entry.coInvestorId !== null && entry.coInvestorId !== undefined
            );

          if (mappedCoInvestors.length > 0) {
            await tx.companyCoInvestorLink.createMany({
              data: mappedCoInvestors.map((entry) => ({
                companyId: entry.companyId,
                coInvestorId: entry.coInvestorId,
                relationshipType: entry.relationshipType,
                notes: entry.notes,
                investmentAmountUsd: entry.investmentAmountUsd
              }))
            });
          }
        }

        await replaceCompanyContactLinks(
          tx,
          job.companyId,
          (enriched.contacts ?? []).map((entry) => ({
            name: entry.name,
            title: trimOrNull(entry.title),
            relationshipTitle: trimOrNull(entry.relationshipTitle),
            email: trimOrNull(entry.email),
            phone: trimOrNull(entry.phone),
            linkedinUrl: trimOrNull(entry.url),
            roleType:
              entry.roleType === "EXECUTIVE" ||
              entry.roleType === "VENTURE_PARTNER" ||
              entry.roleType === "INVESTOR_PARTNER" ||
              entry.roleType === "OTHER" ||
              entry.roleType === "COMPANY_CONTACT"
                ? entry.roleType
                : "COMPANY_CONTACT"
          }))
        );
      });
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown research failure";

      await prisma.$transaction([
        prisma.companyResearchJob.update({
          where: { id: job.id },
          data: { status: "FAILED", completedAt: new Date(), errorMessage: message.slice(0, 900) }
        }),
        prisma.company.update({
          where: { id: job.companyId },
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
