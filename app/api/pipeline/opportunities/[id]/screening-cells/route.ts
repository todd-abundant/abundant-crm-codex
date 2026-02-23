import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";

const patchSchema = z.object({
  healthSystemId: z.string().min(1),
  field: z.enum(["RELEVANT_FEEDBACK", "STATUS_UPDATE"]),
  value: z.string()
});

function normalizeValue(value: string) {
  return value.trim();
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id: companyId } = await context.params;
    const body = await request.json();
    const input = patchSchema.parse(body);
    const nextValue = normalizeValue(input.value);

    const [company, healthSystem] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true }
      }),
      prisma.healthSystem.findUnique({
        where: { id: input.healthSystemId },
        select: { id: true, isAllianceMember: true }
      })
    ]);

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    if (!healthSystem || !healthSystem.isAllianceMember) {
      return NextResponse.json({ error: "Alliance health system not found" }, { status: 404 });
    }

    const latest = await prisma.companyScreeningCellChange.findFirst({
      where: {
        companyId,
        healthSystemId: input.healthSystemId,
        field: input.field
      },
      orderBy: [{ createdAt: "desc" }]
    });

    if (latest && latest.value === nextValue) {
      return NextResponse.json({
        updated: false,
        entry: {
          id: latest.id,
          field: latest.field,
          value: latest.value,
          changedAt: latest.createdAt,
          changedByUserId: latest.changedByUserId,
          changedByName: latest.changedByName || user.name || user.email
        }
      });
    }

    const created = await prisma.companyScreeningCellChange.create({
      data: {
        companyId,
        healthSystemId: input.healthSystemId,
        field: input.field,
        value: nextValue,
        changedByUserId: user.id,
        changedByName: user.name || user.email
      },
      include: {
        changedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return NextResponse.json({
      updated: true,
      entry: {
        id: created.id,
        field: created.field,
        value: created.value,
        changedAt: created.createdAt,
        changedByUserId: created.changedByUserId,
        changedByName:
          created.changedByName || created.changedByUser?.name || created.changedByUser?.email || "Unknown user"
      }
    });
  } catch (error) {
    console.error("update_screening_cell_error", error);
    return NextResponse.json({ error: "Failed to update screening cell." }, { status: 400 });
  }
}
