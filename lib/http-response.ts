export type JsonObject = Record<string, unknown>;

const MAX_RESPONSE_SNIPPET_LENGTH = 240;

function toResponseSnippet(raw: string) {
  const normalized = raw.trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (normalized.length <= MAX_RESPONSE_SNIPPET_LENGTH) return normalized;
  return `${normalized.slice(0, MAX_RESPONSE_SNIPPET_LENGTH)}...`;
}

export async function readJsonResponse(response: Response): Promise<JsonObject> {
  const raw = await response.text();
  if (!raw.trim()) return {};

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
    return { data: parsed };
  } catch {
    const snippet = toResponseSnippet(raw);
    if (!snippet) {
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}.`);
      }
      throw new Error("Received an empty response from the server.");
    }
    if (!response.ok) {
      throw new Error(snippet);
    }
    throw new Error("Received a non-JSON response from the server.");
  }
}

export function getJsonErrorMessage(payload: JsonObject, fallback: string) {
  const candidate = payload.error;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  return fallback;
}
