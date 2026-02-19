import OpenAI from "openai";
import { NextResponse } from "next/server";
import { healthSystemSearchRequestSchema } from "@/lib/schemas";

const healthSystemSearchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    candidates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          website: { type: "string" },
          headquartersCity: { type: "string" },
          headquartersState: { type: "string" },
          headquartersCountry: { type: "string" },
          summary: { type: "string" },
          sourceUrls: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["name"]
      }
    }
  },
  required: ["candidates"]
};

function parseJsonObject(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractJsonPayload(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {};
  }

  const strict = parseJsonObject(trimmed);
  if (Object.keys(strict).length > 0) {
    return strict;
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJsonObject(trimmed.slice(start, end + 1));
  }

  return {};
}

function normalizeSearchText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSearchUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => Boolean(entry));
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
  }
  return "Unknown error";
}

function extractErrorDetails(error: unknown) {
  if (error === undefined || error === null) {
    return {};
  }

  if (typeof error !== "object") {
    return { message: String(error) };
  }

  const typedError = error as {
    message?: unknown;
    status?: unknown;
    code?: unknown;
    name?: unknown;
    cause?: unknown;
  };

  return {
    message: getErrorMessage(error),
    name: typeof typedError.name === "string" ? typedError.name : undefined,
    status: typeof typedError.status === "number" ? typedError.status : undefined,
    code:
      typeof typedError.code === "string" || typeof typedError.code === "number"
        ? typedError.code
        : undefined,
    cause: typedError.cause && typeof typedError.cause === "object" ? typedError.cause : undefined
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = healthSystemSearchRequestSchema.parse(body);
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      return NextResponse.json({ error: "Query is required." }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "OPENAI_API_KEY is not configured." }, { status: 400 });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_SEARCH_MODEL || "gpt-4o-mini";
    const response = await client.responses.create({
      model,
      tools: [{ type: "web_search_preview" }],
      text: {
        format: {
          type: "json_schema",
          name: "health_system_candidates",
          schema: healthSystemSearchSchema,
          strict: false
        }
      },
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Find up to 6 likely US-based health system candidates that best match the query. Return headquarters city/state/country and website to disambiguate results."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Find up to 6 US-based health systems that match the query "${trimmedQuery}".`
            }
          ]
        }
      ]
    } as any);

    const rawOutput = response.output_text || "";
    const parsed = extractJsonPayload(rawOutput);
    const parsedCandidatesInput = Array.isArray(parsed.candidates) ? parsed.candidates : [];
    const parsedCandidates = parsedCandidatesInput
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const candidate = entry as Record<string, unknown>;
        return {
          name: normalizeSearchText(candidate.name),
          website: normalizeSearchText(candidate.website),
          headquartersCity: normalizeSearchText(candidate.headquartersCity),
          headquartersState: normalizeSearchText(candidate.headquartersState),
          headquartersCountry: normalizeSearchText(candidate.headquartersCountry),
          summary: normalizeSearchText(candidate.summary),
          sourceUrls: normalizeSearchUrls(candidate.sourceUrls)
        };
      })
      .filter((entry) => Boolean(entry?.name))
      .slice(0, 6);

    return NextResponse.json({
      query: trimmedQuery,
      model,
      rawOutput,
      parsedCandidates
    });
  } catch (error) {
    console.error("debug_health_system_search_error", error);
    const message = getErrorMessage(error);
    const errorDetails = extractErrorDetails(error);
    const status =
      error && typeof error === "object" && "status" in error && typeof error.status === "number"
        ? (error.status as number)
        : 500;
    return NextResponse.json(
      {
        error: "Failed to run health system debug search",
        details: message,
        errorDetails
      },
      { status: typeof status === "number" && status > 0 ? status : 500 }
    );
  }
}
