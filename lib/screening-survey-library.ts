import { randomBytes } from "node:crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";

type SurveyWriteClient = PrismaClient | Prisma.TransactionClient;

export type ScreeningSurveyTemplateQuestionInput = {
  questionId: string;
  category: string;
  prompt: string;
  instructions: string | null;
  drivesScreeningOpportunity: boolean;
  displayOrder: number;
};

export const screeningSurveyTemplateInclude = {
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
} satisfies Prisma.CompanyScreeningSurveyTemplateInclude;

export type ScreeningSurveyTemplateWithDetails = Prisma.CompanyScreeningSurveyTemplateGetPayload<{
  include: typeof screeningSurveyTemplateInclude;
}>;

export function toScreeningSurveyTemplateResponse(template: ScreeningSurveyTemplateWithDetails) {
  return {
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
      drivesScreeningOpportunity: entry.drivesScreeningOpportunity,
      scaleMin: entry.question.scaleMin,
      scaleMax: entry.question.scaleMax
    }))
  };
}

function normalizeKeySegment(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "SURVEY";
}

export async function generateScreeningSurveyTemplateKey(client: SurveyWriteClient, name: string) {
  const base = normalizeKeySegment(name).slice(0, 50);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const suffix = randomBytes(3).toString("hex").toUpperCase();
    const candidateKey = `CUSTOM_${base}_${suffix}`;
    const existing = await client.companyScreeningSurveyTemplate.findUnique({
      where: { key: candidateKey },
      select: { id: true }
    });
    if (!existing) {
      return candidateKey;
    }
  }
  throw new Error("Unable to generate a unique survey template key.");
}

export async function validateTemplateQuestionSet(
  client: SurveyWriteClient,
  questions: ScreeningSurveyTemplateQuestionInput[]
) {
  const normalizedQuestions = [...questions]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((entry, index) => ({
      questionId: entry.questionId,
      category: entry.category.trim(),
      prompt: entry.prompt.trim(),
      instructions: entry.instructions?.trim() || null,
      drivesScreeningOpportunity: Boolean(entry.drivesScreeningOpportunity),
      displayOrder: index
    }));

  const uniqueQuestionIds = new Set<string>();
  for (const question of normalizedQuestions) {
    if (uniqueQuestionIds.has(question.questionId)) {
      throw new Error("Each question can only appear once per template.");
    }
    uniqueQuestionIds.add(question.questionId);
  }

  const availableQuestions = await client.companyScreeningSurveyQuestion.findMany({
    where: { id: { in: Array.from(uniqueQuestionIds) } },
    select: { id: true }
  });
  if (availableQuestions.length !== uniqueQuestionIds.size) {
    throw new Error("One or more questions in the template no longer exist.");
  }

  return normalizedQuestions;
}

export async function syncTemplateQuestions(
  client: SurveyWriteClient,
  templateId: string,
  questions: ScreeningSurveyTemplateQuestionInput[]
) {
  const existing = await client.companyScreeningSurveyTemplateQuestion.findMany({
    where: { templateId },
    select: {
      id: true,
      questionId: true
    }
  });
  const existingByQuestionId = new Map(existing.map((entry) => [entry.questionId, entry] as const));
  const incomingQuestionIds = new Set(questions.map((entry) => entry.questionId));

  const removedIds = existing
    .filter((entry) => !incomingQuestionIds.has(entry.questionId))
    .map((entry) => entry.id);
  if (removedIds.length > 0) {
    await client.companyScreeningSurveyTemplateQuestion.deleteMany({
      where: { id: { in: removedIds } }
    });
  }

  for (const question of questions) {
    const existingQuestion = existingByQuestionId.get(question.questionId);
    if (existingQuestion) {
      await client.companyScreeningSurveyTemplateQuestion.update({
        where: { id: existingQuestion.id },
        data: {
          displayOrder: question.displayOrder,
          categoryOverride: question.category,
          promptOverride: question.prompt,
          instructionsOverride: question.instructions,
          drivesScreeningOpportunity: question.drivesScreeningOpportunity
        }
      });
      continue;
    }

    await client.companyScreeningSurveyTemplateQuestion.create({
      data: {
        templateId,
        questionId: question.questionId,
        displayOrder: question.displayOrder,
        categoryOverride: question.category,
        promptOverride: question.prompt,
        instructionsOverride: question.instructions,
        drivesScreeningOpportunity: question.drivesScreeningOpportunity
      }
    });
  }
}
