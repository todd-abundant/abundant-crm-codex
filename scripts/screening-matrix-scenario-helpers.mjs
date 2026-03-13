import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export const SCENARIO_KEY = "screening-matrix-e2e-20260313";
export const COMPANY_NAME = "Screening Matrix Scenario Co";
export const MOCK_EMAIL_DOMAIN = "screening-matrix-test.local";
export const SESSION_TITLE = "Screening Matrix Scenario Survey";
export const DEFAULT_APP_BASE_URL = "http://127.0.0.1:3000";

export const QUESTION_DEFINITIONS = [
  {
    slug: "interest_in_codevelopment",
    category: "Co-Development",
    prompt: `[${SCENARIO_KEY}] Interest in co-development`,
    drivesScreeningOpportunity: true
  },
  {
    slug: "readiness_for_codevelopment",
    category: "Co-Development",
    prompt: `[${SCENARIO_KEY}] Readiness for co-development`,
    drivesScreeningOpportunity: true
  },
  {
    slug: "workflow_fit",
    category: "Desirability",
    prompt: `[${SCENARIO_KEY}] Workflow fit`,
    drivesScreeningOpportunity: false
  },
  {
    slug: "implementation_feasibility",
    category: "Feasibility",
    prompt: `[${SCENARIO_KEY}] Implementation feasibility`,
    drivesScreeningOpportunity: false
  }
];

export const SLOT_PLANS = [
  {
    slot: "grey_declined",
    expectation: "GREY",
    description: "Declined / no survey answers",
    createDeclinedParticipant: true,
    submissions: []
  },
  {
    slot: "red_low_interest",
    expectation: "RED",
    description: "Average flagged score below 6, no opportunity should be created",
    submissions: [
      {
        code: "red-1",
        dayOffset: 0,
        impressions:
          "The problem is real, but our team does not have co-development capacity this quarter and would not pursue an LOI now.",
        answers: {
          interest_in_codevelopment: 5,
          readiness_for_codevelopment: 5,
          workflow_fit: 6,
          implementation_feasibility: 5
        }
      }
    ]
  },
  {
    slot: "yellow_qualified",
    expectation: "YELLOW",
    description: "Qualified from survey rollup with legacy feedback fields populated",
    legacyCellChanges: {
      relevantFeedback:
        "Clinical leaders are interested, but they want a tighter KPI framework before committing resources.",
      statusUpdate:
        "Needs an internal review with finance and digital operations before LOI terms are discussed."
    },
    submissions: [
      {
        code: "yellow-1",
        dayOffset: -1,
        impressions:
          "There is moderate interest in co-development, but the team needs another working session to clarify implementation scope.",
        answers: {
          interest_in_codevelopment: 6,
          readiness_for_codevelopment: 7,
          workflow_fit: 7,
          implementation_feasibility: 6
        }
      }
    ]
  },
  {
    slot: "green_qualified",
    expectation: "GREEN",
    description: "Strong co-development signal with a seeded member feedback/status note",
    memberFeedbackStatus:
      "Strong sponsor support. Interested in moving toward LOI language once pilot milestones are drafted.",
    submissions: [
      {
        code: "green-1",
        dayOffset: -2,
        impressions:
          "Leadership is enthusiastic about co-development and sees a clear path to an LOI if the pilot structure looks reasonable.",
        answers: {
          interest_in_codevelopment: 8,
          readiness_for_codevelopment: 9,
          workflow_fit: 8,
          implementation_feasibility: 8
        }
      },
      {
        code: "green-2",
        dayOffset: -1,
        impressions:
          "The executive sponsor supports co-development and wants a proposal-level conversation with legal review next.",
        answers: {
          interest_in_codevelopment: 9,
          readiness_for_codevelopment: 8,
          workflow_fit: 7,
          implementation_feasibility: 8
        }
      }
    ]
  },
  {
    slot: "multi_day_yellow",
    expectation: "YELLOW",
    description: "Multiple respondents over multiple days should still create one opportunity",
    submissions: [
      {
        code: "multi-1",
        dayOffset: -3,
        impressions:
          "Interest is promising, but we need one more internal alignment conversation before we would treat this as active LOI work.",
        answers: {
          interest_in_codevelopment: 7,
          readiness_for_codevelopment: 6,
          workflow_fit: 7,
          implementation_feasibility: 6
        }
      },
      {
        code: "multi-2",
        dayOffset: -2,
        impressions:
          "The organization is open to co-development if the pilot stays narrow and the contact model is clear.",
        answers: {
          interest_in_codevelopment: 6,
          readiness_for_codevelopment: 7,
          workflow_fit: 6,
          implementation_feasibility: 6
        }
      },
      {
        code: "multi-3",
        dayOffset: 0,
        impressions:
          "There is interest, but this should stay in qualification until the team confirms data-sharing assumptions.",
        answers: {
          interest_in_codevelopment: 7,
          readiness_for_codevelopment: 7,
          workflow_fit: 7,
          implementation_feasibility: 6
        }
      }
    ]
  },
  {
    slot: "yellow_followup",
    expectation: "YELLOW",
    description: "Another qualified institution for current-interest stage editing in the UI",
    submissions: [
      {
        code: "yellow-2",
        dayOffset: 0,
        impressions:
          "There is enough interest to keep talking, but the team is not ready to accelerate past qualification without follow-up.",
        answers: {
          interest_in_codevelopment: 6,
          readiness_for_codevelopment: 6,
          workflow_fit: 5,
          implementation_feasibility: 6
        }
      }
    ]
  }
];

export function normalizeBaseUrl(value) {
  const raw = (value || DEFAULT_APP_BASE_URL).trim();
  return raw.replace(/\/+$/, "");
}

export function scenarioEmail(code) {
  return `${code}@${MOCK_EMAIL_DOMAIN}`;
}

export function scenarioParticipantName(code) {
  return code
    .split(/[^a-z0-9]+/i)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function formatScenarioManifest(selectedHealthSystems) {
  return JSON.stringify(
    {
      scenarioKey: SCENARIO_KEY,
      companyName: COMPANY_NAME,
      selectedHealthSystems,
      generatedAt: new Date().toISOString()
    },
    null,
    2
  );
}

export function parseScenarioManifest(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.selectedHealthSystems)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function loadScenarioEnv() {
  for (const filename of [".env", ".env.local"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const content = readFileSync(path, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) continue;
      const key = trimmed.slice(0, separatorIndex).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(separatorIndex + 1).trim();
      if (
        (value.startsWith("\"") && value.endsWith("\"")) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }

  if (typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.includes("://")) {
    try {
      const url = new URL(process.env.DATABASE_URL);
      if (url.hostname === "localhost") {
        url.hostname = "127.0.0.1";
        process.env.DATABASE_URL = url.toString();
      }
    } catch {
      // Ignore malformed DATABASE_URL values; Prisma will surface the actual error later.
    }
  }
}
