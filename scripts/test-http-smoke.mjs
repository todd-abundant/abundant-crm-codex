#!/usr/bin/env node

const baseUrl = process.env.APP_BASE_URL || "http://localhost:3000";
const authCookie = process.env.SMOKE_AUTH_COOKIE?.trim() || "";
const requestedApiMode = process.env.SMOKE_API_AUTH_MODE?.trim().toLowerCase();
const apiMode = resolveApiMode(requestedApiMode, authCookie);
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

function resolveApiMode(requestedMode, cookie) {
  if (!requestedMode) {
    return cookie ? "authenticated" : "anonymous";
  }

  if (requestedMode !== "anonymous" && requestedMode !== "authenticated") {
    throw new Error(
      `Invalid SMOKE_API_AUTH_MODE "${requestedMode}". Use "anonymous" or "authenticated".`
    );
  }

  return requestedMode;
}

async function request(path, init = {}) {
  const url = `${baseUrl}${path}`;
  const headers = new Headers(init.headers || {});
  if (authCookie && !headers.has("cookie")) {
    headers.set("cookie", authCookie);
  }
  try {
    return await fetch(url, { ...init, headers });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Request failed for ${url}: ${detail}. Check APP_BASE_URL and ensure the app is running.`);
  }
}

async function checkProtectedApi(label, runRequest, validateSuccess) {
  await check(label, async () => {
    const response = await runRequest();

    if (apiMode === "authenticated") {
      assert(response.status === 200, `Expected 200 in authenticated mode, got ${response.status}`);
      const json = await expectJson(response);
      await validateSuccess(json);
      return;
    }

    assert(response.status === 401, `Expected 401 in anonymous mode, got ${response.status}`);
    const json = await expectJson(response);
    assert(json?.error === "Unauthorized", 'Anonymous API response should contain error: "Unauthorized"');
  });
}

async function run() {
  if (apiMode === "authenticated" && !authCookie) {
    throw new Error("Authenticated API smoke mode requires SMOKE_AUTH_COOKIE.");
  }

  console.log(`Running HTTP smoke checks against ${baseUrl} (API mode: ${apiMode})`);

  await check("GET /", async () => {
    const response = await request("/");
    assert(response.status === 200, `Expected 200, got ${response.status}`);
  });

  await check("GET /co-investors", async () => {
    const response = await request("/co-investors");
    assert(response.status === 200, `Expected 200, got ${response.status}`);
  });

  await check("GET /companies", async () => {
    const response = await request("/companies");
    assert(response.status === 200, `Expected 200, got ${response.status}`);
  });

  await checkProtectedApi("GET /api/health-systems", () => request("/api/health-systems"), async (json) => {
    assert(Array.isArray(json.healthSystems), "healthSystems must be an array");
  });

  await checkProtectedApi("GET /api/co-investors", () => request("/api/co-investors"), async (json) => {
    assert(Array.isArray(json.coInvestors), "coInvestors must be an array");
  });

  await checkProtectedApi("GET /api/companies", () => request("/api/companies"), async (json) => {
    assert(Array.isArray(json.companies), "companies must be an array");
  });

  await checkProtectedApi(
    "POST /api/health-systems/search",
    () =>
      request("/api/health-systems/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Intermountain Health" })
      }),
    async (json) => {
      assert(Array.isArray(json.candidates), "health-system search candidates must be an array");
    }
  );

  await checkProtectedApi(
    "POST /api/co-investors/search",
    () =>
      request("/api/co-investors/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "General Catalyst" })
      }),
    async (json) => {
      assert(Array.isArray(json.candidates), "co-investor search candidates must be an array");
    }
  );

  await checkProtectedApi(
    "POST /api/companies/search",
    () =>
      request("/api/companies/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Abridge" })
      }),
    async (json) => {
      assert(Array.isArray(json.candidates), "company search candidates must be an array");
    }
  );

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
