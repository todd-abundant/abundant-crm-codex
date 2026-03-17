#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const APPLY = process.argv.includes("--apply");
const REVISIT_MODE = process.argv.includes("--revisit");
const CSV_PATH =
  process.argv.find((arg, index) => index > 1 && !arg.startsWith("--")) ||
  path.join(
    process.env.HOME || "",
    "Downloads",
    REVISIT_MODE ? "Re Approach Pipeline-2026-03-17-09-35-34.csv" : "Alliance Full Pipeline-2026-03-17-09-30-28.csv"
  );

const MANUAL_EXISTING_ALIASES = new Map(
  Object.entries({
    SSM: "SSM Health",
    UMMS: "University of Maryland Medical System",
    "CHS Long Island": "Catholic Health Services of Long Island",
    "Carillion Clinic": "Carilion Clinic",
    "Cincinatti Children's": "Cincinnati Childrens Hospital Medical Center",
    "Kaiser Permanente": "Kaiser Foundation Health Plan, Inc.",
    Providence: "Providence St. Joseph Health"
  }).map(([from, to]) => [normalizeName(from), normalizeName(to)])
);

const CONNECTOR_WORDS = new Set(["and", "of", "the"]);
const FUZZY_AUTO_MATCH_THRESHOLD = 0.9;
const FUZZY_REVIEW_THRESHOLD = 0.72;
const FUZZY_MARGIN_THRESHOLD = 0.08;

function cleanCell(value) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim();
}

function parseCsv(csvText) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];

    if (inQuotes) {
      if (char === "\"") {
        if (csvText[i + 1] === "\"") {
          field += "\"";
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    if (char === "\r") {
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function normalizeName(value) {
  return cleanCell(value)
    .replace(/\([^)]*\)/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameLoose(value) {
  return normalizeName(value)
    .replace(
      /\b(the|of|and|inc|incorporated|corp|corporation|company|llc|ltd|health|healthcare|care|system|services|service|network|medical|hospital|center|centre|partners|university|univ)\b/g,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

function splitTokens(value) {
  return cleanCell(value).split(/\s+/).filter(Boolean);
}

function buildInitialism(tokens) {
  const filtered = tokens.filter((token) => token && !CONNECTOR_WORDS.has(token));
  return filtered.map((token) => token[0]).join("");
}

function hasUsefulInitialism(value) {
  return value.length >= 2;
}

function isLikelyAcronymSearchKey(key) {
  return key.exactTokens.length === 1 && key.exact.length >= 2 && key.exact.length <= 6;
}

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;

    for (let column = 1; column <= right.length; column += 1) {
      const nextDiagonal = previous[column];
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + cost);
      diagonal = nextDiagonal;
    }
  }

  return previous[right.length];
}

function editSimilarity(left, right) {
  if (!left || !right) return 0;
  const longest = Math.max(left.length, right.length);
  if (longest === 0) return 1;
  return 1 - levenshtein(left, right) / longest;
}

function tokenOverlapScore(leftTokens, rightTokens) {
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlap = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) overlap += 1;
  }

  const coverage = overlap / leftSet.size;
  const union = new Set([...leftSet, ...rightSet]).size;
  const jaccard = union === 0 ? 0 : overlap / union;
  return coverage * 0.8 + jaccard * 0.2;
}

function buildSearchKey(value) {
  const exact = normalizeName(value);
  const loose = normalizeNameLoose(value);
  const exactTokens = splitTokens(exact);
  const looseTokens = splitTokens(loose);
  return {
    exact,
    loose,
    exactTokens,
    looseTokens,
    exactInitialism: buildInitialism(exactTokens),
    looseInitialism: buildInitialism(looseTokens)
  };
}

function scoreSearchKeys(query, candidate) {
  if (!query.exact || !candidate.exact) return 0;
  if (query.exact === candidate.exact) return 1;
  if (query.loose && query.loose === candidate.loose) return 0.98;

  let score = 0;

  if (query.loose && candidate.loose && (candidate.loose.includes(query.loose) || query.loose.includes(candidate.loose))) {
    const longest = Math.max(query.loose.length, candidate.loose.length, 1);
    const lengthPenalty = Math.abs(query.loose.length - candidate.loose.length) / longest;
    score = Math.max(score, 0.95 - lengthPenalty * 0.08);
  }

  if (
    hasUsefulInitialism(query.exactInitialism) &&
    hasUsefulInitialism(candidate.exactInitialism) &&
    (isLikelyAcronymSearchKey(query) || isLikelyAcronymSearchKey(candidate)) &&
    (query.exact === candidate.exactInitialism || query.exactInitialism === candidate.exact)
  ) {
    score = Math.max(score, 0.95);
  }

  if (
    hasUsefulInitialism(query.exactInitialism) &&
    hasUsefulInitialism(candidate.exactInitialism) &&
    (isLikelyAcronymSearchKey(query) || isLikelyAcronymSearchKey(candidate)) &&
    query.exactInitialism === candidate.exactInitialism
  ) {
    score = Math.max(score, 0.94);
  }

  if (
    hasUsefulInitialism(query.looseInitialism) &&
    hasUsefulInitialism(candidate.looseInitialism) &&
    (isLikelyAcronymSearchKey(query) || isLikelyAcronymSearchKey(candidate)) &&
    query.looseInitialism === candidate.looseInitialism
  ) {
    score = Math.max(score, 0.92);
  }

  const [queryLead, ...queryTail] = query.exactTokens;
  if (
    queryLead &&
    queryLead.length >= 2 &&
    queryLead.length <= 5 &&
    candidate.exactInitialism &&
    candidate.exactInitialism.startsWith(queryLead) &&
    queryTail.length > 0
  ) {
    const tailCoverage = tokenOverlapScore(queryTail, candidate.exactTokens);
    if (tailCoverage >= 0.99) {
      score = Math.max(score, 0.93);
    }
  }

  const exactTokenScore = tokenOverlapScore(query.exactTokens, candidate.exactTokens);
  const looseTokenScore = tokenOverlapScore(query.looseTokens, candidate.looseTokens);
  const exactEditScore = editSimilarity(query.exact, candidate.exact);
  const looseEditScore = editSimilarity(query.loose, candidate.loose);
  const compositeScore = Math.max(
    exactTokenScore * 0.7 + exactEditScore * 0.3,
    looseTokenScore * 0.75 + looseEditScore * 0.25
  );
  const cappedCompositeScore =
    query.looseTokens.length > 0 && candidate.looseTokens.length > 0 && looseTokenScore === 0
      ? Math.min(compositeScore, 0.69)
      : compositeScore;

  return Math.max(score, cappedCompositeScore);
}

function addToSetMap(map, key, value) {
  if (!key) return;
  const existing = map.get(key);
  if (existing) {
    existing.add(value);
    return;
  }
  map.set(key, new Set([value]));
}

function takeSingle(set) {
  if (!set || set.size !== 1) return null;
  for (const value of set) return value;
  return null;
}

function canonicalHealthSystemName(opportunityName) {
  return cleanCell(opportunityName).replace(/\s*-\s*Alliance\s*$/i, "").trim();
}

function parseUsd(value) {
  const normalized = cleanCell(value).replace(/[$,]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid currency value: ${value}`);
  }
  return parsed.toFixed(2);
}

function parsePercent(value) {
  const normalized = cleanCell(value).replace(/%/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid percentage value: ${value}`);
  }
  return Math.round(parsed);
}

function parseDate(value) {
  const normalized = cleanCell(value);
  if (!normalized) return null;
  const [month, day, year] = normalized.split("/").map((part) => Number(part));
  if (!month || !day || !year) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return new Date(Date.UTC(year, month - 1, day));
}

function mapStage(value, fallbackStage = null) {
  const normalized = cleanCell(value).toLowerCase();
  if (normalized === "re-approach" || normalized === "re approach") {
    return fallbackStage || "PROSPECTING";
  }
  if (normalized === "prospecting") return "PROSPECTING";
  if (normalized === "discovery") return "QUALIFYING";
  if (normalized === "qualification" || normalized === "qualifying") return "QUALIFYING";
  if (normalized === "evaluation" || normalized === "proposal") return "PROPOSAL";
  if (normalized === "contracting" || normalized === "contract" || normalized === "negotiation") return "CONTRACTING";
  throw new Error(`Unsupported stage: ${value}`);
}

function buildHealthSystemLookup(healthSystems) {
  const exactMap = new Map();
  const looseMap = new Map();
  const healthSystemsById = new Map();
  const searchEntries = [];

  for (const healthSystem of healthSystems) {
    healthSystemsById.set(healthSystem.id, healthSystem);
    for (const value of [healthSystem.name, healthSystem.legalName]) {
      if (!value) continue;
      const exact = normalizeName(value);
      if (exact) addToSetMap(exactMap, exact, healthSystem.id);

      const loose = normalizeNameLoose(value);
      if (loose) addToSetMap(looseMap, loose, healthSystem.id);

      searchEntries.push({
        healthSystemId: healthSystem.id,
        label: value,
        ...buildSearchKey(value)
      });
    }
  }

  return { exactMap, looseMap, healthSystemsById, searchEntries };
}

function getSuggestions(healthSystems, cleanedName, aliasTarget) {
  const exactNeedle = normalizeName(aliasTarget || cleanedName);
  const looseNeedle = normalizeNameLoose(aliasTarget || cleanedName);
  const suggestions = [];

  for (const healthSystem of healthSystems) {
    const values = [healthSystem.name, healthSystem.legalName].filter(Boolean);
    const matched = values.some((value) => {
      const exact = normalizeName(value);
      const loose = normalizeNameLoose(value);
      return (
        (exactNeedle && (exact.includes(exactNeedle) || exactNeedle.includes(exact))) ||
        (looseNeedle && loose && (loose.includes(looseNeedle) || looseNeedle.includes(loose)))
      );
    });

    if (matched) {
      suggestions.push(healthSystem.name);
    }
  }

  return suggestions.slice(0, 5);
}

function fuzzyMatchHealthSystem(cleanedName, aliasTarget, lookup) {
  const queryKeys = [aliasTarget, cleanedName].filter(Boolean).map((value) => buildSearchKey(value));
  const candidateScores = new Map();
  const fuzzyReviewThreshold = REVISIT_MODE ? 0.94 : FUZZY_REVIEW_THRESHOLD;

  for (const query of queryKeys) {
    for (const entry of lookup.searchEntries) {
      const score = scoreSearchKeys(query, entry);
      if (score <= 0) continue;

      const existing = candidateScores.get(entry.healthSystemId);
      if (!existing || score > existing.score) {
        candidateScores.set(entry.healthSystemId, {
          healthSystem: lookup.healthSystemsById.get(entry.healthSystemId),
          score,
          label: entry.label
        });
      }
    }
  }

  const ranked = [...candidateScores.values()].sort((left, right) => right.score - left.score);
  const best = ranked[0] || null;
  const second = ranked[1] || null;

  if (
    !REVISIT_MODE &&
    best &&
    best.score >= FUZZY_AUTO_MATCH_THRESHOLD &&
    (!second || best.score - second.score >= FUZZY_MARGIN_THRESHOLD)
  ) {
    return {
      status: "matched",
      healthSystem: best.healthSystem,
      matchType: "fuzzy",
      cleanedName,
      fuzzyScore: Number(best.score.toFixed(3)),
      fuzzyLabel: best.label
    };
  }

  if (best && best.score >= fuzzyReviewThreshold) {
    return {
      status: "unresolved",
      cleanedName,
      suggestions: ranked.slice(0, 5).map((candidate) => ({
        name: candidate.healthSystem.name,
        matchedOn: candidate.label,
        score: Number(candidate.score.toFixed(3))
      }))
    };
  }

  return null;
}

function resolveHealthSystem(row, lookup) {
  const cleanedName = canonicalHealthSystemName(row.opportunityName);
  const cleanedKey = normalizeName(cleanedName);
  const aliasTarget = MANUAL_EXISTING_ALIASES.get(cleanedKey) || null;
  const candidateKeys = [];

  if (aliasTarget) candidateKeys.push(aliasTarget);
  if (cleanedKey) candidateKeys.push(cleanedKey);

  for (const key of candidateKeys) {
    const healthSystemId = takeSingle(lookup.exactMap.get(key));
    if (healthSystemId) {
      return {
        status: "matched",
        healthSystem: lookup.healthSystemsById.get(healthSystemId),
        matchType: key === aliasTarget ? "alias" : "exact",
        cleanedName
      };
    }
  }

  for (const key of candidateKeys) {
    const looseKey = normalizeNameLoose(key);
    if (!looseKey) continue;
    const healthSystemId = takeSingle(lookup.looseMap.get(looseKey));
    if (healthSystemId) {
      return {
        status: "matched",
        healthSystem: lookup.healthSystemsById.get(healthSystemId),
        matchType: key === aliasTarget ? "alias_loose" : "loose",
        cleanedName
      };
    }
  }

  const fuzzyMatch = fuzzyMatchHealthSystem(cleanedName, aliasTarget, lookup);
  if (fuzzyMatch) return fuzzyMatch;

  if (REVISIT_MODE) {
    return {
      status: "create",
      cleanedName,
      aliasTarget,
      suggestions: []
    };
  }

  const suggestions = getSuggestions([...lookup.healthSystemsById.values()], cleanedName, aliasTarget);
  return {
    status: suggestions.length > 0 ? "unresolved" : "create",
    cleanedName,
    aliasTarget,
    suggestions
  };
}

function getHeaderValue(headerIndex, row, names, { required = true } = {}) {
  for (const name of names) {
    if (headerIndex.has(name)) {
      return cleanCell(row[headerIndex.get(name)]);
    }
  }

  if (required) {
    throw new Error(`Missing expected header: ${names.join(" / ")}`);
  }

  return "";
}

function readCsvRows(csvPath) {
  const csvText = readFileSync(csvPath, "utf8");
  const rows = parseCsv(csvText);
  if (rows.length === 0) throw new Error(`CSV has no rows: ${csvPath}`);

  const [headerRow = [], ...dataRows] = rows;
  const headerIndex = new Map();
  headerRow.forEach((header, index) => {
    const cleaned = cleanCell(header);
    if (cleaned && !headerIndex.has(cleaned)) {
      headerIndex.set(cleaned, index);
    }
  });

  return dataRows
    .map((row) => ({
      opportunityName: getHeaderValue(headerIndex, row, ["Opportunity Name", "Health System  ↑", "Health System"]),
      stage: getHeaderValue(headerIndex, row, ["Stage"]),
      annualRevenue: getHeaderValue(headerIndex, row, ["Annual Revenue"], { required: false }),
      probabilityPercent: getHeaderValue(headerIndex, row, ["Probability (%)"], { required: false }),
      ownerName: getHeaderValue(headerIndex, row, ["Opportunity Owner"], { required: false }),
      closeDate: getHeaderValue(headerIndex, row, ["Close Date"], { required: false }),
      createdDate: getHeaderValue(headerIndex, row, ["Created Date"], { required: false }),
      nextStep: getHeaderValue(headerIndex, row, ["Next Step"], { required: false })
    }))
    .filter((row) => row.opportunityName);
}

function toSerializableDate(value) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function describePipelineAction(existingPipeline) {
  return existingPipeline ? "update_pipeline" : "create_pipeline";
}

function importPipelineStatus() {
  return REVISIT_MODE ? "REVISIT" : "ACTIVE";
}

function importAllianceMemberStatus() {
  return REVISIT_MODE ? "REVISIT_LATER" : "PROSPECT";
}

async function main() {
  const csvRows = readCsvRows(CSV_PATH);

  const result = await prisma.$transaction(async (tx) => {
    const healthSystems = await tx.healthSystem.findMany({
      include: {
        alliancePipeline: true
      },
      orderBy: { name: "asc" }
    });

    const lookup = buildHealthSystemLookup(healthSystems);
    const outcomes = [];
    const unresolved = [];
    let createdHealthSystems = 0;
    let createdPipelines = 0;
    let updatedPipelines = 0;

    for (const row of csvRows) {
      const contractPriceUsd = parseUsd(row.annualRevenue);
      const likelihoodPercent = parsePercent(row.probabilityPercent);
      const estimatedCloseDate = REVISIT_MODE ? null : parseDate(row.closeDate);
      const sourceCreatedAt = parseDate(row.createdDate);
      const resolution = resolveHealthSystem(row, lookup);

      if (resolution.status === "unresolved") {
        unresolved.push({
          opportunityName: row.opportunityName,
          cleanedName: resolution.cleanedName,
          suggestions: resolution.suggestions
        });
        continue;
      }

      let healthSystem = resolution.status === "matched" ? resolution.healthSystem : null;
      const healthSystemAction = resolution.status === "matched" ? "match_existing" : "create_health_system";

      if (!healthSystem && APPLY) {
        healthSystem = await tx.healthSystem.create({
          data: {
            name: resolution.cleanedName,
            isAllianceMember: false,
            allianceMemberStatus: importAllianceMemberStatus()
          },
          include: {
            alliancePipeline: true
          }
        });
        createdHealthSystems += 1;

        lookup.healthSystemsById.set(healthSystem.id, healthSystem);
        for (const value of [healthSystem.name, healthSystem.legalName]) {
          if (!value) continue;
          const exact = normalizeName(value);
          if (exact) addToSetMap(lookup.exactMap, exact, healthSystem.id);

          const loose = normalizeNameLoose(value);
          if (loose) addToSetMap(lookup.looseMap, loose, healthSystem.id);

          lookup.searchEntries.push({
            healthSystemId: healthSystem.id,
            label: value,
            ...buildSearchKey(value)
          });
        }
      }

      const existingPipeline = healthSystem?.alliancePipeline || null;
      const stage = mapStage(row.stage, existingPipeline?.stage || null);
      const pipelineStatus = importPipelineStatus();
      const pipelineAction = describePipelineAction(existingPipeline);

      if (APPLY && healthSystem) {
        if (!existingPipeline) {
          await tx.healthSystemAlliancePipeline.create({
            data: {
              healthSystemId: healthSystem.id,
              stage,
              stageChangedAt: sourceCreatedAt || new Date(),
              status: pipelineStatus,
              ownerName: row.ownerName || null,
              nextStep: row.nextStep || null,
              contractPriceUsd,
              likelihoodPercent,
              estimatedCloseDate,
              createdAt: sourceCreatedAt || undefined
            }
          });
          createdPipelines += 1;
        } else {
          const data = {
            stage,
            status: pipelineStatus,
            closedOutcome: null,
            closedAt: null,
            closeReason: null,
            ownerName: row.ownerName || null,
            contractPriceUsd,
            likelihoodPercent,
            estimatedCloseDate,
            ...(row.nextStep ? { nextStep: row.nextStep } : {}),
            ...(existingPipeline.stage !== stage ? { stageChangedAt: sourceCreatedAt || new Date() } : {})
          };

          await tx.healthSystemAlliancePipeline.update({
            where: { healthSystemId: healthSystem.id },
            data
          });
          updatedPipelines += 1;
        }

        await tx.healthSystem.update({
          where: { id: healthSystem.id },
          data: {
            isAllianceMember: false,
            allianceMemberStatus: importAllianceMemberStatus()
          }
        });
      }

      outcomes.push({
        opportunityName: row.opportunityName,
        healthSystemName: healthSystem?.name || resolution.cleanedName,
        healthSystemAction,
        matchType: resolution.status === "matched" ? resolution.matchType : "create",
        fuzzyScore: resolution.status === "matched" && "fuzzyScore" in resolution ? resolution.fuzzyScore : null,
        pipelineAction,
        stage,
        pipelineStatus,
        ownerName: row.ownerName || null,
        contractPriceUsd,
        likelihoodPercent,
        estimatedCloseDate: toSerializableDate(estimatedCloseDate),
        sourceCreatedDate: toSerializableDate(sourceCreatedAt)
      });
    }

    return {
      csvPath: CSV_PATH,
      apply: APPLY,
      revisitMode: REVISIT_MODE,
      rowCount: csvRows.length,
      unresolved,
      outcomes,
      createdHealthSystems,
      createdPipelines,
      updatedPipelines
    };
  });

  if (result.unresolved.length > 0) {
    console.log(JSON.stringify(result, null, 2));
    throw new Error(`Import blocked: ${result.unresolved.length} row(s) need manual health system resolution.`);
  }

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
