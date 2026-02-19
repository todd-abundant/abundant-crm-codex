#!/usr/bin/env node

const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const failures = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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

async function expectJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but received: ${text.slice(0, 240)}`);
  }
}

async function run() {
  console.log(`Running HTTP smoke checks against ${baseUrl}`);

  await check("GET /", async () => {
    const response = await fetch(`${baseUrl}/`);
    assert(response.status === 200, `Expected 200, got ${response.status}`);
  });

  await check("GET /co-investors", async () => {
    const response = await fetch(`${baseUrl}/co-investors`);
    assert(response.status === 200, `Expected 200, got ${response.status}`);
  });

  await check("GET /companies", async () => {
    const response = await fetch(`${baseUrl}/companies`);
    assert(response.status === 200, `Expected 200, got ${response.status}`);
  });

  await check("GET /api/health-systems", async () => {
    const response = await fetch(`${baseUrl}/api/health-systems`);
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    const json = await expectJson(response);
    assert(Array.isArray(json.healthSystems), "healthSystems must be an array");
  });

  await check("GET /api/co-investors", async () => {
    const response = await fetch(`${baseUrl}/api/co-investors`);
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    const json = await expectJson(response);
    assert(Array.isArray(json.coInvestors), "coInvestors must be an array");
  });

  await check("GET /api/companies", async () => {
    const response = await fetch(`${baseUrl}/api/companies`);
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    const json = await expectJson(response);
    assert(Array.isArray(json.companies), "companies must be an array");
  });

  await check("POST /api/health-systems/search", async () => {
    const response = await fetch(`${baseUrl}/api/health-systems/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Intermountain Health" })
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    const json = await expectJson(response);
    assert(Array.isArray(json.candidates), "health-system search candidates must be an array");
  });

  await check("POST /api/co-investors/search", async () => {
    const response = await fetch(`${baseUrl}/api/co-investors/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "General Catalyst" })
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    const json = await expectJson(response);
    assert(Array.isArray(json.candidates), "co-investor search candidates must be an array");
  });

  await check("POST /api/companies/search", async () => {
    const response = await fetch(`${baseUrl}/api/companies/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "Abridge" })
    });
    assert(response.status === 200, `Expected 200, got ${response.status}`);
    const json = await expectJson(response);
    assert(Array.isArray(json.candidates), "company search candidates must be an array");
  });

  if (failures.length > 0) {
    console.error(`\nHTTP smoke checks failed (${failures.length}): ${failures.join(", ")}`);
    process.exit(1);
  }

  console.log("\nHTTP smoke checks passed.");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
