const CACHE = new Map<string, string | null>();

function trimNullable(value: string | null | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function resolveGoogleDocumentTitle(url: string) {
  const normalizedUrl = trimNullable(url);
  if (!normalizedUrl) return null;

  const cached = CACHE.get(normalizedUrl);
  if (cached !== undefined) return cached;

  try {
    const response = await fetch("/api/google-documents/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: normalizedUrl })
    });

    if (!response.ok) {
      CACHE.set(normalizedUrl, null);
      return null;
    }

    const payload = (await response.json()) as { title?: unknown };
    const title = trimNullable(typeof payload.title === "string" ? payload.title : null);
    CACHE.set(normalizedUrl, title);
    return title;
  } catch {
    CACHE.set(normalizedUrl, null);
    return null;
  }
}
