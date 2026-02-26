import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { canAccessAdmin } from "@/lib/auth/permissions";

const createQuestionSchema = z
  .object({
    category: z.string().trim().min(1).max(80),
    prompt: z.string().trim().min(1).max(360),
    instructions: z.string().trim().max(600).optional().or(z.literal("")),
    scaleMin: z.number().int().min(0).max(10).default(1),
    scaleMax: z.number().int().min(1).max(10).default(10),
    isActive: z.boolean().default(true)
  })
  .superRefine((value, ctx) => {
    if (value.scaleMin >= value.scaleMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "scaleMin must be less than scaleMax."
      });
    }
  });

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const user = await getCurrentUser();
    if (!user || !canAccessAdmin(user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const input = createQuestionSchema.parse(await request.json());

    const question = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true }
      });
      if (!company) {
        throw new Error("Pipeline item not found");
      }

      const existing = await tx.companyScreeningSurveyQuestion.findFirst({
        where: {
          category: { equals: input.category, mode: "insensitive" },
          prompt: { equals: input.prompt, mode: "insensitive" }
        },
        select: {
          id: true,
          category: true,
          prompt: true,
          instructions: true,
          scaleMin: true,
          scaleMax: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });

      if (existing) {
        return existing;
      }

      return tx.companyScreeningSurveyQuestion.create({
        data: {
          category: input.category,
          prompt: input.prompt,
          instructions: input.instructions?.trim() || null,
          scaleMin: input.scaleMin,
          scaleMax: input.scaleMax,
          isActive: input.isActive,
          createdByUserId: user?.id || null
        },
        select: {
          id: true,
          category: true,
          prompt: true,
          instructions: true,
          scaleMin: true,
          scaleMax: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        }
      });
    });

    return NextResponse.json({ question }, { status: 201 });
  } catch (error) {
    console.error("create_pipeline_screening_survey_question_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create screening survey question" },
      { status: 400 }
    );
  }
}
