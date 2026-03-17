export const maxDuration = 120; // seconds — allow up to 2 min for LLM extraction

import { NextResponse } from 'next/server';
import { getCurrentUser, readGoogleApiSession } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { runAmbientScan } from '@/lib/claude-data-partner/index';
import { extractFromGmail } from '@/lib/claude-data-partner/sources/gmail';
import { extractFromCalendar } from '@/lib/claude-data-partner/sources/calendar';
import { fetchGmailMessages, fetchCalendarEvents, fetchDriveTranscripts } from '@/lib/claude-data-partner/google';
import { extractFromDrive } from '@/lib/claude-data-partner/sources/drive';
import type { CandidateSet } from '@/lib/claude-data-partner/types';

export type ScanDebugInfo = {
  googleSession: boolean;
  gmail: { fetched: number; relevant?: number; candidates?: number; error?: string } | null;
  calendar: { fetched: number; relevant?: number; candidates?: number; error?: string } | null;
  drive: { fetched: number; candidates?: number; error?: string } | null;
  totalCandidates: number;
  totalChanges: number;
  llmError?: string;
};

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { windowDays?: number; sources?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const windowDays = typeof body.windowDays === 'number' ? body.windowDays : 7;
  const sources = Array.isArray(body.sources) ? body.sources : ['gmail', 'calendar'];

  const googleSession = await readGoogleApiSession();
  const debug: ScanDebugInfo = {
    googleSession: !!googleSession,
    gmail: null,
    calendar: null,
    drive: null,
    totalCandidates: 0,
    totalChanges: 0,
  };

  const candidateSets: CandidateSet[] = [];
  let effectiveAccessToken = googleSession?.accessToken ?? '';

  // ── Gmail ──────────────────────────────────────────────────────────────────
  if (sources.includes('gmail')) {
    if (!googleSession) {
      debug.gmail = { fetched: 0, error: 'No Google session — sign in via Google OAuth to enable Gmail scanning' };
    } else {
      const { messages, fetchedCount, error, accessToken: refreshedToken } = await fetchGmailMessages({
        accessToken: googleSession.accessToken,
        refreshToken: googleSession.refreshToken,
        windowDays,
        maxMessages: 30,
      });
      // Use refreshed token for subsequent calls in this request
      if (refreshedToken) effectiveAccessToken = refreshedToken;

      if (error) {
        debug.gmail = { fetched: 0, error };
      } else {
        debug.gmail = { fetched: fetchedCount };
        try {
          const gmailSet = await extractFromGmail(messages, windowDays, user.email);
          debug.gmail.relevant = messages.length;
          debug.gmail.candidates = gmailSet.candidates.length;
          candidateSets.push(gmailSet);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          debug.gmail.error = `Extraction error: ${msg}`;
          debug.llmError = msg;
        }
      }
    }
  }

  // ── Calendar ───────────────────────────────────────────────────────────────
  if (sources.includes('calendar')) {
    if (!googleSession) {
      debug.calendar = { fetched: 0, error: 'No Google session' };
    } else {
      const { events, fetchedCount, error } = await fetchCalendarEvents({
        accessToken: effectiveAccessToken,
        refreshToken: googleSession.refreshToken,
        windowDays,
        maxEvents: 30,
      });

      if (error) {
        debug.calendar = { fetched: 0, error };
      } else {
        debug.calendar = { fetched: fetchedCount };
        try {
          const calendarSet = await extractFromCalendar(events, windowDays);
          debug.calendar.relevant = events.length;
          debug.calendar.candidates = calendarSet.candidates.length;
          candidateSets.push(calendarSet);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          debug.calendar.error = `Extraction error: ${msg}`;
          debug.llmError = debug.llmError || msg;
        }
      }
    }
  }

  // ── Drive transcripts ──────────────────────────────────────────────────────
  if (sources.includes('drive')) {
    if (!googleSession) {
      debug.drive = { fetched: 0, error: 'No Google session' };
    } else {
      const { documents, fetchedCount, error } = await fetchDriveTranscripts({
        accessToken: effectiveAccessToken,
        refreshToken: googleSession.refreshToken,
        windowDays,
        maxDocuments: 20,
      });

      if (error) {
        debug.drive = { fetched: 0, error };
      } else {
        debug.drive = { fetched: fetchedCount };
        try {
          const driveSet = await extractFromDrive(documents, windowDays);
          debug.drive.candidates = driveSet.candidates.length;
          candidateSets.push(driveSet);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          debug.drive.error = `Extraction error: ${msg}`;
          debug.llmError = debug.llmError || msg;
        }
      }
    }
  }

  debug.totalCandidates = candidateSets.reduce((sum, s) => sum + s.candidates.length, 0);

  if (candidateSets.length === 0 || debug.totalCandidates === 0) {
    return NextResponse.json({
      changeSet: { groups: [], totalChanges: 0, generatedAt: new Date().toISOString() },
      debug,
    });
  }

  try {
    const changeSet = await runAmbientScan({ candidateSets, prisma });
    debug.totalChanges = changeSet.totalChanges;
    return NextResponse.json({ changeSet, debug });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Scan failed';
    debug.llmError = msg;
    console.error('claude_data_partner_scan_error', error);
    return NextResponse.json(
      { error: msg, debug },
      { status: 500 }
    );
  }
}
