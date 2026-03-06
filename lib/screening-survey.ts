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
    category: "Desirability",
    prompt: "How urgent is the underlying problem for your organization?"
  },
  {
    category: "Desirability",
    prompt: "How clear is the value proposition for clinicians and operators?"
  },
  {
    category: "Desirability",
    prompt: "How likely is your team to champion adoption internally?"
  },
  {
    category: "Feasibility",
    prompt: "How feasible is implementation with current workflow and resources?"
  },
  {
    category: "Feasibility",
    prompt: "How realistic is integration with existing systems (Epic/EHR/data)?"
  },
  {
    category: "Feasibility",
    prompt: "How manageable is change management for frontline teams?"
  },
  {
    category: "Impact and Viability",
    prompt: "How strong is expected clinical and operational impact?"
  },
  {
    category: "Impact and Viability",
    prompt: "How compelling is expected ROI over the next 12-24 months?"
  },
  {
    category: "Impact and Viability",
    prompt: "How durable is the model for long-term adoption and scale?"
  },
  {
    category: "Co-Development",
    prompt: "How interested is your organization in co-development participation?"
  },
  {
    category: "Co-Development",
    prompt: "How prepared is your team to share data and feedback loops?"
  },
  {
    category: "Co-Development",
    prompt: "How aligned are incentives for pilot design and governance?"
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
