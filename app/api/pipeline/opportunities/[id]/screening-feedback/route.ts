import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";

const quantitativeFeedbackSchema = z.object({
  type: z.literal("QUANTITATIVE"),
  healthSystemId: z.string().min(1),
  contactId: z.string().optional(),
  category: z.string().optional(),
  metric: z.string().min(1),
  score: z.number().min(1).max(10).optional(),
  weightPercent: z.number().int().min(0).max(100).optional(),
  notes: z.string().optional()
});

const qualitativeFeedbackSchema = z.object({
  type: z.literal("QUALITATIVE"),
  healthSystemId: z.string().min(1),
  contactId: z.string().optional(),
  category: z.string().optional(),
  theme: z.string().min(1),
  sentiment: z.enum(["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE"]).default("NEUTRAL"),
  feedback: z.string().min(1)
});

const screeningFeedbackSchema = z.discriminatedUnion("type", [
  quantitativeFeedbackSchema,
  qualitativeFeedbackSchema
]);

function toNullableString(value?: string) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

function toNumber(value: { toString(): string } | null | undefined) {
  if (!value) return null;
  const numeric = Number(value.toString());
  return Number.isFinite(numeric) ? numeric : null;
}

async function validateScope(
  companyId: string,
  healthSystemId: string,
  contactId: string | null
) {
  const [company, healthSystem, contact] = await Promise.all([
    prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true }
    }),
    prisma.healthSystem.findUnique({
      where: { id: healthSystemId },
      select: { id: true, isAllianceMember: true }
    }),
    contactId
      ? prisma.contact.findUnique({
          where: { id: contactId },
          select: { id: true }
        })
      : Promise.resolve({ id: null as string | null })
  ]);

  if (!company) {
    return { error: "Pipeline item not found", status: 404 as const };
  }

  if (!healthSystem || !healthSystem.isAllianceMember) {
    return { error: "Alliance health system not found", status: 404 as const };
  }

  if (contactId && !contact?.id) {
    return { error: "Contact not found", status: 404 as const };
  }

  return null;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = screeningFeedbackSchema.parse(body);
    const contactId = toNullableString(input.contactId);

    const scopeError = await validateScope(id, input.healthSystemId, contactId);
    if (scopeError) {
      return NextResponse.json({ error: scopeError.error }, { status: scopeError.status });
    }

    if (input.type === "QUANTITATIVE") {
      const feedback = await prisma.companyScreeningQuantitativeFeedback.create({
        data: {
          companyId: id,
          healthSystemId: input.healthSystemId,
          contactId,
          category: toNullableString(input.category),
          metric: input.metric.trim(),
          score: input.score ?? null,
          weightPercent: input.weightPercent ?? null,
          notes: toNullableString(input.notes)
        },
        include: {
          contact: {
            select: {
              id: true,
              name: true,
              title: true
            }
          }
        }
      });

      return NextResponse.json(
        {
          type: "QUANTITATIVE",
          entry: {
            id: feedback.id,
            healthSystemId: feedback.healthSystemId,
            contactId: feedback.contactId,
            contactName: feedback.contact?.name || "Individual not linked",
            contactTitle: feedback.contact?.title || null,
            category: feedback.category,
            metric: feedback.metric,
            score: toNumber(feedback.score),
            weightPercent: feedback.weightPercent,
            notes: feedback.notes,
            updatedAt: feedback.updatedAt
          }
        },
        { status: 201 }
      );
    }

    const feedback = await prisma.companyScreeningQualitativeFeedback.create({
      data: {
        companyId: id,
        healthSystemId: input.healthSystemId,
        contactId,
        category: toNullableString(input.category),
        theme: input.theme.trim(),
        sentiment: input.sentiment,
        feedback: input.feedback.trim()
      },
      include: {
        contact: {
          select: {
            id: true,
            name: true,
            title: true
          }
        }
      }
    });

    return NextResponse.json(
      {
        type: "QUALITATIVE",
        entry: {
          id: feedback.id,
          healthSystemId: feedback.healthSystemId,
          contactId: feedback.contactId,
          contactName: feedback.contact?.name || "Individual not linked",
          contactTitle: feedback.contact?.title || null,
          category: feedback.category,
          theme: feedback.theme,
          sentiment: feedback.sentiment,
          feedback: feedback.feedback,
          updatedAt: feedback.updatedAt
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("create_pipeline_screening_feedback_error", error);
    return NextResponse.json({ error: "Failed to add screening feedback" }, { status: 400 });
  }
}
