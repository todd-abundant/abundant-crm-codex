import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth/server";
import {
  screeningSurveyTemplateInclude,
  syncTemplateQuestions,
  toScreeningSurveyTemplateResponse,
  validateTemplateQuestionSet
} from "@/lib/screening-survey-library";

const templateQuestionSchema = z.object({
  questionId: z.string().min(1),
  category: z.string().trim().min(1).max(80),
  prompt: z.string().trim().min(1).max(360),
  instructions: z.string().trim().max(600).optional().nullable().or(z.literal("")),
  displayOrder: z.number().int().min(0)
});

const updateTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(140).optional(),
    description: z.string().trim().max(500).optional().or(z.literal("")),
    isActive: z.boolean().optional(),
    questions: z.array(templateQuestionSchema).min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (
      !Object.prototype.hasOwnProperty.call(value, "name") &&
      !Object.prototype.hasOwnProperty.call(value, "description") &&
      !Object.prototype.hasOwnProperty.call(value, "isActive") &&
      !Object.prototype.hasOwnProperty.call(value, "questions")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide name, description, isActive, or questions."
      });
    }
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { templateId } = await context.params;
    const input = updateTemplateSchema.parse(await request.json());

    const template = await prisma.$transaction(async (tx) => {
      const existingTemplate = await tx.companyScreeningSurveyTemplate.findUnique({
        where: { id: templateId },
        select: { id: true }
      });
      if (!existingTemplate) {
        throw new Error("Survey template not found.");
      }

      const data: {
        name?: string;
        description?: string | null;
        isActive?: boolean;
      } = {};

      if (Object.prototype.hasOwnProperty.call(input, "name") && input.name) {
        data.name = input.name.trim();
      }
      if (Object.prototype.hasOwnProperty.call(input, "description")) {
        data.description = input.description?.trim() || null;
      }
      if (Object.prototype.hasOwnProperty.call(input, "isActive")) {
        data.isActive = input.isActive;
      }

      if (Object.keys(data).length > 0) {
        await tx.companyScreeningSurveyTemplate.update({
          where: { id: templateId },
          data
        });
      }

      if (input.questions) {
        const normalizedQuestions = await validateTemplateQuestionSet(
          tx,
          input.questions.map((entry) => ({
            questionId: entry.questionId,
            category: entry.category,
            prompt: entry.prompt,
            instructions: entry.instructions?.trim() || null,
            displayOrder: entry.displayOrder
          }))
        );
        await syncTemplateQuestions(tx, templateId, normalizedQuestions);
      }

      return tx.companyScreeningSurveyTemplate.findUniqueOrThrow({
        where: { id: templateId },
        include: screeningSurveyTemplateInclude
      });
    });

    return NextResponse.json({ template: toScreeningSurveyTemplateResponse(template) });
  } catch (error) {
    console.error("update_admin_screening_survey_template_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update survey template." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ templateId: string }> }
) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { templateId } = await context.params;
    const template = await prisma.companyScreeningSurveyTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        isStandard: true
      }
    });
    if (!template) {
      return NextResponse.json({ error: "Survey template not found." }, { status: 404 });
    }
    if (template.isStandard) {
      return NextResponse.json(
        { error: "Standard templates cannot be deleted." },
        { status: 400 }
      );
    }

    await prisma.companyScreeningSurveyTemplate.delete({
      where: { id: templateId }
    });

    return NextResponse.json({ deletedTemplateId: templateId });
  } catch (error) {
    console.error("delete_admin_screening_survey_template_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete survey template." },
      { status: 400 }
    );
  }
}
