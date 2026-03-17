import { type NormalizedMessageMetadata, type OrganizationMatchKind } from "@/lib/gmail-addon/types";

const CONSUMER_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "ymail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me"
]);

const TITLE_KEYWORDS =
  /\b(founder|co-founder|founding partner|partner|principal|general partner|managing partner|managing director|director|vice president|vp|president|ceo|cto|cfo|coo|chief|head|lead|advisor|associate professor|professor|research associate professor|researcher|physician|md)\b/i;

const CO_INVESTOR_SIGNAL =
  /\b(partner|principal|general partner|managing partner|managing director|fund|vc|venture|ventures|capital|investor|lp|portfolio)\b/i;

const HEALTH_SYSTEM_SIGNAL = /\b(health system|hospital|clinic|medical center|medical|healthcare|care system)\b/i;

const GENERIC_LINE_SIGNAL =
  /^(linkedin|twitter|x\.com|www\.|http|mobile|phone|direct|fax|sent from my|confidentiality notice)/i;

export type MessageEntityInference = {
  contactTitle: string | null;
  organizationName: string | null;
  organizationNameTokens: string[];
  organizationWebsite: string | null;
  suggestedEntityKind: OrganizationMatchKind | null;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function splitLines(text: string) {
  return text
    .split(/\r?\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function senderDomain(message: NormalizedMessageMetadata) {
  const raw = message.fromEmail.trim().toLowerCase();
  const at = raw.indexOf("@");
  if (at < 0) return "";
  return raw.slice(at + 1);
}

function isConsumerEmailDomain(domain: string) {
  return Boolean(domain) && CONSUMER_EMAIL_DOMAINS.has(domain);
}

function senderNameTokens(message: NormalizedMessageMetadata) {
  return message.fromName
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && part !== "unknown" && part !== "sender");
}

function lineLooksLikeTitle(line: string) {
  return TITLE_KEYWORDS.test(line) && !line.includes("@");
}

function lineLooksLikeOrganization(line: string) {
  if (!line) return false;
  if (line.length > 100) return false;
  if (line.includes("@")) return false;
  if (GENERIC_LINE_SIGNAL.test(line)) return false;
  if (/^\+?\d[\d\s().-]{6,}$/.test(line)) return false;
  return /[A-Za-z]/.test(line);
}

function extractTitleAndOrganizationFromLine(line: string) {
  const cleaned = normalizeWhitespace(line);
  const patterns = [
    /^(.{2,80}?),(?:\s+)(.{2,80})$/,
    /^(.{2,80}?)\s+-\s+(.{2,80})$/,
    /^(.{2,80}?)\s+\|\s+(.{2,80})$/,
    /^(.{2,80}?)\s+at\s+(.{2,80})$/i
  ];

  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (!match) continue;

    const title = normalizeWhitespace(match[1] || "");
    const organizationName = normalizeWhitespace(match[2] || "");
    if (!lineLooksLikeTitle(title)) continue;
    if (!lineLooksLikeOrganization(organizationName)) continue;

    return {
      contactTitle: title,
      organizationName
    };
  }

  return null;
}

function extractOrganizationTokens(name: string | null) {
  if (!name) return [];

  return Array.from(
    new Set(
      name
        .toLowerCase()
        .split(/[^a-z0-9]+/g)
        .map((part) => part.trim())
        .filter((part) => part.length >= 4)
    )
  ).slice(0, 6);
}

function inferSuggestedEntityKind(args: { contactTitle: string | null; organizationName: string | null; bodyText: string }) {
  const signalText = [args.contactTitle, args.organizationName, args.bodyText].filter(Boolean).join(" ").toLowerCase();

  if (args.contactTitle && CO_INVESTOR_SIGNAL.test(args.contactTitle)) {
    return "CO_INVESTOR" as const;
  }

  if (HEALTH_SYSTEM_SIGNAL.test(signalText) && !CO_INVESTOR_SIGNAL.test(signalText)) {
    return "HEALTH_SYSTEM" as const;
  }

  if (CO_INVESTOR_SIGNAL.test(signalText)) {
    return "CO_INVESTOR" as const;
  }

  if (args.organizationName) {
    return "COMPANY" as const;
  }

  return null;
}

export function inferMessageEntityDefaults(message: NormalizedMessageMetadata): MessageEntityInference {
  const lines = splitLines([message.bodyText, message.snippet].filter(Boolean).join("\n"));
  const signatureWindow = lines.slice(-18);
  const senderTokens = senderNameTokens(message);

  let inferred: { contactTitle: string | null; organizationName: string | null } = {
    contactTitle: null,
    organizationName: null
  };

  let senderLineIndex = -1;
  for (let index = signatureWindow.length - 1; index >= 0; index -= 1) {
    const normalized = signatureWindow[index]?.toLowerCase() || "";
    if (!normalized) continue;
    if (senderTokens.length === 0) continue;
    if (senderTokens.every((token) => normalized.includes(token)) || senderTokens.some((token) => normalized === token)) {
      senderLineIndex = index;
      break;
    }
  }

  if (senderLineIndex >= 0) {
    const localLines = signatureWindow.slice(senderLineIndex + 1, senderLineIndex + 4);
    for (let index = 0; index < localLines.length; index += 1) {
      const direct = extractTitleAndOrganizationFromLine(localLines[index] || "");
      if (direct) {
        inferred = direct;
        break;
      }

      const current = normalizeWhitespace(localLines[index] || "");
      const next = normalizeWhitespace(localLines[index + 1] || "");
      if (lineLooksLikeTitle(current) && lineLooksLikeOrganization(next)) {
        inferred = {
          contactTitle: current,
          organizationName: next
        };
        break;
      }
    }
  }

  if (!inferred.organizationName) {
    for (let index = signatureWindow.length - 1; index >= 0; index -= 1) {
      const direct = extractTitleAndOrganizationFromLine(signatureWindow[index] || "");
      if (direct) {
        inferred = direct;
        break;
      }
    }
  }

  const domain = senderDomain(message);
  const organizationWebsite = domain && !isConsumerEmailDomain(domain) ? `https://${domain}` : null;

  return {
    contactTitle: inferred.contactTitle,
    organizationName: inferred.organizationName,
    organizationNameTokens: extractOrganizationTokens(inferred.organizationName),
    organizationWebsite,
    suggestedEntityKind: inferSuggestedEntityKind({
      contactTitle: inferred.contactTitle,
      organizationName: inferred.organizationName,
      bodyText: message.bodyText
    })
  };
}

export function defaultWebsiteFromMessage(message: NormalizedMessageMetadata) {
  const domain = senderDomain(message);
  if (!domain || isConsumerEmailDomain(domain)) return "";
  return `https://${domain}`;
}
