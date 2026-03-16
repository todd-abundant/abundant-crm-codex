export const DIGEST_KINDS = ["co-investors", "contacts", "companies", "health-systems"] as const;

export type DigestKind = (typeof DIGEST_KINDS)[number];

export const stakeholderSignalsConfig: Record<
  DigestKind,
  {
    label: string;
    singularLabel: string;
    betaCardLabel: string;
    betaCardDescription: string;
    processRoute: string;
    searchDescription: string;
  }
> = {
  "co-investors": {
    label: "Co-Investors",
    singularLabel: "Co-Investor",
    betaCardLabel: "Stakeholder Signals Digest",
    betaCardDescription: "Run investor, contact, company, and health system signal sweeps from one digest view.",
    processRoute: "/api/co-investors/signals/process",
    searchDescription:
      "Searches for new funds, investments, exits, major partner moves, portfolio milestones, and competitor activity that can support a congratulations note or market-relevant outreach."
  },
  contacts: {
    label: "Contacts",
    singularLabel: "Contact",
    betaCardLabel: "Stakeholder Signals Digest",
    betaCardDescription: "Run investor, contact, company, and health system signal sweeps from one digest view.",
    processRoute: "/api/contacts/signals/process",
    searchDescription:
      "Searches for promotions, role changes, speaking appearances, awards, board appointments, quoted commentary, and other identity-safe personal updates tied to known organizations."
  },
  companies: {
    label: "Companies",
    singularLabel: "Company",
    betaCardLabel: "Stakeholder Signals Digest",
    betaCardDescription: "Run investor, contact, company, and health system signal sweeps from one digest view.",
    processRoute: "/api/companies/signals/process",
    searchDescription:
      "Searches for fundraises, customer wins, partnerships, launches, regulatory milestones, executive hires, acquisitions, and competitive market moves."
  },
  "health-systems": {
    label: "Health Systems",
    singularLabel: "Health System",
    betaCardLabel: "Stakeholder Signals Digest",
    betaCardDescription: "Run investor, contact, company, and health system signal sweeps from one digest view.",
    processRoute: "/api/health-systems/signals/process",
    searchDescription:
      "Searches for leadership changes, financial updates, partnerships, AI and innovation initiatives, investments, expansions, M&A, and regional competitor moves."
  }
};

export function isDigestKind(value: string | null): value is DigestKind {
  return value !== null && DIGEST_KINDS.includes(value as DigestKind);
}
