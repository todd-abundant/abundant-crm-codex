import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

const createRequestSchema = z.object({
  coInvestorId: z.string().min(1),
  title: z.string().optional(),
  profileUrl: z.string().url().optional().or(z.literal(""))
});

const patchRequestSchema = z.object({
  linkId: z.string().min(1),
  coInvestorId: z.string().min(1).optional(),
  title: z.string().optional(),
  profileUrl: z.string().url().optional().or(z.literal(""))
});

const deleteRequestSchema = z.object({
  linkId: z.string().min(1)
});

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildPartnerUpdatePayload(input: z.infer<typeof patchRequestSchema> & { partnerName?: string }) {
  const update: Prisma.VenturePartnerUpdateInput = {};
  if (input.title !== undefined) update.title = trimOrNull(input.title);
  if (input.profileUrl !== undefined) update.profileUrl = trimOrNull(input.profileUrl);
  if (input.coInvestorId !== undefined) {
    update.coInvestor = {
      connect: { id: input.coInvestorId }
    };
    if (input.partnerName !== undefined) {
      update.name = input.partnerName;
    }
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
      const [healthSystem, coInvestor] = await Promise.all([
        tx.healthSystem.findUnique({ where: { id: healthSystemId }, select: { id: true } }),
        tx.coInvestor.findUnique({
          where: { id: input.coInvestorId },
          select: { id: true, name: true, website: true }
        })
      ]);

      if (!healthSystem) {
        throw new Error("Health system not found");
      }
      if (!coInvestor) {
        throw new Error("Co-investor not found");
      }

      return tx.venturePartner.create({
        data: {
          healthSystemId,
          coInvestorId: coInvestor.id,
          name: coInvestor.name,
          title: trimOrNull(input.title),
          profileUrl: trimOrNull(input.profileUrl) || coInvestor.website || null
        },
        include: {
          coInvestor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    });

    return NextResponse.json({ ok: true, partner: created }, { status: 201 });
  } catch (error) {
    console.error("health_system_add_venture_partner_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add health system venture partner" },
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
      const partner = await tx.venturePartner.findUnique({
        where: { id: input.linkId }
      });

      if (!partner || partner.healthSystemId !== healthSystemId) {
        throw new Error("Venture partner link not found");
      }

      const coInvestorId = trimOrNull(input.coInvestorId);
      const coInvestorName = coInvestorId ? (await tx.coInvestor.findUnique({
        where: { id: coInvestorId },
        select: { name: true }
      }))?.name : undefined;

      if (input.coInvestorId !== undefined && !coInvestorName) {
        throw new Error("Co-investor not found");
      }

      const update = buildPartnerUpdatePayload({
        ...input,
        partnerName: coInvestorName
      });

      if (Object.keys(update).length === 0) {
        throw new Error("No venture partner updates provided");
      }

      return tx.venturePartner.update({
        where: { id: partner.id },
        data: update,
        include: {
          coInvestor: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });
    });

    return NextResponse.json({ ok: true, partner: updated });
  } catch (error) {
    console.error("health_system_update_venture_partner_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update health system venture partner" },
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

    const removed = await prisma.venturePartner.deleteMany({
      where: {
        id: input.linkId,
        healthSystemId
      }
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Venture partner link not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("health_system_delete_venture_partner_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete health system venture partner" },
      { status: 400 }
    );
  }
}
