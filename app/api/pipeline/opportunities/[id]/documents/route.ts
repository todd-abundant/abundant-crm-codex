import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeCompanyDocumentUrl } from "@/lib/company-document-links";

const companyDocumentSchema = z.object({
  type: z
    .enum([
      "INTAKE_REPORT",
      "SCREENING_REPORT",
      "TERM_SHEET",
      "VENTURE_STUDIO_CONTRACT",
      "LOI",
      "COMMERCIAL_CONTRACT",
      "OTHER"
    ])
    .default("OTHER"),
  title: z.string().min(1),
  url: z.string().min(1),
  notes: z.string().optional().nullable(),
  uploadedAt: z.string().optional().nullable()
});

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function parseUploadedAt(value?: string | null) {
  if (!value) return new Date();
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date();
  return parsed;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = companyDocumentSchema.parse(body);

    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const title = input.title.trim();
    const normalizedUrl = normalizeCompanyDocumentUrl(input.url);

    if (!title) {
      return NextResponse.json({ error: "Document title is required" }, { status: 400 });
    }

    if (!normalizedUrl) {
      return NextResponse.json({ error: "Document URL must be a valid link or uploaded file payload" }, { status: 400 });
    }

    const document = await prisma.companyDocument.create({
      data: {
        companyId: id,
        type: input.type,
        title,
        url: normalizedUrl,
        notes: toNullableString(input.notes),
        uploadedAt: parseUploadedAt(input.uploadedAt)
      }
    });

    return NextResponse.json(
      {
        document: {
          id: document.id,
          type: document.type,
          title: document.title,
          url: document.url,
          notes: document.notes,
          uploadedAt: document.uploadedAt
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("create_pipeline_company_document_error", error);
    return NextResponse.json({ error: "Failed to add company document" }, { status: 400 });
  }
}
