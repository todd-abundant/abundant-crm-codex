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
    prompt: "How urgent is this problem for your organization?"
  },
  {
    category: "Desirability",
    prompt: "How compelling is the value proposition for your clinical and operational teams?"
  },
  {
    category: "Feasibility",
    prompt: "How feasible is implementation with your current workflows and staffing?"
  },
  {
    category: "Feasibility",
    prompt: "How realistic is integration with your current EHR and data systems?"
  },
  {
    category: "Impact",
    prompt: "How strong is the expected clinical impact in the first 12 months?"
  },
  {
    category: "Viability",
    prompt: "How strong is the expected ROI for your health system?"
  },
  {
    category: "Co-Development",
    prompt: "How interested is your team in active co-development and pilot design?"
  },
  {
    category: "Co-Development",
    prompt: "How prepared is your team to share feedback and data during a pilot?"
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
    select: { id: true, category: true, prompt: true, isStandard: true }
  });

  const existingKeys = new Set(existing.map((entry) => normalizedKey(entry)));
  const standardKeys = new Set(standardScreeningSurveyQuestions.map((entry) => normalizedKey(entry)));
  const missing = standardScreeningSurveyQuestions
    .filter((entry) => !existingKeys.has(normalizedKey(entry)))
    .map((entry) => ({
      category: entry.category,
      prompt: entry.prompt,
      instructions: entry.instructions?.trim() || null,
      scaleMin: entry.scaleMin ?? 1,
      scaleMax: entry.scaleMax ?? 10,
      isStandard: true,
      isActive: true
    }));

  if (missing.length > 0) {
    await client.companyScreeningSurveyQuestion.createMany({
      data: missing
    });
  }

  const standardIdsToFlag = existing
    .filter((entry) => standardKeys.has(normalizedKey(entry)) && !entry.isStandard)
    .map((entry) => entry.id);

  if (standardIdsToFlag.length > 0) {
    await client.companyScreeningSurveyQuestion.updateMany({
      where: {
        id: { in: standardIdsToFlag }
      },
      data: {
        isStandard: true
      }
    });
  }
}

export async function ensureDefaultScreeningSurveyLibrary(client: SurveyWriteClient) {
  await ensureDefaultScreeningSurveyQuestions(client);

  const questions = await client.companyScreeningSurveyQuestion.findMany({
    select: {
      id: true,
      category: true,
      prompt: true
    }
  });

  const questionByKey = new Map(questions.map((entry) => [normalizedKey(entry), entry] as const));

  for (const template of standardScreeningSurveyTemplates) {
    const existingTemplate = await client.companyScreeningSurveyTemplate.findUnique({
      where: { key: template.key },
      select: {
        id: true,
        isStandard: true,
        _count: {
          select: {
            questions: true
          }
        }
      }
    });

    let templateId = existingTemplate?.id || null;
    let hasTemplateQuestions = (existingTemplate?._count.questions || 0) > 0;

    if (!templateId) {
      const created = await client.companyScreeningSurveyTemplate.create({
        data: {
          key: template.key,
          name: template.name,
          description: template.description?.trim() || null,
          isActive: true,
          isStandard: true
        },
        select: {
          id: true
        }
      });
      templateId = created.id;
      hasTemplateQuestions = false;
    } else if (!existingTemplate?.isStandard) {
      await client.companyScreeningSurveyTemplate.update({
        where: { id: templateId },
        data: {
          isStandard: true
        }
      });
    }

    if (hasTemplateQuestions) {
      continue;
    }

    const desiredTemplateQuestions = template.questions
      .map((entry, index) => {
        const matchedQuestion = questionByKey.get(normalizedKey(entry));
        if (!matchedQuestion) return null;
        return {
          templateId,
          questionId: matchedQuestion.id,
          displayOrder: index,
          categoryOverride: entry.category.trim(),
          promptOverride: entry.prompt.trim(),
          instructionsOverride: entry.instructions?.trim() || null
        };
      })
      .filter(
        (
          entry
        ): entry is {
          templateId: string;
          questionId: string;
          displayOrder: number;
          categoryOverride: string;
          promptOverride: string;
          instructionsOverride: string | null;
        } => entry !== null
      );

    if (desiredTemplateQuestions.length === 0) {
      continue;
    }

    await client.companyScreeningSurveyTemplateQuestion.createMany({
      data: desiredTemplateQuestions
    });
  }
}

export function createScreeningSurveyAccessToken() {
  return randomBytes(18).toString("base64url");
}

export function screeningSurveyPathFromToken(token: string) {
  return `/survey/live/${token}`;
}
