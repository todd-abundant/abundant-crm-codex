import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const screeningDocumentSchema = z.object({
  healthSystemId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().min(1),
  notes: z.string().optional(),
  uploadedAt: z.string().optional()
});

function toNullableString(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed ? trimmed : null;
}

function parseUploadedAt(value?: string) {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = screeningDocumentSchema.parse(body);

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

    const document = await prisma.companyScreeningDocument.create({
      data: {
        companyId: id,
        healthSystemId: input.healthSystemId,
        title: input.title.trim(),
        url: input.url.trim(),
        notes: toNullableString(input.notes),
        uploadedAt: parseUploadedAt(input.uploadedAt)
      }
    });

    return NextResponse.json(
      {
        document: {
          id: document.id,
          healthSystemId: document.healthSystemId,
          title: document.title,
          url: document.url,
          notes: document.notes,
          uploadedAt: document.uploadedAt
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("create_pipeline_screening_document_error", error);
    return NextResponse.json({ error: "Failed to add screening document" }, { status: 400 });
  }
}
