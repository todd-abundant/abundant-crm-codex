export type CachedLookupResult<T> = {
  data: T;
  fromCache: boolean;
};

type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  inFlight?: Promise<CachedLookupResult<T>>;
  lastAccessAt: number;
};

const cache = new Map<string, CacheEntry<unknown>>();

function normalizeKey(value: string) {
  return value.trim().toLowerCase();
}

function purgeExpired(now: number) {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function cleanupCapacity(capacity = 200) {
  if (cache.size <= capacity) return;

  const entries = [...cache.entries()].sort((a, b) => a[1].lastAccessAt - b[1].lastAccessAt);
  const toDelete = entries.slice(0, cache.size - capacity);
  for (const [key] of toDelete) {
    cache.delete(key);
  }
}

export async function getCachedLookup<T>(
  rawKey: string,
  fetcher: () => Promise<T>,
  ttlMs = 60_000
): Promise<CachedLookupResult<T>> {
  const key = normalizeKey(rawKey);
  const now = Date.now();
  purgeExpired(now);

  const cached = cache.get(key) as CacheEntry<T> | undefined;
  if (cached) {
    cached.lastAccessAt = now;
    if (cached.value !== undefined && cached.expiresAt > now) {
      return { data: cached.value, fromCache: true };
    }

    if (cached.inFlight) {
      const inFlight = await cached.inFlight;
      return inFlight;
    }
  }

  const inFlight = (async () => {
    const data = await fetcher();
    const entry = cache.get(key);
    cache.set(key, {
      value: data,
      expiresAt: Date.now() + ttlMs,
      lastAccessAt: Date.now()
    });

    if (entry?.inFlight === inFlight) {
      const refreshed = cache.get(key);
      if (refreshed) {
        refreshed.inFlight = undefined;
        refreshed.value = data;
        refreshed.lastAccessAt = Date.now();
      }
    }

    return { data, fromCache: false };
  })();

  cache.set(key, {
    inFlight,
    value: cached?.value,
    expiresAt: now + ttlMs,
    lastAccessAt: now
  });

  cleanupCapacity();

  try {
    return await inFlight;
  } catch (error) {
    const entry = cache.get(key);
    if (entry && entry.inFlight === inFlight) {
      cache.delete(key);
    }
    throw error;
  }
}
