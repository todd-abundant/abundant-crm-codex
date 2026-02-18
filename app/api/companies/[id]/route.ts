import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { companyUpdateSchema } from "@/lib/schemas";

function toNullableDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value).replace(/[$,\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseStatusChange(inputStatus: string, currentStatus: string, currentDate?: string | null) {
  if (inputStatus === "SCREENING_EVALUATION") {
    if (currentStatus === "SCREENING_EVALUATION" && currentDate) {
      return new Date(currentDate);
    }
    return new Date();
  }

  if (inputStatus !== "SCREENING_EVALUATION") {
    return null;
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = companyUpdateSchema.parse(body);
    const existing = await prisma.company.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    const intakeScheduledAt = toNullableDate(input.intakeScheduledAt);
    const screeningEvaluationAt = parseStatusChange(input.intakeStatus, existing.intakeStatus, existing.screeningEvaluationAt?.toISOString());
    const spinOutOwnershipPercent =
      input.companyType === "SPIN_OUT" ? toNullableNumber(input.spinOutOwnershipPercent) : null;

    const healthSystemLinks = input.healthSystemLinks.map((link) => ({
      healthSystemId: link.healthSystemId,
      relationshipType: link.relationshipType,
      notes: link.notes || null,
      investmentAmountUsd: toNullableNumber(link.investmentAmountUsd),
      ownershipPercent: toNullableNumber(link.ownershipPercent)
    }));

    const coInvestorLinks = input.coInvestorLinks.map((link) => ({
      coInvestorId: link.coInvestorId,
      relationshipType: link.relationshipType,
      notes: link.notes || null,
      investmentAmountUsd: toNullableNumber(link.investmentAmountUsd)
    }));

    const updated = await prisma.$transaction(async (tx) => {
      await tx.companyHealthSystemLink.deleteMany({ where: { companyId: id } });
      await tx.companyCoInvestorLink.deleteMany({ where: { companyId: id } });

      if (healthSystemLinks.length > 0) {
        await tx.companyHealthSystemLink.createMany({
          data: healthSystemLinks.map((link) => ({ ...link, companyId: id }))
        });
      }

      if (coInvestorLinks.length > 0) {
        await tx.companyCoInvestorLink.createMany({
          data: coInvestorLinks.map((link) => ({ ...link, companyId: id }))
        });
      }

      return tx.company.update({
        where: { id },
        data: {
          name: input.name,
          legalName: input.legalName || null,
          website: input.website || null,
          headquartersCity: input.headquartersCity || null,
          headquartersState: input.headquartersState || null,
          headquartersCountry: input.headquartersCountry || null,
          companyType: input.companyType,
          primaryCategory: input.primaryCategory,
          primaryCategoryOther: input.primaryCategoryOther || null,
          declineReason: input.declineReason || null,
          declineReasonOther: input.declineReasonOther || null,
          leadSourceType: input.leadSourceType,
          leadSourceHealthSystemId:
            input.leadSourceType === "HEALTH_SYSTEM" ? input.leadSourceHealthSystemId || null : null,
          leadSourceOther:
            input.leadSourceType === "OTHER" ? (input.leadSourceOther || null) : null,
          leadSourceNotes: input.leadSourceNotes || null,
          description: input.description || null,
          googleTranscriptUrl: input.googleTranscriptUrl || null,
          spinOutOwnershipPercent,
          intakeStatus: input.intakeStatus,
          intakeScheduledAt,
          screeningEvaluationAt: input.intakeStatus === "SCREENING_EVALUATION" ? screeningEvaluationAt : null,
          researchNotes: input.researchNotes || null,
          researchUpdatedAt: new Date()
        },
        include: {
          leadSourceHealthSystem: { select: { id: true, name: true } },
          healthSystemLinks: {
            include: { healthSystem: { select: { id: true, name: true } } }
          },
          coInvestorLinks: {
            include: { coInvestor: { select: { id: true, name: true } } }
          },
          contactLinks: {
            include: { contact: true }
          },
          researchJobs: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      });
    });

    return NextResponse.json({ company: updated });
  } catch (error) {
    console.error("update_company_error", error);
    return NextResponse.json({ error: "Failed to update company" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    await prisma.company.delete({
      where: { id }
    });

    return NextResponse.json({ deleted: true, id });
  } catch (error) {
    console.error("delete_company_error", error);
    return NextResponse.json({ error: "Failed to delete company" }, { status: 400 });
  }
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const record = await prisma.company.findUnique({
      where: { id },
      include: {
        leadSourceHealthSystem: { select: { id: true, name: true } },
        healthSystemLinks: {
          include: { healthSystem: { select: { id: true, name: true } } }
        },
        coInvestorLinks: {
          include: { coInvestor: { select: { id: true, name: true } } }
        },
        contactLinks: {
          include: { contact: true }
        },
        researchJobs: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    });

    if (!record) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    return NextResponse.json({ company: record });
  } catch (error) {
    console.error("get_company_error", error);
    return NextResponse.json({ error: "Failed to load company" }, { status: 400 });
  }
}
