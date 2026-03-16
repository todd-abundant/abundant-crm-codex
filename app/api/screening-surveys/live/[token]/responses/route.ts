import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  resolveOrCreateContact,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";
import { inferQualitativeFeedbackFromImpression } from "@/lib/screening-qualitative-inference";
import { refreshSurveyDrivenScreeningOpportunity } from "@/lib/screening-opportunity-sync";
import { setScreeningSurveyRespondentProfileCookie } from "@/lib/screening-survey-respondent-cookie";

const submitResponseSchema = z
  .object({
    participantName: z.string().trim().optional().or(z.literal("")),
    participantEmail: z.string().trim().email().optional().or(z.literal("")),
    healthSystemId: z.string().min(1),
    impressions: z.string().trim().min(1).max(1200),
    answers: z
      .array(
        z.object({
          sessionQuestionId: z.string().min(1),
          score: z.number().int().nullable().optional(),
          skipped: z.boolean().optional().default(false)
        })
      )
      .min(1)
  })
  .superRefine((value, ctx) => {
    if (!value.participantName && !value.participantEmail) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide a name or email."
      });
    }
  });

function trimOrNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value?: string | null) {
  const normalized = (value || "").trim().toLowerCase();
  return normalized || null;
}

function inferNameFromEmail(email: string) {
  const local = email.split("@")[0] || "Survey Participant";
  const normalized = local.replace(/[._-]+/g, " ").trim();
  if (!normalized) return "Survey Participant";
  return normalized
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const input = submitResponseSchema.parse(await request.json());
    const participantName = trimOrNull(input.participantName);
    const participantEmail = normalizeEmail(input.participantEmail);
    const impressions = input.impressions.trim();
    const inferredQualitative = await inferQualitativeFeedbackFromImpression({
      impression: impressions
    });

    const userAgent = trimOrNull(request.headers.get("user-agent"));
    const forwardedFor = trimOrNull(request.headers.get("x-forwarded-for")?.split(",")[0] || null);
    const sourceIpHash = forwardedFor
      ? createHash("sha256").update(forwardedFor).digest("hex")
      : null;

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.companyScreeningSurveySession.findUnique({
        where: { accessToken: token },
        include: {
          company: {
            select: {
              name: true
            }
          },
          questions: {
            include: {
              question: {
                select: {
                  id: true,
                  category: true,
                  prompt: true,
                  scaleMin: true,
                  scaleMax: true
                }
              }
            }
          }
        }
      });

      if (!session) {
        throw new Error("Survey session not found");
      }

      if (session.status !== "LIVE") {
        throw new Error("Survey session is not accepting responses.");
      }

      const healthSystem = await tx.healthSystem.findUnique({
        where: { id: input.healthSystemId },
        select: { id: true, name: true, isAllianceMember: true }
      });
      if (!healthSystem || !healthSystem.isAllianceMember) {
        throw new Error("Alliance health system not found");
      }

      const sessionQuestionById = new Map(
        session.questions.map((entry) => [entry.id, entry] as const)
      );

      const dedupedAnswers = new Map<
        string,
        { sessionQuestionId: string; score: number | null; skipped: boolean }
      >();
      for (const entry of input.answers) {
        if (dedupedAnswers.has(entry.sessionQuestionId)) {
          throw new Error("Duplicate survey answers detected.");
        }
        dedupedAnswers.set(entry.sessionQuestionId, {
          sessionQuestionId: entry.sessionQuestionId,
          score: entry.skipped ? null : (entry.score ?? null),
          skipped: entry.skipped ?? false
        });
      }

      if (dedupedAnswers.size !== session.questions.length) {
        throw new Error("Every survey question must be scored or skipped.");
      }

      for (const answer of dedupedAnswers.values()) {
        const sessionQuestion = sessionQuestionById.get(answer.sessionQuestionId);
        if (!sessionQuestion) {
          throw new Error("Survey response includes unknown question.");
        }
        if (answer.skipped) {
          continue;
        }
        if (answer.score === null) {
          throw new Error("Every survey question must include a score or be skipped.");
        }
        if (answer.score < sessionQuestion.question.scaleMin || answer.score > sessionQuestion.question.scaleMax) {
          throw new Error("Survey response score is out of range.");
        }
      }

      let resolvedName = participantName;
      let contactId: string | null = null;
      if (participantName || participantEmail) {
        if (participantName) {
          const resolved = await resolveOrCreateContact(tx, {
            name: participantName,
            email: participantEmail
          });
          contactId = resolved.contact.id;
          resolvedName = resolved.contact.name;
        } else if (participantEmail) {
          const existingContact = await tx.contact.findFirst({
            where: { email: participantEmail },
            select: { id: true, name: true }
          });
          if (existingContact) {
            contactId = existingContact.id;
            resolvedName = existingContact.name;
          } else {
            const resolved = await resolveOrCreateContact(tx, {
              name: inferNameFromEmail(participantEmail),
              email: participantEmail
            });
            contactId = resolved.contact.id;
            resolvedName = resolved.contact.name;
          }
        }
      }

      if (!contactId) {
        throw new Error("Unable to resolve a contact for this submission.");
      }

      await upsertHealthSystemContactLink(tx, {
        contactId,
        healthSystemId: input.healthSystemId,
        roleType: "EXECUTIVE",
        title: null
      });

      const eventTitle = `Alliance Screening - ${healthSystem.name}`;
      const screeningEvent =
        (await tx.companyScreeningEvent.findFirst({
          where: {
            companyId: session.companyId,
            type: "INDIVIDUAL_SESSION",
            title: eventTitle
          },
          orderBy: [{ createdAt: "asc" }]
        })) ||
        (await tx.companyScreeningEvent.create({
          data: {
            companyId: session.companyId,
            type: "INDIVIDUAL_SESSION",
            title: eventTitle
          }
        }));

      const existingParticipant = await tx.companyScreeningParticipant.findFirst({
        where: {
          screeningEventId: screeningEvent.id,
          healthSystemId: input.healthSystemId,
          contactId
        },
        select: { id: true }
      });

      if (existingParticipant) {
        await tx.companyScreeningParticipant.update({
          where: { id: existingParticipant.id },
          data: {
            attendanceStatus: "ATTENDED"
          }
        });
      } else {
        await tx.companyScreeningParticipant.create({
          data: {
            screeningEventId: screeningEvent.id,
            healthSystemId: input.healthSystemId,
            contactId,
            attendanceStatus: "ATTENDED",
            notes: `Captured via live screening survey: ${session.title}`
          }
        });
      }

      const submission = await tx.companyScreeningSurveySubmission.create({
        data: {
          sessionId: session.id,
          healthSystemId: input.healthSystemId,
          contactId,
          participantName: resolvedName,
          participantEmail,
          sourceIpHash,
          userAgent
        }
      });

      const answerRows = Array.from(dedupedAnswers.values()).map((entry) => {
        const sessionQuestion = sessionQuestionById.get(entry.sessionQuestionId);
        if (!sessionQuestion) {
          throw new Error("Survey response includes unknown question.");
        }
        return {
          sessionId: session.id,
          templateId: session.templateId || null,
          submissionId: submission.id,
          sessionQuestionId: entry.sessionQuestionId,
          templateQuestionId: sessionQuestion.templateQuestionId || null,
          questionId: sessionQuestion.questionId,
          score: entry.score,
          isSkipped: entry.skipped,
          metric: sessionQuestion.promptOverride || sessionQuestion.question.prompt,
          category: sessionQuestion.categoryOverride || sessionQuestion.question.category
        };
      });

      await tx.companyScreeningSurveyAnswer.createMany({
        data: answerRows.map((row) => ({
          sessionId: row.sessionId,
          templateId: row.templateId,
          submissionId: row.submissionId,
          sessionQuestionId: row.sessionQuestionId,
          templateQuestionId: row.templateQuestionId,
          questionId: row.questionId,
          score: row.score,
          isSkipped: row.isSkipped
        }))
      });

      const scoredRows = answerRows.filter((row) => !row.isSkipped && row.score !== null);
      if (scoredRows.length > 0) {
        await tx.companyScreeningQuantitativeFeedback.createMany({
          data: scoredRows.map((row) => ({
            companyId: session.companyId,
            healthSystemId: input.healthSystemId,
            contactId,
            category: row.category,
            metric: row.metric,
            score: row.score,
            notes: `Captured via live screening survey: ${session.title}`
          }))
        });
      }

      await tx.companyScreeningQualitativeFeedback.create({
        data: {
          companyId: session.companyId,
          healthSystemId: input.healthSystemId,
          contactId,
          category: "Survey Impression",
          theme: inferredQualitative.topic,
          sentiment: inferredQualitative.sentiment,
          feedback: impressions
        }
      });

      const hasInterestDriver = session.questions.some((entry) => entry.drivesScreeningOpportunity);
      const screeningOpportunityResult = hasInterestDriver
        ? await refreshSurveyDrivenScreeningOpportunity(tx, {
            companyId: session.companyId,
            healthSystemId: input.healthSystemId
          })
        : null;

      return {
        submissionId: submission.id,
        qualitativeInferenceSource: inferredQualitative.source,
        screeningOpportunityId: screeningOpportunityResult?.opportunityId || null,
        respondentProfile: {
          participantName: participantName || resolvedName || inferNameFromEmail(participantEmail || ""),
          participantEmail,
          healthSystemId: healthSystem.id,
          healthSystemName: healthSystem.name
        }
      };
    });

    const response = NextResponse.json({
      ok: true,
      submissionId: result.submissionId,
      qualitativeInferenceSource: result.qualitativeInferenceSource,
      screeningOpportunityId: result.screeningOpportunityId
    });
    setScreeningSurveyRespondentProfileCookie(response, result.respondentProfile);
    return response;
  } catch (error) {
    console.error("submit_live_screening_survey_response_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit screening survey response" },
      { status: 400 }
    );
  }
}
