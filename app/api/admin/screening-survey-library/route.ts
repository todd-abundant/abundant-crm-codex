import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdminApi } from "@/lib/auth/server";
import {
  generateScreeningSurveyTemplateKey,
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
  drivesScreeningOpportunity: z.boolean().default(false),
  displayOrder: z.number().int().min(0)
});

const createTemplateSchema = z.object({
  name: z.string().trim().min(1).max(140),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean().default(true),
  questions: z.array(templateQuestionSchema).min(1)
});

export async function GET(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const { searchParams } = new URL(request.url);
    const templateId = (searchParams.get("templateId") || "").trim() || null;
    const questionId = (searchParams.get("questionId") || "").trim() || null;

    const templates = await prisma.companyScreeningSurveyTemplate.findMany({
      where: templateId ? { id: templateId } : undefined,
      include: {
        _count: {
          select: {
            questions: true,
            sessions: true
          }
        }
      },
      orderBy: [{ isStandard: "desc" }, { name: "asc" }]
    });

    const templateIds = templates.map((entry) => entry.id);

    const templateAnswerAgg =
      templateIds.length > 0
        ? await prisma.companyScreeningSurveyAnswer.groupBy({
            by: ["templateId"],
            where: {
              templateId: { in: templateIds },
              isSkipped: false,
              score: { not: null },
              ...(questionId ? { questionId } : {})
            },
            _count: {
              _all: true
            },
            _avg: {
              score: true
            }
          })
        : [];

    const templateSessions =
      templateIds.length > 0
        ? await prisma.companyScreeningSurveySession.findMany({
            where: {
              templateId: { in: templateIds }
            },
            select: {
              id: true,
              templateId: true,
              companyId: true
            }
          })
        : [];

    const templateStats = new Map<
      string,
      {
        responseCount: number;
        averageScore: number | null;
        sessionCount: number;
        companyCount: number;
      }
    >();

    for (const aggregate of templateAnswerAgg) {
      if (!aggregate.templateId) continue;
      templateStats.set(aggregate.templateId, {
        responseCount: aggregate._count._all,
        averageScore:
          aggregate._avg.score === null ? null : Math.round(aggregate._avg.score * 100) / 100,
        sessionCount: 0,
        companyCount: 0
      });
    }

    for (const template of templates) {
      const sessionsForTemplate = templateSessions.filter((entry) => entry.templateId === template.id);
      const companies = new Set(sessionsForTemplate.map((entry) => entry.companyId));
      const stats = templateStats.get(template.id) || {
        responseCount: 0,
        averageScore: null,
        sessionCount: 0,
        companyCount: 0
      };
      stats.sessionCount = sessionsForTemplate.length;
      stats.companyCount = companies.size;
      templateStats.set(template.id, stats);
    }

    const questionAnswerWhere: {
      templateId?: string | { in: string[] };
      questionId?: string;
      isSkipped?: boolean;
      score?: { not: null };
    } = {
      isSkipped: false,
      score: { not: null }
    };

    if (templateId) {
      questionAnswerWhere.templateId = templateId;
    } else if (templateIds.length > 0) {
      questionAnswerWhere.templateId = { in: templateIds };
    }
    if (questionId) {
      questionAnswerWhere.questionId = questionId;
    }

    const questionAnswerAgg = await prisma.companyScreeningSurveyAnswer.groupBy({
      by: ["questionId"],
      where: questionAnswerWhere,
      _count: {
        _all: true
      },
      _avg: {
        score: true
      }
    });

    const questionIds = questionAnswerAgg.map((entry) => entry.questionId);
    const questions =
      questionIds.length > 0
        ? await prisma.companyScreeningSurveyQuestion.findMany({
            where: { id: { in: questionIds } },
            select: {
              id: true,
              category: true,
              prompt: true,
              instructions: true,
              isStandard: true
            }
          })
        : [];
    const questionById = new Map(questions.map((entry) => [entry.id, entry] as const));

    const questionSessionPairs =
      questionIds.length > 0
        ? await prisma.companyScreeningSurveyAnswer.findMany({
            where: {
              ...questionAnswerWhere,
              questionId: { in: questionIds }
            },
            select: {
              questionId: true,
              sessionId: true,
              session: {
                select: {
                  companyId: true
                }
              }
            },
            distinct: ["questionId", "sessionId"]
          })
        : [];

    const companyCountByQuestion = new Map<string, number>();
    for (const question of questionIds) {
      const companies = new Set(
        questionSessionPairs
          .filter((entry) => entry.questionId === question)
          .map((entry) => entry.session.companyId)
      );
      companyCountByQuestion.set(question, companies.size);
    }

    return NextResponse.json({
      templateSummaries: templates.map((template) => {
        const stats = templateStats.get(template.id) || {
          responseCount: 0,
          averageScore: null,
          sessionCount: 0,
          companyCount: 0
        };

        return {
          templateId: template.id,
          key: template.key,
          name: template.name,
          description: template.description,
          isStandard: template.isStandard,
          questionCount: template._count.questions,
          sessionCount: stats.sessionCount,
          companyCount: stats.companyCount,
          responseCount: stats.responseCount,
          averageScore: stats.averageScore
        };
      }),
      questionSummaries: questionAnswerAgg
        .map((aggregate) => {
          const question = questionById.get(aggregate.questionId);
          if (!question) return null;
          return {
            questionId: question.id,
            category: question.category,
            prompt: question.prompt,
            instructions: question.instructions,
            isStandard: question.isStandard,
            companyCount: companyCountByQuestion.get(question.id) || 0,
            responseCount: aggregate._count._all,
            averageScore:
              aggregate._avg.score === null ? null : Math.round(aggregate._avg.score * 100) / 100
          };
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .sort((a, b) => b.responseCount - a.responseCount || a.prompt.localeCompare(b.prompt))
    });
  } catch (error) {
    console.error("get_admin_screening_survey_library_error", error);
    return NextResponse.json({ error: "Failed to load survey library analytics." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (!auth.ok) {
    return auth.response;
  }

  try {
    const input = createTemplateSchema.parse(await request.json());

    const template = await prisma.$transaction(async (tx) => {
      const normalizedQuestions = await validateTemplateQuestionSet(
        tx,
        input.questions.map((entry) => ({
          questionId: entry.questionId,
          category: entry.category,
          prompt: entry.prompt,
          instructions: entry.instructions?.trim() || null,
          drivesScreeningOpportunity: Boolean(entry.drivesScreeningOpportunity),
          displayOrder: entry.displayOrder
        }))
      );

      const key = await generateScreeningSurveyTemplateKey(tx, input.name);
      const created = await tx.companyScreeningSurveyTemplate.create({
        data: {
          key,
          name: input.name.trim(),
          description: input.description?.trim() || null,
          isActive: input.isActive,
          isStandard: false,
          createdByUserId: auth.user.id
        },
        select: {
          id: true
        }
      });

      await syncTemplateQuestions(tx, created.id, normalizedQuestions);

      return tx.companyScreeningSurveyTemplate.findUniqueOrThrow({
        where: { id: created.id },
        include: screeningSurveyTemplateInclude
      });
    });

    return NextResponse.json({ template: toScreeningSurveyTemplateResponse(template) }, { status: 201 });
  } catch (error) {
    console.error("create_admin_screening_survey_template_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create survey template." },
      { status: 400 }
    );
  }
}
