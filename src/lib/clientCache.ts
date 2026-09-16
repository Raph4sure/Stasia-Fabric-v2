// High-performance client-side SWR (Stale-While-Revalidate) caching layer

interface CacheEntry<T> {
  data: T;
  etag?: string;
  timestamp: number;
}

const memoryStore = new Map<string, CacheEntry<any>>();

export function getClientCachedData<T>(key: string, maxAgeMs = 60000): T | null {
  if (typeof window === 'undefined') return null;

  // 1. Check memory
  const mem = memoryStore.get(key);
  if (mem) {
    return mem.data;
  }

  // 2. Check sessionStorage
  try {
    const raw = sessionStorage.getItem(`stasia_swr_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() - parsed.timestamp < maxAgeMs * 2) {
        memoryStore.set(key, parsed);
        return parsed.data;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

export function getClientCachedEntry<T>(key: string): { data: T; etag?: string; timestamp: number } | null {
  if (typeof window === 'undefined') return null;

  const mem = memoryStore.get(key);
  if (mem) {
    return { data: mem.data, etag: mem.etag, timestamp: mem.timestamp };
  }

  try {
    const raw = sessionStorage.getItem(`stasia_swr_${key}`);
    if (raw) {
      const parsed: CacheEntry<T> = JSON.parse(raw);
      memoryStore.set(key, parsed);
      return { data: parsed.data, etag: parsed.etag, timestamp: parsed.timestamp };
    }
  } catch {
    // ignore
  }

  return null;
}

export function setClientCachedData<T>(key: string, data: T, etag?: string) {
  if (typeof window === 'undefined') return;

  const entry: CacheEntry<T> = {
    data,
    etag,
    timestamp: Date.now(),
  };

  memoryStore.set(key, entry);
  try {
    sessionStorage.setItem(`stasia_swr_${key}`, JSON.stringify(entry));
  } catch {
    // sessionStorage full or blocked, ignore
  }
}

export function touchClientCache(key: string) {
  const mem = memoryStore.get(key);
  if (mem) {
    mem.timestamp = Date.now();
  }
}

export function isClientCacheFresh(key: string, maxAgeMs = 30000): boolean {
  const mem = memoryStore.get(key);
  if (!mem) return false;
  return Date.now() - mem.timestamp < maxAgeMs;
}

export function invalidateClientCache(keyPrefix?: string) {
  if (typeof window === 'undefined') return;

  if (!keyPrefix) {
    memoryStore.clear();
    try {
      const keys = Object.keys(sessionStorage);
      for (const k of keys) {
        if (k.startsWith('stasia_swr_')) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
    return;
  }

  for (const k of memoryStore.keys()) {
    if (k.startsWith(keyPrefix)) {
      memoryStore.delete(k);
    }
  }

  try {
    const prefix = `stasia_swr_${keyPrefix}`;
    const keys = Object.keys(sessionStorage);
    for (const k of keys) {
      if (k.startsWith(prefix)) {
        sessionStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
}
