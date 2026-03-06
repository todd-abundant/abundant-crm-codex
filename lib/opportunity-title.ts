const typeSuffixByOpportunityType = {
  SCREENING_LOI: "LOI",
  VENTURE_STUDIO_SERVICES: "Venture Studio Services",
  S1_TERM_SHEET: "Term Sheet",
  COMMERCIAL_CONTRACT: "Commercial Contract",
  PROSPECT_PURSUIT: "Prospect Pursuit"
} as const;

export type OpportunityTitleType = keyof typeof typeSuffixByOpportunityType;

export function opportunityTypeTitleSuffix(type: string) {
  return typeSuffixByOpportunityType[type as OpportunityTitleType] || "Opportunity";
}

export function generateOpportunityTitle({
  companyName,
  healthSystemName,
  type
}: {
  companyName: string;
  healthSystemName?: string | null;
  type: string;
}) {
  const trimmedCompanyName = companyName.trim();
  if (!trimmedCompanyName) {
    throw new Error("Company name is required to generate an opportunity title.");
  }

  const suffix = opportunityTypeTitleSuffix(type);
  const trimmedHealthSystemName = (healthSystemName || "").trim();
  if (!trimmedHealthSystemName) {
    return `${trimmedCompanyName} - ${suffix}`;
  }
  return `${trimmedCompanyName} - ${trimmedHealthSystemName} ${suffix}`;
}
