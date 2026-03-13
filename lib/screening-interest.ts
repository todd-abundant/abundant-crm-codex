import type { CompanyLoiStatus, CompanyOpportunityStage } from "@prisma/client";

export const screeningInterestStatusValues = ["GREY", "RED", "YELLOW", "GREEN", "BLUE"] as const;

export type ScreeningInterestStatus = (typeof screeningInterestStatusValues)[number];

export type ScreeningCurrentInterestPresentation = {
  status: ScreeningInterestStatus;
  label: string;
};

function roundScore(value: number) {
  return Math.round(value * 10) / 10;
}

export function averageScreeningScores(scores: Array<number | null | undefined>) {
  const valid = scores.filter((score): score is number => Number.isFinite(score as number));
  if (valid.length === 0) return null;
  return roundScore(valid.reduce((sum, score) => sum + score, 0) / valid.length);
}

export function stageProgressRank(stage: CompanyOpportunityStage) {
  if (stage === "IDENTIFIED") return 0;
  if (stage === "QUALIFICATION") return 1;
  if (stage === "PROPOSAL") return 2;
  if (stage === "NEGOTIATION") return 3;
  if (stage === "LEGAL") return 4;
  if (stage === "ON_HOLD") return 5;
  if (stage === "CLOSED_WON") return 6;
  return -1;
}

export function compareOpportunityStagePriority(
  left: CompanyOpportunityStage | null | undefined,
  right: CompanyOpportunityStage | null | undefined
) {
  const leftRank = left ? stageProgressRank(left) : -1;
  const rightRank = right ? stageProgressRank(right) : -1;
  return leftRank - rightRank;
}

export function mapOpportunityStageToCurrentInterest(
  stage: CompanyOpportunityStage | null | undefined
): ScreeningCurrentInterestPresentation {
  if (stage === "ON_HOLD") {
    return { status: "BLUE", label: "Revisit Later" };
  }
  if (stage === "CLOSED_LOST") {
    return { status: "RED", label: "Red" };
  }
  if (stage === "CLOSED_WON") {
    return { status: "GREEN", label: "LOI Signed" };
  }
  if (stage === "PROPOSAL" || stage === "NEGOTIATION" || stage === "LEGAL") {
    return { status: "GREEN", label: "Green" };
  }
  if (stage === "IDENTIFIED" || stage === "QUALIFICATION") {
    return { status: "YELLOW", label: "Yellow" };
  }
  return { status: "GREY", label: "Grey" };
}

export function derivePreliminaryInterestStatus(options: {
  averageScore: number | null;
  overrideStatus?: ScreeningInterestStatus | null;
}) {
  const { averageScore, overrideStatus } = options;
  if (overrideStatus === "BLUE") return "BLUE" as const;
  if (averageScore === null) return "GREY" as const;
  if (averageScore >= 8) return "GREEN" as const;
  if (averageScore >= 6) return "YELLOW" as const;
  return "RED" as const;
}

export function preliminaryInterestLabel(status: ScreeningInterestStatus) {
  if (status === "BLUE") return "Revisit Later";
  if (status === "GREEN") return "Green";
  if (status === "YELLOW") return "Yellow";
  if (status === "RED") return "Red";
  return "Grey";
}

export function screeningOpportunityStageForAverage(averageScore: number) {
  return averageScore >= 8 ? ("PROPOSAL" as const) : ("QUALIFICATION" as const);
}

export function currentInterestStatusToOpportunityStage(status: ScreeningInterestStatus) {
  if (status === "BLUE") return "ON_HOLD" as const;
  if (status === "GREEN") return "PROPOSAL" as const;
  if (status === "YELLOW") return "QUALIFICATION" as const;
  if (status === "RED") return "CLOSED_LOST" as const;
  return "IDENTIFIED" as const;
}

export function loiStatusForOpportunityStage(stage: CompanyOpportunityStage): CompanyLoiStatus | null {
  if (stage === "CLOSED_WON") return "SIGNED";
  if (stage === "CLOSED_LOST") return "DECLINED";
  if (stage === "ON_HOLD") return null;
  if (stage === "PROPOSAL" || stage === "NEGOTIATION" || stage === "LEGAL") return "NEGOTIATING";
  if (stage === "IDENTIFIED" || stage === "QUALIFICATION") return "PENDING";
  return "NOT_STARTED";
}
