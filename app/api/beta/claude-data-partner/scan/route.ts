export const maxDuration = 120; // seconds — allow up to 2 min for LLM extraction

import { getCurrentUser, readGoogleApiSession } from '@/lib/auth/server';
import { prisma } from '@/lib/db';
import { runAmbientScan } from '@/lib/claude-data-partner/index';
import { extractFromGmail } from '@/lib/claude-data-partner/sources/gmail';
import { extractFromCalendar } from '@/lib/claude-data-partner/sources/calendar';
import { fetchGmailMessages, fetchCalendarEvents, fetchDriveTranscripts } from '@/lib/claude-data-partner/google';
import { extractFromDrive } from '@/lib/claude-data-partner/sources/drive';
import type { CandidateSet, ChangeSet } from '@/lib/claude-data-partner/types';

export type ScanDebugInfo = {
  googleSession: boolean;
  gmail: { fetched: number; relevant?: number; candidates?: number; error?: string } | null;
  calendar: { fetched: number; relevant?: number; candidates?: number; error?: string } | null;
  drive: { fetched: number; candidates?: number; error?: string } | null;
  totalCandidates: number;
  totalChanges: number;
  llmError?: string;
};

// ─── Streaming event types (consumed by the client) ──────────────────────────

export type ScanStreamEvent =
  | { type: 'progress'; label: string; detail?: string }
  | { type: 'progress_done'; label: string; detail?: string }
  | { type: 'result'; changeSet: ChangeSet; debug: ScanDebugInfo }
  | { type: 'error'; message: string; debug?: ScanDebugInfo };

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return new Response(JSON.stringify({ type: 'error', message: 'Unauthorized' }) + '\n', {
      status: 401,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  let body: { windowDays?: number; sources?: string[] };
  try {
    body = await request.json() as { windowDays?: number; sources?: string[] };
  } catch {
    return new Response(JSON.stringify({ type: 'error', message: 'Invalid request body' }) + '\n', {
      status: 400,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
  }

  const windowDays = typeof body.windowDays === 'number' ? body.windowDays : 7;
  const sources = Array.isArray(body.sources) ? body.sources : ['gmail', 'calendar', 'drive'];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: ScanStreamEvent) {
        controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      }

      const debug: ScanDebugInfo = {
        googleSession: false,
        gmail: null,
        calendar: null,
        drive: null,
        totalCandidates: 0,
        totalChanges: 0,
      };

      try {
        const googleSession = await readGoogleApiSession();
        debug.googleSession = !!googleSession;
        let effectiveAccessToken = googleSession?.accessToken ?? '';

        const candidateSets: CandidateSet[] = [];

        // ── Gmail ─────────────────────────────────────────────────────────────
        if (sources.includes('gmail')) {
          if (!googleSession) {
            debug.gmail = { fetched: 0, error: 'No Google session' };
          } else {
            const windowLabel = windowDays === 1 ? '24 hours' : windowDays === 2 ? '48 hours' : `${windowDays} days`;
            send({ type: 'progress', label: `Fetching Gmail (last ${windowLabel})…` });

            const { messages, fetchedCount, error, accessToken: refreshedToken } = await fetchGmailMessages({
              accessToken: googleSession.accessToken,
              refreshToken: googleSession.refreshToken,
              windowDays,
              maxMessages: 30,
            });
            if (refreshedToken) effectiveAccessToken = refreshedToken;

            if (error) {
              debug.gmail = { fetched: 0, error };
              send({ type: 'progress_done', label: 'Gmail', detail: `Error: ${error}` });
            } else {
              debug.gmail = { fetched: fetchedCount };
              send({
                type: 'progress_done',
                label: `Gmail`,
                detail: `${fetchedCount} message${fetchedCount !== 1 ? 's' : ''} fetched`,
              });

              send({ type: 'progress', label: `Analyzing ${fetchedCount} emails with Claude…` });
              try {
                const gmailSet = await extractFromGmail(messages, windowDays, user.email);
                debug.gmail.relevant = messages.length;
                debug.gmail.candidates = gmailSet.candidates.length;
                candidateSets.push(gmailSet);
                send({
                  type: 'progress_done',
                  label: 'Email analysis',
                  detail: `${gmailSet.candidates.length} CRM signal${gmailSet.candidates.length !== 1 ? 's' : ''} found`,
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                debug.gmail.error = `Extraction error: ${msg}`;
                debug.llmError = msg;
                send({ type: 'progress_done', label: 'Email analysis', detail: `Error: ${msg}` });
              }
            }
          }
        }

        // ── Calendar ──────────────────────────────────────────────────────────
        if (sources.includes('calendar')) {
          if (!googleSession) {
            debug.calendar = { fetched: 0, error: 'No Google session' };
          } else {
            const calWindowLabel = windowDays === 1 ? '24 hours' : windowDays === 2 ? '48 hours' : `${windowDays} days`;
            send({ type: 'progress', label: `Fetching Calendar events (last ${calWindowLabel})…` });

            const { events, fetchedCount, error } = await fetchCalendarEvents({
              accessToken: effectiveAccessToken,
              refreshToken: googleSession.refreshToken,
              windowDays,
              maxEvents: 30,
            });

            if (error) {
              debug.calendar = { fetched: 0, error };
              send({ type: 'progress_done', label: 'Calendar', detail: `Error: ${error}` });
            } else {
              debug.calendar = { fetched: fetchedCount };
              send({
                type: 'progress_done',
                label: 'Calendar',
                detail: `${fetchedCount} event${fetchedCount !== 1 ? 's' : ''} fetched`,
              });

              send({ type: 'progress', label: `Analyzing ${fetchedCount} calendar events with Claude…` });
              try {
                const calendarSet = await extractFromCalendar(events, windowDays);
                debug.calendar.relevant = events.length;
                debug.calendar.candidates = calendarSet.candidates.length;
                candidateSets.push(calendarSet);
                send({
                  type: 'progress_done',
                  label: 'Calendar analysis',
                  detail: `${calendarSet.candidates.length} CRM signal${calendarSet.candidates.length !== 1 ? 's' : ''} found`,
                });
              } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                debug.calendar.error = `Extraction error: ${msg}`;
                debug.llmError = debug.llmError || msg;
                send({ type: 'progress_done', label: 'Calendar analysis', detail: `Error: ${msg}` });
              }
            }
          }
        }

        // ── Drive transcripts ─────────────────────────────────────────────────
        if (sources.includes('drive')) {
          if (!googleSession) {
            debug.drive = { fetched: 0, error: 'No Google session' };
          } else {
            send({ type: 'progress', label: `Searching Drive for meeting transcripts…` });

            const { documents, fetchedCount, error } = await fetchDriveTranscripts({
              accessToken: effectiveAccessToken,
              refreshToken: googleSession.refreshToken,
              windowDays,
              maxDocuments: 20,
            });

            if (error) {
              debug.drive = { fetched: 0, error };
              send({ type: 'progress_done', label: 'Drive', detail: `Error: ${error}` });
            } else {
              debug.drive = { fetched: fetchedCount };
              if (fetchedCount === 0) {
                send({ type: 'progress_done', label: 'Drive', detail: 'No transcripts found in window' });
              } else {
                send({
                  type: 'progress_done',
                  label: 'Drive',
                  detail: `${fetchedCount} transcript${fetchedCount !== 1 ? 's' : ''} found`,
                });

                send({ type: 'progress', label: `Analyzing ${fetchedCount} transcript${fetchedCount !== 1 ? 's' : ''} with Claude…` });
                try {
                  const driveSet = await extractFromDrive(documents, windowDays);
                  debug.drive.candidates = driveSet.candidates.length;
                  candidateSets.push(driveSet);
                  send({
                    type: 'progress_done',
                    label: 'Transcript analysis',
                    detail: `${driveSet.candidates.length} CRM signal${driveSet.candidates.length !== 1 ? 's' : ''} found`,
                  });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : String(err);
                  debug.drive.error = `Extraction error: ${msg}`;
                  debug.llmError = debug.llmError || msg;
                  send({ type: 'progress_done', label: 'Transcript analysis', detail: `Error: ${msg}` });
                }
              }
            }
          }
        }

        // ── Resolve + plan ────────────────────────────────────────────────────
        debug.totalCandidates = candidateSets.reduce((sum, s) => sum + s.candidates.length, 0);

        if (candidateSets.length === 0 || debug.totalCandidates === 0) {
          send({
            type: 'result',
            changeSet: { groups: [], totalChanges: 0, generatedAt: new Date().toISOString() },
            debug,
          });
          controller.close();
          return;
        }

        const totalSignals = debug.totalCandidates;
        send({
          type: 'progress',
          label: `Resolving ${totalSignals} signal${totalSignals !== 1 ? 's' : ''} against CRM database…`,
        });

        const changeSet = await runAmbientScan({ candidateSets, prisma });
        debug.totalChanges = changeSet.totalChanges;

        send({ type: 'result', changeSet, debug });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Scan failed';
        console.error('claude_data_partner_scan_error', err);
        send({ type: 'error', message: msg, debug });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
