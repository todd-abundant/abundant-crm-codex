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

function normalizedKey(value: { category: string; prompt: string }) {
  return `${value.category.trim().toLowerCase()}::${value.prompt.trim().toLowerCase()}`;
}

export async function ensureDefaultScreeningSurveyQuestions(client: SurveyWriteClient) {
  const existing = await client.companyScreeningSurveyQuestion.findMany({
    select: { id: true, category: true, prompt: true }
  });

  const existingKeys = new Set(existing.map((entry) => normalizedKey(entry)));
  const missing = standardScreeningSurveyQuestions
    .filter((entry) => !existingKeys.has(normalizedKey(entry)))
    .map((entry) => ({
      category: entry.category,
      prompt: entry.prompt,
      instructions: entry.instructions?.trim() || null,
      scaleMin: entry.scaleMin ?? 1,
      scaleMax: entry.scaleMax ?? 10,
      isActive: true
    }));

  if (missing.length === 0) return;

  await client.companyScreeningSurveyQuestion.createMany({
    data: missing
  });
}

export function createScreeningSurveyAccessToken() {
  return randomBytes(18).toString("base64url");
}

export function screeningSurveyPathFromToken(token: string) {
  return `/survey/live/${token}`;
}
