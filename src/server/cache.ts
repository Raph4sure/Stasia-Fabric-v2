// Ultra-fast in-memory cache with tag-based invalidation, revision tracking, and deterministic ETags

interface CacheEntry<T> {
  data: T;
  etag: string;
  expiresAt: number; // 0 = never expires unless invalidated
  tags: string[];
}

class MemoryCache {
  private store = new Map<string, CacheEntry<any>>();
  private tagRevisions = new Map<string, number>();

  getRevision(tag: string): number {
    return this.tagRevisions.get(tag) || 1;
  }

  get<T>(key: string): { data: T; etag: string } | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return { data: entry.data, etag: entry.etag };
  }

  set<T>(key: string, data: T, ttlSeconds = 0, tags: string[] = []): string {
    const serialized = JSON.stringify(data);
    let hash = 0;
    const len = serialized.length;
    for (let i = 0; i < Math.min(len, 2000); i++) {
      hash = ((hash << 5) - hash + serialized.charCodeAt(i)) | 0;
    }
    const rev = tags.length > 0 ? this.getRevision(tags[0]) : 1;
    const etag = `W/"${len}-${Math.abs(hash)}-r${rev}"`;

    this.store.set(key, {
      data,
      etag,
      expiresAt: ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : 0, // 0 means persistent until invalidated
      tags,
    });
    return etag;
  }

  invalidateTags(tags: string[]) {
    const tagSet = new Set(tags);
    for (const tag of tags) {
      this.tagRevisions.set(tag, (this.tagRevisions.get(tag) || 1) + 1);
    }
    for (const [key, entry] of this.store.entries()) {
      if (entry.tags.some((t) => tagSet.has(t))) {
        this.store.delete(key);
      }
    }
  }

  invalidatePrefix(prefix: string) {
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  clear() {
    this.store.clear();
    this.tagRevisions.clear();
  }
}

// Global singleton across serverless/hot reload invocations
const globalCache = (global as any).__boutique_cache || new MemoryCache();
if (process.env.NODE_ENV !== 'production') {
  (global as any).__boutique_cache = globalCache;
}

export const serverCache: MemoryCache = globalCache;
