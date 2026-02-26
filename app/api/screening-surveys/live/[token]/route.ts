import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;

    const session = await prisma.companyScreeningSurveySession.findUnique({
      where: { accessToken: token },
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
                scaleMin: true,
                scaleMax: true
              }
            }
          }
        }
      }
    });

    if (!session) {
      return NextResponse.json({ error: "Survey session not found" }, { status: 404 });
    }

    const healthSystems = await prisma.healthSystem.findMany({
      where: { isAllianceMember: true },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true }
    });

    return NextResponse.json({
      session: {
        id: session.id,
        title: session.title,
        status: session.status,
        companyId: session.company.id,
        companyName: session.company.name,
        openedAt: session.openedAt,
        closedAt: session.closedAt
      },
      questions: session.questions.map((entry) => ({
        sessionQuestionId: entry.id,
        questionId: entry.questionId,
        displayOrder: entry.displayOrder,
        category: entry.categoryOverride || entry.question.category,
        prompt: entry.promptOverride || entry.question.prompt,
        instructions: entry.instructionsOverride || entry.question.instructions,
        scaleMin: entry.question.scaleMin,
        scaleMax: entry.question.scaleMax
      })),
      healthSystems
    });
  } catch (error) {
    console.error("get_live_screening_survey_error", error);
    return NextResponse.json({ error: "Failed to load live survey" }, { status: 400 });
  }
}
