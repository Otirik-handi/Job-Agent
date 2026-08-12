import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, initDb } from '../../db';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { webFetchTool, resetWebQuota, addTrustedUrls } from './web-fetch';

/** execute 返回类型含 ai v7 的 AsyncIterable 分支，取业务结果分支做类型收窄（对齐 web-search.test.ts） */
type WebFetchResult = Extract<Awaited<ReturnType<typeof webFetchTool.execute>>, { ok: boolean }>;

function ctx() {
  return { toolCallId: 'test', messages: [], context: { callStructured: vi.fn() as never, log: vi.fn() } };
}

beforeEach(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterEach(() => {
  initDb(); // 恢复默认连接
  vi.unstubAllGlobals();
});

describe('webFetch（可信集合 + 配额 + 缓存）', () => {
  it('URL 不在可信集合 → FETCH_SOURCE_RESTRICTED', async () => {
    resetWebQuota();
    const result = (await webFetchTool.execute({ url: 'https://unknown.example.com/x' }, ctx())) as WebFetchResult;
    expect(result).toMatchObject({ ok: false, error: { code: 'FETCH_SOURCE_RESTRICTED' } });
  });

  it('可信 URL 抓取成功（direct），命中缓存二次不重抓', async () => {
    resetWebQuota();
    addTrustedUrls(['https://www.zhaopin.com/jobdetail/1.htm']);
    const fetchMock = vi.fn().mockResolvedValue(new Response('<h1>职位详情</h1><p>要求：本科</p>', { status: 200, headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r1 = (await webFetchTool.execute({ url: 'https://www.zhaopin.com/jobdetail/1.htm' }, ctx())) as WebFetchResult;
    vi.unstubAllGlobals();
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      expect(r1.content).toContain('职位详情');
      expect(r1.source).toBe('direct');
      expect(r1.cached).toBe(false);
    }
    // 第二次：缓存命中（不重抓）
    const fetchMock2 = vi.fn();
    vi.stubGlobal('fetch', fetchMock2);
    const r2 = (await webFetchTool.execute({ url: 'https://www.zhaopin.com/jobdetail/1.htm' }, ctx())) as WebFetchResult;
    vi.unstubAllGlobals();
    expect(fetchMock2).not.toHaveBeenCalled();
    if (r2.ok) expect(r2.cached).toBe(true);
  });

  it('配额：每任务 webFetch ≤8 次，超限 QUOTA_EXCEEDED', async () => {
    resetWebQuota();
    addTrustedUrls(['https://a.example.com/1', 'https://a.example.com/2']);
    const fetchMock = vi.fn().mockResolvedValue(new Response('<p>x</p>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    for (let i = 0; i < 8; i++) {
      await webFetchTool.execute({ url: 'https://a.example.com/1' }, ctx());
    }
    const r9 = (await webFetchTool.execute({ url: 'https://a.example.com/2' }, ctx())) as WebFetchResult;
    vi.unstubAllGlobals();
    expect(r9).toMatchObject({ ok: false, error: { code: 'QUOTA_EXCEEDED' } });
  });

  it('refresh: true 绕过缓存重抓', async () => {
    resetWebQuota();
    addTrustedUrls(['https://www.zhaopin.com/jobdetail/2.htm']);
    const fetchMock = vi.fn().mockResolvedValue(new Response('<h1>v1</h1>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await webFetchTool.execute({ url: 'https://www.zhaopin.com/jobdetail/2.htm' }, ctx());
    fetchMock.mockResolvedValue(new Response('<h1>v2</h1>', { status: 200 }));
    const r2 = (await webFetchTool.execute({ url: 'https://www.zhaopin.com/jobdetail/2.htm', refresh: true }, ctx())) as WebFetchResult;
    vi.unstubAllGlobals();
    if (r2.ok) {
      expect(r2.content).toContain('v2');
      expect(r2.cached).toBe(false);
    }
  });
});
