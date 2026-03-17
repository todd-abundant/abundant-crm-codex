import type { CandidateRecord, CandidateSet, SignalSource } from '../types';
import { fillExtractionPrompt, parseExtractionResponse } from '../prompts/extraction';
import { llmChat } from '../llm';

const ABUNDANT_DOMAIN = 'abundantventurepartners.com';

const CRM_KEYWORDS = [
  'intake', 'screening', 'loi', 'pipeline', 'term sheet', 'investment',
  'call', 'meeting', 'intro', 'follow up', 'follow-up', 'due diligence',
  'partner', 'portfolio', 'startup', 'company', 'health system', 'co-investor',
  'venture', 'pitch', 'demo', 'investor', 'raise', 'round', 'seed', 'series',
];

type GmailMessage = {
  id: string;
  threadId: string;
  subject?: string;
  from?: string;
  to?: string;
  date?: string;
  snippet?: string;
  body?: string;
  participants?: string[];
};

function isRelevantMessage(message: GmailMessage): boolean {
  const allParticipants = [
    ...(message.participants || []),
    message.from || '',
    message.to || '',
  ].filter(Boolean);

  const hasExternal = allParticipants.some(
    (p) => p.toLowerCase().includes('@') && !p.toLowerCase().includes(ABUNDANT_DOMAIN)
  );
  if (hasExternal) return true;

  const subjectLower = (message.subject || '').toLowerCase();
  return CRM_KEYWORDS.some((kw) => subjectLower.includes(kw));
}

function formatMessageForExtraction(message: GmailMessage): string {
  return [
    `Subject: ${message.subject || '(no subject)'}`,
    `From: ${message.from || ''}`,
    `To: ${message.to || ''}`,
    `Date: ${message.date || ''}`,
    `Snippet: ${message.snippet || ''}`,
    message.body ? `\nBody:\n${message.body}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function extractBatch(
  messages: GmailMessage[],
  windowStart: string
): Promise<CandidateRecord[]> {
  const contentBlocks = messages
    .map((m, i) => `--- Message ${i + 1} ---\n${formatMessageForExtraction(m)}`)
    .join('\n\n');

  const prompt = fillExtractionPrompt(contentBlocks);

  try {
    const raw = await llmChat(prompt, 2048);
    const result = parseExtractionResponse(raw);
    return result.candidates.map((c) => {
      if ('source' in c && c.source.kind === 'gmail') return c;
      const firstMessage = messages[0];
      if (firstMessage && 'source' in c) {
        const source: SignalSource = {
          kind: 'gmail',
          messageId: firstMessage.id,
          threadId: firstMessage.threadId,
          subject: firstMessage.subject || '',
          date: firstMessage.date || windowStart,
        };
        return { ...c, source };
      }
      return c;
    });
  } catch {
    return [];
  }
}

export async function extractFromGmail(
  messages: GmailMessage[],
  windowDays: number,
  userEmail: string
): Promise<CandidateSet> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = now.toISOString();

  const relevant = messages.filter((m) => isRelevantMessage(m));

  if (relevant.length === 0) {
    return {
      candidates: [],
      sourceWindow: { start: windowStart, end: windowEnd },
      extractedAt: now.toISOString(),
    };
  }

  const batches: GmailMessage[][] = [];
  for (let i = 0; i < relevant.length; i += 10) {
    batches.push(relevant.slice(i, i + 10));
  }

  const batchResults = await Promise.all(
    batches.map((batch) => extractBatch(batch, windowStart))
  );
  const allCandidates: CandidateRecord[] = batchResults.flat();

  return {
    candidates: allCandidates,
    sourceWindow: { start: windowStart, end: windowEnd },
    extractedAt: now.toISOString(),
  };
}
