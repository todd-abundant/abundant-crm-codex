import { randomBytes } from "node:crypto";
import { type Prisma, type PrismaClient } from "@prisma/client";

type SurveyWriteClient = PrismaClient | Prisma.TransactionClient;

type SurveySeedQuestion = {
  category: string;
  prompt: string;
  instructions?: string;
  scaleMin?: number;
  scaleMax?: number;
};

export const standardScreeningSurveyQuestions: SurveySeedQuestion[] = [
  {
    category: "DESIRABILITY",
    prompt: "How does what has been described align with the challenges you are facing?"
  },
  {
    category: "DESIRABILITY",
    prompt: "What is your organization's current competency in solving this problem?"
  },
  {
    category: "DESIRABILITY",
    prompt: "How desirable is this solution for your organization?"
  },
  {
    category: "DESIRABILITY",
    prompt: "Is this a top-three strategic priority for your organization in the next 18 months?"
  },
  {
    category: "FEASABILITY",
    prompt:
      "Overall, how feasible would it be for your organization to implement a solution like this in the next year given resourcing and governance?"
  },
  {
    category: "FEASABILITY",
    prompt: "How feasible would it be to implement this solution from an IT perspective?"
  },
  {
    category: "FEASABILITY",
    prompt: "How feasible would it be to implement this solution from a clinical perspective?"
  },
  {
    category: "VIABILITY",
    prompt: "How differentiated is this solution from others you've evaluated or have in place today?"
  },
  {
    category: "VIABILITY",
    prompt: "How attractive is the business model for a health system customer?"
  },
  {
    category: "IMPACT",
    prompt: "What magnitude of ROI do you anticipate seeing from this solution?"
  },
  {
    category: "IMPACT",
    prompt: "How confident are you in your ability to measure ROI for this solution?"
  },
  {
    category: "CO-DEVELOPMENT INTEREST",
    prompt:
      "If you are the right stakeholder to participate in co-development, how interested are you in being a co-development partner?"
  },
  {
    category: "CO-DEVELOPMENT INTEREST",
    prompt:
      "If you are not the right stakeholder at your organization, how likely are you to bring forward this co-development opportunity to key stakeholders?"
  }
];

type SurveySeedTemplate = {
  key: string;
  name: string;
  description?: string;
  questions: SurveySeedQuestion[];
};

export const standardScreeningSurveyTemplates: SurveySeedTemplate[] = [
  {
    key: "STANDARD_SCREENING_V1",
    name: "Standard Screening Survey",
    description:
      "Core desirability, feasibility, impact, viability, and co-development readiness survey used across portfolio screening.",
    questions: standardScreeningSurveyQuestions
  }
];

function normalizedKey(value: { category: string; prompt: string }) {
  return `${value.category.trim().toLowerCase()}::${value.prompt.trim().toLowerCase()}`;
}

export async function ensureDefaultScreeningSurveyQuestions(client: SurveyWriteClient) {
  const existing = await client.companyScreeningSurveyQuestion.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      category: true,
      prompt: true,
      instructions: true,
      scaleMin: true,
      scaleMax: true,
      isActive: true,
      isStandard: true
    }
  });

  const usedQuestionIds = new Set<string>();
  const desiredAssignments = standardScreeningSurveyQuestions.map((entry) => ({
    entry,
    existingQuestion: null as (typeof existing)[number] | null
  }));

  const findUnusedQuestion = (
    predicate: (question: (typeof existing)[number]) => boolean
  ) => {
    return (
      existing.find((question) => !usedQuestionIds.has(question.id) && predicate(question)) || null
    );
  };

  // Prefer exact matches that are already marked standard to keep existing IDs stable.
  for (const assignment of desiredAssignments) {
    const key = normalizedKey(assignment.entry);
    const matched = findUnusedQuestion(
      (question) => question.isStandard && normalizedKey(question) === key
    );
    if (!matched) continue;
    assignment.existingQuestion = matched;
    usedQuestionIds.add(matched.id);
  }

  for (const assignment of desiredAssignments) {
    if (assignment.existingQuestion) continue;
    const key = normalizedKey(assignment.entry);
    const matched = findUnusedQuestion((question) => normalizedKey(question) === key);
    if (!matched) continue;
    assignment.existingQuestion = matched;
    usedQuestionIds.add(matched.id);
  }

  const reusableStandardQuestions = existing.filter(
    (question) => question.isStandard && !usedQuestionIds.has(question.id)
  );
  let reusableStandardIndex = 0;

  // Retitle legacy standard questions before creating new rows.
  for (const assignment of desiredAssignments) {
    if (assignment.existingQuestion) continue;
    const reusable = reusableStandardQuestions[reusableStandardIndex] || null;
    if (!reusable) continue;
    reusableStandardIndex += 1;
    assignment.existingQuestion = reusable;
    usedQuestionIds.add(reusable.id);
  }

  for (const assignment of desiredAssignments) {
    if (!assignment.existingQuestion) continue;
    const current = assignment.existingQuestion;
    const nextInstructions = assignment.entry.instructions?.trim() || null;
    const nextScaleMin = assignment.entry.scaleMin ?? 1;
    const nextScaleMax = assignment.entry.scaleMax ?? 10;

    if (
      current.category === assignment.entry.category &&
      current.prompt === assignment.entry.prompt &&
      (current.instructions || null) === nextInstructions &&
      current.scaleMin === nextScaleMin &&
      current.scaleMax === nextScaleMax &&
      current.isActive &&
      current.isStandard
    ) {
      continue;
    }

    await client.companyScreeningSurveyQuestion.update({
      where: { id: current.id },
      data: {
        category: assignment.entry.category,
        prompt: assignment.entry.prompt,
        instructions: nextInstructions,
        scaleMin: nextScaleMin,
        scaleMax: nextScaleMax,
        isActive: true,
        isStandard: true
      }
    });
  }

  const missing = desiredAssignments
    .filter((assignment) => assignment.existingQuestion === null)
    .map((assignment) => ({
      category: assignment.entry.category,
      prompt: assignment.entry.prompt,
      instructions: assignment.entry.instructions?.trim() || null,
      scaleMin: assignment.entry.scaleMin ?? 1,
      scaleMax: assignment.entry.scaleMax ?? 10,
      isStandard: true,
      isActive: true
    }));

  if (missing.length > 0) {
    await client.companyScreeningSurveyQuestion.createMany({
      data: missing
    });
  }

  const staleStandardIds = existing
    .filter((question) => question.isStandard && !usedQuestionIds.has(question.id))
    .map((question) => question.id);

  if (staleStandardIds.length > 0) {
    await client.companyScreeningSurveyQuestion.updateMany({
      where: {
        id: { in: staleStandardIds }
      },
      data: {
        isStandard: false,
        isActive: false
      }
    });
  }

  const currentStandardQuestions = await client.companyScreeningSurveyQuestion.findMany({
    where: { isStandard: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      category: true,
      prompt: true
    }
  });

  const standardQuestionIdByKey = new Map<string, string>();
  for (const question of currentStandardQuestions) {
    const key = normalizedKey(question);
    if (!standardQuestionIdByKey.has(key)) {
      standardQuestionIdByKey.set(key, question.id);
    }
  }

  return standardQuestionIdByKey;
}

export async function ensureDefaultScreeningSurveyLibrary(client: SurveyWriteClient) {
  const standardQuestionIdByKey = await ensureDefaultScreeningSurveyQuestions(client);

  for (const template of standardScreeningSurveyTemplates) {
    const templateRecord = await client.companyScreeningSurveyTemplate.upsert({
      where: { key: template.key },
      create: {
        key: template.key,
        name: template.name,
        description: template.description?.trim() || null,
        isActive: true,
        isStandard: true
      },
      update: {
        name: template.name,
        description: template.description?.trim() || null,
        isActive: true,
        isStandard: true
      },
      select: {
        id: true
      }
    });
    const templateId = templateRecord.id;

    const desiredTemplateQuestions: Array<{
      questionId: string;
      displayOrder: number;
      categoryOverride: string;
      promptOverride: string;
      instructionsOverride: string | null;
    }> = [];

    for (const [index, entry] of template.questions.entries()) {
      const questionId = standardQuestionIdByKey.get(normalizedKey(entry));
      if (!questionId) continue;
      desiredTemplateQuestions.push({
        questionId,
        displayOrder: index,
        categoryOverride: entry.category.trim(),
        promptOverride: entry.prompt.trim(),
        instructionsOverride: entry.instructions?.trim() || null
      });
    }

    if (desiredTemplateQuestions.length === 0) {
      continue;
    }

    const existingTemplateQuestions = await client.companyScreeningSurveyTemplateQuestion.findMany({
      where: { templateId },
      select: {
        id: true,
        questionId: true
      }
    });
    const existingByQuestionId = new Map(
      existingTemplateQuestions.map((entry) => [entry.questionId, entry] as const)
    );
    const desiredQuestionIds = new Set(desiredTemplateQuestions.map((entry) => entry.questionId));

    const removedTemplateQuestionIds = existingTemplateQuestions
      .filter((entry) => !desiredQuestionIds.has(entry.questionId))
      .map((entry) => entry.id);

    if (removedTemplateQuestionIds.length > 0) {
      await client.companyScreeningSurveyTemplateQuestion.deleteMany({
        where: { id: { in: removedTemplateQuestionIds } }
      });
    }

    for (const entry of desiredTemplateQuestions) {
      const existingTemplateQuestion = existingByQuestionId.get(entry.questionId);
      if (existingTemplateQuestion) {
        await client.companyScreeningSurveyTemplateQuestion.update({
          where: { id: existingTemplateQuestion.id },
          data: {
            displayOrder: entry.displayOrder,
            categoryOverride: entry.categoryOverride,
            promptOverride: entry.promptOverride,
            instructionsOverride: entry.instructionsOverride
          }
        });
        continue;
      }

      await client.companyScreeningSurveyTemplateQuestion.create({
        data: {
          templateId,
          questionId: entry.questionId,
          displayOrder: entry.displayOrder,
          categoryOverride: entry.categoryOverride,
          promptOverride: entry.promptOverride,
          instructionsOverride: entry.instructionsOverride
        }
      });
    }
  }
}

export function createScreeningSurveyAccessToken() {
  return randomBytes(18).toString("base64url");
}

export function screeningSurveyPathFromToken(token: string) {
  return `/survey/live/${token}`;
}
