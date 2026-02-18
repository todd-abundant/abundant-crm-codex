import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { companyInputSchema } from "@/lib/schemas";

function parseMoney(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNullableString(value?: string | null) {
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
  candidate: {
    name: string;
    headquartersCity: string | null;
    headquartersState: string | null;
    headquartersCountry: string | null;
    website: string | null;
  }
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

  const comparableParts = [
    [candidateCity, existingCity],
    [candidateState, existingState],
    [candidateCountry, existingCountry]
  ] as const;

  const usableParts = comparableParts.filter(([candidateValue, existingValue]) => candidateValue || existingValue);
  if (usableParts.length === 0) return false;

  return usableParts.every(([candidateValue, existingValue]) => candidateValue === existingValue);
}

type CompanyInputParsed = ReturnType<typeof companyInputSchema.parse>;

function mapCompanyCreateData(input: CompanyInputParsed) {
  return {
    name: input.name,
    legalName: toNullableString(input.legalName),
    website: toNullableString(input.website),
    headquartersCity: toNullableString(input.headquartersCity),
    headquartersState: toNullableString(input.headquartersState),
    headquartersCountry: toNullableString(input.headquartersCountry),
    companyType: input.companyType,
    primaryCategory: input.primaryCategory,
    primaryCategoryOther: toNullableString(input.primaryCategoryOther),
    declineReason: input.declineReason || null,
    declineReasonOther: toNullableString(input.declineReasonOther),
    leadSourceType: input.leadSourceType,
    leadSourceHealthSystemId:
      input.leadSourceType === "HEALTH_SYSTEM" ? toNullableString(input.leadSourceHealthSystemId) : null,
    leadSourceOther:
      input.leadSourceType === "OTHER" ? toNullableString(input.leadSourceOther) : null,
    leadSourceNotes: toNullableString(input.leadSourceNotes),
    description: toNullableString(input.description),
    googleTranscriptUrl: toNullableString(input.googleTranscriptUrl),
    spinOutOwnershipPercent:
      input.companyType === "SPIN_OUT"
        ? input.spinOutOwnershipPercent === null || input.spinOutOwnershipPercent === undefined
          ? null
          : parseMoney(input.spinOutOwnershipPercent)
        : null,
    intakeStatus: input.intakeStatus,
    intakeScheduledAt: parseDate(input.intakeScheduledAt),
    screeningEvaluationAt: parseDate(input.screeningEvaluationAt),
    researchNotes: toNullableString(input.researchNotes),
    researchStatus: "DRAFT" as const,
    researchUpdatedAt: new Date()
  };
}

export async function GET() {
  const companies = await prisma.company.findMany({
    include: {
      leadSourceHealthSystem: { select: { id: true, name: true } },
      healthSystemLinks: {
        include: { healthSystem: { select: { id: true, name: true } } }
      },
      coInvestorLinks: {
        include: { coInvestor: { select: { id: true, name: true } } }
      },
      researchJobs: {
        orderBy: { createdAt: "desc" },
        take: 1
      }
    },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ companies });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = companyInputSchema.parse(body);
    const base = mapCompanyCreateData(input);

    const existingCompanies = await prisma.company.findMany({
      where: { name: { mode: "insensitive", equals: base.name } },
      select: {
        id: true,
        name: true,
        headquartersCity: true,
        headquartersState: true,
        headquartersCountry: true,
        website: true
      }
    });

    const candidate = {
      name: base.name,
      headquartersCity: base.headquartersCity,
      headquartersState: base.headquartersState,
      headquartersCountry: base.headquartersCountry,
      website: base.website
    };

    const duplicate = existingCompanies.find((record) => isLikelyDuplicateCandidate(record, candidate));

    if (duplicate) {
      return NextResponse.json(
        {
          error: `Duplicate company: "${duplicate.name}" already exists${formatDuplicateLocation(duplicate)}.`
        },
        { status: 409 }
      );
    }

    const created = await prisma.company.create({
      data: {
        ...base,
        healthSystemLinks: {
          create: input.healthSystemLinks.map((link) => ({
            healthSystemId: link.healthSystemId,
            relationshipType: link.relationshipType,
            notes: toNullableString(link.notes),
            investmentAmountUsd: parseMoney(link.investmentAmountUsd),
            ownershipPercent: parseMoney(link.ownershipPercent)
          }))
        },
        coInvestorLinks: {
          create: input.coInvestorLinks.map((link) => ({
            coInvestorId: link.coInvestorId,
            relationshipType: link.relationshipType,
            notes: toNullableString(link.notes),
            investmentAmountUsd: parseMoney(link.investmentAmountUsd)
          }))
        }
      },
      include: {
        leadSourceHealthSystem: { select: { id: true, name: true } },
        healthSystemLinks: {
          include: { healthSystem: { select: { id: true, name: true } } }
        },
        coInvestorLinks: {
          include: { coInvestor: { select: { id: true, name: true } } }
        },
        researchJobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    return NextResponse.json({ company: created }, { status: 201 });
  } catch (error) {
    console.error("create_company_error", error);
    return NextResponse.json({ error: "Failed to save company" }, { status: 400 });
  }
}

function formatDuplicateLocation(candidate: {
  headquartersCity: string | null;
  headquartersState: string | null;
  headquartersCountry: string | null;
}) {
  const formatted = [candidate.headquartersCity, candidate.headquartersState, candidate.headquartersCountry]
    .filter(Boolean)
    .join(", ");
  return formatted ? ` for ${formatted}` : "";
}
