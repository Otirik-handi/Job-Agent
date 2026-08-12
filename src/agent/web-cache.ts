/** fetch_cache 存取（TTL 判定）：缓存优先、refresh 显式绕过（设计 §6） */
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { fetchCache } from '../db/schema';
import { nowIso } from '../db/repositories/shared';

export type FetchCacheRow = {
  url: string; markdown: string; source: string; fetchedAt: string; ttlSec: number;
};

export function getFetchCache(url: string): FetchCacheRow | null {
  const row = db.select().from(fetchCache).where(eq(fetchCache.url, url)).get();
  return row ?? null;
}

export function putFetchCache(args: { url: string; markdown: string; source: 'direct' | 'jina' | 'opencli' }): void {
  db.insert(fetchCache).values({
    url: args.url,
    markdown: args.markdown,
    source: args.source,
    fetchedAt: nowIso(),
    ttlSec: 86400,
  }).onConflictDoUpdate({ target: fetchCache.url, set: {
    markdown: args.markdown, source: args.source, fetchedAt: nowIso(), ttlSec: 86400,
  } }).run();
}

/** 命中判定：fetchedAt + ttlSec > now（ttlMs 传 0 模拟过期，测试用） */
export function isCacheFresh(row: FetchCacheRow, ttlMs: number): boolean {
  const fetched = new Date(row.fetchedAt).getTime();
  const ttl = ttlMs === 0 ? 0 : row.ttlSec * 1000;
  return Date.now() - fetched < ttl;
}
