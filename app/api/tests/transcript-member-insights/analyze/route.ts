import OpenAI from "openai";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";

const SENTIMENT_VALUES = ["POSITIVE", "MIXED", "NEUTRAL", "NEGATIVE"] as const;

const participantRoleEnum = ["speaker", "participant_listed", "both", "mentioned_only"] as const;
const confidenceEnum = ["high", "medium", "low"] as const;

const analysisRequestSchema = z.object({
  companyId: z.string().trim().min(1),
  transcript: z.string().trim().min(20),
  participantClassifications: z
    .array(
      z.object({
        speakerName: z.string().trim().min(1),
        role: z.enum(["ABUNDANT", "COMPANY", "MEMBER", "UNKNOWN"]),
        healthSystemId: z.string().trim().nullable().optional()
      })
    )
    .optional(),
  maxInsights: z.number().int().min(1).max(300).default(100).optional()
});

type AbundantRosterEntry = {
  name: string;
  source: "about-page" | "fallback";
};

type AbundantCanonicalAlias = {
  canonical: string;
  aliases: string[];
};

type ContactRecord = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  healthSystemLinks: Array<{
    healthSystemId: string;
    healthSystem: {
      id: string;
      name: string;
      isAllianceMember: boolean;
    };
  }>;
  companyLinks: Array<{
    companyId: string;
  }>;
};

type CompanyRecord = {
  id: string;
  name: string;
};

type CompanyPromptContact = {
  name: string;
  title: string | null;
  email: string | null;
};

type CompanyPromptContext = {
  companyName: string;
  knownContacts: CompanyPromptContact[];
};

type AllianceHealthSystem = {
  id: string;
  name: string;
  website: string | null;
};

type ContactMatch = {
  contact: ContactRecord;
  score: number;
  strategy: "email" | "name" | "organization";
};

type ParticipantMatch = {
  speakerName: string;
  role: "ABUNDANT" | "COMPANY" | "MEMBER" | "UNKNOWN";
  healthSystemId: string;
  confidence: "high" | "medium" | "low";
  source: "abundant-identity" | "contact-fuzzy" | "org-fuzzy" | "company" | "manual";
};

const ABUNDANT_ABOUT_URL = "https://www.abundantventurepartners.com/about/";
const ABUNDANT_ROSTER_TTL_MS = 6 * 60 * 60 * 1000;
const MEMBERSHIP_MATCH_THRESHOLD = 0.76;
const MEMBER_ORG_MATCH_THRESHOLD = 0.72;
const COMPANY_CANDIDATE_MATCH_THRESHOLD = 0.92;
const COMPANY_SPEAKER_SIGNAL_MIN = 6;
const MIN_COMPANY_TURN_THRESHOLD = 7;
const COMPANY_ORG_SIGNAL_MIN = 0.86;
const QUOTE_MAX_LENGTH = 260;
const ABUNDANT_IDENTITY_HINTS: AbundantCanonicalAlias[] = [
  { canonical: "Hanna Helms", aliases: ["Hanna Helms", "Hanna"] },
  { canonical: "Katie Edge", aliases: ["Katie Edge", "Katie"] },
  {
    canonical: "Amanda DeMano",
    aliases: ["Amanda Demano", "Amanda DeMano", "Amanda Koch", "Koch, Amanda"]
  },
  { canonical: "Todd Johnson", aliases: ["Todd Johnson", "Todd"] }
];
let abundantRosterCache: {
  updatedAt: number;
  names: string[];
} | null = null;

const participantExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    meeting_id: { type: "string" },
    people: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          display_name: { type: "string" },
          raw_mentions: {
            type: "array",
            items: { type: "string" },
            minItems: 0
          },
          email: { type: "string", nullable: true },
          organization: { type: "string", nullable: true },
          title: { type: "string", nullable: true },
          role_in_meeting: { type: "string", enum: participantRoleEnum },
          confidence: { type: "string", enum: confidenceEnum },
          notes: { type: "string" }
        },
        required: ["display_name", "raw_mentions", "role_in_meeting", "confidence", "notes", "email", "organization", "title"]
      }
    },
    counts: {
      type: "object",
      additionalProperties: false,
      properties: {
        unique_people: { type: "integer" },
        listed_in_participants_line: { type: "integer" },
        spoke_in_transcript: { type: "integer" },
        mentioned_only: { type: "integer" }
      },
      required: ["unique_people", "listed_in_participants_line", "spoke_in_transcript", "mentioned_only"]
    }
  },
  required: ["meeting_id", "people", "counts"]
};

const quoteExtractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          definition: { type: "string" }
        },
        required: ["name", "definition"]
      }
    },
    quotes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          speakerName: { type: "string" },
          speaker: { type: "string" },
          speaker_org: { type: "string", nullable: true },
          excerpt: { type: "string", nullable: true },
          quote: { type: "string", nullable: true },
          type: { type: "string", enum: ["question", "comment"] },
          sentiment: { type: "string", enum: SENTIMENT_VALUES },
          theme: { type: "string" },
          sentiment_rationale: { type: "string" },
          specificity_score: { type: "integer", minimum: 1, maximum: 5 },
          why_selected: { type: "string" },
          isQuestion: { type: "boolean" },
          lineNumber: { type: "integer", minimum: 0 },
          timestampSeconds: { type: "number", nullable: true },
          timestampLabel: { type: "string", nullable: true }
        }
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["quotes", "warnings"]
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
  if (!trimmed) return {};

  const strict = parseJsonObject(trimmed);
  if (Object.keys(strict).length > 0) return strict;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return parseJsonObject(trimmed.slice(start, end + 1));
  }

  return {};
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sanitizeNullableText(value: unknown): string | null {
  const cleaned = cleanText(value);
  return cleaned || null;
}

function normalizeName(value: string): string {
  let normalized = value
    .replace(/\([^)]*\)/g, " ")
    .replace(/[<>"'`]/g, " ")
    .replace(/\bdr\.?|mr\.?|mrs\.?|ms\.?|prof\.?/gi, " ")
    .replace(/\bmd\.?|m\.?d\.?|fnp\.?|rn\.?|mba\.?/gi, " ")
    .trim()
    .replace(/\s*-\s*.*$/g, " ")
    .replace(/\s+/g, " ");

  if (/[A-Za-z],/.test(normalized)) {
    const parts = normalized
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length >= 2 && /\s/.test(parts[1])) {
      normalized = `${parts[1]} ${parts[0]}`;
    }
  }

  return normalized.replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePersonKey(value: string): string {
  return normalizeName(value).replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeForDisplay(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForMatch(value: string): string {
  return normalizeName(value).replace(/\b(md|m\.?d\.?|dr|mr|mrs|ms|rn|fnp|mba|phd|cpa)\b/g, " ").trim().replace(/\s+/g, " ");
}

function tokenizeForMatch(value: string): string[] {
  return normalizeForMatch(value)
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 1);
}

function isLikelySamePersonName(aRaw: string, bRaw: string): boolean {
  const a = tokenizeForMatch(aRaw);
  const b = tokenizeForMatch(bRaw);
  if (!a.length || !b.length) return false;

  if (a.join(" ") === b.join(" ")) return true;

  const aFirst = a[0] || "";
  const bFirst = b[0] || "";
  const aLast = a[a.length - 1] || "";
  const bLast = b[b.length - 1] || "";

  if (aFirst && bFirst && aLast && bLast) {
    if (aFirst === bFirst && aLast === bLast) return true;
    if (aFirst === bLast && aLast === bFirst) return true;
  }

  if (a.length >= 2 && b.length >= 2) {
    const overlap = a.filter((entry) => b.includes(entry)).length;
    return overlap >= 2;
  }

  return false;
}

function isLikelyFirstNameAlias(aRaw: string, bRaw: string): boolean {
  const a = tokenizeForMatch(aRaw);
  const b = tokenizeForMatch(bRaw);
  if (!a.length || !b.length) return false;

  if (a.length === 1 && b.length >= 2) {
    return a[0] === b[0];
  }
  if (b.length === 1 && a.length >= 2) {
    return b[0] === a[0];
  }
  return false;
}

function buildSpeakerNameFromLabel(label: string): string {
  return cleanText(label)
    .replace(/^\s*-\s*/, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/,\s*(MD|M\.D\.?|CDAIO|CFO|CCO|CEO|C\-|VP|CRO|CNM|RN|DO|PA)\b.*$/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildFallbackParticipantsFromTranscript(transcript: string): ParticipantExtractionPerson[] {
  const lines = transcript.split(/\r?\n/);
  const people = new Map<string, ParticipantExtractionPerson>();

  for (const rawLine of lines) {
    const trimmedLine = cleanText(rawLine);
    if (!trimmedLine) continue;

    const participantsMatch = trimmedLine.match(/^Participants:\s*(.+)$/i);
    if (participantsMatch) {
      const peopleLine = participantsMatch[1] || "";
      for (const token of peopleLine.split(",")) {
        const normalizedToken = cleanText(token);
        if (!normalizedToken) continue;

        const displayName = buildSpeakerNameFromLabel(normalizedToken);
        if (!displayName || displayName.length < 2) continue;

        const key = normalizePersonKey(displayName);
        if (!key) continue;
        const existing = people.get(key);
        if (existing) {
          if (!existing.raw_mentions.includes(displayName)) {
            existing.raw_mentions.push(displayName);
          }
          continue;
        }

        people.set(key, {
          display_name: displayName,
          raw_mentions: [displayName],
          email: null,
          organization: null,
          title: null,
          role_in_meeting: "participant_listed",
          confidence: "medium",
          notes: "Fallback parser from transcript participant line."
        });
      }
      continue;
    }

    const colonIndex = trimmedLine.indexOf(":");
    if (colonIndex <= 0 || colonIndex > 160) continue;

    const speakerRaw = buildSpeakerNameFromLabel(trimmedLine.slice(0, colonIndex));
    if (!speakerRaw) continue;

    const key = normalizePersonKey(speakerRaw);
    if (!key) continue;

    const existing = people.get(key);
    if (existing) {
      existing.role_in_meeting = "both";
      if (!existing.raw_mentions.includes(speakerRaw)) {
        existing.raw_mentions.push(speakerRaw);
      }
      continue;
    }

    people.set(key, {
      display_name: speakerRaw,
      raw_mentions: [speakerRaw],
      email: null,
      organization: null,
      title: null,
      role_in_meeting: "speaker",
      confidence: "low",
      notes: "Fallback parser from transcript speaker labels."
    });
  }

  return Array.from(people.values());
}

function extractEmailsFromText(value: string): string[] {
  const matches = value.matchAll(
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi
  );
  const found = new Set<string>();
  for (const match of matches) {
    const email = (match[0] || "").toLowerCase();
    if (email) found.add(email);
  }
  return Array.from(found);
}

function extractPersonNameHints(person: ParticipantExtractionPerson): string[] {
  const mentions = [person.display_name, ...person.raw_mentions, person.email || ""];
  const seen = new Set<string>();
  const hints: string[] = [];

  for (const mention of mentions) {
    const normalized = normalizeForDisplay(mention || "").trim();
    if (!normalized) continue;
    if (seen.has(normalizePersonKey(normalized))) continue;
    seen.add(normalizePersonKey(normalized));
    hints.push(normalized);
  }

  return hints;
}

function scoreTextSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const normalizedA = normalizeForMatch(a);
  const normalizedB = normalizeForMatch(b);
  if (!normalizedA || !normalizedB) return 0;
  if (normalizedA === normalizedB) return 0.98;

  if (normalizedA.includes(normalizedB) || normalizedB.includes(normalizedA)) {
    const maxLen = Math.max(normalizedA.length, normalizedB.length);
    const minLen = Math.min(normalizedA.length, normalizedB.length);
    if (maxLen - minLen <= 4) return 0.9;
    return 0.84;
  }

  const tokensA = new Set(normalizedA.split(" ").filter(Boolean));
  const tokensB = new Set(normalizedB.split(" ").filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let overlap = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) overlap += 1;
  }

  const ratio = overlap / Math.max(tokensA.size, tokensB.size);
  if (tokensA.size === 1 && overlap >= 1) return 0.72;
  if (ratio >= 0.75) return 0.82;
  if (ratio >= 0.5) return 0.7;
  return 0;
}

function matchNameToRecord(query: string, candidate: string): number {
  if (!query || !candidate) return 0;
  const queryParts = normalizeForMatch(query)
    .split(" ")
    .filter(Boolean);
  const candidateParts = normalizeForMatch(candidate)
    .split(" ")
    .filter(Boolean);

  if (!queryParts.length || !candidateParts.length) return 0;
  if (queryParts.join(" ") === candidateParts.join(" ")) return 0.98;

  const qFirst = queryParts[0] || "";
  const cFirst = candidateParts[0] || "";
  const qLast = queryParts[queryParts.length - 1] || "";
  const cLast = candidateParts[candidateParts.length - 1] || "";

  if (qLast && cLast && qLast === cLast && qFirst && cFirst) return 0.94;
  if (qLast && cLast && qFirst && cFirst[0] && qFirst[0] === cFirst[0]) return 0.86;

  return scoreTextSimilarity(normalizeForMatch(query), normalizeForMatch(candidate));
}

function pickBestMatchedHealthSystem(
  organization: string | null,
  systems: AllianceHealthSystem[]
): { healthSystemId: string; score: number; ambiguous: boolean } | null {
  const normalized = normalizeForMatch(organization || "").trim();
  if (!normalized) return null;

  const scored = systems
    .map((system) => {
      const score = matchNameToRecord(normalized, system.name);
      return {
        healthSystemId: system.id,
        score,
        ambiguous: false
      };
    })
    .filter((entry) => entry.score >= MEMBER_ORG_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return null;
  if (scored.length > 1 && scored[0].score - scored[1].score < 0.08) {
    return { ...scored[0], ambiguous: true };
  }
  return scored[0];
}

function detectCompanyMatchText(organization: string | null, companyName: string): boolean {
  const normalizedOrg = normalizeForMatch(organization || "");
  const normalizedCompany = normalizeForMatch(companyName || "");
  if (!normalizedOrg || !normalizedCompany) return false;
  if (normalizedOrg === normalizedCompany) return true;
  if (normalizedOrg.includes(normalizedCompany)) return true;
  if (normalizedCompany.includes(normalizedOrg) && normalizedOrg.length >= 5) return true;
  return false;
}

function extractTranscriptSummary(raw: string): string {
  return raw.slice(0, 22000);
}

function extractSpeakerFromLine(line: string): string | null {
  const trimmed = cleanText(line);
  if (!trimmed) return null;

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex <= 0 || colonIndex > 200) return null;

  const rawSpeaker = buildSpeakerNameFromLabel(trimmed.slice(0, colonIndex));
  return rawSpeaker || null;
}

function extractSpeakerFromLineWithKnownNames(
  line: string,
  knownSpeakerNames: string[]
): string | null {
  const trimmed = cleanText(line);
  if (!trimmed) return null;

  const fromColon = extractSpeakerFromLine(trimmed);
  if (fromColon) {
    for (const candidate of knownSpeakerNames) {
      if (isLikelySamePersonName(fromColon, candidate) || isLikelyFirstNameAlias(fromColon, candidate)) {
        return normalizeForDisplay(candidate);
      }
    }
    return fromColon;
  }

  if (trimmed.length > 120 || /^[-–—]/.test(trimmed) || /^(participants:|grain url:|date:|option\b|---)/i.test(trimmed)) {
    return null;
  }

  for (const candidate of knownSpeakerNames) {
    if (isLikelySamePersonName(trimmed, candidate) || isLikelyFirstNameAlias(trimmed, candidate)) {
      return normalizeForDisplay(candidate);
    }
  }

  return null;
}

function sanitizeTranscriptForAnalysis(
  transcript: string,
  options: {
    speakerNamesToStrip?: string[];
    preserveParticipantsLine?: boolean;
    dropLinesBeforeFirstStrippedSpeaker?: boolean;
  } = {}
): string {
  const lines = transcript.split(/\r?\n/);
  if (!lines.length) return "";

  const rawNames = (options.speakerNamesToStrip || [])
    .map((entry) => normalizeForDisplay(entry))
    .filter(Boolean);
  const namesToStrip = (options.speakerNamesToStrip || [])
    .map((entry) => normalizePersonKey(entry))
    .filter((entry) => entry);
  if (!namesToStrip.length) return transcript;

  const isStripTarget = (speakerRaw: string): boolean => {
    const normalizedSpeaker = normalizePersonKey(speakerRaw);
    if (!normalizedSpeaker) return false;

    if (namesToStrip.includes(normalizedSpeaker)) return true;
    return namesToStrip.some((candidate) => isLikelySamePersonName(normalizedSpeaker, candidate));
  };

  let firstStrippedIndex = -1;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const speakerRaw = extractSpeakerFromLineWithKnownNames(line, rawNames);
    if (!speakerRaw) continue;

    if (isStripTarget(speakerRaw)) {
      firstStrippedIndex = index;
      break;
    }
  }

  const startIndex =
    options.dropLinesBeforeFirstStrippedSpeaker && firstStrippedIndex > 0 ? firstStrippedIndex : 0;
  const cleanedLines: string[] = [];

  for (let index = startIndex; index < lines.length; index++) {
    const rawLine = lines[index];
    const trimmedLine = cleanText(rawLine);

    if (!trimmedLine) {
      cleanedLines.push("");
      continue;
    }

    if (options.preserveParticipantsLine && /^participants:/i.test(trimmedLine)) {
      cleanedLines.push(rawLine);
      continue;
    }

    const speakerRaw = extractSpeakerFromLineWithKnownNames(rawLine, rawNames);
    if (!speakerRaw) {
      cleanedLines.push(rawLine);
      continue;
    }

    if (isStripTarget(speakerRaw)) continue;

    cleanedLines.push(rawLine);
  }

  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function truncateTranscriptAfterLastCompanySpeakerBlock(
  transcript: string,
  options: {
    companySpeakerNames: string[];
    allSpeakerNames: string[];
  }
): {
  transcript: string;
  companyBlockFound: boolean;
  lastCompanySpeaker: string | null;
  lastCompanyLineIndex: number | null;
  totalLineCount: number;
  keptLineCount: number;
} {
  const lines = transcript.split(/\r?\n/);
  if (!lines.length) {
    return {
      transcript,
      companyBlockFound: false,
      lastCompanySpeaker: null,
      lastCompanyLineIndex: null,
      totalLineCount: 0,
      keptLineCount: 0
    };
  }

  const companyNames = options.companySpeakerNames.map((entry) => normalizeForDisplay(entry)).filter(Boolean);
  const allNames = options.allSpeakerNames.map((entry) => normalizeForDisplay(entry)).filter(Boolean);
  if (!companyNames.length || !allNames.length) {
    return {
      transcript,
      companyBlockFound: false,
      lastCompanySpeaker: null,
      lastCompanyLineIndex: null,
      totalLineCount: lines.length,
      keptLineCount: lines.length
    };
  }

  const speakerMarkers: Array<{ lineIndex: number; speaker: string }> = [];
  for (let index = 0; index < lines.length; index++) {
    const speaker = extractSpeakerFromLineWithKnownNames(lines[index], allNames);
    if (!speaker) continue;
    speakerMarkers.push({ lineIndex: index, speaker });
  }

  if (!speakerMarkers.length) {
    return {
      transcript,
      companyBlockFound: false,
      lastCompanySpeaker: null,
      lastCompanyLineIndex: null,
      totalLineCount: lines.length,
      keptLineCount: lines.length
    };
  }

  let lastCompanyBlockEnd = -1;
  let lastCompanySpeaker: string | null = null;

  for (let i = 0; i < speakerMarkers.length; i++) {
    const marker = speakerMarkers[i];
    const isCompanySpeaker = companyNames.some((name) => isLikelySamePersonName(marker.speaker, name));
    if (!isCompanySpeaker) continue;
    const nextStart = i + 1 < speakerMarkers.length ? speakerMarkers[i + 1].lineIndex : lines.length;
    if (nextStart - 1 > lastCompanyBlockEnd) {
      lastCompanyBlockEnd = nextStart - 1;
      lastCompanySpeaker = marker.speaker;
    }
  }

  if (lastCompanyBlockEnd < 0 || lastCompanyBlockEnd >= lines.length - 1) {
    return {
      transcript,
      companyBlockFound: false,
      lastCompanySpeaker,
      lastCompanyLineIndex: lastCompanyBlockEnd >= 0 ? lastCompanyBlockEnd : null,
      totalLineCount: lines.length,
      keptLineCount: lines.length
    };
  }

  const truncated = lines.slice(lastCompanyBlockEnd + 1).join("\n").trim();
  return {
    transcript: truncated || transcript,
    companyBlockFound: Boolean(truncated),
    lastCompanySpeaker,
    lastCompanyLineIndex: lastCompanyBlockEnd,
    totalLineCount: lines.length,
    keptLineCount: truncated ? truncated.split(/\r?\n/).length : lines.length
  };
}

function buildTranscriptStripCandidates(
  classifications: Array<{
    speakerName: string;
    role: "ABUNDANT" | "COMPANY" | "MEMBER" | "UNKNOWN";
    healthSystemId?: string | null;
  }>,
  fallbackNames: string[] = [],
  speakerLineCounts?: Map<string, number>
): string[] {
  const shouldStripCompanySpeaker = (speakerName: string): boolean => {
    if (!speakerLineCounts) return true;
    const key = normalizePersonKey(speakerName);
    if (!key) return false;
    const turns = speakerLineCounts.get(key) || 0;
    return turns >= MIN_COMPANY_TURN_THRESHOLD;
  };

  const namesFromClassifications = classifications
    .filter((entry) => {
      if (entry.role === "ABUNDANT") return true;
      if (entry.role !== "COMPANY") return false;
      return shouldStripCompanySpeaker(entry.speakerName);
    })
    .map((entry) => entry.speakerName);

  const uniqueNames = new Set<string>([
    ...namesFromClassifications,
    ...fallbackNames
  ]);

  return Array.from(uniqueNames).filter((name) => cleanText(name));
}

function buildSpeakerLineCountsFromClassifications(
  transcript: string,
  classifications: Array<{
    speakerName: string;
    role: "ABUNDANT" | "COMPANY" | "MEMBER" | "UNKNOWN";
    healthSystemId?: string | null;
  }>
): Map<string, number> {
  const people: ParticipantExtractionPerson[] = classifications.map((entry) => ({
    display_name: normalizeForDisplay(entry.speakerName),
    raw_mentions: [normalizeForDisplay(entry.speakerName)],
    email: null,
    organization: null,
    title: null,
    role_in_meeting: "speaker",
    confidence: "low",
    notes: "derived from participant classifications"
  }));

  return buildSpeakerLineCounts(transcript, people);
}

function inferQuoteType(text: string): "question" | "comment" {
  const trimmed = cleanText(text);
  if (!trimmed) return "comment";
  if (/[?]$/.test(trimmed)) return "question";
  const startsAsQuestion = /^(what|why|how|when|where|who|can|could|would|will|did|do|does|is|are|should|has|have)\b/i.test(trimmed);
  return startsAsQuestion ? "question" : "comment";
}

function quotePriorityScore(type: "question" | "comment", specificity: number, lineNumber = 0): number {
  const commentBonus = type === "comment" ? 0.75 : 0;
  // Prefer earlier transcript evidence when scores tie to keep outputs stable.
  const recencyAdjustment = lineNumber > 0 ? Math.max(0, 0.2 - lineNumber / 100000) : 0;
  return specificity + commentBonus + recencyAdjustment;
}

type TranscriptQuote = {
  id: string;
  speakerName: string;
  speaker_org: string;
  excerpt: string;
  sentiment: "POSITIVE" | "MIXED" | "NEUTRAL" | "NEGATIVE";
  type: "question" | "comment";
  sentiment_rationale: string;
  specificity_score: number;
  why_selected: string;
  quote: string;
  theme: string;
  isQuestion: boolean;
  lineNumber: number;
  timestampSeconds: number | null;
  timestampLabel: string | null;
  healthSystemId: string;
};

function parseOpenAIErrorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    if ("message" in error && typeof error.message === "string") {
      return error.message;
    }
    if ("error" in error && error.error && typeof error.error === "object" && "message" in error.error) {
      const nestedMessage = (error.error as { message?: unknown }).message;
      if (typeof nestedMessage === "string") return nestedMessage;
    }
  }

  return "An unexpected model error occurred.";
}

function extractTextFromObject(entry: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = cleanText(entry[key]);
    if (value) return value;
  }

  return "";
}

function compactQuoteText(value: string, maxLength = QUOTE_MAX_LENGTH): string {
  const trimmed = cleanText(value);
  if (!trimmed || trimmed.length <= maxLength) return trimmed;

  const normalized = trimmed.replace(/\s+/g, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((entry) => cleanText(entry))
    .filter((entry) => entry.length > 0);

  if (sentences.length <= 1) {
    const words = normalized.split(" ");
    if (words.length <= 38) return normalized;
    return `${words.slice(0, 18).join(" ")} ... ${words.slice(Math.max(0, words.length - 14)).join(" ")}`;
  }

  const priorityTerms = [
    /\b(metrics|survey|evidence|data|roi|cost|integration|workflow|noise|precision|validation|pilot|timeline|adoption|accuracy|false positive|cohort|case study|support|implementation|concern|model|results|lift|co.?development|health system|question|study|resource|budget|concerns|go.?no.?go|decision|ROI)\b/i,
    /\bwe've|never|want|want to|interested|interested in|see more|concern|decision|evidence|further|before|fewer|hard|hard to|how|what|why|number|data|in basket|inbox|pajama|survey|metrics|proposed/i
  ];

  const scored = sentences.map((sentence, index) => {
    const lower = sentence.toLowerCase();
    let score = Math.min(sentence.length / 12, 12);
    for (const pattern of priorityTerms) {
      const matches = lower.match(pattern);
      if (matches) {
        score += matches.length * 5;
      }
    }
    return { sentence, score, index };
  });

  const sorted = scored.slice().sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = [sorted[0], sorted[1]].filter(Boolean);

  if (!selected.length) return normalized.slice(0, Math.max(120, maxLength));

  const selectedIndices = [...new Set(selected.map((entry) => entry.index))].sort((a, b) => a - b);
  const compacted = selectedIndices
    .map((index) => sentences[index])
    .filter((sentence, i, arr) => i === 0 || sentence !== arr[i - 1])
    .join(" ... ");

  if (compacted.length <= maxLength) return compacted;

  const start = normalized.slice(0, Math.floor(maxLength * 0.55)).trim();
  const end = normalized.slice(-Math.floor(maxLength * 0.35)).trim();
  return `${start} ... ${end}`;
}

function buildSpeakerLineCounts(
  transcript: string,
  people: ParticipantExtractionPerson[]
): Map<string, number> {
  const lineCounts = new Map<string, number>();
  const participantKeys = people
    .map((person) => normalizePersonKey(person.display_name))
    .filter(Boolean);

  if (!participantKeys.length) return lineCounts;

  const keySet = new Set(participantKeys);
  const uniqueKeys = Array.from(keySet);
  const lines = transcript.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = cleanText(line);
    if (!trimmed) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0 || colonIndex > 140) continue;

    const rawSpeaker = cleanText(trimmed.slice(0, colonIndex));
    if (!rawSpeaker) continue;

    const normalizedSpeaker = normalizePersonKey(rawSpeaker);
    if (!normalizedSpeaker) continue;

    if (keySet.has(normalizedSpeaker)) {
      lineCounts.set(normalizedSpeaker, (lineCounts.get(normalizedSpeaker) || 0) + 1);
      continue;
    }

    for (const key of uniqueKeys) {
      if (!key) continue;
      if (normalizedSpeaker.includes(key) || key.includes(normalizedSpeaker) || isLikelySamePersonName(normalizedSpeaker, key)) {
        lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
        break;
      }
    }
  }

  return lineCounts;
}

function buildFallbackQuoteHints(
  transcript: string,
  participantClassifications: Array<{
    speakerName: string;
    role: "ABUNDANT" | "COMPANY" | "MEMBER" | "UNKNOWN";
    healthSystemId: string | null | undefined;
  }>
): Array<{ speaker: string; quote: string; lineNumber: number }> {
  const memberNames = new Set(
    participantClassifications
      .filter((entry) => entry.role === "MEMBER" || entry.role === "UNKNOWN" || entry.role === "COMPANY")
      .map((entry) => normalizePersonKey(entry.speakerName))
      .filter(Boolean)
  );

  const lines = transcript.split(/\r?\n/);
  const scored: Array<{ speaker: string; quote: string; lineNumber: number; score: number }> = [];

  const boilerplate = /^(\s*[-–—]{2,}|\s*TRANSCRIPT\b|\s*Participants:|\s*Grain URL:|\s*OPTION\b|\s*Date:)/i;

  for (let index = 0; index < lines.length; index++) {
    const trimmed = cleanText(lines[index]);
    if (!trimmed || boilerplate.test(trimmed)) continue;

    const match = trimmed.match(/^([^:\n]{1,120}):\s*(.+)$/);
    if (!match) continue;

    const [, rawSpeaker, text] = match;
    const speaker = cleanText(rawSpeaker);
    const statement = cleanText(text);
    if (!speaker || !statement || statement.length < 20) continue;

    let score = 0;
    const normalizedSpeaker = normalizePersonKey(speaker);

    const quoteType = inferQuoteType(statement);
    if (quoteType === "comment") score += 1;
    if (/(stat|evidence|cost|roi|integration|workflow|false positives|noise|precision|validation|timeline|adoption|go.?no.?go|concern|metric|pilot|investment)/i.test(statement)) {
      score += 2;
    }
    if (
      normalizedSpeaker &&
      Array.from(memberNames).some((memberName) => isLikelySamePersonName(normalizedSpeaker, memberName))
    ) {
      score += 2;
    }

    if (score >= 1) {
      scored.push({ speaker, quote: statement, lineNumber: index + 1, score });
    }
  }

  return scored
    .sort((a, b) => {
      const aType = inferQuoteType(a.quote);
      const bType = inferQuoteType(b.quote);
      const weighted = quotePriorityScore(bType, b.score, b.lineNumber) - quotePriorityScore(aType, a.score, a.lineNumber);
      if (weighted !== 0) return weighted;
      return b.score - a.score;
    })
    .slice(0, 45)
    .map(({ speaker, quote, lineNumber }) => ({ speaker, quote, lineNumber }));
}

function extractTextualSentiment(value: string): "POSITIVE" | "NEGATIVE" | "MIXED" | "NEUTRAL" {
  const lowered = value.toLowerCase();
  const positiveTokens = ["great", "helpful", "good", "interested", "strong", "valuable", "improves", "better", "impressive", "benefit"];
  const negativeTokens = ["concern", "concerns", "risk", "problem", "issue", "difficulty", "difficult", "challenging", "noisy", "false positive", "negative", "not worth", "cost", "expensive"];
  let positiveScore = 0;
  let negativeScore = 0;

  for (const token of positiveTokens) {
    if (lowered.includes(token)) positiveScore += 1;
  }
  for (const token of negativeTokens) {
    if (lowered.includes(token)) negativeScore += 1;
  }

  if (positiveScore >= 2 && negativeScore === 0) return "POSITIVE";
  if (negativeScore >= 2 && positiveScore === 0) return "NEGATIVE";
  if (positiveScore >= 1 && negativeScore >= 1) return "MIXED";
  return negativeScore > positiveScore ? "NEGATIVE" : positiveScore > 0 ? "POSITIVE" : "NEUTRAL";
}

function classifyTranscriptQuoteTheme(quote: string): string {
  const lowered = quote.toLowerCase();
  if (/(metrics|roi|cost|investment|spend|savings|financial|value)/i.test(lowered)) {
    return "ROI & Economics";
  }
  if (/(integrat|api|workflow|implementation|pilot|timeline|data feed|technical)/i.test(lowered)) {
    return "Implementation & Adoption";
  }
  if (/(survey|signal|validation|evidence|statistics|pilot|proof|accuracy|precision)/i.test(lowered)) {
    return "Validation & Evidence";
  }
  if (/(schedule|workflow|volume|burnout|retention|workload|friction|departments?)/i.test(lowered)) {
    return "Workload & Operations";
  }
  return "General feedback";
}

function extractFallbackQuotesFromTranscript(
  transcript: string,
  classifications: Array<{
    speakerName: string;
    role: "ABUNDANT" | "COMPANY" | "MEMBER" | "UNKNOWN";
    healthSystemId: string | null | undefined;
  }>,
  maxInsights: number
) {
  const memberNames = new Set(
    classifications
      .filter((entry) => entry.role === "MEMBER" || entry.role === "UNKNOWN")
      .map((entry) => normalizePersonKey(entry.speakerName))
      .filter(Boolean)
  );
  const includeNonMembers = memberNames.size === 0;

  const lines = transcript.split(/\r?\n/);
  const scored: Array<{
    id: string;
    speaker: string;
    quote: string;
    lineNumber: number;
    type: "question" | "comment";
    sentiment: "POSITIVE" | "NEGATIVE" | "MIXED" | "NEUTRAL";
    theme: string;
    specificity: number;
    isQuestion: boolean;
  }> = [];

  const isBoilerplateLine = (line: string) => {
    const normalized = line.trim().toLowerCase();
    return (
      line.trimStart().startsWith("-") ||
      normalized.startsWith("transcript") ||
      normalized.startsWith("participants:") ||
      normalized.startsWith("grain url:") ||
      normalized.startsWith("option") ||
      normalized.startsWith("date:")
    );
  };
  for (let index = 0; index < lines.length; index++) {
    const rawLine = lines[index];
    const trimmed = cleanText(rawLine);
    if (!trimmed || isBoilerplateLine(trimmed)) continue;

    const colonIndex = trimmed.indexOf(":");
    if (colonIndex <= 0 || colonIndex > 180) continue;

    const rawSpeaker = cleanText(trimmed.slice(0, colonIndex));
    const utterance = cleanText(trimmed.slice(colonIndex + 1));
    if (!rawSpeaker || !utterance || utterance.length < 35) continue;

    const normalizedSpeaker = normalizePersonKey(rawSpeaker);
    const isLikelyMember = normalizedSpeaker
      ? Array.from(memberNames).some((memberName) => isLikelySamePersonName(normalizedSpeaker, memberName))
      : false;
    if (!includeNonMembers && !isLikelyMember) continue;

    let score = 1;
    const lowered = utterance.toLowerCase();
    const type = inferQuoteType(utterance);
    if (type === "question") {
      score += 1;
    } else {
      score += 2;
    }
    if (/(metrics|roi|cost|integration|workflow|pilot|precision|validation|evidence|adoption|go.?no.?go|timeline|false positive|noise|noise ratio|evidence|concern|stat|case study|evidence|resourcing|co.?development)/i.test(lowered)) {
      score += 2;
    }
    if (isLikelyMember) score += 1;

    const sentiment = extractTextualSentiment(utterance);
    const theme = classifyTranscriptQuoteTheme(utterance);
    scored.push({
      id: `fallback-${index + 1}`,
      speaker: rawSpeaker,
      quote: compactQuoteText(utterance, QUOTE_MAX_LENGTH),
      lineNumber: index + 1,
      type,
      sentiment,
      theme,
      specificity: Math.min(5, Math.max(1, Math.round(score))),
      isQuestion: type === "question"
    });
  }

  return scored
    .sort((a, b) => {
      const weighted = quotePriorityScore(b.type, b.specificity, b.lineNumber) - quotePriorityScore(a.type, a.specificity, a.lineNumber);
      if (weighted !== 0) return weighted;
      return b.specificity - a.specificity;
    })
    .slice(0, maxInsights)
    .map((entry) => ({
      id: entry.id,
      speaker: entry.speaker,
      quote: entry.quote,
      lineNumber: entry.lineNumber,
      type: entry.type,
      sentiment: entry.sentiment,
      theme: entry.theme,
      sentiment_rationale: `Heuristic sentiment from wording and signal terms in the quote.`,
      specificity_score: entry.specificity,
      why_selected: `Transcript fallback parser selected this ${entry.type} as a likely decision-relevant comment.`,
      isQuestion: entry.isQuestion
    }));
}

function detectCompanyCue(organization: string | null): boolean {
  const normalizedOrg = normalizeForMatch(organization || "");
  return /abundant|adalan|adalyn|adeline|tiffany|venture|capital|partner|venture partners|company/i.test(normalizedOrg);
}

function detectHealthSystemCue(organization: string | null): boolean {
  const normalizedOrganization = cleanText(organization);
  return /(health|hospital|medical|clinic|system|systems|healthcare|health center|university|children)/i.test(
    normalizedOrganization
  );
}

function safeInt(value: unknown, fallback: number) {
  return Number.isSafeInteger(value as number) ? (value as number) : fallback;
}

function safeNumber(value: unknown, fallback: number | null = null) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function buildSummary(
  mode: "participants" | "quotes",
  speakersParsed: number,
  participantsReturned: number,
  membersClassified: number,
  quotesReturned: number
) {
  return {
    mode,
    speakersParsed,
    participantsReturned,
    membersClassified,
    quotesReturned
  };
}

function buildCompanyPromptContextText(context: CompanyPromptContext): string {
  const companyName = cleanText(context.companyName) || "Unknown Company";
  const contacts = context.knownContacts
    .slice(0, 30)
    .map((contact, index) => {
      const name = cleanText(contact.name);
      const title = cleanText(contact.title || "");
      const email = cleanText(contact.email || "");
      const tokens = [name, title, email].filter(Boolean);
      return `${index + 1}. ${tokens.join(" | ")}`;
    })
    .filter(Boolean)
    .join("\n");

  return (
    `Official company under review: ${companyName}\n` +
    "Known company-side contacts (presenters/employees; not health-system members unless explicitly stated):\n" +
    `${contacts || "None provided."}\n` +
    "Transcript text may misspell names (example: Atalan vs Adalan). Prefer the official company name and known contacts for company identification."
  );
}

function getKnownCompanySpeakerNamesFromContext(
  context: CompanyPromptContext,
  rosterNames: string[]
): string[] {
  const roster = rosterNames.map((entry) => normalizeForDisplay(entry)).filter(Boolean);
  if (!roster.length) return [];

  const names = new Set<string>();
  for (const contact of context.knownContacts) {
    const contactName = normalizeForDisplay(contact.name);
    if (!contactName) continue;
    for (const rosterName of roster) {
      const exactLike = isLikelySamePersonName(rosterName, contactName);
      const firstNameAlias =
        tokenizeForMatch(rosterName).length === 1 &&
        tokenizeForMatch(contactName).length >= 2 &&
        tokenizeForMatch(rosterName)[0] === tokenizeForMatch(contactName)[0];
      if (exactLike || firstNameAlias) {
        names.add(contactName);
        break;
      }
    }
  }

  return Array.from(names);
}

type ParticipantExtractionPerson = {
  display_name: string;
  raw_mentions: string[];
  email: string | null;
  organization: string | null;
  title: string | null;
  role_in_meeting: (typeof participantRoleEnum)[number];
  confidence: (typeof confidenceEnum)[number];
  notes: string;
};

type ExtractedParticipantsResult = {
  meeting_id: string;
  people: ParticipantExtractionPerson[];
  counts: {
    unique_people: number;
    listed_in_participants_line: number;
    spoke_in_transcript: number;
    mentioned_only: number;
  };
};

function normalizeParticipantExtraction(raw: unknown): ParticipantExtractionPerson[] {
  if (!raw || typeof raw !== "object") return [];

  const casted = raw as Record<string, unknown>;
  if (!Array.isArray(casted.people)) return [];

  return casted.people
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const person = entry as Record<string, unknown>;

      const displayName = cleanText(person.display_name);
      if (!displayName) return null;

      const roleInMeeting = cleanText(person.role_in_meeting) as (typeof participantRoleEnum)[number];
      const confidence = cleanText(person.confidence) as (typeof confidenceEnum)[number];

      if (!participantRoleEnum.includes(roleInMeeting)) return null;
      if (!confidenceEnum.includes(confidence)) return null;

      const rawMentions = Array.isArray(person.raw_mentions)
        ? person.raw_mentions
            .map((entry) => cleanText(entry))
            .filter((entry): entry is string => entry.length > 0)
        : [];

      return {
        display_name: displayName,
        raw_mentions: rawMentions,
        email: sanitizeNullableText(person.email),
        organization: sanitizeNullableText(person.organization),
        title: sanitizeNullableText(person.title),
        role_in_meeting: roleInMeeting,
        confidence,
        notes: cleanText(person.notes)
      };
    })
    .filter((entry): entry is ParticipantExtractionPerson => entry !== null);
}

function dedupePeople(people: ParticipantExtractionPerson[]): ParticipantExtractionPerson[] {
  const byKey = new Map<string, ParticipantExtractionPerson>();

  for (const person of people) {
    const key = normalizePersonKey(person.display_name);
    if (!key) continue;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...person, raw_mentions: [...person.raw_mentions] });
      continue;
    }

    const mergedMentions = new Set<string>(existing.raw_mentions);
    for (const mention of person.raw_mentions) {
      if (mention) {
        mergedMentions.add(mention);
      }
    }
    existing.raw_mentions = Array.from(mergedMentions);

    if (!existing.email && person.email) existing.email = person.email;
    if (!existing.organization && person.organization) existing.organization = person.organization;
    if (!existing.title && person.title) existing.title = person.title;
    if (person.notes && !existing.notes.includes(person.notes)) {
      existing.notes = `${existing.notes ? `${existing.notes}; ` : ""}${person.notes}`.trim();
    }
  }

  return Array.from(byKey.values());
}

function inferCountsFromPeople(people: ParticipantExtractionPerson[]) {
  const unique = people.length;
  let listedInParticipants = 0;
  let spokeInTranscript = 0;
  let mentionedOnly = 0;

  for (const person of people) {
    if (person.role_in_meeting === "participant_listed" || person.role_in_meeting === "both") {
      listedInParticipants += 1;
    }

    if (person.role_in_meeting === "speaker" || person.role_in_meeting === "both") {
      spokeInTranscript += 1;
    }

    if (person.role_in_meeting === "mentioned_only") {
      mentionedOnly += 1;
    }
  }

  return {
    unique_people: unique,
    listed_in_participants_line: listedInParticipants,
    spoke_in_transcript: spokeInTranscript,
    mentioned_only: mentionedOnly
  };
}

function normalizeExtractionPayload(parsed: unknown): ExtractedParticipantsResult {
  if (!parsed || typeof parsed !== "object") {
    return {
      meeting_id: "transcript_extract",
      people: [],
      counts: {
        unique_people: 0,
        listed_in_participants_line: 0,
        spoke_in_transcript: 0,
        mentioned_only: 0
      }
    };
  }

  const rawResult = parsed as {
    meeting_id?: unknown;
    people?: unknown;
    counts?: {
      unique_people?: unknown;
      listed_in_participants_line?: unknown;
      spoke_in_transcript?: unknown;
      mentioned_only?: unknown;
    };
  };

  const deduped = dedupePeople(normalizeParticipantExtraction(rawResult));

  const countsFromModel =
    rawResult.counts && typeof rawResult.counts === "object"
      ? {
          unique_people: safeInt((rawResult.counts as Record<string, unknown>).unique_people, deduped.length),
          listed_in_participants_line: safeInt(
            (rawResult.counts as Record<string, unknown>).listed_in_participants_line,
            0
          ),
          spoke_in_transcript: safeInt(
            (rawResult.counts as Record<string, unknown>).spoke_in_transcript,
            0
          ),
          mentioned_only: safeInt((rawResult.counts as Record<string, unknown>).mentioned_only, 0)
        }
      : inferCountsFromPeople(deduped);

  return {
    meeting_id: cleanText(rawResult.meeting_id) || "transcript_extract",
    people: deduped,
    counts: {
      unique_people: countsFromModel.unique_people || deduped.length,
      listed_in_participants_line: countsFromModel.listed_in_participants_line,
      spoke_in_transcript: countsFromModel.spoke_in_transcript,
      mentioned_only: countsFromModel.mentioned_only
    }
  };
}

function getFallbackAbundantRoster(): AbundantRosterEntry[] {
  return [
    { name: "Hanna Helms", source: "fallback" },
    { name: "Todd Johnson", source: "fallback" },
    { name: "Amanda Demano", source: "fallback" },
    { name: "Amanda DeMano", source: "fallback" },
    { name: "Katie Edge", source: "fallback" }
  ];
}

function parseRosterFromHtml(html: string): string[] {
  const collected = new Set<string>();

  const jsonLdMatches = html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const match of jsonLdMatches) {
    const jsonBlob = (match[1] || "").trim();
    if (!jsonBlob) continue;

    try {
      const parsed = JSON.parse(jsonBlob);
      const queue: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of queue) {
        if (!item || typeof item !== "object") continue;
        const cast = item as Record<string, unknown>;
        const pushPerson = (name?: string) => {
          const normalized = cleanText(name);
          if (normalized && normalized.includes(" ")) {
            collected.add(normalizeForDisplay(normalized));
          }
        };

        if (cast["@type"] === "Person" && typeof cast.name === "string") {
          pushPerson(cast.name);
        }

        const graph = cast["@graph"];
        if (Array.isArray(graph)) {
          for (const child of graph) {
            if (!child || typeof child !== "object") continue;
            const castChild = child as Record<string, unknown>;
            if (castChild["@type"] === "Person" && typeof castChild.name === "string") {
              pushPerson(castChild.name);
            }
          }
        }
      }
    } catch {}
  }

  const nameMatches = html.matchAll(/"name"\s*:\s*"([^"]{3,80})"/g);
  for (const match of nameMatches) {
    const candidate = cleanText(match[1]);
    if (!candidate || candidate.length < 5) continue;
    if (candidate === "Abundant Venture Partners") continue;
    if (candidate.toLowerCase().includes("abundant")) continue;
    const words = candidate.split(/\s+/);
    if (words.length <= 6 && words.every((entry) => /^[A-Za-z .'-]+$/.test(entry))) {
      collected.add(normalizeForDisplay(candidate));
    }
  }

  return Array.from(collected).sort();
}

async function getAbundantTeamRoster(): Promise<AbundantRosterEntry[]> {
  const now = Date.now();
  if (abundantRosterCache && now - abundantRosterCache.updatedAt < ABUNDANT_ROSTER_TTL_MS) {
    return abundantRosterCache.names.map((name) => ({ name, source: "about-page" as const }));
  }

  try {
    const response = await fetch(ABUNDANT_ABOUT_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`About page returned ${response.status}`);
    }

    const html = await response.text();
    const names = parseRosterFromHtml(html);
    if (names.length > 0) {
      abundantRosterCache = {
        updatedAt: now,
        names
      };
      return names.map((name) => ({ name, source: "about-page" as const }));
    }
  } catch (error) {
    console.error("transcript_member_insights_roster_fetch_error", error);
  }

  const fallback = getFallbackAbundantRoster();
  const uniqueFallback = Array.from(
    new Map(fallback.map((entry) => [normalizePersonKey(entry.name), entry])).values()
  );
  abundantRosterCache = {
    updatedAt: now,
    names: uniqueFallback.map((entry) => entry.name)
  };
  return uniqueFallback;
}

function buildAbundantAliasMap(roster: AbundantRosterEntry[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const entry of roster) {
    map.set(normalizePersonKey(entry.name), entry.name);
  }

  for (const entry of ABUNDANT_IDENTITY_HINTS) {
    for (const alias of entry.aliases) {
      const normalizedAlias = normalizePersonKey(alias);
      if (!normalizedAlias) continue;
      map.set(normalizedAlias, entry.canonical);
    }
  }

  return map;
}

function inferAbundantMatch(
  person: ParticipantExtractionPerson,
  aliasMap: Map<string, string>
): string | null {
  const nameKey = normalizePersonKey(person.display_name);
  if (nameKey && aliasMap.has(nameKey)) return normalizeForDisplay(aliasMap.get(nameKey) || person.display_name);

  for (const mention of person.raw_mentions) {
    const mentionKey = normalizePersonKey(mention);
    if (!mentionKey) continue;
    if (aliasMap.has(mentionKey)) return normalizeForDisplay(aliasMap.get(mentionKey) || person.display_name);
  }

  return null;
}

function applyAbundantCanonicalization(
  person: ParticipantExtractionPerson,
  aliasMap: Map<string, string>
): ParticipantExtractionPerson {
  const nameKey = normalizePersonKey(person.display_name);
  const canonical = nameKey && aliasMap.has(nameKey) ? aliasMap.get(nameKey) : null;

  if (!canonical) return person;
  const canonicalNormalized = normalizeForDisplay(canonical);
  const merged = new Set<string>(person.raw_mentions);
  merged.add(person.display_name);
  merged.add(canonicalNormalized);

  return {
    ...person,
    display_name: canonicalNormalized,
    raw_mentions: Array.from(merged).filter((entry) => Boolean(entry))
  };
}

async function loadMatchingCandidates(
  companyId: string,
  people: ParticipantExtractionPerson[],
  healthSystems: AllianceHealthSystem[]
) {
  const healthSystemIds = Array.from(new Set(healthSystems.map((entry) => entry.id)));
  const emailTokens = Array.from(
    new Set(
      people.flatMap((person) => extractPersonNameHints(person).flatMap((value) => extractEmailsFromText(value)))
    )
  );

  const whereOr: Array<Prisma.ContactWhereInput> = [];
  if (healthSystemIds.length > 0) {
    whereOr.push({
      healthSystemLinks: {
        some: {
          healthSystemId: { in: healthSystemIds }
        }
      }
    });
  }

  whereOr.push({
    companyLinks: {
      some: { companyId }
    }
  });

  if (emailTokens.length > 0) {
    whereOr.push({
      email: {
        in: emailTokens
      }
    });
  }

  const personNameHints = Array.from(
    new Set(
      people.flatMap((person) => extractPersonNameHints(person)).map((entry) => normalizeForMatch(entry)).filter(Boolean)
    )
  )
    .filter((entry) => entry.length >= 4 && entry.includes(" "))
    .slice(0, 30);

  for (const hint of personNameHints) {
    if (hint.length >= 4) {
      whereOr.push({
        name: { contains: hint, mode: "insensitive" }
      });
    }
  }

  const candidates = await prisma.contact.findMany({
    where: {
      OR: whereOr.length > 0 ? whereOr : undefined
    },
    select: {
      id: true,
      name: true,
      title: true,
      email: true,
      healthSystemLinks: {
        select: {
          healthSystemId: true,
          healthSystem: {
            select: {
              id: true,
              name: true,
              isAllianceMember: true
            }
          }
        }
      },
      companyLinks: {
        select: {
          companyId: true
        }
      }
    },
    take: 500
  });

  return candidates;
}

async function loadCompanyPromptContacts(companyId: string): Promise<CompanyPromptContact[]> {
  const contacts = await prisma.contact.findMany({
    where: {
      companyLinks: {
        some: { companyId }
      }
    },
    select: {
      name: true,
      title: true,
      email: true
    },
    orderBy: {
      name: "asc"
    },
    take: 120
  });

  const deduped = new Map<string, CompanyPromptContact>();
  for (const contact of contacts) {
    const key = normalizePersonKey(contact.name || contact.email || "");
    if (!key) continue;
    if (!deduped.has(key)) {
      deduped.set(key, {
        name: cleanText(contact.name),
        title: sanitizeNullableText(contact.title),
        email: sanitizeNullableText(contact.email)
      });
    }
  }

  return Array.from(deduped.values())
    .filter((entry) => Boolean(entry.name))
    .slice(0, 80);
}

function inferParticipantMatch(
  person: ParticipantExtractionPerson,
  aliasMap: Map<string, string>,
  company: CompanyRecord,
  companyContext: CompanyPromptContext,
  healthSystems: AllianceHealthSystem[],
  candidates: ContactRecord[],
  speakerLineCounts: Map<string, number>
): ParticipantMatch {
  const canonicalName = inferAbundantMatch(person, aliasMap);
  const organization = sanitizeNullableText(person.organization);
  const normalizedPersonKey = normalizePersonKey(person.display_name);
  const speakerTurnSignal = normalizedPersonKey ? speakerLineCounts.get(normalizedPersonKey) || 0 : 0;
  const participantMentionSignal = Math.max(person.raw_mentions.length, speakerTurnSignal);
  const likelyFrequentSpeaker = participantMentionSignal >= COMPANY_SPEAKER_SIGNAL_MIN;
  const isHighTurnSpeaker = speakerTurnSignal >= MIN_COMPANY_TURN_THRESHOLD;
  const isLowTurnSpeaker = speakerTurnSignal > 0 && speakerTurnSignal < MIN_COMPANY_TURN_THRESHOLD;
  const hasCompanyCueInTranscriptOrg = Boolean(organization && detectCompanyCue(organization));
  const hasHealthSystemOrganizationCue = detectHealthSystemCue(organization);
  const byOrganization = pickBestMatchedHealthSystem(organization, healthSystems);
  const hasStrongHealthSystemSignal = Boolean(
    byOrganization && !byOrganization.ambiguous && byOrganization.score >= MEMBERSHIP_MATCH_THRESHOLD
  );

  const hints = extractPersonNameHints(person);
  const emails = Array.from(new Set(hints.flatMap((entry) => extractEmailsFromText(entry))));
  const emailSet = new Set(emails);
  const normalizedTitle = normalizeForMatch(person.title || "");

  if (canonicalName) {
    return {
      speakerName: canonicalName,
      role: "ABUNDANT",
      healthSystemId: "",
      confidence: "high",
      source: "abundant-identity"
    };
  }

  const matchedKnownCompanyContact = companyContext.knownContacts.find((contact) => {
    const contactEmail = sanitizeNullableText(contact.email)?.toLowerCase();
    if (contactEmail && emailSet.has(contactEmail)) return true;

    const fullNameMatch = hints.some((hint) => matchNameToRecord(hint, contact.name) >= 0.9);
    if (fullNameMatch) return true;

    const firstNameAlias = hints.some((hint) => {
      const hintTokens = tokenizeForMatch(hint);
      const contactTokens = tokenizeForMatch(contact.name);
      if (hintTokens.length !== 1 || contactTokens.length < 2) return false;
      return hintTokens[0] === contactTokens[0];
    });
    return firstNameAlias && likelyFrequentSpeaker;
  });

  if (matchedKnownCompanyContact && !hasStrongHealthSystemSignal) {
    return {
      speakerName: person.display_name,
      role: "COMPANY",
      healthSystemId: "",
      confidence: "high",
      source: "company"
    };
  }

  if (
    (normalizedTitle.includes("ceo") || normalizedTitle.includes("co founder") || normalizedTitle.includes("cofounder")) &&
    (hasCompanyCueInTranscriptOrg || likelyFrequentSpeaker) &&
    !hasStrongHealthSystemSignal
  ) {
    return {
      speakerName: person.display_name,
      role: "COMPANY",
      healthSystemId: "",
      confidence: "medium",
      source: "company"
    };
  }

  let bestMatch: ContactMatch | null = null;
  let memberMatch: ContactMatch | null = null;
  let companyMatch: ContactMatch | null = null;

  for (const candidate of candidates) {
    let score = 0;
    let strategy: ContactMatch["strategy"] = "name";

    const candidateEmail = sanitizeNullableText(candidate.email)?.toLowerCase();
    if (candidateEmail && emailSet.has(candidateEmail)) {
      score = 0.99;
      strategy = "email";
    } else {
      for (const hint of hints) {
        const current = matchNameToRecord(hint, candidate.name);
        if (current > score) {
          score = current;
        }
      }
    }

    const isCompanyMatch = candidate.companyLinks.some((entry) => entry.companyId === company.id);
    if (isCompanyMatch) {
      const companyMatchScore =
        score >= COMPANY_CANDIDATE_MATCH_THRESHOLD ||
        strategy === "email" ||
        (hasCompanyCueInTranscriptOrg && score >= COMPANY_ORG_SIGNAL_MIN);

      if (companyMatchScore && (strategy === "email" || likelyFrequentSpeaker)) {
        companyMatch = companyMatch
          ? score > companyMatch.score
            ? { contact: candidate, score, strategy }
            : companyMatch
          : { contact: candidate, score, strategy };
      }
    }

    const memberLinks = candidate.healthSystemLinks.filter((entry) => entry.healthSystem.isAllianceMember);
    if (memberLinks.length > 0 && score >= 0.8) {
      if (!memberMatch || score > memberMatch.score) {
        memberMatch = { contact: candidate, score, strategy };
      }

      continue;
    }

    if (score > 0.9 && !bestMatch) {
      bestMatch = {
        contact: candidate,
        score,
        strategy
      };
    } else if (bestMatch && score > bestMatch.score && score >= 0.8) {
      bestMatch = {
        contact: candidate,
        score,
        strategy
      };
    }
  }

  if (memberMatch && memberMatch.score >= 0.83) {
    return {
      speakerName: person.display_name,
      role: "MEMBER",
      healthSystemId: memberMatch.contact.healthSystemLinks.find((entry) => entry.healthSystem.isAllianceMember)?.healthSystemId || "",
      confidence: memberMatch.score >= 0.9 ? "high" : "medium",
      source: "contact-fuzzy"
    };
  }

  if (companyMatch && bestMatch && bestMatch.contact.id !== companyMatch.contact.id) {
    companyMatch = null;
  }

  if (
    byOrganization &&
    !byOrganization.ambiguous &&
    byOrganization.score >= 0.74 &&
    !isHighTurnSpeaker
  ) {
    return {
      speakerName: person.display_name,
      role: "MEMBER",
      healthSystemId: byOrganization.healthSystemId,
      confidence: byOrganization.score >= 0.9 ? "high" : "medium",
      source: "org-fuzzy"
    };
  }

  if (
    bestMatch &&
    detectCompanyMatchText(organization, company.name) &&
    hasCompanyCueInTranscriptOrg &&
    !hasStrongHealthSystemSignal &&
    !hasHealthSystemOrganizationCue &&
    isHighTurnSpeaker
  ) {
    return {
      speakerName: person.display_name,
      role: "COMPANY",
      healthSystemId: "",
      confidence: bestMatch.score >= 0.9 ? "high" : "medium",
      source: "company"
    };
  }

  if (
    companyMatch &&
    likelyFrequentSpeaker &&
    !hasStrongHealthSystemSignal &&
    !hasHealthSystemOrganizationCue &&
    (bestMatch ? bestMatch.score >= COMPANY_ORG_SIGNAL_MIN || bestMatch.strategy === "email" : true)
  ) {
    return {
      speakerName: person.display_name,
      role: "COMPANY",
      healthSystemId: "",
      confidence: companyMatch.score >= 0.96 ? "high" : "medium",
      source: "company"
    };
  }

  if (organization && !hasStrongHealthSystemSignal && hasCompanyCueInTranscriptOrg && isHighTurnSpeaker && !byOrganization) {
    return {
      speakerName: person.display_name,
      role: "COMPANY",
      healthSystemId: "",
      confidence: bestMatch ? (bestMatch.score >= 0.9 ? "high" : "medium") : "low",
      source: "company"
    };
  }

  if (
    organization &&
    hasHealthSystemOrganizationCue &&
    byOrganization &&
    !byOrganization.ambiguous &&
    !isHighTurnSpeaker
  ) {
    return {
      speakerName: person.display_name,
      role: "MEMBER",
      healthSystemId: byOrganization.healthSystemId,
      confidence: byOrganization.score >= 0.8 ? "medium" : "low",
      source: "org-fuzzy"
    };
  }

  if (!organization && isLowTurnSpeaker && byOrganization && !byOrganization.ambiguous && byOrganization.score >= 0.78) {
    return {
      speakerName: person.display_name,
      role: "MEMBER",
      healthSystemId: byOrganization.healthSystemId,
      confidence: byOrganization.score >= 0.86 ? "medium" : "low",
      source: "org-fuzzy"
    };
  }

  return {
    speakerName: person.display_name,
    role: !organization && isLowTurnSpeaker ? "MEMBER" : organization ? "MEMBER" : "UNKNOWN",
    healthSystemId: "",
    confidence: "low",
    source: bestMatch ? "contact-fuzzy" : "manual"
  };
}

async function extractParticipantsWithAI(transcript: string, companyContext: CompanyPromptContext) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const abundantRoster = await getAbundantTeamRoster();
  const knownNames = abundantRoster.length ? abundantRoster.map((entry) => entry.name).slice(0, 25).join(", ") : "Not available";
  const companyContextText = buildCompanyPromptContextText(companyContext);
  const participantTranscript = sanitizeTranscriptForAnalysis(transcript, {
    speakerNamesToStrip: abundantRoster.map((entry) => entry.name),
    preserveParticipantsLine: true,
    dropLinesBeforeFirstStrippedSpeaker: true
  });

  const model = process.env.OPENAI_AGENT_MODEL || process.env.OPENAI_MODEL || process.env.OPENAI_SEARCH_MODEL || "gpt-4.1-mini";

  const systemPrompt =
    "You are an information extraction assistant and digital health expert. Your job is to extract people from a meeting transcript accurately and conservatively. " +
    "Do not invent facts. Prefer exact text spans from the transcript.\n\n" +
    "Task: Identify every unique human participant mentioned as a participant or speaker.\n" +
    "Include names from the Participants line and from speaker labels.\n" +
    "Also include participants mentioned in-line if they clearly refer to a person present; otherwise do not include.\n\n" +
    "Handle formats like 'Last, First', credentials (MD/M.D.), handles/usernames, and emails.\n" +
    "Do not invent orgs/titles. If unclear, set null. Correct obvious transcript misspellings for known company or health-system names when confidence is high.\n" +
    `Known Abundant Venture Partners names (for canonicalization): ${knownNames}.\n` +
    "If a participant is a known Abundant person and only a first name/handle appears in transcript, prefer the canonical full name when confident.";

  const userPrompt =
    `${companyContextText}\n\n` +
    `Transcript:\n${extractTranscriptSummary(participantTranscript)}\n\n` +
    "Output JSON with fields: meeting_id, people, counts.\n" +
    "Each person should include: display_name, raw_mentions, email, organization, title, role_in_meeting, confidence, notes.\n" +
    "role_in_meeting enum: speaker, participant_listed, both, mentioned_only.\n" +
    "confidence enum: high | medium | low.\n" +
    "Conservatively deduplicate aliases like 'Koch, Amanda' and 'Amanda Koch'.\n" +
    "If any uncertainty exists, mark confidence lower rather than guessing.";

  const response = await client.responses.create({
    model,
    text: {
      format: {
        type: "json_schema",
        name: "meeting_participants",
        schema: participantExtractionSchema,
        strict: false
      }
    },
    input: [
      { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
      { role: "user", content: [{ type: "input_text", text: userPrompt }] }
    ]
    } as any);

  const rawOutput = response.output_text || "";
  const parsed = extractJsonPayload(rawOutput);
  const normalized = normalizeExtractionPayload(parsed);
  const fallbackPeople = normalized.people.length === 0 ? buildFallbackParticipantsFromTranscript(participantTranscript) : [];

  const participantSource =
    normalized.people.length > 0 ? normalized.people : fallbackPeople;
  const roster = await getAbundantTeamRoster();
  const aliasMap = buildAbundantAliasMap(roster);

  const canonicalPeople = dedupePeople(participantSource.map((person) => applyAbundantCanonicalization(person, aliasMap)));

  return {
    ...normalized,
    counts: normalized.counts.unique_people > 0
      ? normalized.counts
      : {
          ...normalized.counts,
          unique_people: canonicalPeople.length,
          listed_in_participants_line: canonicalPeople.length,
          spoke_in_transcript: canonicalPeople.length,
          mentioned_only: 0
        },
    people: canonicalPeople
  };
}

async function extractMemberQuotesWithAI(
  transcript: string,
  maxInsights: number,
  participantClassifications: Array<{
    speakerName: string;
    role: "ABUNDANT" | "COMPANY" | "MEMBER" | "UNKNOWN";
    healthSystemId: string | null | undefined;
  }>,
  healthSystemNameById: Map<string, string>,
  companyContext: CompanyPromptContext
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const nonAbundantCandidates = participantClassifications.filter((entry) => entry.role !== "ABUNDANT");
  const explicitMemberCandidates = participantClassifications.filter((entry) => entry.role === "MEMBER");
  const unknownCandidates = participantClassifications.filter((entry) => entry.role === "UNKNOWN");
  const memberLikeCandidates = participantClassifications.filter(
    (entry) => entry.role === "MEMBER" || entry.role === "UNKNOWN"
  );
  const likelyMisclassifiedMembers =
    nonAbundantCandidates.length >= 5 && memberLikeCandidates.length <= 2;
  const memberClassifications = likelyMisclassifiedMembers
    ? nonAbundantCandidates
    : memberLikeCandidates.length > 0
      ? memberLikeCandidates
      : nonAbundantCandidates;
  const extractionMode = likelyMisclassifiedMembers
    ? "best-effort-misclassification-guard"
    : memberLikeCandidates.length > 0
      ? "member-focused"
      : "best-effort";
  const noMemberCandidatesWarning =
    explicitMemberCandidates.length === 0
      ? ["No explicit MEMBER participants were classified; using best-effort extraction for all non-Abundant speakers."]
      : likelyMisclassifiedMembers
        ? [
            `Detected likely misclassification (members=${explicitMemberCandidates.length}, unknown=${unknownCandidates.length}, non-abundant=${nonAbundantCandidates.length}); using best-effort extraction over all non-Abundant speakers.`
          ]
        : [];

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model =
    process.env.OPENAI_QUOTE_MODEL ||
    process.env.OPENAI_AGENT_MODEL ||
    process.env.OPENAI_MODEL ||
    process.env.OPENAI_SEARCH_MODEL ||
    "gpt-4.1-mini";
  const abundantRoster = await getAbundantTeamRoster();
  const companyContextText = buildCompanyPromptContextText(companyContext);
  const classificationSpeakerCounts = buildSpeakerLineCountsFromClassifications(
    transcript,
    participantClassifications
  );
  const knownCompanySpeakers = getKnownCompanySpeakerNamesFromContext(
    companyContext,
    participantClassifications.map((entry) => entry.speakerName)
  );
  const companySpeakersFromRoles = participantClassifications
    .filter((entry) => entry.role === "COMPANY")
    .map((entry) => entry.speakerName);
  const companySpeakerNames = Array.from(new Set([...companySpeakersFromRoles, ...knownCompanySpeakers]));
  const allSpeakerNames = Array.from(
    new Set([
      ...participantClassifications.map((entry) => entry.speakerName),
      ...knownCompanySpeakers
    ])
  );
  const postCompanySegment = truncateTranscriptAfterLastCompanySpeakerBlock(transcript, {
    companySpeakerNames,
    allSpeakerNames
  });

  const companyTruncationDebug = {
    enabled: postCompanySegment.companyBlockFound,
    lastCompanySpeaker: postCompanySegment.lastCompanySpeaker,
    lastCompanyLineIndex: postCompanySegment.lastCompanyLineIndex,
    totalLineCount: postCompanySegment.totalLineCount,
    keptLineCount: postCompanySegment.keptLineCount
  };

  const transcriptForQuoteWork = postCompanySegment.transcript;
  const quoteTranscript = sanitizeTranscriptForAnalysis(transcriptForQuoteWork, {
    speakerNamesToStrip: buildTranscriptStripCandidates(
      participantClassifications,
      abundantRoster.map((entry) => entry.name),
      classificationSpeakerCounts
    ),
    preserveParticipantsLine: false,
    dropLinesBeforeFirstStrippedSpeaker: true
  });

  const speakerRoster = participantClassifications
    .map((entry, index) => {
      const organization = entry.healthSystemId
        ? healthSystemNameById.get(entry.healthSystemId) || "unassigned"
        : "unassigned";
      return `${index + 1}. ${normalizeForDisplay(entry.speakerName)} | role=${entry.role} | org=${organization}`;
    })
    .join("\n");

  async function requestQuotes(isRetry = false) {
    const retryInstruction = isRetry
      ? "Second pass: role tags are unreliable. Focus on transcript speaker behavior and context to identify which lines are health-system feedback, regardless of roster role labels.\n"
      : "";
    return client.responses.create({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "member_quotes",
          schema: quoteExtractionSchema,
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
                "You are an information extraction assistant and digital health expert. You extract verbatim quotes and structured insights from meeting transcripts. Do not invent content or attributes.\n\n" +
                "Task:\n" +
              retryInstruction +
              `${companyContextText}\n\n` +
              "A) Use the roster to identify health system participants (exclude vendor presenters and host/firm staff unless the roster marks them as health system participants).\n" +
                "If extractionMode is best-effort, treat roster roles as hints only and still extract from likely member-facing speakers even when roles are unknown or COMPANY.\n" +
                "If speaker cannot be confidently matched to roster, still include the quote with the raw speaker label.\n" +
                "B) Extract the top 15 most specific and meaningful questions or comments that evaluate the solution/company being presented.\n" +
                "C) Create themes derived from the transcript (not a predefined list). Generate 5-8 themes with short names + one-sentence definitions.\n" +
                "D) For each extracted quote, output fields (exact JSON keys): speaker (canonical), speaker_org, type, quote, sentiment, sentiment_rationale, theme, specificity_score, why_selected.\n\n" +
                "If a quote is long, return only the most salient clause(s), preserving exact wording, and use ellipses (...) for skipped text.\n" +
                "Selection rules for top quotes:\n" +
                "- prioritize specific evidence requests, decision-value concerns, operational constraints, signal/noise tradeoffs, and false-positive/precision concerns\n" +
                "- prioritize comments over questions when both have similar specificity and decision value\n" +
                "- avoid duplicate near-identical comments\n" +
                "- spread across speakers where possible\n" +
                `Return a JSON object with fields themes, quotes, warnings. Limit output to at most ${Math.min(maxInsights, 15)} quotes.\n` +
                "Sentiment must be POSITIVE, MIXED, NEUTRAL, or NEGATIVE.\n" +
                "Theme should be one of the generated theme names."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `${companyContextText}\n\n` +
                `Transcript:\n${extractTranscriptSummary(quoteTranscript)}\n\n` +
                "Participant roster (name | role | org):\n" +
                speakerRoster +
                `\nExtractionMode: ${extractionMode}\n` +
                `\nPost-company segment detected: ${postCompanySegment.companyBlockFound ? "yes" : "no"}\n` +
                "\nFor each selected quote, return JSON keys: speaker, speaker_org, type, quote, sentiment, sentiment_rationale, theme, specificity_score, why_selected, id, excerpt.\n" +
                "Keep each quote concise; if longer than about 260 characters, return a decision-relevant excerpt with ellipses.\n" +
                "Optionally include isQuestion, lineNumber, timestampSeconds, timestampLabel, and excerpt if available.\n"
            }
          ]
        }
      ]
    } as any);
  }

  async function requestQuotesFromFallbackHints() {
    const hints = buildFallbackQuoteHints(quoteTranscript, memberClassifications);
    if (!hints.length) return null;

    const hintsPayload = hints
      .map((entry, index) => `${index + 1}. ${entry.speaker} (line ${entry.lineNumber}): ${entry.quote}`)
      .join("\n");

    const response = await client.responses.create({
      model,
      text: {
        format: {
          type: "json_schema",
          name: "member_quotes_fallback",
          schema: quoteExtractionSchema,
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
                "You are an information extraction assistant. Your task is to select top 15 meaningful member-facing comments from the provided candidate snippets and assign sentiment and themes. " +
                "For long snippets, return a concise, decision-relevant excerpt using exact wording and ellipses (...) where truncated. " +
                "If speaker roles are unknown, still include the quoted speaker and preserve exact wording."
            }
          ]
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                `Candidate snippets:\n${hintsPayload}\n` +
                `Select the top ${Math.min(maxInsights, 15)} entries and return JSON with keys themes, quotes, warnings only.\n` +
                "For each quote, return speaker, speaker_org (if known), type (question|comment), quote, sentiment, sentiment_rationale, theme, specificity_score, why_selected, id.\n" +
                "You can include lineNumber, isQuestion, and excerpt if helpful."
            }
          ]
        }
      ]
    } as any);

    const fallbackOutput = response.output_text || "";
    return {
      output: fallbackOutput,
      parsed: extractJsonPayload(fallbackOutput)
    };
  }

  let response = await requestQuotes();
  let usedFallbackRetry = false;
  let rawOutput = response.output_text || "";
  let parsed = extractJsonPayload(rawOutput);
  const extractRawQuotes = (payload: Record<string, unknown>): unknown[] => {
    if (Array.isArray(payload.quotes)) return payload.quotes as unknown[];
    if (Array.isArray(payload.items)) return payload.items as unknown[];
    return [];
  };
  let rawQuotes = extractRawQuotes(parsed);
  let rawThemes = Array.isArray((parsed as Record<string, unknown>).themes)
    ? ((parsed as { themes: unknown[] }).themes as unknown[])
    : [];
  let warnings = Array.isArray((parsed as Record<string, unknown>).warnings)
    ? ((parsed as { warnings: unknown[] }).warnings as unknown[])
        .map((entry) => cleanText(entry))
        .filter((entry): entry is string => Boolean(entry))
    : [];

  if (rawQuotes.length === 0) {
    usedFallbackRetry = true;
    response = await requestQuotes(true);
    rawOutput = response.output_text || "";
    parsed = extractJsonPayload(rawOutput);
    rawQuotes = extractRawQuotes(parsed);
    rawThemes = Array.isArray((parsed as Record<string, unknown>).themes)
      ? ((parsed as { themes: unknown[] }).themes as unknown[])
      : [];
    warnings = Array.isArray((parsed as Record<string, unknown>).warnings)
      ? ((parsed as { warnings: unknown[] }).warnings as unknown[])
          .map((entry) => cleanText(entry))
          .filter((entry): entry is string => Boolean(entry))
      : [];

    if (rawQuotes.length === 0) {
      const fallbackParsed = await requestQuotesFromFallbackHints();
      if (fallbackParsed) {
        rawOutput = fallbackParsed.output || "";
        parsed = fallbackParsed.parsed;
        rawQuotes = extractRawQuotes(parsed);
        rawThemes = Array.isArray((parsed as Record<string, unknown>).themes)
          ? ((parsed as { themes: unknown[] }).themes as unknown[])
          : [];
        warnings = Array.isArray((parsed as Record<string, unknown>).warnings)
          ? ((parsed as { warnings: unknown[] }).warnings as unknown[])
              .map((entry) => cleanText(entry))
              .filter((entry): entry is string => Boolean(entry))
          : [];

        if (rawQuotes.length === 0) {
          warnings.push("Fallback extraction from transcript snippets also returned no quotes.");
        } else {
          warnings.push("First pass empty. Second pass + fallback snippet extraction returned quotes.");
        }
      } else {
        warnings.push("Fallback extraction could not be run because no suitable transcript snippets were found.");
      }
    }
  }

  if (rawQuotes.length === 0) {
    const deterministicFallback = extractFallbackQuotesFromTranscript(
      quoteTranscript,
      memberClassifications,
      Math.min(maxInsights, 15)
    );
    if (deterministicFallback.length > 0) {
      rawQuotes = deterministicFallback;
      rawThemes = [
        { name: "General feedback", definition: "General member-facing feedback and decision-relevant discussion points from transcript." },
        { name: "Workload & Operations", definition: "Comments tied to staffing workload, scheduling, and operational friction." },
        { name: "Implementation & Adoption", definition: "Feedback about rollout complexity, integration effort, and practical adoption." },
        { name: "Validation & Evidence", definition: "Questions and requests for objective proof, timing, and model accuracy." },
        { name: "ROI & Economics", definition: "Discussion related to business impact, cost, and financial outcomes." }
      ];
      warnings.push("No AI quote entries were returned. A deterministic transcript parser generated reviewable fallback quotes.");
    } else {
      warnings.push("Fallback parser also found no candidate quote lines.");
    }
  }

  const normalizedMemberIndex = memberClassifications.map((entry) => ({
    speakerName: normalizeForDisplay(entry.speakerName),
    speakerKey: normalizePersonKey(entry.speakerName),
    healthSystemId: entry.healthSystemId || ""
  }));

  const normalizedMemberMap = new Map<string, string>();
  for (const member of normalizedMemberIndex) {
    normalizedMemberMap.set(member.speakerKey, member.healthSystemId);
  }

  const normalizedByDisplayName = new Map<string, string>();
  const normalizedByDisplayNameOrg = new Map<string, string>();
  for (const member of memberClassifications) {
    const normalizedDisplay = normalizePersonKey(member.speakerName);
    if (!normalizedDisplay) continue;
    normalizedByDisplayName.set(normalizedDisplay, normalizeForDisplay(member.speakerName));
    const orgName = member.healthSystemId ? healthSystemNameById.get(member.healthSystemId) || "" : "";
    if (orgName) {
      normalizedByDisplayNameOrg.set(normalizedDisplay, orgName);
    }
  }

  const themeLabelById = new Map<string, string>();
  for (const entry of rawThemes) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const id = cleanText(raw.theme_id) || cleanText(raw.id);
    const name = cleanText(raw.name);
    if (id && name) {
      themeLabelById.set(id, name);
    }
  }

  let mappedQuotes = rawQuotes
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const quote = entry as Record<string, unknown>;

      const providedSpeakerRaw = extractTextFromObject(quote, [
        "speaker",
        "speakerName",
        "speaker_name",
        "speaker_display_name",
        "speakerNameCanonical"
      ]);
      const quotedSpeakerRaw = cleanText(
        (quote as Record<string, unknown>).speaker_raw ||
          (quote as Record<string, unknown>).speaker_alias ||
          (quote as Record<string, unknown>).name ||
          ""
      );
      const speakerRaw = providedSpeakerRaw || quotedSpeakerRaw || "Unmatched Speaker";
      const isUnmatchedSpeaker = !providedSpeakerRaw && !quotedSpeakerRaw;
      const normalizedSpeaker = normalizePersonKey(speakerRaw);

      let matchedHealthSystemId = normalizedMemberMap.get(normalizedSpeaker) || "";
      let matchedSpeaker = normalizedByDisplayName.get(normalizedSpeaker) || "";

      if (!matchedHealthSystemId) {
        for (const member of normalizedMemberIndex) {
          if (isLikelySamePersonName(speakerRaw, member.speakerName)) {
            matchedHealthSystemId = member.healthSystemId;
            if (!matchedSpeaker) {
              matchedSpeaker = member.speakerName;
            }
            break;
          }

          const score = matchNameToRecord(speakerRaw, member.speakerName);
          if (score >= 0.72) {
            matchedHealthSystemId = member.healthSystemId;
            if (!matchedSpeaker) {
              matchedSpeaker = member.speakerName;
            }
            break;
          }
        }
      }

      const quoteText = extractTextFromObject(
        quote,
        ["quote", "text", "statement", "content", "utterance", "excerpt", "body", "description", "detail", "raw_text"]
      );
      const excerptSource = cleanText(sanitizeNullableText((quote as Record<string, unknown>).excerpt) || quoteText);
      const excerpt = compactQuoteText(excerptSource, QUOTE_MAX_LENGTH);
      if (!excerpt) return null;

      const quoteTypeRaw = cleanText((quote as Record<string, unknown>).type).toLowerCase();
      const normalizedType: "question" | "comment" = quoteTypeRaw === "question" ? "question" : "comment";

      const sentiment = cleanText((quote as Record<string, unknown>).sentiment).toUpperCase();
      const validatedSentiment = SENTIMENT_VALUES.includes(sentiment as (typeof SENTIMENT_VALUES)[number])
        ? (sentiment as (typeof SENTIMENT_VALUES)[number])
        : "NEUTRAL";

      const rawTheme = cleanText((quote as Record<string, unknown>).theme) || cleanText((quote as Record<string, unknown>).theme_id);
      const theme = themeLabelById.get(rawTheme) || rawTheme || "General feedback";
      const sentimentRationale =
        cleanText((quote as Record<string, unknown>).sentiment_rationale) || "No rationale was provided by the model.";
      const whySelected = cleanText((quote as Record<string, unknown>).why_selected) || "Selected as relevant decision input.";
      const specificityRaw = Number((quote as Record<string, unknown>).specificity_score);
      const specificity_score =
        Number.isInteger(specificityRaw) && specificityRaw >= 1 && specificityRaw <= 5
          ? specificityRaw
          : 3;

      const speakerOrg =
        sanitizeNullableText((quote as Record<string, unknown>).speaker_org) ||
        (matchedSpeaker ? normalizedByDisplayNameOrg.get(normalizePersonKey(matchedSpeaker)) || "" : "") ||
        normalizedByDisplayNameOrg.get(normalizedSpeaker) ||
        "";

      const lineNumberRaw = quote.lineNumber;
      const parsedLineNumber = Number(lineNumberRaw);
      const lineNumber = Number.isSafeInteger(parsedLineNumber) ? Math.max(1, parsedLineNumber) : 0;

      return {
        id: cleanText(quote.id) || `q-${Math.random().toString(36).slice(2)}`,
        speakerName: matchedSpeaker || speakerRaw,
        speaker_org: speakerOrg,
        excerpt,
        sentiment: validatedSentiment,
        type: normalizedType,
        sentiment_rationale: sentimentRationale,
        specificity_score,
        why_selected: whySelected,
        quote: excerpt,
        theme,
        isQuestion: normalizedType === "question" || Boolean(quote.isQuestion),
        lineNumber,
        timestampSeconds: safeNumber(quote.timestampSeconds),
        timestampLabel: sanitizeNullableText(quote.timestampLabel),
        healthSystemId: isUnmatchedSpeaker ? "" : matchedHealthSystemId
      } as TranscriptQuote;
    })
    .filter((entry): entry is TranscriptQuote => entry !== null)
    .sort((a, b) => {
      const weighted =
        quotePriorityScore(b.type, b.specificity_score, b.lineNumber) -
        quotePriorityScore(a.type, a.specificity_score, a.lineNumber);
      if (weighted !== 0) return weighted;
      return b.specificity_score - a.specificity_score;
    })
    .slice(0, maxInsights);

  if (mappedQuotes.length === 0 && transcript && rawQuotes.length > 0) {
    const deterministicFallback = extractFallbackQuotesFromTranscript(
      quoteTranscript,
      memberClassifications,
      Math.min(maxInsights, 15)
    );
    if (deterministicFallback.length > 0) {
      mappedQuotes = deterministicFallback.map<TranscriptQuote>((entry) => ({
        id: entry.id,
        speakerName: entry.speaker,
        speaker_org: "",
        excerpt: entry.quote,
        sentiment: entry.sentiment,
        type: entry.type,
        sentiment_rationale: "Fallback quote generated from transcript text.",
        specificity_score: Math.max(1, Math.min(5, entry.specificity_score)),
        why_selected: "Deterministic fallback snippet extraction used for review.",
        quote: entry.quote,
        theme: entry.theme || "General feedback",
        isQuestion: entry.isQuestion,
        lineNumber: entry.lineNumber,
        timestampSeconds: null,
        timestampLabel: null,
        healthSystemId: ""
      }));
      warnings.push("AI quote output could not be parsed/merged. Deterministic parser produced reviewable fallback quotes.");
    }
  }

  const normalizedThemes = rawThemes
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const name = cleanText(item.name);
      const definition = cleanText(item.definition);
      if (!name || !definition) return null;
      return { name, definition };
    })
    .filter((entry): entry is { name: string; definition: string } => entry !== null)
    .slice(0, 8);

  const effectiveWarnings = [...noMemberCandidatesWarning, ...warnings];

  const truncationDebugLines = [
    `Post-company truncation applied: ${companyTruncationDebug.enabled ? "yes" : "no"}`,
    `Last detected company speaker: ${companyTruncationDebug.lastCompanySpeaker || "none"} | kept ${companyTruncationDebug.keptLineCount} of ${companyTruncationDebug.totalLineCount} lines`
  ];

  for (const debugLine of truncationDebugLines) {
    effectiveWarnings.push(debugLine);
  }

  if (usedFallbackRetry) {
    if (rawQuotes.length === 0) {
      effectiveWarnings.push("Primary quote extraction returned no quotes; a second pass ran with roles de-prioritized.");
    } else {
      const fallbackUsed = mappedQuotes.length > 0 && rawOutput === "";
      effectiveWarnings.push(
        fallbackUsed
          ? "First pass returned no quotes; a second pass and fallback snippet extraction returned quotes."
          : "First pass returned no quotes; a second pass returned fallback extraction output."
      );
    }
  }

  if (rawQuotes.length === 0) {
    effectiveWarnings.push(
      "AI returned no quote entries. Review transcript complexity or try re-running extraction with manual member roster adjustments."
    );
    if (rawOutput && rawOutput.length > 120) {
      const outputPreview = rawOutput.replace(/[\t\n\r ]+/g, " ").slice(0, 280);
      effectiveWarnings.push(`AI raw output preview: ${outputPreview}`);
    } else if (rawOutput) {
      effectiveWarnings.push(`AI raw output preview: ${rawOutput.replace(/[\t\n\r ]+/g, " ")}`);
    } else {
      effectiveWarnings.push("AI response content was empty.");
    }
  }

  if (mappedQuotes.length !== rawQuotes.length) {
    effectiveWarnings.push(
      `Filtered ${Math.max(0, rawQuotes.length - mappedQuotes.length)} extracted quotes because speaker could not be parsed/validated.`
    );
  }

  return {
    quotes: mappedQuotes,
    themes: normalizedThemes,
    warnings: effectiveWarnings,
    summary: buildSummary(
      "quotes",
      0,
      memberClassifications.length,
      memberClassifications.length,
      mappedQuotes.length
    ),
    debug: companyTruncationDebug
  };
}

export async function POST(request: Request) {
  try {
    const input = analysisRequestSchema.parse(await request.json());

    const transcript = input.transcript.trim();
    const company = await prisma.company.findUnique({
      where: { id: input.companyId },
      select: { id: true, name: true }
    });

    if (!company) {
      return NextResponse.json({ error: "Company not found." }, { status: 404 });
    }

    const knownCompanyContacts = await loadCompanyPromptContacts(company.id);
    const companyPromptContext: CompanyPromptContext = {
      companyName: company.name,
      knownContacts: knownCompanyContacts
    };

    const allianceHealthSystems = await prisma.healthSystem.findMany({
      where: { isAllianceMember: true },
      select: { id: true, name: true, website: true }
    });

    if (input.maxInsights !== undefined && input.maxInsights < 1) {
      return NextResponse.json({ error: "maxInsights must be at least 1." }, { status: 400 });
    }

    if (!input.companyId) {
      return NextResponse.json({ error: "companyId is required." }, { status: 400 });
    }

    if (!transcript) {
      return NextResponse.json({ error: "Transcript is required." }, { status: 400 });
    }

    const hasClassifications = Array.isArray(input.participantClassifications) && input.participantClassifications.length > 0;

    if (!hasClassifications) {
      const extraction = await extractParticipantsWithAI(transcript, companyPromptContext);
      const roster = await getAbundantTeamRoster();
      const aliasMap = buildAbundantAliasMap(roster);
      const peopleForUi = dedupePeople(
        extraction.people.map((person) => applyAbundantCanonicalization(person, aliasMap))
      ).sort((a, b) => normalizeForDisplay(a.display_name).localeCompare(normalizeForDisplay(b.display_name)));
      const candidates = await loadMatchingCandidates(company.id, peopleForUi, allianceHealthSystems);
      const speakerLineCounts = buildSpeakerLineCounts(transcript, peopleForUi);

      const inferredRoles = peopleForUi.map((person) => {
        const inferred = inferParticipantMatch(
          person,
          aliasMap,
          company,
          companyPromptContext,
          allianceHealthSystems,
          candidates,
          speakerLineCounts
        );

        return {
          speakerName: inferred.speakerName,
          role: inferred.role,
          healthSystemId: inferred.healthSystemId
        };
      });
      const membersDetected = inferredRoles.filter((entry) => entry.role === "MEMBER").length;
      const membersWithHealthSystem = inferredRoles.filter(
        (entry) => entry.role === "MEMBER" && Boolean(entry.healthSystemId)
      ).length;

      return NextResponse.json({
        summary: buildSummary(
          "participants",
          extraction.people.length,
          peopleForUi.length,
          membersDetected,
          0
        ),
        participantClassifications: inferredRoles,
        warnings: [
          `Extracted ${extraction.people.length} people using AI from the transcript.`,
          `Matched ${inferredRoles.filter((entry) => entry.role === "ABUNDANT").length} people as Abundant.`,
          `Matched ${inferredRoles.filter((entry) => entry.role === "COMPANY").length} people as Company participants.`,
          `Matched ${membersWithHealthSystem} people as members with health systems (${membersDetected - membersWithHealthSystem} without health system match).`,
          `Unique people: ${extraction.counts.unique_people}, speakers: ${extraction.counts.spoke_in_transcript}, participants-line: ${extraction.counts.listed_in_participants_line}, mentioned-only: ${extraction.counts.mentioned_only}`
        ]
      });
    }

    const healthSystemNameById = new Map(
      allianceHealthSystems.map((entry) => [entry.id, entry.name])
    );

    const allClassifications = (input.participantClassifications || []).map((entry) => ({
      speakerName: entry.speakerName,
      role: entry.role,
      healthSystemId: entry.healthSystemId || ""
    }));

    const quotesResult = await extractMemberQuotesWithAI(
      transcript,
      input.maxInsights || 100,
      allClassifications,
      healthSystemNameById,
      companyPromptContext
    );

    return NextResponse.json({
      summary: quotesResult.summary,
      quotes: quotesResult.quotes,
      themes: quotesResult.themes,
      warnings: quotesResult.warnings
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid analyze request." }, { status: 400 });
    }

    console.error("transcript_member_insights_analyze_error", error);
    return NextResponse.json(
      {
        error: "Failed to analyze transcript.",
        details: parseOpenAIErrorMessage(error)
      },
      { status: 500 }
    );
  }
}
