import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const createRequestSchema = z.object({
  healthSystemId: z.string().min(1)
});

const patchRequestSchema = z.object({
  linkId: z.string().min(1),
  healthSystemId: z.string().min(1)
});

const deleteRequestSchema = z.object({
  linkId: z.string().min(1)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coInvestorId } = await context.params;
    const body = await request.json();
    const input = createRequestSchema.parse(body);

    const result = await prisma.$transaction(async (tx) => {
      const [coInvestor, healthSystem] = await Promise.all([
        tx.coInvestor.findUnique({
          where: { id: coInvestorId },
          select: { id: true, name: true }
        }),
        tx.healthSystem.findUnique({
          where: { id: input.healthSystemId },
          select: {
            id: true,
            name: true,
            website: true,
            headquartersCity: true,
            headquartersState: true,
            headquartersCountry: true
          }
        })
      ]);

      if (!coInvestor) {
        throw new Error("Co-investor not found");
      }
      if (!healthSystem) {
        throw new Error("Health system not found");
      }

      const existing = await tx.venturePartner.findFirst({
        where: {
          coInvestorId,
          healthSystemId: healthSystem.id
        },
        include: {
          healthSystem: {
            select: {
              id: true,
              name: true,
              website: true,
              headquartersCity: true,
              headquartersState: true,
              headquartersCountry: true
            }
          }
        }
      });

      if (existing) {
        return { created: false as const, link: existing };
      }

      const link = await tx.venturePartner.create({
        data: {
          coInvestorId,
          healthSystemId: healthSystem.id,
          name: healthSystem.name,
          title: "Limited Partner",
          profileUrl: healthSystem.website || null
        },
        include: {
          healthSystem: {
            select: {
              id: true,
              name: true,
              website: true,
              headquartersCity: true,
              headquartersState: true,
              headquartersCountry: true
            }
          }
        }
      });

      return { created: true as const, link };
    });

    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error("co_investor_add_health_system_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to add health system limited partner" },
      { status: 400 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coInvestorId } = await context.params;
    const body = await request.json();
    const input = patchRequestSchema.parse(body);

    const updated = await prisma.$transaction(async (tx) => {
      const existingLink = await tx.venturePartner.findUnique({
        where: { id: input.linkId },
        select: { id: true, coInvestorId: true }
      });

      if (!existingLink || existingLink.coInvestorId !== coInvestorId) {
        throw new Error("Health system limited partner link not found");
      }

      const healthSystem = await tx.healthSystem.findUnique({
        where: { id: input.healthSystemId },
        select: {
          id: true,
          name: true,
          website: true
        }
      });

      if (!healthSystem) {
        throw new Error("Health system not found");
      }

      const duplicate = await tx.venturePartner.findFirst({
        where: {
          coInvestorId,
          healthSystemId: healthSystem.id,
          NOT: { id: existingLink.id }
        },
        select: { id: true }
      });

      if (duplicate) {
        throw new Error("This health system is already linked as a limited partner.");
      }

      return tx.venturePartner.update({
        where: { id: existingLink.id },
        data: {
          healthSystemId: healthSystem.id,
          name: healthSystem.name,
          title: "Limited Partner",
          profileUrl: healthSystem.website || null
        },
        include: {
          healthSystem: {
            select: {
              id: true,
              name: true,
              website: true,
              headquartersCity: true,
              headquartersState: true,
              headquartersCountry: true
            }
          }
        }
      });
    });

    return NextResponse.json({ ok: true, link: updated });
  } catch (error) {
    console.error("co_investor_update_health_system_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update health system limited partner" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: coInvestorId } = await context.params;
    const body = await request.json();
    const input = deleteRequestSchema.parse(body);

    const removed = await prisma.venturePartner.deleteMany({
      where: {
        id: input.linkId,
        coInvestorId
      }
    });

    if (removed.count === 0) {
      return NextResponse.json({ error: "Health system limited partner link not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, removed: true });
  } catch (error) {
    console.error("co_investor_delete_health_system_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete health system limited partner" },
      { status: 400 }
    );
  }
}
