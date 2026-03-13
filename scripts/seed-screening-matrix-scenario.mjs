import { PrismaClient } from "@prisma/client";
import {
  COMPANY_NAME,
  DEFAULT_APP_BASE_URL,
  MOCK_EMAIL_DOMAIN,
  QUESTION_DEFINITIONS,
  SCENARIO_KEY,
  SESSION_TITLE,
  SLOT_PLANS,
  formatScenarioManifest,
  loadScenarioEnv,
  normalizeBaseUrl,
  scenarioEmail,
  scenarioParticipantName
} from "./screening-matrix-scenario-helpers.mjs";

loadScenarioEnv();
const prisma = new PrismaClient();

async function cleanupExistingScenario(tx) {
  const companies = await tx.company.findMany({
    where: {
      OR: [
        { name: COMPANY_NAME },
        { description: { contains: SCENARIO_KEY } },
        { leadSourceNotes: { contains: SCENARIO_KEY } }
      ]
    },
    select: { id: true }
  });
  const contacts = await tx.contact.findMany({
    where: {
      email: { endsWith: `@${MOCK_EMAIL_DOMAIN}`, mode: "insensitive" }
    },
    select: { id: true }
  });

  if (companies.length > 0) {
    await tx.company.deleteMany({
      where: { id: { in: companies.map((entry) => entry.id) } }
    });
  }

  await tx.companyScreeningSurveyQuestion.deleteMany({
    where: {
      OR: [
        { prompt: { in: QUESTION_DEFINITIONS.map((entry) => entry.prompt) } },
        { prompt: { contains: SCENARIO_KEY } }
      ]
    }
  });

  if (contacts.length > 0) {
    const contactIds = contacts.map((entry) => entry.id);
    await tx.contactCompany.deleteMany({
      where: { contactId: { in: contactIds } }
    });
    await tx.contactHealthSystem.deleteMany({
      where: { contactId: { in: contactIds } }
    });
    await tx.contact.deleteMany({
      where: { id: { in: contactIds } }
    });
  }
}

function average(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

async function ensureAppIsReachable(appBaseUrl) {
  try {
    const response = await fetch(`${appBaseUrl}/`, { redirect: "manual" });
    if (response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    throw new Error(
      `Local app is not reachable at ${appBaseUrl}. Start the app with "npm run dev" and rerun the seed script. (${detail})`
    );
  }
}

async function main() {
  const appBaseUrl = normalizeBaseUrl(process.env.APP_BASE_URL || DEFAULT_APP_BASE_URL);
  await ensureAppIsReachable(appBaseUrl);

  const healthSystems = await prisma.healthSystem.findMany({
    where: { isAllianceMember: true },
    orderBy: [{ name: "asc" }],
    take: SLOT_PLANS.length,
    select: {
      id: true,
      name: true
    }
  });

  if (healthSystems.length < SLOT_PLANS.length) {
    throw new Error(`Expected at least ${SLOT_PLANS.length} alliance health systems for the scenario.`);
  }

  const selectedHealthSystems = SLOT_PLANS.map((plan, index) => ({
    slot: plan.slot,
    expectation: plan.expectation,
    healthSystemId: healthSystems[index].id,
    healthSystemName: healthSystems[index].name,
    description: plan.description
  }));

  const setup = await prisma.$transaction(async (tx) => {
    await cleanupExistingScenario(tx);

    const company = await tx.company.create({
      data: {
        name: COMPANY_NAME,
        website: "https://screening-matrix-test.local",
        description: `Local-only screening matrix scenario seeded by ${SCENARIO_KEY}.`,
        leadSourceNotes: formatScenarioManifest(selectedHealthSystems),
        atAGlanceProblem: "Scenario fixture company for the screening matrix rollout.",
        atAGlanceSolution: "Synthetic data that exercises survey rollups, opportunity sync, and matrix editing."
      },
      select: {
        id: true,
        name: true
      }
    });

    await tx.companyPipeline.create({
      data: {
        companyId: company.id,
        phase: "SCREENING",
        targetLoiCount: 3,
        screeningWebinarDate1At: new Date("2026-03-09T17:00:00.000Z"),
        screeningWebinarDate2At: new Date("2026-03-11T17:00:00.000Z"),
        nextStep: "Use the seeded scenario to validate preliminary/current interest behavior."
      }
    });

    const session = await tx.companyScreeningSurveySession.create({
      data: {
        companyId: company.id,
        title: SESSION_TITLE,
        accessToken: `${SCENARIO_KEY}-${Date.now()}`,
        status: "LIVE",
        openedAt: new Date("2026-03-11T18:00:00.000Z")
      },
      select: {
        id: true,
        accessToken: true
      }
    });

    const sessionQuestionIdsBySlug = new Map();
    for (const [index, definition] of QUESTION_DEFINITIONS.entries()) {
      const question = await tx.companyScreeningSurveyQuestion.create({
        data: {
          category: definition.category,
          prompt: definition.prompt,
          instructions: `Scenario fixture question for ${SCENARIO_KEY}.`
        },
        select: { id: true }
      });
      const sessionQuestion = await tx.companyScreeningSurveySessionQuestion.create({
        data: {
          sessionId: session.id,
          questionId: question.id,
          displayOrder: index,
          drivesScreeningOpportunity: definition.drivesScreeningOpportunity
        },
        select: { id: true }
      });
      sessionQuestionIdsBySlug.set(definition.slug, sessionQuestion.id);
    }

    const webinar = await tx.companyScreeningEvent.create({
      data: {
        companyId: company.id,
        type: "WEBINAR",
        title: "Alliance Screening Webinar 1",
        scheduledAt: new Date("2026-03-09T17:00:00.000Z"),
        completedAt: new Date("2026-03-09T18:00:00.000Z"),
        notes: "Scenario webinar fixture."
      },
      select: { id: true }
    });

    for (const system of selectedHealthSystems) {
      const plan = SLOT_PLANS.find((entry) => entry.slot === system.slot);
      if (!plan) continue;

      if (plan.memberFeedbackStatus) {
        await tx.companyScreeningCellChange.create({
          data: {
            companyId: company.id,
            healthSystemId: system.healthSystemId,
            field: "MEMBER_FEEDBACK_STATUS",
            value: plan.memberFeedbackStatus,
            changedByName: "Scenario Seeder"
          }
        });
      }

      if (plan.legacyCellChanges) {
        await tx.companyScreeningCellChange.createMany({
          data: [
            {
              companyId: company.id,
              healthSystemId: system.healthSystemId,
              field: "RELEVANT_FEEDBACK",
              value: plan.legacyCellChanges.relevantFeedback,
              changedByName: "Scenario Seeder"
            },
            {
              companyId: company.id,
              healthSystemId: system.healthSystemId,
              field: "STATUS_UPDATE",
              value: plan.legacyCellChanges.statusUpdate,
              changedByName: "Scenario Seeder"
            }
          ]
        });
      }

      if (plan.createDeclinedParticipant) {
        const contact = await tx.contact.create({
          data: {
            name: "Grey Declined Participant",
            title: "VP Innovation",
            email: scenarioEmail("grey-declined")
          },
          select: { id: true }
        });
        await tx.contactHealthSystem.create({
          data: {
            contactId: contact.id,
            healthSystemId: system.healthSystemId,
            roleType: "EXECUTIVE",
            title: "VP Innovation"
          }
        });
        await tx.contactCompany.create({
          data: {
            contactId: contact.id,
            companyId: company.id,
            roleType: "COMPANY_CONTACT",
            title: "VP Innovation"
          }
        });
        await tx.companyScreeningParticipant.create({
          data: {
            screeningEventId: webinar.id,
            healthSystemId: system.healthSystemId,
            contactId: contact.id,
            attendanceStatus: "DECLINED",
            notes: "Scenario fixture for a health system that declined to participate."
          }
        });
      }
    }

    return {
      companyId: company.id,
      sessionId: session.id,
      accessToken: session.accessToken,
      sessionQuestionIdsBySlug: Object.fromEntries(sessionQuestionIdsBySlug.entries())
    };
  });

  const submissionResults = [];
  for (const system of selectedHealthSystems) {
    const plan = SLOT_PLANS.find((entry) => entry.slot === system.slot);
    if (!plan) continue;

    for (const submission of plan.submissions) {
      const response = await fetch(
        `${appBaseUrl}/api/screening-surveys/live/${setup.accessToken}/responses`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            participantName: scenarioParticipantName(submission.code),
            participantEmail: scenarioEmail(submission.code),
            healthSystemId: system.healthSystemId,
            impressions: submission.impressions,
            answers: QUESTION_DEFINITIONS.map((definition) => ({
              sessionQuestionId: setup.sessionQuestionIdsBySlug[definition.slug],
              score: submission.answers[definition.slug],
              skipped: false
            }))
          })
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          `Failed to seed survey response for ${system.healthSystemName} (${submission.code}): ${
            payload.error || response.statusText
          }`
        );
      }
      submissionResults.push({
        submissionId: payload.submissionId,
        opportunityId: payload.screeningOpportunityId || null,
        healthSystemId: system.healthSystemId,
        healthSystemName: system.healthSystemName,
        slot: system.slot,
        code: submission.code,
        dayOffset: submission.dayOffset
      });
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const submission of submissionResults) {
      if (!submission.submissionId || submission.dayOffset === 0) continue;
      const submittedAt = new Date();
      submittedAt.setUTCDate(submittedAt.getUTCDate() + submission.dayOffset);
      submittedAt.setUTCHours(16, 0, 0, 0);
      await tx.companyScreeningSurveySubmission.update({
        where: { id: submission.submissionId },
        data: { submittedAt }
      });
    }
  });

  const seededCompany = await prisma.company.findUnique({
    where: { id: setup.companyId },
    include: {
      screeningSurveySessions: {
        include: {
          submissions: {
            include: {
              answers: {
                where: {
                  sessionQuestion: {
                    drivesScreeningOpportunity: true
                  }
                },
                select: {
                  score: true
                }
              }
            }
          }
        }
      },
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
      }
    }
  });

  const submissionSummaryBySystemId = new Map();
  for (const session of seededCompany?.screeningSurveySessions || []) {
    for (const submission of session.submissions) {
      if (!submission.healthSystemId) continue;
      const current = submissionSummaryBySystemId.get(submission.healthSystemId) || [];
      current.push(...submission.answers.map((answer) => Number(answer.score)).filter(Number.isFinite));
      submissionSummaryBySystemId.set(submission.healthSystemId, current);
    }
  }

  const opportunityBySystemId = new Map();
  for (const opportunity of seededCompany?.opportunities || []) {
    if (!opportunity.healthSystem?.id) continue;
    if (!opportunityBySystemId.has(opportunity.healthSystem.id)) {
      opportunityBySystemId.set(opportunity.healthSystem.id, opportunity);
    }
  }

  const summary = selectedHealthSystems.map((system) => {
    const scores = submissionSummaryBySystemId.get(system.healthSystemId) || [];
    const avg = average(scores);
    const opportunity = opportunityBySystemId.get(system.healthSystemId) || null;
    return {
      slot: system.slot,
      healthSystemName: system.healthSystemName,
      expectation: system.expectation,
      flaggedAverageScore: avg,
      submissionCount: submissionResults.filter((entry) => entry.healthSystemId === system.healthSystemId).length,
      opportunityStage: opportunity?.stage || null,
      opportunityContactCount: opportunity?.contacts.length || 0
    };
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        appBaseUrl,
        companyId: setup.companyId,
        companyName: COMPANY_NAME,
        surveySessionId: setup.sessionId,
        surveyAccessToken: setup.accessToken,
        expectedMatrixCounts: {
          grey: 1,
          red: 1,
          yellow: 3,
          green: 1
        },
        systems: summary,
        nextSteps: [
          "Open the screening company in the UI and verify the Status Matrix columns.",
          "Modify current-interest stages in the opportunity UI or matrix.",
          "Run node scripts/assert-screening-matrix-scenario.mjs to verify the seeded scenario.",
          "Run node scripts/cleanup-screening-matrix-scenario.mjs to remove the scenario."
        ]
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("seed_screening_matrix_scenario_error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
