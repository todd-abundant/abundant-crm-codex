type ZoomTokenResponse = {
  access_token?: string;
};

type ZoomApiError = {
  code?: number;
  message?: string;
};

type ZoomWebinarResponse = {
  id?: string | number;
  topic?: string;
  start_time?: string;
};

type ZoomParticipantsResponse = {
  participants?: unknown[];
  next_page_token?: string;
};

type ZoomRegistrantsResponse = {
  registrants?: unknown[];
  next_page_token?: string;
};

export type ZoomWebinarParticipant = {
  id: string | null;
  registrantId: string | null;
  name: string;
  email: string | null;
  joinTime: string | null;
  leaveTime: string | null;
  durationMinutes: number | null;
};

export type ZoomWebinarRegistrant = {
  registrantId: string | null;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  email: string | null;
  title: string | null;
  organization: string | null;
};

export type ZoomWebinarDetails = {
  id: string;
  topic: string | null;
  startTime: string | null;
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeEmail(value: unknown): string | null {
  const raw = trimOrNull(value);
  if (!raw) return null;
  return raw.toLowerCase();
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function encodeZoomPathSegment(value: string) {
  const once = encodeURIComponent(value.trim());
  return once.includes("%2F") ? encodeURIComponent(once) : once;
}

function getZoomConfig() {
  const accountId = process.env.ZOOM_ACCOUNT_ID?.trim();
  const clientId = process.env.ZOOM_CLIENT_ID?.trim();
  const clientSecret = process.env.ZOOM_CLIENT_SECRET?.trim();
  const apiBaseUrl = (process.env.ZOOM_API_BASE_URL || "https://api.zoom.us/v2").replace(/\/+$/, "");

  if (!accountId || !clientId || !clientSecret) {
    throw new Error("Zoom credentials are missing. Set ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID, and ZOOM_CLIENT_SECRET.");
  }

  return { accountId, clientId, clientSecret, apiBaseUrl };
}

async function getZoomAccessToken() {
  const { accountId, clientId, clientSecret } = getZoomConfig();
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenUrl =
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`;

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${authHeader}`
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as ZoomTokenResponse & ZoomApiError;
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.message || "Failed to authenticate with Zoom.");
  }

  return payload.access_token;
}

async function zoomGet(
  path: string,
  accessToken: string,
  query?: Record<string, string | undefined>
) {
  const { apiBaseUrl } = getZoomConfig();
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (!value) continue;
    params.set(key, value);
  }

  const url = `${apiBaseUrl}${path}${params.size > 0 ? `?${params.toString()}` : ""}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown> & ZoomApiError;
  if (!response.ok) {
    const code = payload.code ? ` (${payload.code})` : "";
    throw new Error(`${payload.message || "Zoom API request failed"}${code}`);
  }

  return payload;
}

function mapZoomParticipant(raw: unknown): ZoomWebinarParticipant | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  const name = trimOrNull(entry.name) || trimOrNull(entry.user_name);
  if (!name) return null;

  return {
    id: trimOrNull(entry.id),
    registrantId: trimOrNull(entry.registrant_id),
    name,
    email: normalizeEmail(entry.user_email) || normalizeEmail(entry.email),
    joinTime: trimOrNull(entry.join_time),
    leaveTime: trimOrNull(entry.leave_time),
    durationMinutes: parseNumber(entry.duration)
  };
}

function mapZoomRegistrant(raw: unknown): ZoomWebinarRegistrant | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  const firstName = trimOrNull(entry.first_name);
  const lastName = trimOrNull(entry.last_name);
  const fullName =
    trimOrNull(entry.name) || [firstName || "", lastName || ""].join(" ").trim() || null;

  return {
    registrantId: trimOrNull(entry.id) || trimOrNull(entry.registrant_id),
    firstName,
    lastName,
    name: fullName,
    email: normalizeEmail(entry.email),
    title: trimOrNull(entry.job_title),
    organization: trimOrNull(entry.org) || trimOrNull(entry.organization)
  };
}

export async function fetchZoomWebinarDetails(webinarId: string): Promise<ZoomWebinarDetails | null> {
  const normalizedId = webinarId.trim();
  if (!normalizedId) return null;

  const accessToken = await getZoomAccessToken();
  try {
    const payload = (await zoomGet(
      `/webinars/${encodeZoomPathSegment(normalizedId)}`,
      accessToken
    )) as ZoomWebinarResponse;
    return {
      id: String(payload.id || normalizedId),
      topic: trimOrNull(payload.topic),
      startTime: trimOrNull(payload.start_time)
    };
  } catch {
    return null;
  }
}

export async function fetchZoomWebinarParticipants(webinarId: string): Promise<ZoomWebinarParticipant[]> {
  const normalizedId = webinarId.trim();
  if (!normalizedId) {
    throw new Error("Webinar ID is required.");
  }

  const accessToken = await getZoomAccessToken();
  const participants: ZoomWebinarParticipant[] = [];
  let nextPageToken = "";

  do {
    const payload = (await zoomGet(
      `/report/webinars/${encodeZoomPathSegment(normalizedId)}/participants`,
      accessToken,
      {
        page_size: "300",
        next_page_token: nextPageToken || undefined
      }
    )) as ZoomParticipantsResponse;

    const pageItems = Array.isArray(payload.participants) ? payload.participants : [];
    for (const item of pageItems) {
      const mapped = mapZoomParticipant(item);
      if (mapped) participants.push(mapped);
    }

    nextPageToken = trimOrNull(payload.next_page_token) || "";
  } while (nextPageToken);

  return participants;
}

export async function fetchZoomWebinarRegistrants(webinarId: string): Promise<ZoomWebinarRegistrant[]> {
  const normalizedId = webinarId.trim();
  if (!normalizedId) {
    throw new Error("Webinar ID is required.");
  }

  const accessToken = await getZoomAccessToken();
  const registrants: ZoomWebinarRegistrant[] = [];
  let nextPageToken = "";

  do {
    const payload = (await zoomGet(
      `/webinars/${encodeZoomPathSegment(normalizedId)}/registrants`,
      accessToken,
      {
        status: "approved",
        page_size: "300",
        next_page_token: nextPageToken || undefined
      }
    )) as ZoomRegistrantsResponse;

    const pageItems = Array.isArray(payload.registrants) ? payload.registrants : [];
    for (const item of pageItems) {
      const mapped = mapZoomRegistrant(item);
      if (mapped) registrants.push(mapped);
    }

    nextPageToken = trimOrNull(payload.next_page_token) || "";
  } while (nextPageToken);

  return registrants;
}
