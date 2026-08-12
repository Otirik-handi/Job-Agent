/** webSearch 多供应商适配层（用户决议 2026-08-12：Brave 需外卡不可用）。
 * 按 key 存在性自动选择：Tavily（免费层，首选）> 智谱（国内支付）> Brave（需外卡）。
 * 统一输出 { title, url, snippet, source }；无可用供应商返回 null（工具层转 SEARCH_NOT_CONFIGURED）。 */
export type SearchResult = { title: string; url: string; snippet: string; source: string };
export type SearchProvider = 'tavily' | 'zhipu' | 'brave';

export function detectProvider(): SearchProvider | null {
  if (process.env.TAVILY_API_KEY) return 'tavily';
  if (process.env.ZHIPU_API_KEY) return 'zhipu';
  if (process.env.BRAVE_API_KEY) return 'brave';
  return null;
}

const SEARCH_TIMEOUT_MS = 10_000;

async function searchTavily(query: string, maxResults: number): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY!;
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ query, max_results: maxResults, search_depth: 'basic', topic: 'general' }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`tavily HTTP ${res.status}`);
  const data = (await res.json()) as { results?: Array<{ title?: string; url?: string; content?: string }> };
  return (data.results ?? []).map((r) => ({
    title: r.title ?? '', url: r.url ?? '', snippet: r.content ?? '',
    source: (() => { try { return new URL(r.url ?? '').hostname; } catch { return ''; } })(),
  }));
}

async function searchBrave(query: string, maxResults: number): Promise<SearchResult[]> {
  const apiKey = process.env.BRAVE_API_KEY!;
  const params = new URLSearchParams({ q: query, count: String(maxResults) });
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`brave HTTP ${res.status}`);
  const data = (await res.json()) as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? '', url: r.url ?? '', snippet: r.description ?? '',
    source: (() => { try { return new URL(r.url ?? '').hostname; } catch { return ''; } })(),
  }));
}

/** 智谱：OpenAI 兼容 chat/completions + web_search 工具触发联网搜索，提取 search_result 列表。
 * 响应结构（search_result 顶层数组）以实测为准——若实测不同（如在 message 内），实现时按实测字段适配。 */
async function searchZhipu(query: string, maxResults: number): Promise<SearchResult[]> {
  const baseUrl = (process.env.ZHIPU_BASE_URL ?? 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
  const model = process.env.ZHIPU_MODEL ?? 'glm-4-flash';
  const apiKey = process.env.ZHIPU_API_KEY!;
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: query }],
      tools: [{ type: 'web_search', web_search: { enable: true } }],
      max_tokens: 64,
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`zhipu HTTP ${res.status}`);
  const data = (await res.json()) as { search_result?: Array<{ title?: string; link?: string; content?: string }> };
  return (data.search_result ?? []).slice(0, maxResults).map((r) => ({
    title: r.title ?? '', url: r.link ?? '', snippet: r.content ?? '',
    source: (() => { try { return new URL(r.link ?? '').hostname; } catch { return ''; } })(),
  }));
}

/** 统一搜索入口：无供应商 → null；供应商调用失败 → 抛错（工具层转 SEARCH_FAILED） */
export async function searchWeb(args: { query: string; maxResults?: number }): Promise<SearchResult[] | null> {
  const provider = detectProvider();
  if (!provider) return null;
  const maxResults = args.maxResults ?? 5;
  switch (provider) {
    case 'tavily': return searchTavily(args.query, maxResults);
    case 'zhipu': return searchZhipu(args.query, maxResults);
    case 'brave': return searchBrave(args.query, maxResults);
  }
}
