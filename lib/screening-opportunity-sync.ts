import type { CompanyOpportunityStage, CompanyOpportunityType, Prisma, PrismaClient } from "@prisma/client";
import {
  averageScreeningScores,
  compareOpportunityStagePriority,
  currentInterestStatusToOpportunityStage,
  loiStatusForOpportunityStage,
  screeningOpportunityStageForAverage
} from "@/lib/screening-interest";
import { generateOpportunityTitle } from "@/lib/opportunity-title";

type Tx = Prisma.TransactionClient | PrismaClient;

function appendTimestampedNote(existing: string | null | undefined, message: string) {
  const trimmed = message.trim();
  if (!trimmed) return existing || null;
  const entry = `[${new Date().toISOString()}] ${trimmed}`;
  if (!existing || !existing.trim()) return entry;
  return `${existing.trim()}\n\n${entry}`;
}

function normalizeText(value: string | null | undefined) {
  const trimmed = (value || "").trim();
  return trimmed || null;
}

export async function mirrorHealthSystemOpportunity(
  tx: Tx,
  opportunity: {
    id: string;
    companyId: string;
    healthSystemId: string | null;
    type: CompanyOpportunityType;
    title: string;
    stage: CompanyOpportunityStage;
    likelihoodPercent: number | null;
    contractPriceUsd: Prisma.Decimal | number | null;
    durationDays: number | null;
    preliminaryInterestOverride: string | null;
    memberFeedbackStatus: string | null;
    notes: string | null;
    nextSteps: string | null;
    closeReason: string | null;
    estimatedCloseDate: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }
) {
  await tx.healthSystemOpportunity.upsert({
    where: { id: opportunity.id },
    update: {
      legacyCompanyOpportunityId: opportunity.id,
      companyId: opportunity.companyId,
      healthSystemId: opportunity.healthSystemId,
      type: opportunity.type,
      title: opportunity.title,
      stage: opportunity.stage,
      likelihoodPercent: opportunity.likelihoodPercent,
      contractPriceUsd: opportunity.contractPriceUsd,
      durationDays: opportunity.durationDays,
      preliminaryInterestOverride: opportunity.preliminaryInterestOverride,
      memberFeedbackStatus: opportunity.memberFeedbackStatus,
      notes: opportunity.notes,
      nextSteps: opportunity.nextSteps,
      closeReason: opportunity.closeReason,
      estimatedCloseDate: opportunity.estimatedCloseDate,
      closedAt: opportunity.closedAt
    },
    create: {
      id: opportunity.id,
      legacyCompanyOpportunityId: opportunity.id,
      companyId: opportunity.companyId,
      healthSystemId: opportunity.healthSystemId,
      type: opportunity.type,
      title: opportunity.title,
      stage: opportunity.stage,
      likelihoodPercent: opportunity.likelihoodPercent,
      contractPriceUsd: opportunity.contractPriceUsd,
      durationDays: opportunity.durationDays,
      preliminaryInterestOverride: opportunity.preliminaryInterestOverride,
      memberFeedbackStatus: opportunity.memberFeedbackStatus,
      notes: opportunity.notes,
      nextSteps: opportunity.nextSteps,
      closeReason: opportunity.closeReason,
      estimatedCloseDate: opportunity.estimatedCloseDate,
      closedAt: opportunity.closedAt,
      createdAt: opportunity.createdAt,
      updatedAt: opportunity.updatedAt
    }
  });
}

export async function syncOpportunityContactLinks(
  tx: Tx,
  opportunityId: string,
  contactIds: string[],
  role = "CONTRACTING_CONTACT"
) {
  const uniqueContactIds = Array.from(new Set(contactIds.filter(Boolean)));
  for (const contactId of uniqueContactIds) {
    const companyLink = await tx.companyOpportunityContact.upsert({
      where: {
        opportunityId_contactId: {
          opportunityId,
          contactId
        }
      },
      update: {
        role
      },
      create: {
        opportunityId,
        contactId,
        role
      }
    });

    await tx.healthSystemOpportunityContact.upsert({
      where: {
        opportunityId_contactId: {
          opportunityId,
          contactId
        }
      },
      update: {
        role
      },
      create: {
        id: companyLink.id,
        opportunityId,
        contactId,
        role
      }
    });
  }
}

async function syncCompanyLoiFromOpportunityStage(
  tx: Tx,
  companyId: string,
  healthSystemId: string,
  stage: CompanyOpportunityStage
) {
  const nextLoiStatus = loiStatusForOpportunityStage(stage);
  if (!nextLoiStatus) return;

  const existing = await tx.companyLoi.findUnique({
    where: {
      companyId_healthSystemId: {
        companyId,
        healthSystemId
      }
    }
  });

  await tx.companyLoi.upsert({
    where: {
      companyId_healthSystemId: {
        companyId,
        healthSystemId
      }
    },
    create: {
      companyId,
      healthSystemId,
      status: nextLoiStatus,
      statusUpdatedAt: new Date(),
      signedAt: stage === "CLOSED_WON" ? new Date() : null,
      notes: existing?.notes || null
    },
    update: {
      status: nextLoiStatus,
      statusUpdatedAt: existing?.status === nextLoiStatus ? existing.statusUpdatedAt : new Date(),
      signedAt:
        stage === "CLOSED_WON"
          ? existing?.signedAt || new Date()
          : nextLoiStatus === "SIGNED"
            ? existing?.signedAt || new Date()
            : existing?.signedAt || null
    }
  });
}

async function latestMemberFeedbackStatus(
  tx: Tx,
  companyId: string,
  healthSystemId: string
) {
  const latestCellChange = await tx.companyScreeningCellChange.findFirst({
    where: {
      companyId,
      healthSystemId,
      field: "MEMBER_FEEDBACK_STATUS"
    },
    orderBy: [{ createdAt: "desc" }]
  });
  if (latestCellChange) {
    return normalizeText(latestCellChange.value);
  }

  const latestQualitativeFeedback = await tx.companyScreeningQualitativeFeedback.findFirst({
    where: {
      companyId,
      healthSystemId
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      feedback: true
    }
  });

  return normalizeText(latestQualitativeFeedback?.feedback);
}

function chooseExistingOpportunityStage(
  existingStage: CompanyOpportunityStage,
  targetStage: CompanyOpportunityStage
) {
  if (targetStage === "CLOSED_LOST" || targetStage === "ON_HOLD") return targetStage;
  if (existingStage === "ON_HOLD" || existingStage === "CLOSED_WON") return existingStage;
  if (compareOpportunityStagePriority(existingStage, targetStage) >= 0) return existingStage;
  return targetStage;
}

export async function ensureScreeningOpportunityForInterestStatus(
  tx: Tx,
  options: {
    companyId: string;
    healthSystemId: string;
    status: "BLUE" | "GREEN" | "YELLOW" | "RED" | "GREY";
    source?: "CURRENT" | "PRELIMINARY";
  }
) {
  const { companyId, healthSystemId, status, source = "CURRENT" } = options;
  const [company, healthSystem] = await Promise.all([
    tx.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true }
    }),
    tx.healthSystem.findUnique({
      where: { id: healthSystemId },
      select: { id: true, name: true }
    })
  ]);

  if (!company) {
    throw new Error("Pipeline item not found");
  }
  if (!healthSystem) {
    throw new Error("Health system not found");
  }

  const targetStage = currentInterestStatusToOpportunityStage(status);
  const openOpportunity = await tx.companyOpportunity.findFirst({
    where: {
      companyId,
      healthSystemId,
      type: "SCREENING_LOI",
      stage: {
        notIn: ["CLOSED_WON", "CLOSED_LOST"]
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  const nextTitle = generateOpportunityTitle({
    companyName: company.name,
    healthSystemName: healthSystem.name,
    type: "SCREENING_LOI"
  });
  const memberFeedbackStatus = await latestMemberFeedbackStatus(tx, companyId, healthSystemId);
  const nextPreliminaryInterestOverride = source === "PRELIMINARY" && status === "BLUE" ? "BLUE" : null;

  const opportunity = openOpportunity
    ? await tx.companyOpportunity.update({
        where: { id: openOpportunity.id },
        data: {
          title: nextTitle,
          stage: chooseExistingOpportunityStage(openOpportunity.stage, targetStage),
          preliminaryInterestOverride:
            source === "PRELIMINARY"
              ? nextPreliminaryInterestOverride
              : openOpportunity.preliminaryInterestOverride,
          memberFeedbackStatus: openOpportunity.memberFeedbackStatus || memberFeedbackStatus,
          closedAt: targetStage === "CLOSED_LOST" ? openOpportunity.closedAt || new Date() : null
        }
      })
    : await tx.companyOpportunity.create({
        data: {
          companyId,
          healthSystemId,
          type: "SCREENING_LOI",
          title: nextTitle,
          stage: targetStage,
          preliminaryInterestOverride: nextPreliminaryInterestOverride,
          memberFeedbackStatus,
          likelihoodPercent:
            status === "GREEN" ? 80 : status === "YELLOW" ? 60 : status === "BLUE" ? 40 : 0,
          closedAt: targetStage === "CLOSED_LOST" ? new Date() : null
        }
      });

  await mirrorHealthSystemOpportunity(tx, opportunity);
  await syncCompanyLoiFromOpportunityStage(tx, companyId, healthSystemId, opportunity.stage);
  return opportunity;
}

export async function clearScreeningPreliminaryInterestOverride(
  tx: Tx,
  options: {
    companyId: string;
    healthSystemId: string;
  }
) {
  const { companyId, healthSystemId } = options;
  const opportunity = await tx.companyOpportunity.findFirst({
    where: {
      companyId,
      healthSystemId,
      type: "SCREENING_LOI"
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  if (!opportunity) return null;

  const updated = await tx.companyOpportunity.update({
    where: { id: opportunity.id },
    data: {
      preliminaryInterestOverride: null
    }
  });

  await mirrorHealthSystemOpportunity(tx, updated);
  return updated;
}

export async function refreshSurveyDrivenScreeningOpportunity(
  tx: Tx,
  options: {
    companyId: string;
    healthSystemId: string;
    force?: boolean;
  }
) {
  const { companyId, healthSystemId, force = false } = options;
  const company = await tx.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      pipeline: {
        select: {
          screeningWebinarDate2At: true
        }
      }
    }
  });
  if (!company) {
    throw new Error("Pipeline item not found");
  }

  const healthSystem = await tx.healthSystem.findUnique({
    where: { id: healthSystemId },
    select: { id: true, name: true }
  });
  if (!healthSystem) {
    throw new Error("Health system not found");
  }

  const flaggedAnswers = await tx.companyScreeningSurveyAnswer.findMany({
    where: {
      session: { companyId },
      submission: { healthSystemId },
      sessionQuestion: {
        drivesScreeningOpportunity: true
      },
      isSkipped: false,
      score: { not: null }
    },
    select: {
      score: true
    }
  });

  const averageScore = averageScreeningScores(flaggedAnswers.map((answer) => answer.score));
  const shouldWaitForWebinarTwo =
    Boolean(company.pipeline?.screeningWebinarDate2At) &&
    company.pipeline?.screeningWebinarDate2At instanceof Date &&
    company.pipeline.screeningWebinarDate2At.getTime() > Date.now();

  const contactIdsFromParticipants = await tx.companyScreeningParticipant.findMany({
    where: {
      healthSystemId,
      contactId: { not: null },
      screeningEvent: {
        companyId
      }
    },
    select: {
      contactId: true
    }
  });
  const contactIdsFromSurvey = await tx.companyScreeningSurveySubmission.findMany({
    where: {
      session: { companyId },
      healthSystemId,
      contactId: { not: null }
    },
    select: {
      contactId: true
    }
  });
  const syncedContactIds = [
    ...contactIdsFromParticipants.map((entry) => entry.contactId),
    ...contactIdsFromSurvey.map((entry) => entry.contactId)
  ].map((contactId) => normalizeText(contactId)).filter((contactId): contactId is string => Boolean(contactId));
  const existingOpenOpportunity = await tx.companyOpportunity.findFirst({
    where: {
      companyId,
      healthSystemId,
      type: "SCREENING_LOI",
      stage: {
        notIn: ["CLOSED_WON", "CLOSED_LOST"]
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });

  if (averageScore === null || averageScore < 6 || (!force && shouldWaitForWebinarTwo)) {
    if (existingOpenOpportunity) {
      await syncOpportunityContactLinks(tx, existingOpenOpportunity.id, syncedContactIds);
    }
    return {
      averageScore,
      qualified: averageScore !== null && averageScore >= 6,
      opportunityId: existingOpenOpportunity?.id || null,
      waitingForWebinarTwo: !force && shouldWaitForWebinarTwo
    };
  }

  const targetStage = screeningOpportunityStageForAverage(averageScore);
  const openOpportunity = existingOpenOpportunity;

  const note = `Survey preliminary interest average ${averageScore}/10 across flagged co-development questions.`;
  const likelihoodPercent = Math.max(60, Math.min(95, Math.round(averageScore * 10)));
  const nextTitle = generateOpportunityTitle({
    companyName: company.name,
    healthSystemName: healthSystem.name,
    type: "SCREENING_LOI"
  });
  const memberFeedbackStatus = await latestMemberFeedbackStatus(tx, companyId, healthSystemId);

  const opportunity = openOpportunity
    ? await tx.companyOpportunity.update({
        where: { id: openOpportunity.id },
        data: {
          title: nextTitle,
          stage: chooseExistingOpportunityStage(openOpportunity.stage, targetStage),
          likelihoodPercent:
            openOpportunity.likelihoodPercent === null
              ? likelihoodPercent
              : Math.max(openOpportunity.likelihoodPercent, likelihoodPercent),
          preliminaryInterestOverride: openOpportunity.preliminaryInterestOverride,
          memberFeedbackStatus: openOpportunity.memberFeedbackStatus || memberFeedbackStatus,
          notes: appendTimestampedNote(openOpportunity.notes, note)
        }
      })
    : await tx.companyOpportunity.create({
        data: {
          companyId,
          healthSystemId,
          type: "SCREENING_LOI",
          title: nextTitle,
          stage: targetStage,
          preliminaryInterestOverride: null,
          memberFeedbackStatus,
          likelihoodPercent,
          notes: appendTimestampedNote(null, note)
        }
      });

  await mirrorHealthSystemOpportunity(tx, opportunity);
  await syncCompanyLoiFromOpportunityStage(tx, companyId, healthSystemId, opportunity.stage);
  await syncOpportunityContactLinks(
    tx,
    opportunity.id,
    syncedContactIds
  );

  return {
    averageScore,
    qualified: true,
    opportunityId: opportunity.id,
    waitingForWebinarTwo: false
  };
}
