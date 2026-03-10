#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const buildIdPath = path.join(rootDir, ".next", "BUILD_ID");
const routesManifestPath = path.join(rootDir, ".next", "routes-manifest.json");

if (existsSync(buildIdPath) && existsSync(routesManifestPath)) {
  process.exit(0);
}

console.error("Missing production Next.js build output in .next.");
console.error("Run `npm run build` before `npm run start`.");
console.error("Do not run `npm run dev` and `npm run start` against the same workspace at the same time.");
process.exit(1);
