#!/usr/bin/env node

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = new Set(process.argv.slice(2));
const shouldApply = args.has("--apply");

function targetIntakeDecision(phase) {
  if (phase === "INTAKE") return "PENDING";
  if (phase === "DECLINED") return "DECLINE";
  return "ADVANCE_TO_NEGOTIATION";
}

function equivalentDatePresence(a, b) {
  return (a === null && b === null) || (a !== null && b !== null);
}

function summarizeMismatches(rows) {
  const mismatches = [];

  for (const row of rows) {
    const nextDecision = targetIntakeDecision(row.phase);
    const nextDecisionAt = nextDecision === "PENDING" ? null : row.intakeDecisionAt ?? row.updatedAt;
    const decisionChanged = row.intakeDecision !== nextDecision;
    const decisionAtChanged = !equivalentDatePresence(row.intakeDecisionAt, nextDecisionAt);

    if (!decisionChanged && !decisionAtChanged) continue;

    mismatches.push({
      id: row.id,
      companyId: row.companyId,
      companyName: row.company?.name || null,
      phase: row.phase,
      currentIntakeDecision: row.intakeDecision,
      nextIntakeDecision: nextDecision,
      currentIntakeDecisionAt: row.intakeDecisionAt,
      nextIntakeDecisionAt: nextDecisionAt
    });
  }

  return mismatches;
}

async function fetchPipelines() {
  return prisma.companyPipeline.findMany({
    select: {
      id: true,
      companyId: true,
      phase: true,
      intakeDecision: true,
      intakeDecisionAt: true,
      updatedAt: true,
      company: {
        select: {
          name: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }]
  });
}

async function main() {
  const beforeRows = await fetchPipelines();
  const mismatches = summarizeMismatches(beforeRows);

  if (!shouldApply) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          summary: {
            totalPipelines: beforeRows.length,
            mismatches: mismatches.length
          },
          sample: mismatches.slice(0, 25)
        },
        null,
        2
      )
    );
    return;
  }

  let updated = 0;

  for (const mismatch of mismatches) {
    await prisma.companyPipeline.update({
      where: { id: mismatch.id },
      data: {
        intakeDecision: mismatch.nextIntakeDecision,
        intakeDecisionAt: mismatch.nextIntakeDecisionAt
      }
    });
    updated += 1;
  }

  const afterRows = await fetchPipelines();
  const remainingMismatches = summarizeMismatches(afterRows);

  console.log(
    JSON.stringify(
      {
        mode: "apply",
        summary: {
          totalPipelines: beforeRows.length,
          mismatchesBefore: mismatches.length,
          updated,
          mismatchesAfter: remainingMismatches.length
        },
        remainingSample: remainingMismatches.slice(0, 25)
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
