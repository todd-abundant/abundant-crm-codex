import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { canAccessAdmin } from "@/lib/auth/permissions";

type QuestionAggregate = {
  sessionQuestionId: string;
  category: string;
  prompt: string;
  instructions: string | null;
  displayOrder: number;
  sum: number;
  count: number;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  try {
    const { id: companyId, sessionId } = await context.params;
    const user = await getCurrentUser();
    if (!user || !canAccessAdmin(user.roles)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const session = await prisma.companyScreeningSurveySession.findUnique({
      where: { id: sessionId },
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
          include: {
            healthSystem: {
              select: {
                id: true,
                name: true
              }
            },
            contact: {
              select: {
                id: true,
                name: true,
                title: true,
                email: true
              }
            },
            answers: {
              include: {
                sessionQuestion: {
                  include: {
                    question: {
                      select: {
                        id: true,
                        category: true,
                        prompt: true,
                        instructions: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!session || session.companyId !== companyId) {
      return NextResponse.json({ error: "Screening survey session not found" }, { status: 404 });
    }

    const sessionQuestionById = new Map(
      session.questions.map((entry) => [
        entry.id,
        {
          sessionQuestionId: entry.id,
          displayOrder: entry.displayOrder,
          questionId: entry.questionId,
          category: entry.categoryOverride || entry.question.category,
          prompt: entry.promptOverride || entry.question.prompt,
          instructions: entry.instructionsOverride || entry.question.instructions,
          scaleMin: entry.question.scaleMin,
          scaleMax: entry.question.scaleMax
        }
      ] as const)
    );

    const categoryAggregate = new Map<string, { sum: number; count: number }>();
    const questionAggregate = new Map<string, QuestionAggregate>();

    const submissions = session.submissions.map((submission) => {
      const sortedAnswers = [...submission.answers].sort((a, b) => {
        const aOrder = sessionQuestionById.get(a.sessionQuestionId)?.displayOrder ?? 0;
        const bOrder = sessionQuestionById.get(b.sessionQuestionId)?.displayOrder ?? 0;
        return aOrder - bOrder;
      });

      const mappedAnswers = sortedAnswers.map((answer) => {
        const configuredQuestion = sessionQuestionById.get(answer.sessionQuestionId);
        const category =
          configuredQuestion?.category ||
          answer.sessionQuestion.categoryOverride ||
          answer.sessionQuestion.question.category;
        const prompt =
          configuredQuestion?.prompt ||
          answer.sessionQuestion.promptOverride ||
          answer.sessionQuestion.question.prompt;
        const instructions =
          configuredQuestion?.instructions ||
          answer.sessionQuestion.instructionsOverride ||
          answer.sessionQuestion.question.instructions ||
          null;
        const displayOrder = configuredQuestion?.displayOrder ?? 0;

        const categoryBucket = categoryAggregate.get(category) || { sum: 0, count: 0 };
        categoryBucket.sum += answer.score;
        categoryBucket.count += 1;
        categoryAggregate.set(category, categoryBucket);

        const questionBucket = questionAggregate.get(answer.sessionQuestionId) || {
          sessionQuestionId: answer.sessionQuestionId,
          category,
          prompt,
          instructions,
          displayOrder,
          sum: 0,
          count: 0
        };
        questionBucket.sum += answer.score;
        questionBucket.count += 1;
        questionAggregate.set(answer.sessionQuestionId, questionBucket);

        return {
          answerId: answer.id,
          sessionQuestionId: answer.sessionQuestionId,
          questionId: answer.questionId,
          category,
          prompt,
          instructions,
          score: answer.score
        };
      });

      const averageScore =
        mappedAnswers.length > 0
          ? Math.round(
              (mappedAnswers.reduce((sum, entry) => sum + entry.score, 0) / mappedAnswers.length) * 10
            ) / 10
          : null;

      return {
        submissionId: submission.id,
        submittedAt: submission.submittedAt,
        participantName: submission.participantName || submission.contact?.name || "Unknown participant",
        participantEmail: submission.participantEmail || submission.contact?.email || null,
        contactId: submission.contactId,
        contactName: submission.contact?.name || null,
        contactTitle: submission.contact?.title || null,
        healthSystemId: submission.healthSystemId,
        healthSystemName: submission.healthSystem?.name || "Unlinked health system",
        answerCount: mappedAnswers.length,
        averageScore,
        answers: mappedAnswers
      };
    });

    const categoryOrder = session.questions.reduce<string[]>((order, entry) => {
      const category = (entry.categoryOverride || entry.question.category).trim() || "General";
      if (!order.includes(category)) {
        order.push(category);
      }
      return order;
    }, []);

    const categoryAverages = Array.from(categoryAggregate.entries())
      .map(([category, totals]) => ({
        category,
        responseCount: totals.count,
        averageScore: totals.count > 0 ? Math.round((totals.sum / totals.count) * 10) / 10 : null
      }))
      .sort((a, b) => {
        const aIndex = categoryOrder.indexOf(a.category);
        const bIndex = categoryOrder.indexOf(b.category);
        if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;
        if (aIndex >= 0) return -1;
        if (bIndex >= 0) return 1;
        return a.category.localeCompare(b.category);
      });

    const questionAverages = Array.from(questionAggregate.values())
      .map((entry) => ({
        sessionQuestionId: entry.sessionQuestionId,
        category: entry.category,
        prompt: entry.prompt,
        instructions: entry.instructions,
        responseCount: entry.count,
        averageScore: entry.count > 0 ? Math.round((entry.sum / entry.count) * 10) / 10 : null,
        displayOrder: entry.displayOrder
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((entry) => ({
        sessionQuestionId: entry.sessionQuestionId,
        category: entry.category,
        prompt: entry.prompt,
        instructions: entry.instructions,
        responseCount: entry.responseCount,
        averageScore: entry.averageScore
      }));

    return NextResponse.json({
      session: {
        id: session.id,
        companyId: session.companyId,
        title: session.title,
        status: session.status,
        responseCount: submissions.length,
        questionCount: session.questions.length,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        updatedAt: session.updatedAt,
        lastResponseAt: submissions[0]?.submittedAt || null
      },
      submissions,
      categoryAverages,
      questionAverages
    });
  } catch (error) {
    console.error("get_pipeline_screening_survey_results_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load screening survey results" },
      { status: 400 }
    );
  }
}
