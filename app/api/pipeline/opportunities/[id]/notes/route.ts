import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";

const noteCreateSchema = z.object({
  note: z.string().min(1)
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = noteCreateSchema.parse(body);

    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const user = await getCurrentUser();

    const created = await prisma.entityNote.create({
      data: {
        entityKind: "COMPANY",
        entityId: id,
        note: input.note.trim(),
        createdByUserId: user?.id || null,
        createdByName: user?.name || user?.email || null
      },
      select: {
        id: true,
        note: true,
        createdAt: true,
        createdByName: true,
        createdByUser: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    const count = await prisma.entityNote.count({
      where: {
        entityKind: "COMPANY",
        entityId: id
      }
    });

    return NextResponse.json(
      {
        note: {
          id: created.id,
          note: created.note,
          createdAt: created.createdAt,
          createdByName: created.createdByName || created.createdByUser?.name || created.createdByUser?.email || "Unknown user"
        },
        noteCount: count
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("create_pipeline_note_error", error);
    return NextResponse.json({ error: "Failed to add pipeline note" }, { status: 400 });
  }
}
