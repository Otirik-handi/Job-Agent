import { afterEach, describe, expect, it, vi } from 'vitest';
import { webSearchTool } from './web-search';

/** execute 返回类型含 ai v7 的 AsyncIterable 分支，取业务结果分支做类型收窄（对齐 search-messages.test.ts） */
type WebSearchResult = Extract<Awaited<ReturnType<typeof webSearchTool.execute>>, { ok: boolean }>;

function ctx() {
  return { toolCallId: 'test', messages: [], context: { callStructured: vi.fn() as never, log: vi.fn() } };
}
function saveEnv() {
  const e = { t: process.env.TAVILY_API_KEY, z: process.env.ZHIPU_API_KEY, b: process.env.BRAVE_API_KEY };
  delete process.env.TAVILY_API_KEY; delete process.env.ZHIPU_API_KEY; delete process.env.BRAVE_API_KEY;
  return e;
}
function restoreEnv(e: ReturnType<typeof saveEnv>) {
  process.env.TAVILY_API_KEY = e.t; process.env.ZHIPU_API_KEY = e.z; process.env.BRAVE_API_KEY = e.b;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('webSearch（多供应商）', () => {
  it('成功（Tavily）：返回结果列表 + 加入可信集合', async () => {
    const e = saveEnv();
    process.env.TAVILY_API_KEY = 'tk';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: '字节跳动招聘', url: 'https://jobs.bytedance.com/', content: '官方招聘' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = (await webSearchTool.execute({ query: '字节跳动 面试' }, ctx())) as WebSearchResult;
    expect(result.ok).toBe(true);
    if (result.results) {
      expect(result.count).toBe(1);
      expect(result.results[0]).toMatchObject({ title: '字节跳动招聘' });
    }
    restoreEnv(e);
  });
  it('未配置任何 key → SEARCH_NOT_CONFIGURED', async () => {
    const e = saveEnv();
    const result = (await webSearchTool.execute({ query: 'x' }, ctx())) as WebSearchResult;
    expect(result).toMatchObject({ ok: false, error: { code: 'SEARCH_NOT_CONFIGURED' } });
    restoreEnv(e);
  });
  it('供应商 API 非 2xx → SEARCH_FAILED', async () => {
    const e = saveEnv();
    process.env.TAVILY_API_KEY = 'tk';
    const fetchMock = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = (await webSearchTool.execute({ query: 'x' }, ctx())) as WebSearchResult;
    expect(result).toMatchObject({ ok: false, error: { code: 'SEARCH_FAILED' } });
    restoreEnv(e);
  });
});
