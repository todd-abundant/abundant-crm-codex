export type IntakeDeclineReason =
  | "PRODUCT"
  | "INSUFFICIENT_ROI"
  | "HIGHLY_COMPETITIVE_LANDSCAPE"
  | "OUT_OF_INVESTMENT_THESIS_SCOPE"
  | "TOO_EARLY"
  | "TOO_MATURE_FOR_SEED_INVESTMENT"
  | "LACKS_PROOF_POINTS"
  | "INSUFFICIENT_TAM"
  | "TEAM"
  | "HEALTH_SYSTEM_BUYING_PROCESS"
  | "WORKFLOW_FRICTION"
  | "OTHER";

type IntakeDeclineReasonCore = Exclude<IntakeDeclineReason, "OTHER">;

export const INTAKE_DECLINE_REASON_CATALOG: Array<{
  value: IntakeDeclineReasonCore;
  label: string;
  description: string;
}> = [
  {
    value: "PRODUCT",
    label: "Product",
    description: "Core solution doesn't meet need / weak differentiation / workflow friction."
  },
  {
    value: "INSUFFICIENT_ROI",
    label: "Insufficient ROI",
    description: "Economics don't pencil (payback too long, weak measurable value)."
  },
  {
    value: "HIGHLY_COMPETITIVE_LANDSCAPE",
    label: "Highly Competitive Landscape",
    description: "Crowded category; hard to win or displace incumbents."
  },
  {
    value: "OUT_OF_INVESTMENT_THESIS_SCOPE",
    label: "Out of Investment Thesis Scope",
    description: "Outside Abundant's thesis, stage, geography, or focus areas."
  },
  {
    value: "TOO_EARLY",
    label: "Too Early",
    description: "Too little validation, traction, or product maturity for current bar."
  },
  {
    value: "TOO_MATURE_FOR_SEED_INVESTMENT",
    label: "Too Mature for Seed Investment",
    description: "Stage/valuation/round size doesn't fit seed mandate."
  },
  {
    value: "LACKS_PROOF_POINTS",
    label: "Lacks Proof Points",
    description: "Missing key evidence (clinical, regulatory, pilots, retention, etc.)."
  },
  {
    value: "INSUFFICIENT_TAM",
    label: "Insufficient TAM",
    description: "Market size too small or constrained for venture-scale outcome."
  },
  {
    value: "TEAM",
    label: "Team",
    description: "Lack conviction in leadership/founding team."
  },
  {
    value: "HEALTH_SYSTEM_BUYING_PROCESS",
    label: "Health System Buying Process",
    description: "No clear defined buyer, lack of health system prioritization."
  },
  {
    value: "WORKFLOW_FRICTION",
    label: "Workflow Friction",
    description: "Implementation complexity, adoption risk."
  }
];

export const INTAKE_DECLINE_REASON_OPTIONS: Array<{ value: IntakeDeclineReason | ""; label: string }> = [
  { value: "", label: "Not declined" },
  ...INTAKE_DECLINE_REASON_CATALOG.map((reason) => ({
    value: reason.value,
    label: `${reason.label} - ${reason.description}`
  })),
  { value: "OTHER", label: "Other (custom)" }
];

export const INTAKE_DECLINE_REASON_TEXT_SUGGESTIONS: string[] = [
  ...INTAKE_DECLINE_REASON_CATALOG.map((reason) => `${reason.label} - ${reason.description}`),
  "Other"
];

export function intakeDeclineReasonLabel(value: IntakeDeclineReason | "") {
  if (!value) return "Not declined";
  if (value === "OTHER") return "Other";
  return INTAKE_DECLINE_REASON_CATALOG.find((reason) => reason.value === value)?.label || value;
}
