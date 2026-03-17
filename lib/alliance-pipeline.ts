import type { AllianceMemberStatus } from "./schemas";

export type AlliancePipelineStage = "PROSPECTING" | "QUALIFYING" | "PROPOSAL" | "CONTRACTING";
export type AlliancePipelineStatus = "ACTIVE" | "CLOSED" | "REVISIT";
export type AlliancePipelineClosedOutcome = "JOINED" | "PASSED" | "LOST" | "WITHDREW" | "OTHER";

export const ALLIANCE_PIPELINE_STAGE_OPTIONS: Array<{ value: AlliancePipelineStage; label: string }> = [
  { value: "PROSPECTING", label: "Prospecting" },
  { value: "QUALIFYING", label: "Qualifying" },
  { value: "PROPOSAL", label: "Proposal" },
  { value: "CONTRACTING", label: "Contracting" }
];

export const ALLIANCE_PIPELINE_STATUS_OPTIONS: Array<{ value: AlliancePipelineStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "REVISIT", label: "Revisit" },
  { value: "CLOSED", label: "Closed" }
];

export const ALLIANCE_PIPELINE_CLOSED_OUTCOME_OPTIONS: Array<{
  value: AlliancePipelineClosedOutcome;
  label: string;
}> = [
  { value: "JOINED", label: "Joined" },
  { value: "PASSED", label: "Passed" },
  { value: "LOST", label: "Lost" },
  { value: "WITHDREW", label: "Withdrew" },
  { value: "OTHER", label: "Other" }
];

export function normalizeAlliancePipelineStage(value: string | null | undefined): AlliancePipelineStage {
  if (value === "QUALIFYING" || value === "PROPOSAL" || value === "CONTRACTING") return value;
  return "PROSPECTING";
}

export function normalizeAlliancePipelineStatus(value: string | null | undefined): AlliancePipelineStatus {
  if (value === "CLOSED" || value === "REVISIT") return value;
  return "ACTIVE";
}

export function stageLabel(stage: AlliancePipelineStage) {
  return ALLIANCE_PIPELINE_STAGE_OPTIONS.find((option) => option.value === stage)?.label || stage;
}

export function statusLabel(status: AlliancePipelineStatus) {
  return ALLIANCE_PIPELINE_STATUS_OPTIONS.find((option) => option.value === status)?.label || status;
}

export function closedOutcomeLabel(outcome: AlliancePipelineClosedOutcome | null | undefined) {
  if (!outcome) return "";
  return ALLIANCE_PIPELINE_CLOSED_OUTCOME_OPTIONS.find((option) => option.value === outcome)?.label || outcome;
}

export function allianceMemberStateFromPipeline(
  status: AlliancePipelineStatus,
  closedOutcome: AlliancePipelineClosedOutcome | null | undefined
): { isAllianceMember: boolean; allianceMemberStatus: AllianceMemberStatus } {
  if (status === "CLOSED" && closedOutcome === "JOINED") {
    return {
      isAllianceMember: true,
      allianceMemberStatus: "YES"
    };
  }

  if (status === "REVISIT") {
    return {
      isAllianceMember: false,
      allianceMemberStatus: "REVISIT_LATER"
    };
  }

  if (status === "ACTIVE") {
    return {
      isAllianceMember: false,
      allianceMemberStatus: "PROSPECT"
    };
  }

  return {
    isAllianceMember: false,
    allianceMemberStatus: "NO"
  };
}
