import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

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

    const created = await prisma.companyPipelineNote.create({
      data: {
        companyId: id,
        note: input.note.trim()
      }
    });

    const count = await prisma.companyPipelineNote.count({
      where: { companyId: id }
    });

    return NextResponse.json(
      {
        note: {
          id: created.id,
          note: created.note,
          createdAt: created.createdAt
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
