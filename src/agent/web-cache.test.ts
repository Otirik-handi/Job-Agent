import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db, initDb } from '../db';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getFetchCache, putFetchCache, isCacheFresh } from './web-cache';

beforeEach(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterEach(() => {
  initDb(); // 恢复默认连接
});

describe('web-cache（fetch_cache 存取）', () => {
  it('put 后 get 取回；TTL 未过期 fresh', () => {
    putFetchCache({ url: 'https://a.com/x', markdown: '# 内容', source: 'direct' });
    const row = getFetchCache('https://a.com/x');
    expect(row).not.toBeNull();
    expect(row!.markdown).toBe('# 内容');
    expect(isCacheFresh(row!, 86_400_000)).toBe(true);
  });
  it('超 TTL 不 fresh（forceFetch 语义）', () => {
    putFetchCache({ url: 'https://a.com/y', markdown: 'x', source: 'direct' });
    const row = getFetchCache('https://a.com/y')!;
    expect(isCacheFresh(row, 0)).toBe(false);
  });
  it('同 URL 覆盖更新', () => {
    putFetchCache({ url: 'https://a.com/x', markdown: 'v1', source: 'direct' });
    putFetchCache({ url: 'https://a.com/x', markdown: 'v2', source: 'jina' });
    expect(getFetchCache('https://a.com/x')!.markdown).toBe('v2');
  });
});
