import { PrismaClient } from "@prisma/client";
import {
  COMPANY_NAME,
  MOCK_EMAIL_DOMAIN,
  QUESTION_DEFINITIONS,
  SCENARIO_KEY,
  loadScenarioEnv
} from "./screening-matrix-scenario-helpers.mjs";

loadScenarioEnv();
const prisma = new PrismaClient();

async function main() {
  const companies = await prisma.company.findMany({
    where: {
      OR: [
        { name: COMPANY_NAME },
        { description: { contains: SCENARIO_KEY } },
        { leadSourceNotes: { contains: SCENARIO_KEY } }
      ]
    },
    select: {
      id: true,
      name: true
    }
  });

  const contacts = await prisma.contact.findMany({
    where: {
      email: { endsWith: `@${MOCK_EMAIL_DOMAIN}`, mode: "insensitive" }
    },
    select: { id: true }
  });
  const contactIds = contacts.map((entry) => entry.id);

  await prisma.$transaction(async (tx) => {
    if (companies.length > 0) {
      await tx.company.deleteMany({
        where: { id: { in: companies.map((entry) => entry.id) } }
      });
    }

    const prompts = QUESTION_DEFINITIONS.map((entry) => entry.prompt);
    await tx.companyScreeningSurveyQuestion.deleteMany({
      where: {
        OR: [
          { prompt: { in: prompts } },
          { prompt: { contains: SCENARIO_KEY } }
        ]
      }
    });

    if (contactIds.length > 0) {
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
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        deletedCompanyCount: companies.length,
        deletedContactCount: contactIds.length,
        scenarioKey: SCENARIO_KEY
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("cleanup_screening_matrix_scenario_error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
