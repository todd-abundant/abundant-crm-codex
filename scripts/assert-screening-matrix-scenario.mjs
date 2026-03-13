import { PrismaClient } from "@prisma/client";
import {
  COMPANY_NAME,
  SLOT_PLANS,
  loadScenarioEnv,
  parseScenarioManifest
} from "./screening-matrix-scenario-helpers.mjs";

loadScenarioEnv();
const prisma = new PrismaClient();

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: COMPANY_NAME },
    include: {
      pipeline: true,
      opportunities: {
        where: { type: "SCREENING_LOI" },
        include: {
          healthSystem: {
            select: {
              id: true,
              name: true
            }
          },
          contacts: {
            select: {
              contactId: true
            }
          }
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      },
      screeningSurveySessions: {
        include: {
          questions: {
            select: {
              id: true,
              drivesScreeningOpportunity: true
            }
          },
          submissions: {
            include: {
              answers: {
                where: {
                  sessionQuestion: {
                    drivesScreeningOpportunity: true
                  },
                  isSkipped: false,
                  score: { not: null }
                },
                select: {
                  score: true
                }
              }
            }
          }
        },
        orderBy: [{ createdAt: "desc" }]
      },
      screeningCellChanges: {
        orderBy: [{ createdAt: "desc" }],
        select: {
          healthSystemId: true,
          field: true,
          value: true
        }
      }
    }
  });

  assertCondition(Boolean(company), `Scenario company not found: ${COMPANY_NAME}`);
  assertCondition(company?.pipeline?.phase === "SCREENING", "Scenario company is not in SCREENING phase.");

  const manifest = parseScenarioManifest(company?.leadSourceNotes);
  assertCondition(Boolean(manifest), "Scenario manifest is missing from the company record.");
  assertCondition(
    manifest.selectedHealthSystems.length === SLOT_PLANS.length,
    `Expected ${SLOT_PLANS.length} selected health systems in the manifest.`
  );

  const session = company.screeningSurveySessions[0];
  assertCondition(Boolean(session), "Scenario survey session was not created.");
  assertCondition(session.status === "LIVE", "Scenario survey session is not LIVE.");
  assertCondition(
    session.questions.filter((entry) => entry.drivesScreeningOpportunity).length >= 2,
    "Expected at least two survey questions to drive preliminary interest."
  );

  const scoresBySystemId = new Map();
  const submissionCountBySystemId = new Map();
  const contactIdsBySystemId = new Map();
  for (const submission of session.submissions) {
    if (!submission.healthSystemId) continue;

    submissionCountBySystemId.set(
      submission.healthSystemId,
      (submissionCountBySystemId.get(submission.healthSystemId) || 0) + 1
    );

    if (submission.contactId) {
      const contactIds = contactIdsBySystemId.get(submission.healthSystemId) || new Set();
      contactIds.add(submission.contactId);
      contactIdsBySystemId.set(submission.healthSystemId, contactIds);
    }

    const scores = scoresBySystemId.get(submission.healthSystemId) || [];
    for (const answer of submission.answers) {
      const score = Number(answer.score);
      if (Number.isFinite(score)) scores.push(score);
    }
    scoresBySystemId.set(submission.healthSystemId, scores);
  }

  const opportunityBySystemId = new Map();
  for (const opportunity of company.opportunities) {
    if (!opportunity.healthSystem?.id) continue;
    if (!opportunityBySystemId.has(opportunity.healthSystem.id)) {
      opportunityBySystemId.set(opportunity.healthSystem.id, opportunity);
    }
  }

  const systems = manifest.selectedHealthSystems.map((system) => {
    const plan = SLOT_PLANS.find((entry) => entry.slot === system.slot);
    assertCondition(Boolean(plan), `Missing slot plan for ${system.slot}.`);

    const scores = scoresBySystemId.get(system.healthSystemId) || [];
    const averageScore = average(scores);
    const opportunity = opportunityBySystemId.get(system.healthSystemId) || null;
    const submissionCount = submissionCountBySystemId.get(system.healthSystemId) || 0;
    const respondentContactIds = contactIdsBySystemId.get(system.healthSystemId) || new Set();
    const opportunityContactIds = new Set((opportunity?.contacts || []).map((entry) => entry.contactId));

    if (plan.expectation === "GREY") {
      assertCondition(submissionCount === 0, `${system.healthSystemName} should have no survey submissions.`);
      assertCondition(!opportunity, `${system.healthSystemName} should not have a screening opportunity.`);
    }

    if (plan.expectation === "RED") {
      assertCondition(averageScore !== null && averageScore < 6, `${system.healthSystemName} should average below 6.`);
      assertCondition(!opportunity, `${system.healthSystemName} should not have a screening opportunity.`);
    }

    if (plan.expectation === "YELLOW" || plan.expectation === "GREEN") {
      assertCondition(
        averageScore !== null && averageScore >= 6,
        `${system.healthSystemName} should average at least 6 for a qualified opportunity.`
      );
      assertCondition(Boolean(opportunity), `${system.healthSystemName} should have one screening opportunity.`);
      for (const contactId of respondentContactIds) {
        assertCondition(
          opportunityContactIds.has(contactId),
          `${system.healthSystemName} is missing a survey respondent contact on the opportunity.`
        );
      }
    }

    if (system.slot === "multi_day_yellow") {
      assertCondition(submissionCount >= 3, "The multi-day fixture should have at least three survey submissions.");
      assertCondition(Boolean(opportunity), "The multi-day fixture should resolve to one screening opportunity.");
    }

    return {
      slot: system.slot,
      healthSystemName: system.healthSystemName,
      expectedPreliminaryInterest: plan.expectation,
      flaggedAverageScore: averageScore,
      submissionCount,
      currentOpportunityStage: opportunity?.stage || null,
      opportunityContactCount: opportunity?.contacts.length || 0,
      memberFeedbackStatus:
        company.screeningCellChanges.find(
          (entry) =>
            entry.healthSystemId === system.healthSystemId && entry.field === "MEMBER_FEEDBACK_STATUS"
        )?.value || opportunity?.memberFeedbackStatus || null
    };
  });

  const qualifiedSystems = systems.filter((entry) => entry.expectedPreliminaryInterest === "YELLOW" || entry.expectedPreliminaryInterest === "GREEN");
  assertCondition(qualifiedSystems.length === 4, "Expected four qualified health systems in the seeded scenario.");
  assertCondition(
    company.opportunities.length >= qualifiedSystems.length,
    "Expected at least one screening opportunity for each qualified health system."
  );
  assertCondition(
    systems.some((entry) => Boolean(entry.memberFeedbackStatus)),
    "Expected at least one seeded Member Feedback/Status value."
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        companyId: company.id,
        companyName: company.name,
        surveySessionId: session.id,
        systems
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("assert_screening_matrix_scenario_error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
