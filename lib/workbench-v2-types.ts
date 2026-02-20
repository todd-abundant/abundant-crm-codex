import { z } from "zod";
import {
  narrativeActionSchema,
  narrativeExecutionResultSchema,
  narrativePlanSchema
} from "@/lib/narrative-agent-types";

export const workbenchClarificationSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  affectedOperationIds: z.array(z.string()).default([])
});

export type WorkbenchClarification = z.infer<typeof workbenchClarificationSchema>;

export const workbenchDraftSchema = z.object({
  sessionId: z.string().min(1),
  phase: z.literal("CLARIFICATION"),
  conversation: z.string().min(1),
  summary: z.string().default(""),
  warnings: z.array(z.string()).default([]),
  clarifications: z.array(workbenchClarificationSchema).default([]),
  operations: z.array(narrativeActionSchema).default([])
});

export type WorkbenchDraft = z.infer<typeof workbenchDraftSchema>;

export const workbenchIntakeRequestSchema = z.object({
  conversation: z.string().min(12)
});

export const workbenchClarificationAnswerSchema = z.object({
  questionId: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1)
});

export type WorkbenchClarificationAnswer = z.infer<typeof workbenchClarificationAnswerSchema>;

export const workbenchPlanRequestSchema = z.object({
  sessionId: z.string().min(1),
  conversation: z.string().min(1),
  operations: z.array(narrativeActionSchema).default([]),
  clarifications: z.array(workbenchClarificationAnswerSchema).default([])
});

export const workbenchPlanResponseSchema = z.object({
  sessionId: z.string().min(1),
  plan: narrativePlanSchema
});

export type WorkbenchPlanResponse = z.infer<typeof workbenchPlanResponseSchema>;

export const workbenchExecuteRequestSchema = z.object({
  plan: narrativePlanSchema
});

export const workbenchExecuteResponseSchema = z.object({
  summary: z.string(),
  executed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  results: z.array(narrativeExecutionResultSchema),
  createdEntities: z.array(
    z.object({
      entityType: z.enum(["HEALTH_SYSTEM", "COMPANY", "CO_INVESTOR"]),
      id: z.string().min(1),
      name: z.string().min(1),
      created: z.boolean()
    })
  )
});

export type WorkbenchExecuteResponse = z.infer<typeof workbenchExecuteResponseSchema>;
