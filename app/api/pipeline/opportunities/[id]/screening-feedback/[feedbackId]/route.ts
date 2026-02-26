import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const updateQualitativeFeedbackSchema = z
  .object({
    contactId: z.string().optional().nullable(),
    category: z.string().optional().nullable(),
    theme: z.string().trim().min(1).optional(),
    sentiment: z.enum(["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE"]).optional(),
    feedback: z.string().trim().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (
      value.contactId === undefined &&
      value.category === undefined &&
      value.theme === undefined &&
      value.sentiment === undefined &&
      value.feedback === undefined
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at least one field to update."
      });
    }
  });

function toNullableString(value?: string | null) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function toEntryResponse(entry: {
  id: string;
  healthSystemId: string;
  contactId: string | null;
  category: string | null;
  theme: string;
  sentiment: "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";
  feedback: string;
  updatedAt: Date;
  contact: { name: string; title: string | null } | null;
}) {
  return {
    id: entry.id,
    healthSystemId: entry.healthSystemId,
    contactId: entry.contactId,
    contactName: entry.contact?.name || "Individual not linked",
    contactTitle: entry.contact?.title || null,
    category: entry.category,
    theme: entry.theme,
    sentiment: entry.sentiment,
    feedback: entry.feedback,
    updatedAt: entry.updatedAt
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; feedbackId: string }> }
) {
  try {
    const { id: companyId, feedbackId } = await context.params;
    const input = updateQualitativeFeedbackSchema.parse(await request.json());

    const existing = await prisma.companyScreeningQualitativeFeedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, companyId: true }
    });

    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: "Qualitative feedback not found" }, { status: 404 });
    }

    const nextContactId =
      input.contactId === undefined ? undefined : toNullableString(input.contactId);

    if (nextContactId) {
      const contact = await prisma.contact.findUnique({
        where: { id: nextContactId },
        select: { id: true }
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      }
    }

    const updated = await prisma.companyScreeningQualitativeFeedback.update({
      where: { id: feedbackId },
      data: {
        ...(input.contactId !== undefined ? { contactId: nextContactId } : {}),
        ...(input.category !== undefined ? { category: toNullableString(input.category) } : {}),
        ...(input.theme !== undefined ? { theme: input.theme.trim() } : {}),
        ...(input.sentiment !== undefined ? { sentiment: input.sentiment } : {}),
        ...(input.feedback !== undefined ? { feedback: input.feedback.trim() } : {})
      },
      include: {
        contact: {
          select: {
            name: true,
            title: true
          }
        }
      }
    });

    return NextResponse.json({ entry: toEntryResponse(updated) });
  } catch (error) {
    console.error("update_pipeline_screening_qualitative_feedback_error", error);
    return NextResponse.json({ error: "Failed to update qualitative feedback" }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; feedbackId: string }> }
) {
  try {
    const { id: companyId, feedbackId } = await context.params;

    const existing = await prisma.companyScreeningQualitativeFeedback.findUnique({
      where: { id: feedbackId },
      select: { id: true, companyId: true }
    });

    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: "Qualitative feedback not found" }, { status: 404 });
    }

    await prisma.companyScreeningQualitativeFeedback.delete({
      where: { id: feedbackId }
    });

    return NextResponse.json({ ok: true, id: feedbackId });
  } catch (error) {
    console.error("delete_pipeline_screening_qualitative_feedback_error", error);
    return NextResponse.json({ error: "Failed to delete qualitative feedback" }, { status: 400 });
  }
}
