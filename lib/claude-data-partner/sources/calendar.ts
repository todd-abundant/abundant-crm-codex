import type { CandidateRecord, CandidateSet, SignalSource } from '../types';
import { fillExtractionPrompt, parseExtractionResponse } from '../prompts/extraction';
import { llmChat } from '../llm';

const ABUNDANT_DOMAIN = 'abundantventurepartners.com';

const CRM_EVENT_KEYWORDS = [
  'intake', 'screening', 'loi', 'investment', 'intro', 'meeting',
  'due diligence', 'board', 'dinner', 'call', 'debrief', 'partner',
  'portfolio', 'pitch', 'demo', 'follow-up', 'follow up', 'with',
];

type CalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  attendees?: Array<{ email: string; name?: string; responseStatus?: string }>;
  location?: string;
  transcriptFileId?: string;
  transcriptContent?: string;
};

function isRelevantEvent(event: CalendarEvent): boolean {
  const summaryLower = (event.summary || '').toLowerCase();
  const hasExternal = (event.attendees || []).some(
    (a) => !a.email.toLowerCase().includes(ABUNDANT_DOMAIN)
  );
  if (hasExternal) return true;
  return CRM_EVENT_KEYWORDS.some((kw) => summaryLower.includes(kw));
}

function formatEventForExtraction(event: CalendarEvent): string {
  const attendeeList = (event.attendees || [])
    .map((a) => `${a.name || a.email} <${a.email}>`)
    .join(', ');

  return [
    `Event: ${event.summary || '(no title)'}`,
    `Date: ${event.startDate || ''}`,
    `Attendees: ${attendeeList || 'none listed'}`,
    event.description ? `Description: ${event.description}` : '',
    event.location ? `Location: ${event.location}` : '',
    event.transcriptContent ? `\nTranscript:\n${event.transcriptContent.slice(0, 8000)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

async function extractBatch(events: CalendarEvent[], windowStart: string): Promise<CandidateRecord[]> {
  const contentBlocks = events
    .map((e, i) => `--- Event ${i + 1} ---\n${formatEventForExtraction(e)}`)
    .join('\n\n');

  const prompt = fillExtractionPrompt(contentBlocks);

  try {
    const raw = await llmChat(prompt, 2048);
    const result = parseExtractionResponse(raw);
    return result.candidates.map((c) => {
      if ('source' in c && c.source.kind === 'calendar') return c;
      const firstEvent = events[0];
      if (firstEvent && 'source' in c) {
        const source: SignalSource = {
          kind: 'calendar',
          eventId: firstEvent.id,
          summary: firstEvent.summary || '',
          date: firstEvent.startDate || windowStart,
        };
        return { ...c, source };
      }
      return c;
    });
  } catch {
    return [];
  }
}

export async function extractFromCalendar(events: CalendarEvent[], windowDays: number): Promise<CandidateSet> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = now.toISOString();

  const relevant = events.filter(isRelevantEvent);

  if (relevant.length === 0) {
    return {
      candidates: [],
      sourceWindow: { start: windowStart, end: windowEnd },
      extractedAt: now.toISOString(),
    };
  }

  const batches: CalendarEvent[][] = [];
  for (let i = 0; i < relevant.length; i += 8) {
    batches.push(relevant.slice(i, i + 8));
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
