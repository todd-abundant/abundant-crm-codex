import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  clearScreeningPreliminaryInterestOverride,
  ensureScreeningOpportunityForInterestStatus,
  syncOpportunityContactLinks
} from "@/lib/screening-opportunity-sync";
import {
  averageScreeningScores,
  derivePreliminaryInterestStatus,
  mapOpportunityStageToCurrentInterest,
  preliminaryInterestLabel
} from "@/lib/screening-interest";

const setStatusSchema = z.object({
  action: z.literal("SET_STATUS"),
  healthSystemId: z.string().min(1),
  status: z.enum(["RED", "YELLOW", "GREEN", "BLUE"]),
  source: z.enum(["CURRENT", "PRELIMINARY"]).default("CURRENT")
});

const clearPreliminaryOverrideSchema = z.object({
  action: z.literal("CLEAR_PRELIMINARY_OVERRIDE"),
  healthSystemId: z.string().min(1)
});

const patchSchema = z.discriminatedUnion("action", [setStatusSchema, clearPreliminaryOverrideSchema]);

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: companyId } = await context.params;
    const input = patchSchema.parse(await request.json());

    const [company, healthSystem] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId },
        select: { id: true }
      }),
      prisma.healthSystem.findUnique({
        where: { id: input.healthSystemId },
        select: { id: true, isAllianceMember: true }
      })
    ]);

    if (!company) {
      return NextResponse.json({ error: "Pipeline item not found" }, { status: 404 });
    }

    if (!healthSystem || !healthSystem.isAllianceMember) {
      return NextResponse.json({ error: "Alliance health system not found" }, { status: 404 });
    }

    const opportunity = await prisma.$transaction(async (tx) => {
      const updated =
        input.action === "CLEAR_PRELIMINARY_OVERRIDE"
          ? await clearScreeningPreliminaryInterestOverride(tx, {
              companyId,
              healthSystemId: input.healthSystemId
            })
          : await ensureScreeningOpportunityForInterestStatus(tx, {
              companyId,
              healthSystemId: input.healthSystemId,
              status: input.status,
              source: input.source
            });

      if (!updated) {
        throw new Error("Screening opportunity not found");
      }

      const participantContacts = await tx.companyScreeningParticipant.findMany({
        where: {
          healthSystemId: input.healthSystemId,
          contactId: { not: null },
          screeningEvent: {
            companyId
          }
        },
        select: { contactId: true }
      });
      const surveyContacts = await tx.companyScreeningSurveySubmission.findMany({
        where: {
          healthSystemId: input.healthSystemId,
          contactId: { not: null },
          session: { companyId }
        },
        select: { contactId: true }
      });
      const flaggedAnswers = await tx.companyScreeningSurveyAnswer.findMany({
        where: {
          session: { companyId },
          submission: { healthSystemId: input.healthSystemId },
          sessionQuestion: {
            drivesScreeningOpportunity: true
          },
          isSkipped: false,
          score: { not: null }
        },
        select: { score: true }
      });

      await syncOpportunityContactLinks(
        tx,
        updated.id,
        [...participantContacts, ...surveyContacts]
          .map((entry) => entry.contactId)
          .filter((contactId): contactId is string => Boolean(contactId))
      );

      const averageScore = averageScreeningScores(flaggedAnswers.map((entry) => entry.score));
      const preliminaryInterestStatus = derivePreliminaryInterestStatus({
        averageScore,
        overrideStatus: updated.preliminaryInterestOverride as "BLUE" | null | undefined
      });

      return {
        opportunity: updated,
        preliminaryInterestStatus,
        preliminaryInterestLabel: preliminaryInterestLabel(preliminaryInterestStatus)
      };
    });

    const currentInterest = mapOpportunityStageToCurrentInterest(opportunity.opportunity.stage);
    return NextResponse.json({
      healthSystemId: input.healthSystemId,
      opportunityId: opportunity.opportunity.id,
      stage: opportunity.opportunity.stage,
      currentInterestStatus: currentInterest.status,
      currentInterestLabel: currentInterest.label,
      preliminaryInterestStatus: opportunity.preliminaryInterestStatus,
      preliminaryInterestLabel: opportunity.preliminaryInterestLabel,
      updatedAt: opportunity.opportunity.updatedAt
    });
  } catch (error) {
    console.error("update_pipeline_screening_interest_error", error);
    return NextResponse.json({ error: "Failed to update screening interest" }, { status: 400 });
  }
}
