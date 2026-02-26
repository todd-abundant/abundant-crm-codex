import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  resolveOrCreateContact,
  upsertHealthSystemContactLink
} from "@/lib/contact-resolution";

const submitResponseSchema = z
  .object({
    participantName: z.string().trim().optional().or(z.literal("")),
    participantEmail: z.string().trim().email().optional().or(z.literal("")),
    healthSystemId: z.string().min(1),
    answers: z
      .array(
        z.object({
          sessionQuestionId: z.string().min(1),
          score: z.number().int().min(0).max(10)
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

    const userAgent = trimOrNull(request.headers.get("user-agent"));
    const forwardedFor = trimOrNull(request.headers.get("x-forwarded-for")?.split(",")[0] || null);
    const sourceIpHash = forwardedFor
      ? createHash("sha256").update(forwardedFor).digest("hex")
      : null;

    const result = await prisma.$transaction(async (tx) => {
      const session = await tx.companyScreeningSurveySession.findUnique({
        where: { accessToken: token },
        include: {
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
        select: { id: true, isAllianceMember: true }
      });
      if (!healthSystem || !healthSystem.isAllianceMember) {
        throw new Error("Alliance health system not found");
      }

      const sessionQuestionById = new Map(
        session.questions.map((entry) => [entry.id, entry] as const)
      );

      const dedupedAnswers = new Map<string, { sessionQuestionId: string; score: number }>();
      for (const entry of input.answers) {
        if (dedupedAnswers.has(entry.sessionQuestionId)) {
          throw new Error("Duplicate survey answers detected.");
        }
        dedupedAnswers.set(entry.sessionQuestionId, entry);
      }

      if (dedupedAnswers.size !== session.questions.length) {
        throw new Error("Every survey question must be answered.");
      }

      for (const answer of dedupedAnswers.values()) {
        const sessionQuestion = sessionQuestionById.get(answer.sessionQuestionId);
        if (!sessionQuestion) {
          throw new Error("Survey response includes unknown question.");
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
          submissionId: submission.id,
          sessionQuestionId: entry.sessionQuestionId,
          questionId: sessionQuestion.questionId,
          score: entry.score,
          metric: sessionQuestion.promptOverride || sessionQuestion.question.prompt,
          category: sessionQuestion.categoryOverride || sessionQuestion.question.category
        };
      });

      await tx.companyScreeningSurveyAnswer.createMany({
        data: answerRows.map((row) => ({
          sessionId: row.sessionId,
          submissionId: row.submissionId,
          sessionQuestionId: row.sessionQuestionId,
          questionId: row.questionId,
          score: row.score
        }))
      });

      await tx.companyScreeningQuantitativeFeedback.createMany({
        data: answerRows.map((row) => ({
          companyId: session.companyId,
          healthSystemId: input.healthSystemId,
          contactId,
          category: row.category,
          metric: row.metric,
          score: row.score,
          notes: `Captured via live screening survey: ${session.title}`
        }))
      });

      return {
        submissionId: submission.id
      };
    });

    return NextResponse.json({
      ok: true,
      submissionId: result.submissionId
    });
  } catch (error) {
    console.error("submit_live_screening_survey_response_error", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to submit screening survey response" },
      { status: 400 }
    );
  }
}
