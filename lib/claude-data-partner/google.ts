/**
 * Fetches Gmail messages and Google Calendar events using the authenticated
 * user's OAuth access token (from readGoogleApiSession).
 *
 * Uses the same fetch-based pattern as lib/gmail-addon/gmail.ts.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type FetchedGmailMessage = {
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

export type FetchedCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  attendees?: Array<{ email: string; name?: string }>;
  location?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(accessToken: string): Record<string, string> {
  return { Authorization: `Bearer ${accessToken}` };
}

function decodeBase64Url(value: string | undefined): string {
  if (!value) return '';
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

type GmailPayload = {
  mimeType?: string;
  body?: { data?: string };
  headers?: Array<{ name?: string; value?: string }>;
  parts?: GmailPayload[];
};

function extractBodyText(payload: GmailPayload | undefined): string {
  if (!payload) return '';
  const mime = (payload.mimeType || '').toLowerCase();
  if (mime === 'text/plain') return decodeBase64Url(payload.body?.data).trim();
  if (mime === 'text/html') return stripHtml(decodeBase64Url(payload.body?.data));
  for (const part of payload.parts || []) {
    const text = extractBodyText(part);
    if (text) return text;
  }
  const direct = decodeBase64Url(payload.body?.data).trim();
  return direct ? stripHtml(direct) : '';
}

function headerMap(headers: Array<{ name?: string; value?: string }> | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const h of headers || []) {
    if (h.name) map.set(h.name.toLowerCase(), h.value?.trim() || '');
  }
  return map;
}

// ─── Gmail ────────────────────────────────────────────────────────────────────

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
  nextPageToken?: string;
};

type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  snippet?: string;
  payload?: GmailPayload;
};

/**
 * Fetches recent Gmail messages for the given access token.
 * Returns at most maxMessages messages.
 */
export async function fetchGmailMessages(opts: {
  accessToken: string;
  refreshToken?: string | null;
  windowDays: number;
  maxMessages?: number;
}): Promise<{ messages: FetchedGmailMessage[]; fetchedCount: number; accessToken?: string; error?: string }> {
  const { windowDays, maxMessages = 50 } = opts;
  let { accessToken } = opts;

  const after = Math.floor((Date.now() - windowDays * 24 * 60 * 60 * 1000) / 1000);
  const query = `after:${after} -category:promotions -category:social`;

  // List message IDs
  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  listUrl.searchParams.set('maxResults', String(Math.min(maxMessages, 100)));
  listUrl.searchParams.set('q', query);

  let messageIds: Array<{ id: string; threadId: string }> = [];

  try {
    let listRes = await fetch(listUrl, {
      headers: authHeaders(accessToken),
      cache: 'no-store',
    });

    // Auto-refresh on 401 if we have a refresh token
    if (listRes.status === 401 && opts.refreshToken) {
      const { refreshGoogleAccessToken } = await import('@/lib/auth/server');
      const refreshed = await refreshGoogleAccessToken(opts.refreshToken);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        listRes = await fetch(listUrl, { headers: authHeaders(accessToken), cache: 'no-store' });
      }
    }

    if (!listRes.ok) {
      const errText = await listRes.text();
      return { messages: [], fetchedCount: 0, error: `Gmail list failed (${listRes.status}): ${errText.slice(0, 200)}` };
    }

    const listData = (await listRes.json()) as GmailListResponse;
    messageIds = listData.messages || [];
  } catch (err) {
    return { messages: [], fetchedCount: 0, error: `Gmail list error: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Fetch each message (up to maxMessages)
  const messages: FetchedGmailMessage[] = [];
  const toFetch = messageIds.slice(0, maxMessages);

  await Promise.allSettled(
    toFetch.map(async ({ id, threadId }) => {
      try {
        const msgUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`);
        msgUrl.searchParams.set('format', 'full');

        const msgRes = await fetch(msgUrl, {
          headers: authHeaders(accessToken),
          cache: 'no-store',
        });

        if (!msgRes.ok) return;

        const msg = (await msgRes.json()) as GmailMessageResponse;
        const headers = headerMap(msg.payload?.headers);

        const participants: string[] = [];
        const from = headers.get('from') || '';
        const to = headers.get('to') || '';
        const cc = headers.get('cc') || '';
        if (from) participants.push(from);
        for (const addr of [...to.split(','), ...cc.split(',')]) {
          const trimmed = addr.trim();
          if (trimmed) participants.push(trimmed);
        }

        messages.push({
          id: msg.id || id,
          threadId: msg.threadId || threadId,
          subject: headers.get('subject') || '',
          from,
          to,
          date: headers.get('date') || '',
          snippet: msg.snippet || '',
          body: extractBodyText(msg.payload).slice(0, 3000),
          participants,
        });
      } catch {
        // Skip messages that fail to fetch
      }
    })
  );

  return { messages, fetchedCount: messages.length, accessToken };
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

type CalendarListResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    description?: string;
    location?: string;
    start?: { dateTime?: string; date?: string };
    end?: { dateTime?: string; date?: string };
    attendees?: Array<{ email?: string; displayName?: string }>;
  }>;
};

/**
 * Fetches calendar events for the given access token.
 */
export async function fetchCalendarEvents(opts: {
  accessToken: string;
  refreshToken?: string | null;
  windowDays: number;
  maxEvents?: number;
}): Promise<{ events: FetchedCalendarEvent[]; fetchedCount: number; error?: string }> {
  const { windowDays, maxEvents = 50 } = opts;
  let { accessToken } = opts;

  const now = new Date();
  const timeMin = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = now.toISOString();

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('maxResults', String(Math.min(maxEvents, 250)));
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  try {
    let res = await fetch(url, {
      headers: authHeaders(accessToken),
      cache: 'no-store',
    });

    // Auto-refresh on 401 if we have a refresh token
    if (res.status === 401 && opts.refreshToken) {
      const { refreshGoogleAccessToken } = await import('@/lib/auth/server');
      const refreshed = await refreshGoogleAccessToken(opts.refreshToken);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        res = await fetch(url, { headers: authHeaders(accessToken), cache: 'no-store' });
      }
    }

    if (!res.ok) {
      const errText = await res.text();
      return { events: [], fetchedCount: 0, error: `Calendar fetch failed (${res.status}): ${errText.slice(0, 200)}` };
    }

    const data = (await res.json()) as CalendarListResponse;
    const events: FetchedCalendarEvent[] = (data.items || []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      summary: item.summary || '',
      description: item.description || '',
      startDate: item.start?.dateTime || item.start?.date || '',
      endDate: item.end?.dateTime || item.end?.date || '',
      location: item.location || '',
      attendees: (item.attendees || []).map((a) => ({
        email: a.email || '',
        name: a.displayName || '',
      })),
    }));

    return { events, fetchedCount: events.length };
  } catch (err) {
    return { events: [], fetchedCount: 0, error: `Calendar error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

// ─── Drive transcripts ────────────────────────────────────────────────────────

export type FetchedDriveDocument = {
  id: string;
  title: string;
  content: string;
  modifiedAt?: string;
};

type DriveFilesResponse = {
  files?: Array<{
    id?: string;
    name?: string;
    modifiedTime?: string;
    mimeType?: string;
  }>;
};

/**
 * Searches Google Drive for meeting transcript documents modified within the
 * window and exports their plain-text content.
 *
 * Looks for Google Docs whose name contains "transcript" (Google Meet auto-saves
 * transcripts this way). Falls back to broader keyword search if needed.
 */
export async function fetchDriveTranscripts(opts: {
  accessToken: string;
  refreshToken?: string | null;
  windowDays: number;
  maxDocuments?: number;
}): Promise<{ documents: FetchedDriveDocument[]; fetchedCount: number; error?: string }> {
  const { windowDays, maxDocuments = 20 } = opts;
  let { accessToken } = opts;

  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  // Search for Google Docs with transcript-related names modified in window
  const searchTerms = ['transcript', 'meeting notes', 'call notes', 'debrief'];
  const nameQueries = searchTerms.map((t) => `name contains '${t}'`).join(' or ');
  const query = `(${nameQueries}) and mimeType = 'application/vnd.google-apps.document' and modifiedTime > '${windowStart}' and trashed = false`;

  const listUrl = new URL('https://www.googleapis.com/drive/v3/files');
  listUrl.searchParams.set('q', query);
  listUrl.searchParams.set('pageSize', String(Math.min(maxDocuments, 50)));
  listUrl.searchParams.set('fields', 'files(id,name,modifiedTime,mimeType)');
  listUrl.searchParams.set('orderBy', 'modifiedTime desc');

  let fileList: DriveFilesResponse;
  try {
    let listRes = await fetch(listUrl, { headers: authHeaders(accessToken), cache: 'no-store' });

    // Auto-refresh on 401
    if (listRes.status === 401 && opts.refreshToken) {
      const { refreshGoogleAccessToken } = await import('@/lib/auth/server');
      const refreshed = await refreshGoogleAccessToken(opts.refreshToken);
      if (refreshed) {
        accessToken = refreshed.accessToken;
        listRes = await fetch(listUrl, { headers: authHeaders(accessToken), cache: 'no-store' });
      }
    }

    if (!listRes.ok) {
      const errText = await listRes.text();
      return { documents: [], fetchedCount: 0, error: `Drive search failed (${listRes.status}): ${errText.slice(0, 200)}` };
    }

    fileList = (await listRes.json()) as DriveFilesResponse;
  } catch (err) {
    return { documents: [], fetchedCount: 0, error: `Drive search error: ${err instanceof Error ? err.message : String(err)}` };
  }

  const files = fileList.files || [];
  const documents: FetchedDriveDocument[] = [];

  await Promise.allSettled(
    files.slice(0, maxDocuments).map(async (file) => {
      if (!file.id) return;
      try {
        const exportUrl = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export`);
        exportUrl.searchParams.set('mimeType', 'text/plain');

        const exportRes = await fetch(exportUrl, { headers: authHeaders(accessToken), cache: 'no-store' });
        if (!exportRes.ok) return;

        const content = await exportRes.text();
        if (!content.trim()) return;

        documents.push({
          id: file.id,
          title: file.name || '(untitled)',
          content: content.slice(0, 15000), // cap per doc
          modifiedAt: file.modifiedTime,
        });
      } catch {
        // Skip documents that fail to export
      }
    })
  );

  return { documents, fetchedCount: documents.length };
}
