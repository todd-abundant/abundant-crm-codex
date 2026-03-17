import { type NormalizedMessageMetadata } from "@/lib/gmail-addon/types";

type GmailMessageHeader = {
  name?: string;
  value?: string;
};

type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: {
    mimeType?: string;
    body?: {
      data?: string;
    };
    headers?: GmailMessageHeader[];
    parts?: Array<GmailMessageResponse["payload"]>;
  };
};

export type GmailMessageFetchInput = {
  messageId: string | null;
  userOAuthToken: string | null;
  gmailAccessToken: string | null;
};

const METADATA_HEADERS = ["From", "To", "Cc", "Date", "Subject", "Message-Id"];

function normalizeHeaderMap(headers: GmailMessageHeader[] | undefined) {
  const map = new Map<string, string>();
  for (const header of headers || []) {
    if (!header || typeof header.name !== "string") continue;
    const key = header.name.toLowerCase();
    const value = typeof header.value === "string" ? header.value.trim() : "";
    map.set(key, value);
  }
  return map;
}

function decodeBase64Url(value: string | undefined) {
  if (!value) return "";

  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractBodyText(payload: GmailMessageResponse["payload"] | undefined): string {
  if (!payload) return "";

  const mimeType = (payload.mimeType || "").toLowerCase();
  if (mimeType === "text/plain") {
    return decodeBase64Url(payload.body?.data).trim();
  }

  if (mimeType === "text/html") {
    return stripHtml(decodeBase64Url(payload.body?.data));
  }

  for (const part of payload.parts || []) {
    const extracted = extractBodyText(part);
    if (extracted) return extracted;
  }

  const directBody = decodeBase64Url(payload.body?.data).trim();
  return directBody ? stripHtml(directBody) : "";
}

function parseAddress(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      name: "Unknown sender",
      email: ""
    };
  }

  const bracketMatch = trimmed.match(/^(.*)<([^>]+)>$/);
  if (bracketMatch) {
    const email = bracketMatch[2]?.trim().toLowerCase() || "";
    const nameRaw = (bracketMatch[1] || "").trim().replace(/^"|"$/g, "");
    return {
      name: nameRaw || email || "Unknown sender",
      email
    };
  }

  const emailOnlyMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailOnlyMatch) {
    const email = emailOnlyMatch[0].trim().toLowerCase();
    return {
      name: email,
      email
    };
  }

  return {
    name: trimmed,
    email: ""
  };
}

export function buildFallbackMessageMetadata(messageId: string | null): NormalizedMessageMetadata {
  return {
    messageId,
    threadId: null,
    internetMessageId: "",
    subject: "",
    fromRaw: "",
    fromName: "Unknown sender",
    fromEmail: "",
    toRaw: "",
    ccRaw: "",
    dateRaw: "",
    snippet: "",
    bodyText: ""
  };
}

export async function fetchMessageMetadata(input: GmailMessageFetchInput): Promise<NormalizedMessageMetadata> {
  if (!input.messageId) {
    return buildFallbackMessageMetadata(null);
  }

  if (!input.gmailAccessToken && !input.userOAuthToken) {
    return buildFallbackMessageMetadata(input.messageId);
  }

  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}`);
  url.searchParams.set("format", "full");
  for (const header of METADATA_HEADERS) {
    url.searchParams.append("metadataHeaders", header);
  }

  const attempts: Array<{ name: string; headers: Record<string, string> }> = [];

  if (input.userOAuthToken && input.gmailAccessToken) {
    attempts.push({
      name: "user_oauth_plus_gmail_access_header",
      headers: {
        Authorization: `Bearer ${input.userOAuthToken}`,
        "X-Goog-Gmail-Access-Token": input.gmailAccessToken
      }
    });
  }

  if (input.gmailAccessToken) {
    attempts.push({
      name: "gmail_access_token_as_bearer",
      headers: {
        Authorization: `Bearer ${input.gmailAccessToken}`
      }
    });
  }

  if (input.userOAuthToken) {
    attempts.push({
      name: "user_oauth_token_as_bearer",
      headers: {
        Authorization: `Bearer ${input.userOAuthToken}`
      }
    });
  }

  let payload: GmailMessageResponse | null = null;
  const failures: string[] = [];

  for (const attempt of attempts) {
    const response = await fetch(url, {
      method: "GET",
      headers: attempt.headers,
      cache: "no-store"
    });

    const body = await response.text();

    if (response.ok) {
      try {
        payload = (body ? JSON.parse(body) : {}) as GmailMessageResponse;
      } catch {
        throw new Error(`Failed Gmail metadata parse (${attempt.name}): expected JSON`);
      }
      break;
    }

    failures.push(`${attempt.name}:${response.status}:${body.slice(0, 200)}`);
  }

  if (!payload) {
    throw new Error(`Failed Gmail metadata fetch after ${attempts.length} attempts: ${failures.join(" || ")}`);
  }

  const headers = normalizeHeaderMap(payload.payload?.headers);

  const fromRaw = headers.get("from") || "";
  const parsedFrom = parseAddress(fromRaw);
  const bodyText = extractBodyText(payload.payload);

  return {
    messageId: payload.id || input.messageId,
    threadId: payload.threadId || null,
    internetMessageId: headers.get("message-id") || "",
    subject: headers.get("subject") || "",
    fromRaw,
    fromName: parsedFrom.name,
    fromEmail: parsedFrom.email,
    toRaw: headers.get("to") || "",
    ccRaw: headers.get("cc") || "",
    dateRaw: headers.get("date") || "",
    snippet: payload.snippet || "",
    bodyText
  };
}
