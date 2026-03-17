import { NextResponse } from 'next/server';
import { getCurrentUser, readGoogleApiSession } from '@/lib/auth/server';
import { fetchGmailMessages, fetchCalendarEvents, fetchDriveTranscripts } from '@/lib/claude-data-partner/google';
import { llmChat } from '@/lib/claude-data-partner/llm';

export type DiagnosticsResult = {
  auth: {
    appSession: boolean;
    googleSession: boolean;
    userEmail?: string;
  };
  llm: {
    ok: boolean;
    model?: string;
    error?: string;
  };
  gmail: {
    ok: boolean;
    fetched: number;
    sample: Array<{ subject: string; from: string; date: string }>;
    error?: string;
  } | null;
  calendar: {
    ok: boolean;
    fetched: number;
    sample: Array<{ summary: string; date: string; attendeeCount: number }>;
    error?: string;
  } | null;
  drive: {
    ok: boolean;
    fetched: number;
    sample: Array<{ title: string; modifiedAt?: string }>;
    error?: string;
  } | null;
};

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const windowDays = Number(searchParams.get('windowDays') || '7');

  const result: DiagnosticsResult = {
    auth: { appSession: true, googleSession: false, userEmail: user.email },
    llm: { ok: false },
    gmail: null,
    calendar: null,
    drive: null,
  };

  // ── LLM check ────────────────────────────────────────────────────────────
  try {
    const reply = await llmChat('Reply with exactly: ready', 32);
    result.llm = { ok: true, model: process.env.CLAUDE_DATA_PARTNER_MODEL || 'claude-sonnet-4-6' };
    void reply; // discard
  } catch (err) {
    result.llm = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  // ── Google session ────────────────────────────────────────────────────────
  const googleSession = await readGoogleApiSession();
  result.auth.googleSession = !!googleSession;

  if (!googleSession) {
    return NextResponse.json(result);
  }

  // ── Gmail check ───────────────────────────────────────────────────────────
  const gmailResult = await fetchGmailMessages({
    accessToken: googleSession.accessToken,
    refreshToken: googleSession.refreshToken,
    windowDays,
    maxMessages: 20,
  });

  if (gmailResult.error) {
    result.gmail = { ok: false, fetched: 0, sample: [], error: gmailResult.error };
  } else {
    result.gmail = {
      ok: true,
      fetched: gmailResult.fetchedCount,
      sample: gmailResult.messages.slice(0, 5).map((m) => ({
        subject: m.subject || '(no subject)',
        from: m.from || '',
        date: m.date || '',
      })),
    };
  }

  // Use refreshed token for calendar if Gmail refreshed it
  const calAccessToken = gmailResult.accessToken || googleSession.accessToken;

  // ── Calendar check ────────────────────────────────────────────────────────
  const calResult = await fetchCalendarEvents({
    accessToken: calAccessToken,
    refreshToken: googleSession.refreshToken,
    windowDays,
    maxEvents: 20,
  });

  if (calResult.error) {
    result.calendar = { ok: false, fetched: 0, sample: [], error: calResult.error };
  } else {
    result.calendar = {
      ok: true,
      fetched: calResult.fetchedCount,
      sample: calResult.events.slice(0, 5).map((e) => ({
        summary: e.summary || '(no title)',
        date: e.startDate || '',
        attendeeCount: e.attendees?.length || 0,
      })),
    };
  }

  // ── Drive check ───────────────────────────────────────────────────────────
  const effectiveToken = gmailResult.accessToken || googleSession.accessToken;
  const driveResult = await fetchDriveTranscripts({
    accessToken: effectiveToken,
    refreshToken: googleSession.refreshToken,
    windowDays,
    maxDocuments: 10,
  });

  if (driveResult.error) {
    result.drive = { ok: false, fetched: 0, sample: [], error: driveResult.error };
  } else {
    result.drive = {
      ok: true,
      fetched: driveResult.fetchedCount,
      sample: driveResult.documents.slice(0, 5).map((d) => ({
        title: d.title,
        modifiedAt: d.modifiedAt,
      })),
    };
  }

  return NextResponse.json(result);
}
