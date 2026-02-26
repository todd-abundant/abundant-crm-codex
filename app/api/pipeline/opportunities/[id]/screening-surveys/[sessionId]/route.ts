import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { canAccessAdmin } from "@/lib/auth/permissions";
import { screeningSurveyPathFromToken } from "@/lib/screening-survey";

const patchSessionSchema = z
  .object({
    status: z.enum(["DRAFT", "LIVE", "CLOSED"]).optional(),
    title: z.string().trim().min(1).max(140).optional(),
    questions: z
      .array(
        z.object({
          questionId: z.string().min(1),
          category: z.string().trim().min(1).max(80),
          prompt: z.string().trim().min(1).max(360),
          instructions: z.string().trim().max(600).optional().or(z.literal("")),
          displayOrder: z.number().int().min(0)
        })
      )
      .min(1)
      .optional()
  })
  .superRefine((value, ctx) => {
    if (!value.status && !value.title && !value.questions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide status, title, or questions."
      });
    }
  });

function toSessionResponse(
  session: {
    id: string;
    title: string;
    accessToken: string;
    status: "DRAFT" | "LIVE" | "CLOSED";
    openedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    questions: Array<{
      id: string;
      questionId: string;
      displayOrder: number;
      categoryOverride: string | null;
      promptOverride: string | null;
      instructionsOverride: string | null;
      question: {
        id: string;
        category: string;
        prompt: string;
        instructions: string | null;
        scaleMin: number;
        scaleMax: number;
      };
    }>;
    _count: {
      questions: number;
      submissions: number;
    };
    submissions: Array<{ submittedAt: Date }>;
  }
) {
  return {
    id: session.id,
    title: session.title,
    status: session.status,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    questionCount: session._count.questions,
    responseCount: session._count.submissions,
    lastResponseAt: session.submissions[0]?.submittedAt || null,
    sharePath: screeningSurveyPathFromToken(session.accessToken),
    questions: session.questions.map((entry) => ({
      sessionQuestionId: entry.id,
      questionId: entry.questionId,
      displayOrder: entry.displayOrder,
      category: entry.categoryOverride || entry.question.category,
      prompt: entry.promptOverride || entry.question.prompt,
      instructions: entry.instructionsOverride || entry.question.instructions,
      scaleMin: entry.question.scaleMin,
      scaleMax: entry.question.scaleMax
    }))
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: companyId, sessionId } = await context.params;
    const input = patchSessionSchema.parse(await request.json());
    const user = await getCurrentUser();
    if (!user || !canAccessAdmin(user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.companyScreeningSurveySession.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          companyId: true,
          openedAt: true,
          questions: {
            orderBy: [{ displayOrder: "asc" }],
            select: {
              questionId: true,
              categoryOverride: true,
              promptOverride: true,
              instructionsOverride: true,
              question: {
                select: {
                  category: true,
                  prompt: true,
                  instructions: true
                }
              }
            }
          }
        }
      });

      if (!existing || existing.companyId !== companyId) {
        throw new Error("Screening survey session not found");
      }

      let questionsToSave:
        | Array<{
            questionId: string;
            category: string;
            prompt: string;
            instructions: string | null;
            displayOrder: number;
          }>
        | null = null;

      if (input.questions) {
        const dedupedQuestionIds = new Set<string>();
        for (const entry of input.questions) {
          if (dedupedQuestionIds.has(entry.questionId)) {
            throw new Error("Each question can only be included once per survey.");
          }
          dedupedQuestionIds.add(entry.questionId);
        }

        const existingQuestions = await tx.companyScreeningSurveyQuestion.findMany({
          where: { id: { in: Array.from(dedupedQuestionIds) } },
          select: { id: true }
        });

        if (existingQuestions.length !== dedupedQuestionIds.size) {
          throw new Error("One or more questions no longer exist.");
        }

        const normalizedIncomingQuestions = [...input.questions]
          .sort((a, b) => a.displayOrder - b.displayOrder)
          .map((entry, index) => ({
            questionId: entry.questionId,
            category: entry.category.trim(),
            prompt: entry.prompt.trim(),
            instructions: entry.instructions?.trim() || null,
            displayOrder: index
          }));

        const normalizedExistingQuestions = existing.questions.map((entry, index) => ({
          questionId: entry.questionId,
          category: (entry.categoryOverride || entry.question.category).trim(),
          prompt: (entry.promptOverride || entry.question.prompt).trim(),
          instructions: (entry.instructionsOverride || entry.question.instructions || "").trim() || null,
          displayOrder: index
        }));

        const questionSetChanged =
          JSON.stringify(normalizedIncomingQuestions) !==
          JSON.stringify(normalizedExistingQuestions);

        if (questionSetChanged) {
          const submissionCount = await tx.companyScreeningSurveySubmission.count({
            where: { sessionId }
          });
          if (submissionCount > 0) {
            throw new Error("Cannot modify question set after responses have been submitted.");
          }
          questionsToSave = normalizedIncomingQuestions;
        }
      }

      const now = new Date();
      if (input.status === "LIVE") {
        await tx.companyScreeningSurveySession.updateMany({
          where: {
            companyId,
            status: "LIVE",
            id: { not: sessionId }
          },
          data: {
            status: "CLOSED",
            closedAt: now
          }
        });
      }

      const data: {
        title?: string;
        status?: "DRAFT" | "LIVE" | "CLOSED";
        openedAt?: Date | null;
        closedAt?: Date | null;
      } = {};

      if (input.title) data.title = input.title;
      if (input.status) {
        data.status = input.status;
        if (input.status === "LIVE") {
          data.openedAt = existing.openedAt || now;
          data.closedAt = null;
        } else if (input.status === "CLOSED") {
          data.closedAt = now;
        } else if (input.status === "DRAFT") {
          data.closedAt = null;
        }
      }

      const updated = await tx.companyScreeningSurveySession.update({
        where: { id: sessionId },
        data
      });

      if (questionsToSave) {
        await tx.companyScreeningSurveySessionQuestion.deleteMany({
          where: { sessionId }
        });

        await tx.companyScreeningSurveySessionQuestion.createMany({
          data: questionsToSave.map((entry) => ({
            sessionId,
            questionId: entry.questionId,
            displayOrder: entry.displayOrder,
            categoryOverride: entry.category,
            promptOverride: entry.prompt,
            instructionsOverride: entry.instructions
          }))
        });
      }

      return tx.companyScreeningSurveySession.findUniqueOrThrow({
        where: { id: updated.id },
        include: {
          questions: {
            orderBy: [{ displayOrder: "asc" }],
            include: {
              question: {
                select: {
                  id: true,
                  category: true,
                  prompt: true,
                  instructions: true,
                  scaleMin: true,
                  scaleMax: true
                }
              }
            }
          },
          submissions: {
            orderBy: [{ submittedAt: "desc" }],
            take: 1,
            select: { submittedAt: true }
          },
          _count: {
            select: {
              questions: true,
              submissions: true
            }
          }
        }
      });
    });

    return NextResponse.json({ session: toSessionResponse(session) });
  } catch (error) {
    console.error("update_pipeline_screening_survey_session_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update screening survey session" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: companyId, sessionId } = await context.params;
    const user = await getCurrentUser();
    if (!user || !canAccessAdmin(user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const existing = await prisma.companyScreeningSurveySession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        companyId: true
      }
    });

    if (!existing || existing.companyId !== companyId) {
      return NextResponse.json({ error: "Screening survey session not found" }, { status: 404 });
    }

    await prisma.companyScreeningSurveySession.delete({
      where: { id: sessionId }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("delete_pipeline_screening_survey_session_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete screening survey session" },
      { status: 400 }
    );
  }
}
