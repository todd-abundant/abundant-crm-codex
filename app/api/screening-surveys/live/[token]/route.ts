import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  parseScreeningSurveyRespondentProfileCookie,
  SCREENING_SURVEY_RESPONDENT_COOKIE_NAME
} from "@/lib/screening-survey-respondent-cookie";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const participantProfile = parseScreeningSurveyRespondentProfileCookie(
      request.cookies.get(SCREENING_SURVEY_RESPONDENT_COOKIE_NAME)?.value
    );

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

    const orderedQuestions = [...session.questions].sort((a, b) => {
      if (a.displayOrder !== b.displayOrder) {
        return a.displayOrder - b.displayOrder;
      }
      return a.id.localeCompare(b.id);
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
      questions: orderedQuestions.map((entry) => ({
        sessionQuestionId: entry.id,
        questionId: entry.questionId,
        displayOrder: entry.displayOrder,
        category: entry.categoryOverride || entry.question.category,
        prompt: entry.promptOverride || entry.question.prompt,
        instructions: entry.instructionsOverride || entry.question.instructions,
        drivesScreeningOpportunity: entry.drivesScreeningOpportunity,
        scaleMin: entry.question.scaleMin,
        scaleMax: entry.question.scaleMax
      })),
      healthSystems,
      participantProfile
    });
  } catch (error) {
    console.error("get_live_screening_survey_error", error);
    return NextResponse.json({ error: "Failed to load live survey" }, { status: 400 });
  }
}
