import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const createRequestSchema = z.object({
  companyId: z.string().min(1),
  relationshipType: z.enum(["CUSTOMER", "SPIN_OUT_PARTNER", "INVESTOR_PARTNER", "OTHER"]).default("CUSTOMER"),
  notes: z.string().optional(),
  annualContractValueUsd: z.number().nonnegative().optional().nullable(),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  ownershipPercent: z.number().nonnegative().max(100).optional().nullable()
});

const patchRequestSchema = z.object({
  linkId: z.string().min(1),
  companyId: z.string().min(1).optional(),
  relationshipType: z
    .enum(["CUSTOMER", "SPIN_OUT_PARTNER", "INVESTOR_PARTNER", "OTHER"])
    .optional(),
  notes: z.string().optional(),
  annualContractValueUsd: z.number().nonnegative().optional().nullable(),
  investmentAmountUsd: z.number().nonnegative().optional().nullable(),
  ownershipPercent: z.number().nonnegative().max(100).optional().nullable()
});

const deleteRequestSchema = z.object({
  linkId: z.string().min(1)
});

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getAnnualContractValueUsdInput(input: {
  annualContractValueUsd?: number | null;
  investmentAmountUsd?: number | null;
}) {
  return input.annualContractValueUsd ?? input.investmentAmountUsd;
}

function buildCustomerUpdatePayload(
  input: z.infer<typeof patchRequestSchema>
) {
  const update: Prisma.CompanyHealthSystemLinkUpdateInput = {};

  if (input.companyId !== undefined) {
    update.company = {
      connect: { id: input.companyId }
    };
  }

  if (input.relationshipType !== undefined) {
    update.relationshipType = input.relationshipType;
  }

  if (input.notes !== undefined) {
    update.notes = trimOrNull(input.notes);
  }

  const annualContractValueUsd = getAnnualContractValueUsdInput(input);
  if (annualContractValueUsd !== undefined) {
    update.investmentAmountUsd = annualContractValueUsd;
  }

  if (input.ownershipPercent !== undefined) {
    update.ownershipPercent = input.ownershipPercent;
  }

  return update;
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

      const annualContractValueUsd = getAnnualContractValueUsdInput(input);

      return tx.companyHealthSystemLink.create({
        data: {
          healthSystemId,
          companyId: company.id,
          relationshipType: input.relationshipType,
          notes: trimOrNull(input.notes),
          investmentAmountUsd: annualContractValueUsd ?? null,
          ownershipPercent: input.ownershipPercent ?? null
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

    return NextResponse.json({ ok: true, link: created }, { status: 201 });
  } catch (error) {
    console.error("health_system_add_customer_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add health system customer" },
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
      const link = await tx.companyHealthSystemLink.findUnique({
        where: { id: input.linkId }
      });

      if (!link || link.healthSystemId !== healthSystemId) {
        throw new Error("Health system customer link not found");
      }

      if (input.companyId !== undefined) {
        const company = await tx.company.findUnique({
          where: { id: input.companyId },
          select: { name: true }
        });
        if (!company) {
          throw new Error("Company not found");
        }
      }
      const update = buildCustomerUpdatePayload(input);
      if (Object.keys(update).length === 0) {
        throw new Error("No customer updates provided");
      }

      return tx.companyHealthSystemLink.update({
        where: { id: link.id },
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

    return NextResponse.json({ ok: true, link: updated });
  } catch (error) {
    console.error("health_system_update_customer_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update health system customer" },
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

    const removed = await prisma.companyHealthSystemLink.deleteMany({
      where: {
        id: input.linkId,
        healthSystemId
      }
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Health system customer link not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("health_system_delete_customer_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete health system customer" },
      { status: 400 }
    );
  }
}
