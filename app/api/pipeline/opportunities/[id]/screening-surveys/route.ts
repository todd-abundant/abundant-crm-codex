import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/server";
import { canAccessAdmin } from "@/lib/auth/permissions";
import {
  createScreeningSurveyAccessToken,
  ensureDefaultScreeningSurveyLibrary,
  screeningSurveyPathFromToken
} from "@/lib/screening-survey";

const createSessionSchema = z
  .object({
    title: z.string().trim().min(1).max(140).optional(),
    questionIds: z.array(z.string().min(1)).optional(),
    templateId: z.string().min(1).optional(),
    sourceSessionId: z.string().min(1).optional(),
    openNow: z.boolean().default(true)
  })
  .superRefine((value, ctx) => {
    const hasQuestionIds = Array.isArray(value.questionIds) && value.questionIds.length > 0;
    const hasTemplateId = Boolean(value.templateId);
    const hasSourceSessionId = Boolean(value.sourceSessionId);
    const sourceCount =
      Number(hasQuestionIds) + Number(hasTemplateId) + Number(hasSourceSessionId);

    if (sourceCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide questionIds, templateId, or sourceSessionId."
      });
      return;
    }
    if (sourceCount > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use only one survey source: questionIds, templateId, or sourceSessionId."
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
    template: {
      id: string;
      key: string;
      name: string;
      isStandard: boolean;
    } | null;
    questions: Array<{
      id: string;
      questionId: string;
      templateQuestionId: string | null;
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
  const orderedQuestions = [...session.questions].sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.id.localeCompare(b.id);
  });

  return {
    id: session.id,
    title: session.title,
    status: session.status,
    openedAt: session.openedAt,
    closedAt: session.closedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    templateId: session.template?.id || null,
    templateKey: session.template?.key || null,
    templateName: session.template?.name || null,
    templateIsStandard: session.template?.isStandard || false,
    questionCount: session._count.questions,
    responseCount: session._count.submissions,
    lastResponseAt: session.submissions[0]?.submittedAt || null,
    sharePath: screeningSurveyPathFromToken(session.accessToken),
    questions: orderedQuestions.map((entry) => ({
      sessionQuestionId: entry.id,
      questionId: entry.questionId,
      templateQuestionId: entry.templateQuestionId,
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
    const user = await getCurrentUser();
    const canViewCrossCompanySources = Boolean(user && canAccessAdmin(user.roles));

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

      await ensureDefaultScreeningSurveyLibrary(tx);

      const [questionBank, surveyTemplates, sessions] = await Promise.all([
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
            isStandard: true,
            createdAt: true,
            updatedAt: true
          }
        }),
        tx.companyScreeningSurveyTemplate.findMany({
          where: { isActive: true },
          orderBy: [{ isStandard: "desc" }, { name: "asc" }],
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
            sessions: {
              orderBy: [{ createdAt: "desc" }],
              take: 1,
              select: { createdAt: true }
            },
            _count: {
              select: {
                questions: true,
                sessions: true
              }
            }
          }
        }),
        tx.companyScreeningSurveySession.findMany({
          where: { companyId },
          orderBy: [{ updatedAt: "desc" }],
          include: {
            template: {
              select: {
                id: true,
                key: true,
                name: true,
                isStandard: true
              }
            },
            questions: {
              orderBy: [{ displayOrder: "asc" }],
              include: {
                templateQuestion: {
                  select: {
                    id: true
                  }
                },
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

      const sourceSessions = canViewCrossCompanySources
        ? await tx.companyScreeningSurveySession.findMany({
            orderBy: [{ updatedAt: "desc" }],
            include: {
              company: {
                select: {
                  id: true,
                  name: true
                }
              },
              template: {
                select: {
                  id: true,
                  name: true
                }
              },
              _count: {
                select: {
                  questions: true,
                  submissions: true
                }
              }
            }
          })
        : [];

      return {
        status: 200 as const,
        data: {
          company,
          questionBank,
          surveyTemplates: surveyTemplates.map((template) => ({
            id: template.id,
            key: template.key,
            name: template.name,
            description: template.description,
            isActive: template.isActive,
            isStandard: template.isStandard,
            questionCount: template._count.questions,
            usageCount: template._count.sessions,
            lastUsedAt: template.sessions[0]?.createdAt || null,
            questions: template.questions.map((entry) => ({
              templateQuestionId: entry.id,
              questionId: entry.questionId,
              displayOrder: entry.displayOrder,
              category: entry.categoryOverride || entry.question.category,
              prompt: entry.promptOverride || entry.question.prompt,
              instructions: entry.instructionsOverride || entry.question.instructions,
              scaleMin: entry.question.scaleMin,
              scaleMax: entry.question.scaleMax
            }))
          })),
          sessions: sessions.map(toSessionResponse),
          sourceSessions: sourceSessions.map((session) => ({
            id: session.id,
            companyId: session.company.id,
            companyName: session.company.name,
            title: session.title,
            status: session.status,
            updatedAt: session.updatedAt,
            questionCount: session._count.questions,
            responseCount: session._count.submissions,
            templateId: session.template?.id || null,
            templateName: session.template?.name || null
          })),
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
      await ensureDefaultScreeningSurveyLibrary(tx);

      const company = await tx.company.findUnique({
        where: { id: companyId },
        select: { id: true, name: true }
      });
      if (!company) {
        throw new Error("Pipeline item not found");
      }

      let sessionTemplateId: string | null = null;
      let resolvedTitle = input.title || `${company.name} Live Screening Survey`;
      let sessionQuestions: Array<{
        questionId: string;
        templateQuestionId: string | null;
        displayOrder: number;
        categoryOverride: string | null;
        promptOverride: string | null;
        instructionsOverride: string | null;
      }> = [];

      if (input.templateId) {
        const template = await tx.companyScreeningSurveyTemplate.findFirst({
          where: {
            id: input.templateId,
            isActive: true
          },
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
                    isActive: true
                  }
                }
              }
            }
          }
        });
        if (!template) {
          throw new Error("Survey template not found.");
        }

        const activeTemplateQuestions = template.questions.filter((entry) => entry.question.isActive);
        if (activeTemplateQuestions.length === 0) {
          throw new Error("Selected template has no active questions.");
        }

        sessionTemplateId = template.id;
        if (!input.title) {
          resolvedTitle = `${company.name} - ${template.name}`;
        }

        sessionQuestions = activeTemplateQuestions.map((entry, index) => ({
          questionId: entry.questionId,
          templateQuestionId: entry.id,
          displayOrder: index,
          categoryOverride: entry.categoryOverride || entry.question.category,
          promptOverride: entry.promptOverride || entry.question.prompt,
          instructionsOverride: entry.instructionsOverride || entry.question.instructions || null
        }));
      } else if (input.sourceSessionId) {
        const sourceSession = await tx.companyScreeningSurveySession.findUnique({
          where: {
            id: input.sourceSessionId
          },
          include: {
            company: {
              select: {
                id: true,
                name: true
              }
            },
            questions: {
              orderBy: [{ displayOrder: "asc" }],
              include: {
                question: {
                  select: {
                    id: true,
                    category: true,
                    prompt: true,
                    instructions: true,
                    isActive: true
                  }
                }
              }
            }
          }
        });
        if (!sourceSession) {
          throw new Error("Source survey not found.");
        }

        const activeSourceQuestions = sourceSession.questions.filter((entry) => entry.question.isActive);
        if (activeSourceQuestions.length === 0) {
          throw new Error("Source survey has no active questions to copy.");
        }

        sessionTemplateId = sourceSession.templateId;
        if (!input.title) {
          resolvedTitle =
            sourceSession.company.id === companyId
              ? `${sourceSession.title} (Copy)`
              : `${sourceSession.title} (${sourceSession.company.name} Copy)`;
        }

        sessionQuestions = activeSourceQuestions.map((entry, index) => ({
          questionId: entry.questionId,
          templateQuestionId: entry.templateQuestionId,
          displayOrder: index,
          categoryOverride: entry.categoryOverride || entry.question.category,
          promptOverride: entry.promptOverride || entry.question.prompt,
          instructionsOverride: entry.instructionsOverride || entry.question.instructions || null
        }));
      } else {
        const dedupedQuestionIds = Array.from(new Set(input.questionIds || []));
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

        sessionQuestions = dedupedQuestionIds.map((questionId, index) => ({
          questionId,
          templateQuestionId: null,
          displayOrder: index,
          categoryOverride: null,
          promptOverride: null,
          instructionsOverride: null
        }));
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
          templateId: sessionTemplateId,
          title: resolvedTitle,
          accessToken: createScreeningSurveyAccessToken(),
          status: input.openNow ? "LIVE" : "DRAFT",
          openedAt: input.openNow ? now : null,
          createdByUserId: user?.id || null
        }
      });

      await tx.companyScreeningSurveySessionQuestion.createMany({
        data: sessionQuestions.map((entry) => ({
          sessionId: created.id,
          questionId: entry.questionId,
          templateQuestionId: entry.templateQuestionId,
          displayOrder: entry.displayOrder,
          categoryOverride: entry.categoryOverride,
          promptOverride: entry.promptOverride,
          instructionsOverride: entry.instructionsOverride
        }))
      });

      return tx.companyScreeningSurveySession.findUniqueOrThrow({
        where: { id: created.id },
        include: {
          template: {
            select: {
              id: true,
              key: true,
              name: true,
              isStandard: true
            }
          },
          questions: {
            orderBy: [{ displayOrder: "asc" }],
            include: {
              templateQuestion: {
                select: {
                  id: true
                }
              },
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
