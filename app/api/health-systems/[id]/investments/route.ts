import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const createRequestSchema = z.object({
  companyId: z.string().min(1),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  investmentDate: z.string().optional().nullable(),
  leadPartnerName: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal(""))
});

const patchRequestSchema = z.object({
  linkId: z.string().min(1),
  companyId: z.string().min(1).optional(),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  investmentDate: z.string().optional().nullable(),
  leadPartnerName: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal(""))
});

const deleteRequestSchema = z.object({
  linkId: z.string().min(1)
});

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseDate(value?: string | null) {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === null) return null;
  if (trimmed === "") return null;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Investment date is invalid");
  }

  return parsed;
}

function buildInvestmentUpdatePayload(
  input: z.infer<typeof patchRequestSchema>,
  companyName?: string | null
) {
  const update: Prisma.HealthSystemInvestmentUpdateInput = {};

  if (input.companyId !== undefined) {
    if (companyName === undefined) {
      throw new Error("Company not found");
    }
    update.company = {
      connect: { id: input.companyId }
    };
    update.portfolioCompanyName = companyName;
  }

  if (input.investmentAmountUsd !== undefined) {
    update.investmentAmountUsd = input.investmentAmountUsd;
  }

    if (input.investmentDate !== undefined) {
    update.investmentDate = parseDate(input.investmentDate);
  }

  if (input.leadPartnerName !== undefined) {
    update.leadPartnerName = trimOrNull(input.leadPartnerName);
  }

  if (input.sourceUrl !== undefined) {
    update.sourceUrl = trimOrNull(input.sourceUrl);
  }

  return update;
}

function toParsedDate(value?: string | null) {
  if (value === undefined || value === null || value.trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Investment date is invalid");
  }
  return parsed;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: healthSystemId } = await context.params;
    const body = await request.json();
    const input = createRequestSchema.parse(body);

    const created = await prisma.$transaction(async (tx) => {
      const [healthSystem, company] = await Promise.all([
        tx.healthSystem.findUnique({ where: { id: healthSystemId }, select: { id: true } }),
        tx.company.findUnique({
          where: { id: input.companyId },
          select: { id: true, name: true }
        })
      ]);

      if (!healthSystem) {
        throw new Error("Health system not found");
      }
      if (!company) {
        throw new Error("Company not found");
      }

      return tx.healthSystemInvestment.create({
        data: {
          healthSystemId,
          companyId: company.id,
          portfolioCompanyName: company.name,
          investmentAmountUsd: input.investmentAmountUsd ?? null,
          investmentDate: toParsedDate(input.investmentDate),
          leadPartnerName: trimOrNull(input.leadPartnerName),
          sourceUrl: trimOrNull(input.sourceUrl)
        },
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    });

    return NextResponse.json({ ok: true, investment: created }, { status: 201 });
  } catch (error) {
    console.error("health_system_add_investment_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add health system investment" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: healthSystemId } = await context.params;
    const body = await request.json();
    const input = patchRequestSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const investment = await tx.healthSystemInvestment.findUnique({
        where: { id: input.linkId }
      });

      if (!investment || investment.healthSystemId !== healthSystemId) {
        throw new Error("Health system investment not found");
      }

      let companyName: string | null | undefined;
      if (input.companyId !== undefined) {
        const company = await tx.company.findUnique({
          where: { id: input.companyId },
          select: { name: true }
        });
        if (!company) {
          throw new Error("Company not found");
        }
        companyName = company.name;
      }

      const update = buildInvestmentUpdatePayload(input, companyName);
      if (Object.keys(update).length === 0) {
        throw new Error("No health system investment updates provided");
      }

      return tx.healthSystemInvestment.update({
        where: { id: investment.id },
        data: update,
        include: {
          company: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    });

    return NextResponse.json({ ok: true, investment: updated });
  } catch (error) {
    console.error("health_system_update_investment_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update health system investment" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: healthSystemId } = await context.params;
    const body = await request.json();
    const input = deleteRequestSchema.parse(body);

    const removed = await prisma.healthSystemInvestment.deleteMany({
      where: {
        id: input.linkId,
        healthSystemId
      }
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Health system investment not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("health_system_delete_investment_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete health system investment" },
      { status: 400 }
    );
  }
}
