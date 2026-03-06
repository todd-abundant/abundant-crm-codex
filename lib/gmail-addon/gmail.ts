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
    headers?: GmailMessageHeader[];
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
    snippet: ""
  };
}

export async function fetchMessageMetadata(input: GmailMessageFetchInput): Promise<NormalizedMessageMetadata> {
  if (!input.messageId) {
    return buildFallbackMessageMetadata(null);
  }

  if (!input.userOAuthToken || !input.gmailAccessToken) {
    return buildFallbackMessageMetadata(input.messageId);
  }

  const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(input.messageId)}`);
  url.searchParams.set("format", "metadata");
  for (const header of METADATA_HEADERS) {
    url.searchParams.append("metadataHeaders", header);
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${input.userOAuthToken}`,
      "X-Goog-Gmail-Access-Token": input.gmailAccessToken
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed Gmail metadata fetch (${response.status}): ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as GmailMessageResponse;
  const headers = normalizeHeaderMap(payload.payload?.headers);

  const fromRaw = headers.get("from") || "";
  const parsedFrom = parseAddress(fromRaw);

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
    snippet: payload.snippet || ""
  };
}
