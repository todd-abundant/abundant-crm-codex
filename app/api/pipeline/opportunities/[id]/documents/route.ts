import { NextResponse } from "next/server";
import { CompanyDocumentType } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { normalizeCompanyDocumentUrl } from "@/lib/company-document-links";
import { parseDateInput } from "@/lib/date-parse";

const companyDocumentSchema = z.object({
  type: z.nativeEnum(CompanyDocumentType).default("OTHER"),
  title: z.string().min(1),
  url: z.string().min(1),
  notes: z.string().optional().nullable(),
  uploadedAt: z.string().optional().nullable()
});
const companyDocumentUpdateSchema = z.object({
  documentId: z.string().min(1),
  type: z.nativeEnum(CompanyDocumentType),
  title: z.string().min(1),
  url: z.string().min(1),
  notes: z.string().optional().nullable(),
  uploadedAt: z.string().optional().nullable()
});
const companyDocumentDeleteSchema = z.object({
  documentId: z.string().min(1)
});

type CompanyDocumentRecord = {
  id: string;
  type: CompanyDocumentType;
  title: string;
  url: string;
  notes: string | null;
  uploadedAt: Date;
};

function toCompanyDocumentPayload(document: CompanyDocumentRecord) {
  return {
    id: document.id,
    type: document.type,
    title: document.title,
    url: document.url,
    notes: document.notes,
    uploadedAt: document.uploadedAt
  };
}

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function parseUploadedAt(value?: string | null) {
  if (!value) return new Date();
  const parsed = parseDateInput(value);
  if (!parsed) return new Date();
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const body = await request.json();
    const input = companyDocumentUpdateSchema.parse(body);
    const title = input.title.trim();
    const normalizedUrl = normalizeCompanyDocumentUrl(input.url);

    if (!title) {
      return NextResponse.json({ error: "Document title is required" }, { status: 400 });
    }

    if (!normalizedUrl) {
      return NextResponse.json(
        { error: "Document URL must be a valid link or uploaded file payload" },
        { status: 400 }
      );
    }

    const updated = await prisma.companyDocument.findFirst({
      where: {
        id: input.documentId,
        companyId: id
      }
    });

    if (!updated) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const nextDocument = await prisma.companyDocument.update({
      where: { id: input.documentId },
      data: {
        type: input.type,
        title,
        url: normalizedUrl,
        notes: toNullableString(input.notes),
        uploadedAt: parseUploadedAt(input.uploadedAt)
      }
    });

    return NextResponse.json({ document: toCompanyDocumentPayload(nextDocument as CompanyDocumentRecord) });
  } catch (error) {
    console.error("update_pipeline_company_document_error", error);
    return NextResponse.json({ error: "Failed to update company document" }, { status: 400 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    const body = await request.json();
    const input = companyDocumentDeleteSchema.parse(body);

    const deleted = await prisma.companyDocument.deleteMany({
      where: {
        id: input.documentId,
        companyId: id
      }
    });

    if (deleted.count === 0) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: input.documentId });
  } catch (error) {
    console.error("delete_pipeline_company_document_error", error);
    return NextResponse.json({ error: "Failed to delete company document" }, { status: 400 });
  }
}
