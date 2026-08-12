import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectProvider, searchWeb } from './web-search-provider';

function saveEnv() {
  const e = { t: process.env.TAVILY_API_KEY, z: process.env.ZHIPU_API_KEY, b: process.env.BRAVE_API_KEY };
  delete process.env.TAVILY_API_KEY; delete process.env.ZHIPU_API_KEY; delete process.env.BRAVE_API_KEY;
  return e;
}
function restoreEnv(e: ReturnType<typeof saveEnv>) {
  process.env.TAVILY_API_KEY = e.t; process.env.ZHIPU_API_KEY = e.z; process.env.BRAVE_API_KEY = e.b;
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('detectProvider（按 key 存在性选择，优先级 Tavily > 智谱 > Brave）', () => {
  it('仅 Tavily key → tavily', () => {
    const e = saveEnv();
    process.env.TAVILY_API_KEY = 'tk';
    expect(detectProvider()).toBe('tavily');
    restoreEnv(e);
  });
  it('优先级与缺失：Tavily+智谱→tavily；仅智谱→zhipu；仅 Brave→brave；都没有→null', () => {
    const e = saveEnv();
    process.env.TAVILY_API_KEY = 'tk'; process.env.ZHIPU_API_KEY = 'zk';
    expect(detectProvider()).toBe('tavily');
    delete process.env.TAVILY_API_KEY;
    expect(detectProvider()).toBe('zhipu');
    delete process.env.ZHIPU_API_KEY; process.env.BRAVE_API_KEY = 'bk';
    expect(detectProvider()).toBe('brave');
    delete process.env.BRAVE_API_KEY;
    expect(detectProvider()).toBeNull();
    restoreEnv(e);
  });
});

describe('searchWeb（统一输出 { title, url, snippet, source }）', () => {
  it('Tavily：POST /search，Bearer 鉴权，解析 results', async () => {
    const e = saveEnv();
    process.env.TAVILY_API_KEY = 'tk';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: '字节跳动招聘', url: 'https://jobs.bytedance.com/', content: '官方招聘页' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchWeb({ query: '字节跳动 招聘' });
    expect(result).toHaveLength(1);
    expect(result![0]).toMatchObject({ title: '字节跳动招聘', url: 'https://jobs.bytedance.com/', source: 'jobs.bytedance.com' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.tavily.com/search');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ query: '字节跳动 招聘' });
    restoreEnv(e);
  });
  it('Brave：GET /res/v1/web/search + X-Subscription-Token', async () => {
    const e = saveEnv();
    process.env.BRAVE_API_KEY = 'bk';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      web: { results: [{ title: '面经', url: 'https://example.com/x', description: '经验' }] },
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchWeb({ query: '面试' });
    expect(result![0]).toMatchObject({ title: '面经' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('api.search.brave.com/res/v1/web/search');
    expect((init as RequestInit).headers).toHaveProperty('X-Subscription-Token');
    restoreEnv(e);
  });
  it('智谱：OpenAI 兼容 chat/completions + web_search 工具，提取 search_result', async () => {
    const e = saveEnv();
    process.env.ZHIPU_API_KEY = 'zk';
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '搜索结果', tool_calls: [] } }],
      search_result: [{ title: '智谱搜索项', link: 'https://example.com/z', content: '摘要' }],
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await searchWeb({ query: '公司调研' });
    expect(result![0]).toMatchObject({ title: '智谱搜索项', url: 'https://example.com/z' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/chat/completions');
    const body = JSON.parse(String((init as RequestInit).body));
    expect(body.tools).toEqual([{ type: 'web_search', web_search: { enable: true } }]);
    restoreEnv(e);
  });
  it('无任何 key → null', async () => {
    const e = saveEnv();
    expect(await searchWeb({ query: 'x' })).toBeNull();
    restoreEnv(e);
  });
});
