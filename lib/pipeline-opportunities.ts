export type PipelinePhase =
  | "INTAKE"
  | "DECLINED"
  | "VENTURE_STUDIO_NEGOTIATION"
  | "SCREENING"
  | "LOI_COLLECTION"
  | "COMMERCIAL_NEGOTIATION"
  | "PORTFOLIO_GROWTH";

export type PipelineIntakeStatus = "NOT_SCHEDULED" | "SCHEDULED" | "COMPLETED" | "SCREENING_EVALUATION";
export type PipelineIntakeDecision = "PENDING" | "ADVANCE_TO_NEGOTIATION" | "DECLINE";

export type PipelineBoardColumn = "INTAKE" | "VENTURE_STUDIO_CONTRACT_EVALUATION" | "SCREENING" | "COMMERCIAL_ACCELERATION";

export const PIPELINE_BOARD_COLUMNS: Array<{ key: PipelineBoardColumn; label: string }> = [
  { key: "INTAKE", label: "Intake" },
  { key: "VENTURE_STUDIO_CONTRACT_EVALUATION", label: "Venture Studio Contract Evaluation" },
  { key: "SCREENING", label: "Screening" },
  { key: "COMMERCIAL_ACCELERATION", label: "Commercial Acceleration" }
];

export const PIPELINE_PHASE_OPTIONS: Array<{ value: PipelinePhase; label: string }> = [
  { value: "INTAKE", label: "Intake" },
  { value: "DECLINED", label: "Declined" },
  { value: "VENTURE_STUDIO_NEGOTIATION", label: "Venture Studio Negotiation" },
  { value: "SCREENING", label: "Screening" },
  { value: "LOI_COLLECTION", label: "LOI Collection" },
  { value: "COMMERCIAL_NEGOTIATION", label: "Commercial Negotiation" },
  { value: "PORTFOLIO_GROWTH", label: "Portfolio Growth" }
];

const screeningPhases = new Set<PipelinePhase>(["SCREENING", "LOI_COLLECTION"]);
const commercialPhases = new Set<PipelinePhase>(["COMMERCIAL_NEGOTIATION", "PORTFOLIO_GROWTH"]);

export function inferDefaultPhaseFromCompany(company: {
  intakeStatus: PipelineIntakeStatus;
  declineReason: string | null;
}) {
  if (company.declineReason) return "DECLINED" as const;
  if (company.intakeStatus === "SCREENING_EVALUATION") return "SCREENING" as const;
  if (company.intakeStatus === "COMPLETED") return "VENTURE_STUDIO_NEGOTIATION" as const;
  return "INTAKE" as const;
}

export function inferDefaultDecisionFromCompany(company: {
  intakeStatus: PipelineIntakeStatus;
  declineReason: string | null;
}) {
  if (company.declineReason) return "DECLINE" as const;
  if (company.intakeStatus === "COMPLETED" || company.intakeStatus === "SCREENING_EVALUATION") {
    return "ADVANCE_TO_NEGOTIATION" as const;
  }
  return "PENDING" as const;
}

export function mapPhaseToBoardColumn(phase: PipelinePhase): PipelineBoardColumn | null {
  if (phase === "DECLINED") return null;
  if (phase === "INTAKE") return "INTAKE";
  if (phase === "VENTURE_STUDIO_NEGOTIATION") return "VENTURE_STUDIO_CONTRACT_EVALUATION";
  if (screeningPhases.has(phase)) return "SCREENING";
  if (commercialPhases.has(phase)) return "COMMERCIAL_ACCELERATION";
  return null;
}

export function mapBoardColumnToCanonicalPhase(column: PipelineBoardColumn): PipelinePhase {
  if (column === "INTAKE") return "INTAKE";
  if (column === "VENTURE_STUDIO_CONTRACT_EVALUATION") return "VENTURE_STUDIO_NEGOTIATION";
  if (column === "SCREENING") return "SCREENING";
  return "COMMERCIAL_NEGOTIATION";
}

export function isScreeningPhase(phase: PipelinePhase) {
  return screeningPhases.has(phase);
}

export function phaseLabel(phase: PipelinePhase) {
  return PIPELINE_PHASE_OPTIONS.find((option) => option.value === phase)?.label || phase;
}
