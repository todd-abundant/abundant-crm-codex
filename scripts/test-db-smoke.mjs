#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const failures = [];

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

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  console.log("Running database smoke checks");

  await check("connection", async () => {
    await prisma.$queryRawUnsafe("SELECT 1");
  });

  await check("required co-investor activity tables", async () => {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT
         to_regclass('public."CoInvestorInteraction"')::text AS co_investor_interaction,
         to_regclass('public."NextAction"')::text AS next_action`
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    assert(row?.co_investor_interaction, 'Missing table public."CoInvestorInteraction"');
    assert(row?.next_action, 'Missing table public."NextAction"');
  });

  await check("health system graph query", async () => {
    await prisma.healthSystem.findMany({
      take: 1,
      include: {
        venturePartners: true,
        contactLinks: { include: { contact: true } },
        investments: true,
        researchJobs: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
  });

  await check("co-investor graph query", async () => {
    await prisma.coInvestor.findMany({
      take: 1,
      include: {
        partners: true,
        contactLinks: { include: { contact: true } },
        investments: true,
        interactions: { orderBy: { occurredAt: "desc" }, take: 5 },
        nextActions: { orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], take: 5 },
        researchJobs: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
  });

  await check("company graph query", async () => {
    await prisma.company.findMany({
      take: 1,
      include: {
        leadSourceHealthSystem: true,
        healthSystemLinks: { include: { healthSystem: true } },
        coInvestorLinks: { include: { coInvestor: true } },
        contactLinks: { include: { contact: true } },
        researchJobs: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
  });

  await prisma.$disconnect();

  if (failures.length > 0) {
    console.error(`\nDatabase smoke checks failed (${failures.length}): ${failures.join(", ")}`);
    process.exit(1);
  }

  console.log("\nDatabase smoke checks passed.");
}

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
