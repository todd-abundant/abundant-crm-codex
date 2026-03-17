#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const endpointUrl = `${baseUrl.replace(/\/$/, "")}/api/addons/gmail/execute`;
const allowWrites = (process.env.GMAIL_ADDON_SMOKE_ALLOW_WRITES || "").trim().toLowerCase() === "true";
const cleanup = (process.env.GMAIL_ADDON_SMOKE_CLEANUP || "").trim().toLowerCase() === "true";

const failures = [];
const createdIds = {
  companyId: null,
  healthSystemId: null,
  contactId: null,
  opportunityId: null,
  messageId: null
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function buildFormInputs(form) {
  const output = {};

  for (const [key, rawValue] of Object.entries(form || {})) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    output[key] = {
      stringInputs: {
        value: values.map((value) => `${value}`)
      }
    };
  }

  return output;
}

function buildEvent({ action, parameters = {}, form = {} }) {
  return {
    commonEventObject: {
      hostApp: "GMAIL",
      parameters: {
        addonAction: action,
        ...parameters
      },
      formInputs: buildFormInputs(form)
    }
  };
}

async function invoke(event) {
  let response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(event)
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Request failed for ${endpointUrl}: ${detail}. Set APP_BASE_URL to a running app URL.`
    );
  }

  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON response (${response.status}), got: ${text.slice(0, 300)}`);
  }

  return {
    status: response.status,
    json
  };
}

function extractCard(responseJson) {
  const navigation =
    responseJson?.action?.navigations?.[0] || responseJson?.renderActions?.action?.navigations?.[0] || null;
  if (!navigation) return null;
  return navigation.pushCard || navigation.updateCard || null;
}

function extractCardText(card) {
  if (!card || !Array.isArray(card.sections)) return "";

  const lines = [];
  for (const section of card.sections) {
    const widgets = Array.isArray(section.widgets) ? section.widgets : [];
    for (const widget of widgets) {
      const paragraph = widget?.textParagraph?.text;
      if (typeof paragraph === "string" && paragraph.trim()) {
        lines.push(paragraph.trim());
      }
    }
  }

  return lines.join("\n");
}

async function check(label, fn) {
  process.stdout.write(`- ${label}... `);
  try {
    await fn();
    console.log("ok");
  } catch (error) {
    failures.push(label);
    console.log("FAILED");
    console.error(error instanceof Error ? error.message : error);
  }
}

function assertAddonCardResponse(status, json) {
  if (status === 401 || status === 403) {
    throw new Error(
      "Gmail add-on request was unauthorized. For local testing, set GMAIL_ADDON_DEV_BYPASS_EMAIL in the running app env."
    );
  }

  assert(status === 200, `Expected 200, got ${status}`);
  const navigations = json?.action?.navigations || json?.renderActions?.action?.navigations || [];
  assert(navigations.length > 0, "Response missing add-on card navigation");
}

async function findEntityIdsByNames(names) {
  const [company, healthSystem, contact, opportunity] = await Promise.all([
    prisma.company.findFirst({ where: { name: names.companyName }, select: { id: true } }),
    prisma.healthSystem.findFirst({ where: { name: names.healthSystemName }, select: { id: true } }),
    prisma.contact.findFirst({ where: { email: names.contactEmail.toLowerCase() }, select: { id: true } }),
    prisma.companyOpportunity.findFirst({ where: { title: names.opportunityTitle }, select: { id: true } })
  ]);

  return {
    companyId: company?.id || null,
    healthSystemId: healthSystem?.id || null,
    contactId: contact?.id || null,
    opportunityId: opportunity?.id || null
  };
}

async function run() {
  const suffix = Date.now().toString(36);
  const names = {
    companyName: `Gmail Smoke Company ${suffix}`,
    healthSystemName: `Gmail Smoke Health System ${suffix}`,
    contactEmail: `gmail-smoke-${suffix}@example.com`,
    contactName: `Gmail Smoke Contact ${suffix}`,
    opportunityTitle: `Gmail Smoke Opportunity ${suffix}`,
    messageId: `gmail-smoke-message-${suffix}`,
    threadId: `gmail-smoke-thread-${suffix}`
  };

  createdIds.messageId = names.messageId;

  console.log(`Running Gmail add-on smoke checks against ${endpointUrl}`);
  console.log(`Write mode: ${allowWrites ? "enabled" : "disabled"}`);

  await check("home card", async () => {
    const response = await invoke(buildEvent({ action: "home" }));
    assertAddonCardResponse(response.status, response.json);

    const card = extractCard(response.json);
    assert(card?.header?.title === "Abundant CRM", "Home card title should be 'Abundant CRM'");
  });

  await check("navigation card: attach note", async () => {
    const response = await invoke(buildEvent({ action: "nav_attach_note", parameters: { messageId: names.messageId } }));
    assertAddonCardResponse(response.status, response.json);
    const card = extractCard(response.json);
    assert(card?.header?.title === "Attach Email", "Attach note card title mismatch");
  });

  await check("navigation card: add contact", async () => {
    const response = await invoke(buildEvent({ action: "nav_add_contact", parameters: { messageId: names.messageId } }));
    assertAddonCardResponse(response.status, response.json);
    const card = extractCard(response.json);
    assert(card?.header?.title === "Add Contact", "Add contact card title mismatch");
  });

  await check("navigation card: add company", async () => {
    const response = await invoke(buildEvent({ action: "nav_add_company", parameters: { messageId: names.messageId } }));
    assertAddonCardResponse(response.status, response.json);
    const card = extractCard(response.json);
    assert(card?.header?.title === "Add Company", "Add company card title mismatch");
  });

  await check("navigation card: add health system", async () => {
    const response = await invoke(
      buildEvent({ action: "nav_add_health_system", parameters: { messageId: names.messageId } })
    );
    assertAddonCardResponse(response.status, response.json);
    const card = extractCard(response.json);
    assert(card?.header?.title === "Add Health System", "Add health system card title mismatch");
  });

  await check("navigation card: add co-investor", async () => {
    const response = await invoke(
      buildEvent({ action: "nav_add_co_investor", parameters: { messageId: names.messageId } })
    );
    assertAddonCardResponse(response.status, response.json);
    const card = extractCard(response.json);
    assert(card?.header?.title === "Add Co-Investor", "Add co-investor card title mismatch");
  });

  await check("navigation card: add opportunity", async () => {
    const response = await invoke(
      buildEvent({ action: "nav_add_opportunity", parameters: { messageId: names.messageId } })
    );
    assertAddonCardResponse(response.status, response.json);
    const card = extractCard(response.json);
    assert(card?.header?.title === "Add Health System Opportunity", "Add opportunity card title mismatch");
  });

  if (allowWrites) {
    await check("write action: create company", async () => {
      const response = await invoke(
        buildEvent({
          action: "submit_add_company",
          parameters: { messageId: names.messageId, threadId: names.threadId },
          form: {
            companyName: names.companyName,
            companyType: "STARTUP"
          }
        })
      );

      assertAddonCardResponse(response.status, response.json);
      const card = extractCard(response.json);
      assert(card?.header?.title === "Company saved", "Expected company success card");
    });

    await check("write action: create health system", async () => {
      const response = await invoke(
        buildEvent({
          action: "submit_add_health_system",
          parameters: { messageId: names.messageId, threadId: names.threadId },
          form: {
            healthSystemName: names.healthSystemName,
            healthSystemAllianceMember: "false"
          }
        })
      );

      assertAddonCardResponse(response.status, response.json);
      const card = extractCard(response.json);
      assert(card?.header?.title === "Health system saved", "Expected health system success card");
    });

    const idsAfterOrgCreates = await findEntityIdsByNames(names);
    createdIds.companyId = idsAfterOrgCreates.companyId;
    createdIds.healthSystemId = idsAfterOrgCreates.healthSystemId;

    assert(createdIds.companyId, "Company was not created by add-on action");
    assert(createdIds.healthSystemId, "Health system was not created by add-on action");

    await check("write action: create contact", async () => {
      const response = await invoke(
        buildEvent({
          action: "submit_add_contact",
          parameters: { messageId: names.messageId, threadId: names.threadId },
          form: {
            contactName: names.contactName,
            contactEmail: names.contactEmail,
            contactPrincipal: `COMPANY:${createdIds.companyId}`
          }
        })
      );

      assertAddonCardResponse(response.status, response.json);
      const card = extractCard(response.json);
      assert(card?.header?.title === "Contact saved", "Expected contact success card");
    });

    await check("write action: create opportunity", async () => {
      const response = await invoke(
        buildEvent({
          action: "submit_add_opportunity",
          parameters: { messageId: names.messageId, threadId: names.threadId },
          form: {
            opportunityCompanyId: createdIds.companyId,
            opportunityTitle: names.opportunityTitle,
            opportunityType: "PROSPECT_PURSUIT",
            opportunityStage: "IDENTIFIED",
            opportunityHealthSystemId: createdIds.healthSystemId,
            opportunityNotes: "Created from Gmail add-on smoke test"
          }
        })
      );

      assertAddonCardResponse(response.status, response.json);
      const card = extractCard(response.json);
      assert(card?.header?.title === "Opportunity saved", "Expected opportunity success card");
    });

    const idsAfterWrites = await findEntityIdsByNames(names);
    createdIds.contactId = idsAfterWrites.contactId;
    createdIds.opportunityId = idsAfterWrites.opportunityId;

    assert(createdIds.contactId, "Contact was not created by add-on action");
    assert(createdIds.opportunityId, "Opportunity was not created by add-on action");

    await check("write action: attach note", async () => {
      const response = await invoke(
        buildEvent({
          action: "submit_attach_note",
          parameters: {
            messageId: names.messageId,
            threadId: names.threadId
          },
          form: {
            attachTargets: [`COMPANY:${createdIds.companyId}`, `OPPORTUNITY:${createdIds.opportunityId}`],
            notePrefix: "Smoke test attach"
          }
        })
      );

      assertAddonCardResponse(response.status, response.json);
      const card = extractCard(response.json);
      assert(card?.header?.title === "Email attached", "Expected attach-note success card");

      const captureCount = await prisma.externalMessageCapture.count({
        where: {
          provider: "GMAIL",
          externalMessageId: names.messageId
        }
      });
      assert(captureCount >= 2, "Expected at least 2 capture records after attach action");
    });

    await check("write action: attach note idempotent", async () => {
      const captureBefore = await prisma.externalMessageCapture.count({
        where: {
          provider: "GMAIL",
          externalMessageId: names.messageId
        }
      });

      const response = await invoke(
        buildEvent({
          action: "submit_attach_note",
          parameters: {
            messageId: names.messageId,
            threadId: names.threadId
          },
          form: {
            attachTargets: [`COMPANY:${createdIds.companyId}`, `OPPORTUNITY:${createdIds.opportunityId}`],
            notePrefix: "Smoke test attach duplicate"
          }
        })
      );

      assertAddonCardResponse(response.status, response.json);
      const card = extractCard(response.json);
      assert(card?.header?.title === "Email attached", "Expected attach-note success card on duplicate run");

      const summary = extractCardText(card);
      assert(summary.includes("Skipped"), "Expected duplicate summary to mention skipped targets");

      const captureAfter = await prisma.externalMessageCapture.count({
        where: {
          provider: "GMAIL",
          externalMessageId: names.messageId
        }
      });
      assert(captureAfter === captureBefore, "Idempotency failed: capture count increased on duplicate attach");
    });
  }

  if (failures.length > 0) {
    console.error(`\nGmail add-on smoke checks failed (${failures.length}): ${failures.join(", ")}`);
    process.exitCode = 1;
  } else {
    console.log("\nGmail add-on smoke checks passed.");
  }

  if (allowWrites && cleanup) {
    console.log("\nCleanup requested; deleting smoke-test records.");

    const deletes = [];

    if (createdIds.messageId) {
      deletes.push(
        prisma.externalMessageCapture.deleteMany({
          where: {
            provider: "GMAIL",
            externalMessageId: createdIds.messageId
          }
        })
      );
    }

    if (createdIds.companyId) {
      deletes.push(
        prisma.entityNote.deleteMany({
          where: {
            entityKind: "COMPANY",
            entityId: createdIds.companyId,
            note: {
              contains: names.messageId,
              mode: "insensitive"
            }
          }
        })
      );
    }

    if (createdIds.healthSystemId) {
      deletes.push(
        prisma.entityNote.deleteMany({
          where: {
            entityKind: "HEALTH_SYSTEM",
            entityId: createdIds.healthSystemId,
            note: {
              contains: names.messageId,
              mode: "insensitive"
            }
          }
        })
      );
    }

    if (createdIds.opportunityId) {
      deletes.push(
        prisma.companyOpportunity.deleteMany({
          where: {
            id: createdIds.opportunityId
          }
        })
      );
    }

    if (createdIds.contactId) {
      deletes.push(
        prisma.contact.deleteMany({
          where: {
            id: createdIds.contactId
          }
        })
      );
    }

    if (createdIds.healthSystemId) {
      deletes.push(
        prisma.healthSystem.deleteMany({
          where: {
            id: createdIds.healthSystemId
          }
        })
      );
    }

    if (createdIds.companyId) {
      deletes.push(
        prisma.company.deleteMany({
          where: {
            id: createdIds.companyId
          }
        })
      );
    }

    await Promise.all(deletes);
    console.log("Cleanup complete.");
  }
}

run()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
    if (process.exitCode && process.exitCode !== 0) {
      process.exit(process.exitCode);
    }
  });
