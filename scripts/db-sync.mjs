#!/usr/bin/env node

import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const migrationsDir = join(process.cwd(), "prisma", "migrations");

function hasMigrationFolders() {
  try {
    return readdirSync(migrationsDir, { withFileTypes: true }).some((entry) => {
      return entry.isDirectory() && !entry.name.startsWith(".");
    });
  } catch {
    return false;
  }
}

function runPrismaCommand(args, options = {}) {
  const { exitOnFailure = true } = options;
  const npxBinary = process.platform === "win32" ? "npx.cmd" : "npx";
  console.log(`\n> npx ${args.join(" ")}`);
  const result = spawnSync(npxBinary, args, { stdio: "inherit" });
  const succeeded = result.status === 0;
  if (!succeeded && exitOnFailure) {
    process.exit(result.status ?? 1);
  }
  return succeeded;
}

const useMigrations = hasMigrationFolders();

if (useMigrations) {
  const migrated = runPrismaCommand(["prisma", "migrate", "deploy"], { exitOnFailure: false });
  if (!migrated) {
    console.warn(
      "\nPrisma migrate deploy failed for this local database. Falling back to `prisma db push` to align schema."
    );
    runPrismaCommand(["prisma", "db", "push"]);
  }
} else {
  runPrismaCommand(["prisma", "db", "push"]);
  console.log(
    "\nNo committed Prisma migration folders were found, so schema push mode was used."
  );
}

runPrismaCommand(["prisma", "generate"]);
