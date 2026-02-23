import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const COMPANY_NAME = "Bunkerhill Health";
const MOCK_EMAIL_DOMAIN = "bunkerhill-mock.local";

const quantitativeQuestionCategories = [
  {
    category: "Desirability",
    questions: [
      "How urgent is the underlying problem for your organization?",
      "How clear is the value proposition for clinicians and operators?",
      "How likely is your team to champion adoption internally?"
    ]
  },
  {
    category: "Feasibility",
    questions: [
      "How feasible is implementation with current workflow and resources?",
      "How realistic is integration with existing systems (Epic/EHR/data)?",
      "How manageable is change management for frontline teams?"
    ]
  },
  {
    category: "Impact and Viability",
    questions: [
      "How strong is expected clinical and operational impact?",
      "How compelling is expected ROI over the next 12-24 months?",
      "How durable is the model for long-term adoption and scale?"
    ]
  },
  {
    category: "Co-Development",
    questions: [
      "How interested is your organization in co-development participation?",
      "How prepared is your team to share data and feedback loops?",
      "How aligned are incentives for pilot design and governance?"
    ]
  }
];

const healthSystemPlans = [
  {
    name: "Medical University of South Carolina",
    status: "DECLINED",
    baseScore: 4.8,
    relevantFeedback:
      "Strong interest in problem framing but concern on near-term IT capacity and timing for a 2026 pilot.",
    statusUpdate:
      "Declined to move forward this cycle; open to revisit after internal platform upgrade in Q4.",
    screeningDate: "2026-01-14T15:00:00.000Z",
    attendees: [
      { name: "Dr. Maya Ellison", title: "Chief Medical Information Officer" },
      { name: "Kevin Duarte", title: "VP Digital Innovation" },
      { name: "Rachel Singh", title: "Director, Care Transformation" }
    ],
    qualitative: {
      category: "Delivery Model & Implementation Capacity",
      theme: "Bandwidth constraints for pilot launch",
      sentiment: "NEGATIVE",
      feedback:
        "Team validated value but cannot staff integration work until after current enterprise initiatives close."
    }
  },
  {
    name: "MedStar Health",
    status: "NEGOTIATING",
    baseScore: 7.9,
    relevantFeedback:
      "Leadership sees clear value in chronic care workflows and wants commercial + implementation terms refined.",
    statusUpdate:
      "Actively evaluating LOI language; legal and operations teams requested revisions and implementation assumptions.",
    screeningDate: "2026-01-12T18:00:00.000Z",
    attendees: [
      { name: "Michael Chen", title: "SVP, Strategy and Innovation" },
      { name: "Priya Raman", title: "Chief Digital Officer" },
      { name: "Daniel O'Neal", title: "Senior Director, Clinical Operations" }
    ],
    qualitative: {
      category: "Pricing Predictability",
      theme: "Need tighter pricing guardrails",
      sentiment: "MIXED",
      feedback:
        "Team is positive on outcomes but asked for predictable implementation and renewal economics before signature."
    }
  },
  {
    name: "MemorialCare Health System",
    status: "PENDING",
    baseScore: 6.9,
    relevantFeedback:
      "Clinical champions supportive; finance and governance groups want clearer KPI definitions before commitment.",
    statusUpdate:
      "Pending internal debrief and scorecard review; follow-up requested with measurement framework details.",
    screeningDate: "2026-01-16T20:00:00.000Z",
    attendees: [
      { name: "Sarah Truong", title: "VP, Population Health" },
      { name: "Eric Valdez", title: "Chief Medical Information Officer" },
      { name: "Janet Keller", title: "Director, Innovation Partnerships" }
    ],
    qualitative: {
      category: "Governance & Prioritization Requirements",
      theme: "Steering committee ownership required",
      sentiment: "NEUTRAL",
      feedback:
        "Organization requires governance alignment and formal pilot owner assignment before converting to LOI."
    }
  },
  {
    name: "Northwell Health",
    status: "SIGNED",
    baseScore: 8.8,
    relevantFeedback:
      "Cross-functional team rated value and feasibility highly and aligned on co-development milestones.",
    statusUpdate:
      "LOI signed with phased implementation plan; kickoff planning and data workstream scoping underway.",
    screeningDate: "2026-01-10T17:00:00.000Z",
    attendees: [
      { name: "Alicia Park", title: "EVP, Enterprise Innovation" },
      { name: "Thomas Greene", title: "Chief Transformation Officer" },
      { name: "Dr. Nina Patel", title: "VP, Clinical Informatics" }
    ],
    qualitative: {
      category: "Key Theme",
      theme: "Fast path to pilot execution",
      sentiment: "POSITIVE",
      feedback:
        "Executive sponsor and operations leads are aligned on implementation sequence and near-term pilot objectives."
    }
  }
];

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function scoreFor({ baseScore, categoryIndex, questionIndex, attendeeIndex }) {
  const categoryOffsets = [0.4, 0.1, 0.6, 0.2];
  const questionOffsets = [0.25, -0.1, 0.15];
  const attendeeOffsets = [0.3, -0.2, 0.1];
  const raw =
    baseScore +
    (categoryOffsets[categoryIndex] || 0) +
    (questionOffsets[questionIndex] || 0) +
    (attendeeOffsets[attendeeIndex] || 0);
  const clamped = Math.max(1, Math.min(10, raw));
  return Math.round(clamped * 10) / 10;
}

async function main() {
  const company = await prisma.company.findFirst({
    where: { name: { equals: COMPANY_NAME, mode: "insensitive" } },
    select: { id: true, name: true }
  });

  if (!company) {
    throw new Error(`Company not found: ${COMPANY_NAME}`);
  }

  const healthSystems = await prisma.healthSystem.findMany({
    where: { isAllianceMember: true },
    select: { id: true, name: true }
  });
  const healthSystemByName = new Map(healthSystems.map((row) => [row.name, row]));

  for (const plan of healthSystemPlans) {
    if (!healthSystemByName.has(plan.name)) {
      throw new Error(`Missing alliance health system: ${plan.name}`);
    }
  }

  const existingMockContacts = await prisma.contact.findMany({
    where: {
      email: { endsWith: `@${MOCK_EMAIL_DOMAIN}`, mode: "insensitive" }
    },
    select: { id: true }
  });
  const existingMockContactIds = existingMockContacts.map((row) => row.id);

  await prisma.$transaction(async (tx) => {
    await tx.companyScreeningQualitativeFeedback.deleteMany({ where: { companyId: company.id } });
    await tx.companyScreeningQuantitativeFeedback.deleteMany({ where: { companyId: company.id } });
    await tx.companyScreeningDocument.deleteMany({ where: { companyId: company.id } });
    await tx.companyScreeningCellChange.deleteMany({ where: { companyId: company.id } });
    await tx.companyScreeningEvent.deleteMany({ where: { companyId: company.id } });
    await tx.companyLoi.deleteMany({ where: { companyId: company.id } });

    if (existingMockContactIds.length > 0) {
      await tx.contactCompany.deleteMany({
        where: { contactId: { in: existingMockContactIds } }
      });
      await tx.contactHealthSystem.deleteMany({
        where: { contactId: { in: existingMockContactIds } }
      });
      await tx.contact.deleteMany({
        where: { id: { in: existingMockContactIds } }
      });
    }

    await tx.companyPipeline.upsert({
      where: { companyId: company.id },
      create: { companyId: company.id, phase: "SCREENING" },
      update: { phase: "SCREENING" }
    });
    await tx.company.update({
      where: { id: company.id },
      data: { screeningEvaluationAt: new Date("2026-01-15T00:00:00.000Z") }
    });

    for (const [planIndex, plan] of healthSystemPlans.entries()) {
      const healthSystem = healthSystemByName.get(plan.name);
      if (!healthSystem) continue;

      await tx.companyLoi.create({
        data: {
          companyId: company.id,
          healthSystemId: healthSystem.id,
          status: plan.status,
          statusUpdatedAt: new Date(plan.screeningDate),
          signedAt: plan.status === "SIGNED" ? new Date("2026-01-22T17:30:00.000Z") : null,
          notes: `${plan.statusUpdate}\n\n${plan.relevantFeedback}`
        }
      });

      const statusChangeAt = new Date(Date.parse(plan.screeningDate) + 10 * 60 * 1000);
      const feedbackChangeAt = new Date(Date.parse(plan.screeningDate) + 20 * 60 * 1000);
      await tx.companyScreeningCellChange.create({
        data: {
          companyId: company.id,
          healthSystemId: healthSystem.id,
          field: "STATUS_UPDATE",
          value: plan.statusUpdate,
          changedByName: "Mock Seeder",
          createdAt: statusChangeAt
        }
      });
      await tx.companyScreeningCellChange.create({
        data: {
          companyId: company.id,
          healthSystemId: healthSystem.id,
          field: "RELEVANT_FEEDBACK",
          value: plan.relevantFeedback,
          changedByName: "Mock Seeder",
          createdAt: feedbackChangeAt
        }
      });

      const event = await tx.companyScreeningEvent.create({
        data: {
          companyId: company.id,
          type: "INDIVIDUAL_SESSION",
          title: `Alliance Screening - ${plan.name}`,
          scheduledAt: new Date(plan.screeningDate),
          completedAt: new Date(Date.parse(plan.screeningDate) + 45 * 60 * 1000),
          notes: "Mock screening session loaded for UI validation."
        }
      });

      const contacts = [];
      for (const attendee of plan.attendees) {
        const emailLocal = slugify(attendee.name);
        const contact = await tx.contact.create({
          data: {
            name: attendee.name,
            title: attendee.title,
            email: `${emailLocal}@${MOCK_EMAIL_DOMAIN}`,
            notes: "Synthetic contact for Bunkerhill screening UI mock."
          },
          select: { id: true, name: true, title: true }
        });
        contacts.push(contact);

        await tx.contactHealthSystem.create({
          data: {
            contactId: contact.id,
            healthSystemId: healthSystem.id,
            roleType: "EXECUTIVE",
            title: attendee.title
          }
        });
        await tx.contactCompany.create({
          data: {
            contactId: contact.id,
            companyId: company.id,
            roleType: "COMPANY_CONTACT",
            title: attendee.title
          }
        });

        await tx.companyScreeningParticipant.create({
          data: {
            screeningEventId: event.id,
            healthSystemId: healthSystem.id,
            contactId: contact.id,
            attendanceStatus: "ATTENDED",
            notes: "Attended full screening session."
          }
        });
      }

      const quantitativeRows = [];
      for (let categoryIndex = 0; categoryIndex < quantitativeQuestionCategories.length; categoryIndex += 1) {
        const section = quantitativeQuestionCategories[categoryIndex];
        for (let questionIndex = 0; questionIndex < section.questions.length; questionIndex += 1) {
          const metric = section.questions[questionIndex];
          for (let attendeeIndex = 0; attendeeIndex < contacts.length; attendeeIndex += 1) {
            const contact = contacts[attendeeIndex];
            const score = scoreFor({
              baseScore: plan.baseScore,
              categoryIndex,
              questionIndex,
              attendeeIndex
            });

            quantitativeRows.push({
              companyId: company.id,
              healthSystemId: healthSystem.id,
              contactId: contact.id,
              category: section.category,
              metric,
              score,
              weightPercent: 25,
              notes: `Mock rating by ${contact.name}`
            });
          }
        }
      }

      if (quantitativeRows.length > 0) {
        await tx.companyScreeningQuantitativeFeedback.createMany({
          data: quantitativeRows
        });
      }

      await tx.companyScreeningQualitativeFeedback.create({
        data: {
          companyId: company.id,
          healthSystemId: healthSystem.id,
          contactId: contacts[0]?.id || null,
          category: plan.qualitative.category,
          theme: plan.qualitative.theme,
          sentiment: plan.qualitative.sentiment,
          feedback: plan.qualitative.feedback
        }
      });

      await tx.companyScreeningDocument.create({
        data: {
          companyId: company.id,
          healthSystemId: healthSystem.id,
          title: `Screening Debrief - ${plan.name}`,
          url: `https://example.com/bunkerhill/screening-debrief/${slugify(plan.name)}`,
          notes: `Mock artifact for ${plan.name} (${planIndex + 1}/${healthSystemPlans.length}).`,
          uploadedAt: new Date(Date.parse(plan.screeningDate) + 2 * 24 * 60 * 60 * 1000)
        }
      });
    }
  });

  const summary = await prisma.company.findUnique({
    where: { id: company.id },
    include: {
      lois: true,
      screeningEvents: { include: { participants: true } },
      screeningQuantitativeFeedback: true,
      screeningQualitativeFeedback: true,
      screeningDocuments: true,
      screeningCellChanges: true
    }
  });

  console.log(`Seeded mock screening dataset for ${company.name}.`);
  console.log(
    JSON.stringify(
      {
        lois: summary?.lois.length || 0,
        events: summary?.screeningEvents.length || 0,
        participants:
          summary?.screeningEvents.reduce((sum, event) => sum + event.participants.length, 0) || 0,
        quantitative: summary?.screeningQuantitativeFeedback.length || 0,
        qualitative: summary?.screeningQualitativeFeedback.length || 0,
        documents: summary?.screeningDocuments.length || 0,
        cellChanges: summary?.screeningCellChanges.length || 0
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("seed_bunkerhill_screening_mock_error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
