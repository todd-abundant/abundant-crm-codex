const DATE_DEBUG_QUERY_PARAM = "dateDebug";
const DATE_DEBUG_STORAGE_KEY = "abundant-crm-date-debug";
const DATE_DEBUG_SESSION_KEY = "abundant-crm-date-debug-session";
const DATE_DEBUG_HEADER = "x-date-debug";
const DATE_DEBUG_SESSION_HEADER = "x-date-debug-session-id";
const DATE_DEBUG_REQUEST_HEADER = "x-date-debug-request-id";
const DATE_DEBUG_SCOPE_HEADER = "x-date-debug-scope";
const DATE_DEBUG_ITEM_HEADER = "x-date-debug-item-id";
const DATE_DEBUG_SEQUENCE_HEADER = "x-date-debug-seq";
const DATE_DEBUG_CLIENT_UPDATED_AT_HEADER = "x-date-debug-client-updated-at";

type DateDebugContext = {
  requestId: string;
  sessionId: string;
  scope: string;
  itemId?: string;
  requestSequence?: number | null;
  clientUpdatedAt?: string | null;
  headers: Record<string, string>;
};

function toShortId(value: number) {
  return value.toString(36);
}

function getClientValue(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const search = new URLSearchParams(window.location.search);
    const queryValue = search.get(DATE_DEBUG_QUERY_PARAM);
    if (queryValue === "1") {
      window.localStorage?.setItem(DATE_DEBUG_STORAGE_KEY, "1");
      return "1";
    }
    if (queryValue === "0") {
      window.localStorage?.removeItem(DATE_DEBUG_STORAGE_KEY);
      return null;
    }

    return window.localStorage?.getItem(DATE_DEBUG_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getDebugSessionId() {
  if (typeof window === "undefined") return null;

  try {
    const existing = window.localStorage?.getItem(DATE_DEBUG_SESSION_KEY);
    if (existing) return existing;

    const next = [Date.now(), Math.floor(Math.random() * 1_000_000_000).toString(36)].join(".");
    window.localStorage?.setItem(DATE_DEBUG_SESSION_KEY, next);
    return next;
  } catch {
    return null;
  }
}

export function isDateDebugEnabled() {
  const queryOrStorage = getClientValue();
  if (queryOrStorage) return queryOrStorage === "1";

  return process.env.NEXT_PUBLIC_DATE_DEBUG === "1" || process.env.DEBUG_DATE_DEBUG === "1";
}

function buildDateDebugContext(
  scope: string = "default",
  itemId?: string
): DateDebugContext | null {
  if (!isDateDebugEnabled()) return null;

  const sessionId = getDebugSessionId() || "no-session";
  const requestId = [Date.now(), Math.floor(Math.random() * 1_000_000).toString(36), toShortId(Math.random() * 1_000_000)].join(".");

  return {
    requestId,
    sessionId,
    scope,
    itemId,
    headers: {
      [DATE_DEBUG_HEADER]: "1",
      [DATE_DEBUG_SESSION_HEADER]: sessionId,
      [DATE_DEBUG_REQUEST_HEADER]: requestId,
      [DATE_DEBUG_SCOPE_HEADER]: scope,
      ...(itemId ? { [DATE_DEBUG_ITEM_HEADER]: itemId } : {})
    }
  };
}

export function dateDebugHeaders(scope?: string, itemId?: string) {
  const context = buildDateDebugContext(scope, itemId);
  return context ? context.headers : {};
}

export function createDateDebugContext(scope?: string, itemId?: string): DateDebugContext | null {
  return buildDateDebugContext(scope, itemId);
}

export function shouldLogDateRequest(request: Request) {
  if (request.headers.get(DATE_DEBUG_HEADER) === "1") return true;

  const url = new URL(request.url);
  const queryEnabled = url.searchParams.get(DATE_DEBUG_QUERY_PARAM) === "1";
  return (
    queryEnabled ||
    request.headers.has(DATE_DEBUG_REQUEST_HEADER) ||
    process.env.NEXT_PUBLIC_DATE_DEBUG === "1" ||
    process.env.DEBUG_DATE_DEBUG === "1"
  );
}

export function getDateDebugContextFromRequest(request: Request) {
  if (!shouldLogDateRequest(request)) return null;

  const requestSequenceHeader = request.headers.get(DATE_DEBUG_SEQUENCE_HEADER);
  const requestSequence = requestSequenceHeader && /^\d+$/.test(requestSequenceHeader) ? Number(requestSequenceHeader) : null;

  return {
    requestId: request.headers.get(DATE_DEBUG_REQUEST_HEADER) || null,
    sessionId: request.headers.get(DATE_DEBUG_SESSION_HEADER),
    scope: request.headers.get(DATE_DEBUG_SCOPE_HEADER),
    itemId: request.headers.get(DATE_DEBUG_ITEM_HEADER),
    requestSequence,
    clientUpdatedAt: request.headers.get(DATE_DEBUG_CLIENT_UPDATED_AT_HEADER)
  };
}

export function debugDateLog(scope: string, payload: unknown) {
  if (!isDateDebugEnabled()) return;
  console.log(`[date-debug] ${scope}`, payload);
}
