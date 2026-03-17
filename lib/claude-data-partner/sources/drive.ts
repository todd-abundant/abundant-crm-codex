import type { CandidateRecord, CandidateSet, SignalSource } from '../types';
import { fillExtractionPrompt, parseExtractionResponse } from '../prompts/extraction';
import { llmChat } from '../llm';

const RELEVANT_TITLE_KEYWORDS = [
  'transcript', 'notes', 'agenda', 'debrief', 'summary', 'minutes',
  'intake', 'screening', 'pitch', 'meeting', 'call',
];

type DriveDocument = {
  id: string;
  title: string;
  content: string;
  modifiedAt?: string;
};

function isRelevantDocument(doc: DriveDocument): boolean {
  const titleLower = doc.title.toLowerCase();
  return RELEVANT_TITLE_KEYWORDS.some((kw) => titleLower.includes(kw));
}

async function extractFromDocument(doc: DriveDocument, windowStart: string): Promise<CandidateRecord[]> {
  const contentSnippet = doc.content.slice(0, 12000);
  const formattedContent = `Document Title: ${doc.title}\nModified: ${doc.modifiedAt || 'unknown'}\n\n${contentSnippet}`;
  const prompt = fillExtractionPrompt(formattedContent);

  try {
    const raw = await llmChat(prompt, 2048);
    const result = parseExtractionResponse(raw);
    const driveSource: SignalSource = { kind: 'drive', fileId: doc.id, title: doc.title };
    return result.candidates.map((c) =>
      'source' in c ? { ...c, source: driveSource } : c
    );
  } catch {
    return [];
  }
}

export async function extractFromDrive(documents: DriveDocument[], windowDays: number): Promise<CandidateSet> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const windowEnd = now.toISOString();

  const relevant = documents.filter(isRelevantDocument);

  if (relevant.length === 0) {
    return {
      candidates: [],
      sourceWindow: { start: windowStart, end: windowEnd },
      extractedAt: now.toISOString(),
    };
  }

  const allCandidates: CandidateRecord[] = [];
  for (const doc of relevant) {
    const candidates = await extractFromDocument(doc, windowStart);
    allCandidates.push(...candidates);
  }

  return {
    candidates: allCandidates,
    sourceWindow: { start: windowStart, end: windowEnd },
    extractedAt: now.toISOString(),
  };
}
