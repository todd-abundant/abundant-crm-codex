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

function runPrismaCommand(args) {
  const npxBinary = process.platform === "win32" ? "npx.cmd" : "npx";
  console.log(`\n> npx ${args.join(" ")}`);
  const result = spawnSync(npxBinary, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const useMigrations = hasMigrationFolders();

if (useMigrations) {
  runPrismaCommand(["prisma", "migrate", "deploy"]);
} else {
  runPrismaCommand(["prisma", "db", "push"]);
  console.log(
    "\nNo committed Prisma migration folders were found, so schema push mode was used."
  );
}

runPrismaCommand(["prisma", "generate"]);
