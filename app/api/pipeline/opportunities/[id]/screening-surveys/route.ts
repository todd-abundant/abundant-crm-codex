import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { canAccessAdmin } from "@/lib/auth/permissions";
import {
  createScreeningSurveyAccessToken,
  ensureDefaultScreeningSurveyQuestions,
  screeningSurveyPathFromToken
} from "@/lib/screening-survey";

const createSessionSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  questionIds: z.array(z.string().min(1)).min(1),
  openNow: z.boolean().default(true)
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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;

    const payload = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      });
      if (!company) {
        return {
          error: "Pipeline item not found",
          status: 404 as const
        };
      }

      await ensureDefaultScreeningSurveyQuestions(tx);

      const [questionBank, sessions] = await Promise.all([
        tx.companyScreeningSurveyQuestion.findMany({
          orderBy: [{ category: "asc" }, { createdAt: "asc" }],
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
        }),
        tx.companyScreeningSurveySession.findMany({
          where: { companyId },
          orderBy: [{ updatedAt: "desc" }],
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
        })
      ]);

      return {
        status: 200 as const,
        data: {
          company,
          questionBank,
          sessions: sessions.map(toSessionResponse),
          activeSessionId: sessions.find((session) => session.status === "LIVE")?.id || null
        }
      };
    });

    if ("error" in payload) {
      return NextResponse.json({ error: payload.error }, { status: payload.status });
    }

    return NextResponse.json(payload.data);
  } catch (error) {
    console.error("get_pipeline_screening_surveys_error", error);
    return NextResponse.json({ error: "Failed to load screening surveys" }, { status: 400 });
  }
}

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
    const input = createSessionSchema.parse(await request.json());

    const session = await prisma.$transaction(async (tx) => {
      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      });
      if (!company) {
        throw new Error("Pipeline item not found");
      }

      const dedupedQuestionIds = Array.from(new Set(input.questionIds));
      const questions = await tx.companyScreeningSurveyQuestion.findMany({
        where: {
          id: { in: dedupedQuestionIds },
          isActive: true
        },
        select: { id: true }
      });

      if (questions.length !== dedupedQuestionIds.length) {
        throw new Error("One or more selected questions are unavailable.");
      }

      const now = new Date();
      if (input.openNow) {
        await tx.companyScreeningSurveySession.updateMany({
          where: {
            companyId,
            status: "LIVE"
          },
          data: {
            status: "CLOSED",
            closedAt: now
          }
        });
      }

      const created = await tx.companyScreeningSurveySession.create({
        data: {
          companyId,
          title: input.title || `${company.name} Live Screening Survey`,
          accessToken: createScreeningSurveyAccessToken(),
          status: input.openNow ? "LIVE" : "DRAFT",
          openedAt: input.openNow ? now : null,
          createdByUserId: user?.id || null
        }
      });

      await tx.companyScreeningSurveySessionQuestion.createMany({
        data: dedupedQuestionIds.map((questionId, index) => ({
          sessionId: created.id,
          questionId,
          displayOrder: index
        }))
      });

      return tx.companyScreeningSurveySession.findUniqueOrThrow({
        where: { id: created.id },
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

    return NextResponse.json({ session: toSessionResponse(session) }, { status: 201 });
  } catch (error) {
    console.error("create_pipeline_screening_survey_session_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create screening survey session" },
      { status: 400 }
    );
  }
}
