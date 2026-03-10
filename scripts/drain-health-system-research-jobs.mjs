#!/usr/bin/env node

import { createHmac } from "node:crypto";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const AUTH_COOKIE_NAME = "abundant_crm_auth";

function getArgValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function encodeBase64Url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printJson(label, value) {
  console.log(`${label}=${JSON.stringify(value)}`);
}

async function createSessionToken() {
  if (!process.env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is required.");
  }

  const user = await prisma.user.findFirst({
    where: { isActive: true, roles: { some: { role: "USER" } } },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      roles: { select: { role: true } }
    }
  });

  if (!user) {
    throw new Error("No active USER account found.");
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    email: user.email,
    roles: user.roles.map((item) => item.role),
    iat: now,
    exp: now + 60 * 60 * 24 * 14,
    name: user.name || null,
    image: user.image || null
  };

  const header = encodeBase64Url({ alg: "HS256", typ: "JWT" });
  const body = encodeBase64Url(payload);
  const signature = createHmac("sha256", process.env.AUTH_SECRET)
    .update(`${header}.${body}`)
    .digest("base64url");

  return `${header}.${body}.${signature}`;
}

async function getCounts() {
  const grouped = await prisma.healthSystemResearchJob.groupBy({
    by: ["status"],
    _count: { _all: true }
  });

  const counts = {
    queued: 0,
    running: 0,
    completed: 0,
    failed: 0
  };

  for (const entry of grouped) {
    const status = String(entry.status || "").toLowerCase();
    if (status === "queued") counts.queued = entry._count._all;
    if (status === "running") counts.running = entry._count._all;
    if (status === "completed") counts.completed = entry._count._all;
    if (status === "failed") counts.failed = entry._count._all;
  }

  return counts;
}

async function triggerProcessor({ baseUrl, maxJobsPerCall, token }) {
  const response = await fetch(`${baseUrl.replace(/\/+$/g, "")}/api/health-systems/research-jobs/process`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${AUTH_COOKIE_NAME}=${token}`
    },
    body: JSON.stringify({ maxJobs: maxJobsPerCall })
  });

  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = { raw };
  }

  if (!response.ok) {
    throw new Error(`Processor request failed with ${response.status}: ${raw || response.statusText}`);
  }

  return payload?.result || null;
}

async function main() {
  const baseUrl = getArgValue("--base-url", process.env.APP_BASE_URL || "http://127.0.0.1:3000");
  const maxRounds = Number(getArgValue("--max-rounds", "100"));
  const maxJobsPerCall = Number(getArgValue("--max-jobs-per-call", "1"));
  const delayMs = Number(getArgValue("--delay-ms", "250"));

  if (!Number.isFinite(maxRounds) || maxRounds <= 0) {
    throw new Error("--max-rounds must be a positive number.");
  }
  if (!Number.isFinite(maxJobsPerCall) || maxJobsPerCall <= 0) {
    throw new Error("--max-jobs-per-call must be a positive number.");
  }
  if (!Number.isFinite(delayMs) || delayMs < 0) {
    throw new Error("--delay-ms must be zero or a positive number.");
  }

  const token = await createSessionToken();
  const iterations = [];

  for (let round = 1; round <= maxRounds; round += 1) {
    const before = await getCounts();
    if (before.queued === 0) {
      break;
    }

    const startedAt = new Date().toISOString();
    const result = await triggerProcessor({ baseUrl, maxJobsPerCall, token });
    const after = await getCounts();
    const completedDelta = after.completed - before.completed;
    const failedDelta = after.failed - before.failed;
    const queuedDelta = before.queued - after.queued;

    const iteration = {
      round,
      startedAt,
      result,
      before,
      after,
      completedDelta,
      failedDelta,
      queuedDelta
    };
    iterations.push(iteration);
    printJson("iteration", iteration);

    if ((completedDelta <= 0 && failedDelta <= 0 && queuedDelta <= 0) || after.queued === 0) {
      break;
    }

    if (delayMs > 0) {
      await sleep(delayMs);
    }
  }

  printJson("final_counts", await getCounts());
  printJson("summary", {
    baseUrl,
    maxRounds,
    maxJobsPerCall,
    delayMs,
    roundsExecuted: iterations.length,
    totalCompletedDelta: iterations.reduce((sum, entry) => sum + Math.max(entry.completedDelta, 0), 0),
    totalFailedDelta: iterations.reduce((sum, entry) => sum + Math.max(entry.failedDelta, 0), 0),
    totalQueuedDelta: iterations.reduce((sum, entry) => sum + Math.max(entry.queuedDelta, 0), 0)
  });
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
