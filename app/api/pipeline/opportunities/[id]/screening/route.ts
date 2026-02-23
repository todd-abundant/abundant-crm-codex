import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const screeningUpdateSchema = z.object({
  healthSystemId: z.string().min(1),
  status: z
    .enum(["NOT_STARTED", "PENDING", "NEGOTIATING", "SIGNED", "DECLINED"])
    .optional(),
  note: z.string().optional()
});

function appendNote(existing: string | null, nextNote: string | undefined) {
  const trimmed = (nextNote || "").trim();
  if (!trimmed) return existing;

  const timestamp = new Date().toISOString();
  const nextEntry = `[${timestamp}] ${trimmed}`;
  if (!existing || !existing.trim()) {
    return nextEntry;
  }

  return `${existing.trim()}\n\n${nextEntry}`;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = screeningUpdateSchema.parse(body);

    const [company, healthSystem] = await Promise.all([
      prisma.company.findUnique({ where: { id }, select: { id: true } }),
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

    const existing = await prisma.companyLoi.findUnique({
      where: {
        companyId_healthSystemId: {
          companyId: id,
          healthSystemId: input.healthSystemId
        }
      }
    });

    const nextStatus = input.status || existing?.status || "NOT_STARTED";
    const statusChanged = input.status ? input.status !== existing?.status : false;
    const nextNotes = appendNote(existing?.notes || null, input.note);

    const nextSignedAt =
      nextStatus === "SIGNED"
        ? existing?.signedAt || new Date()
        : statusChanged
          ? null
          : existing?.signedAt || null;

    const next = await prisma.companyLoi.upsert({
      where: {
        companyId_healthSystemId: {
          companyId: id,
          healthSystemId: input.healthSystemId
        }
      },
      create: {
        companyId: id,
        healthSystemId: input.healthSystemId,
        status: nextStatus,
        statusUpdatedAt: new Date(),
        signedAt: nextSignedAt,
        notes: nextNotes
      },
      update: {
        status: nextStatus,
        statusUpdatedAt: statusChanged ? new Date() : existing?.statusUpdatedAt || new Date(),
        signedAt: nextSignedAt,
        notes: nextNotes
      }
    });

    return NextResponse.json({
      healthSystemId: next.healthSystemId,
      status: next.status,
      notes: next.notes,
      signedAt: next.signedAt,
      statusUpdatedAt: next.statusUpdatedAt
    });
  } catch (error) {
    console.error("update_pipeline_screening_status_error", error);
    return NextResponse.json({ error: "Failed to update screening status" }, { status: 400 });
  }
}
