/** webFetch：可信 URL 抓取（三级降级链），缓存优先 + 配额护栏 + 三段式输出 */
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getFetchCache, isCacheFresh, putFetchCache } from '../web-cache';
import { routeFetch } from '../web-fetch-router';
import { normalizeUrl } from '../web-url-guard';

const inputSchema = z.strictObject({
  url: z.string().min(1).describe('目标 URL（须来自 webSearch 结果或用户提供，http/https）'),
  extractPrompt: z.string().optional().describe('提取要点提示（预留，D1 全文转 Markdown）'),
  refresh: z.boolean().optional().describe('绕过缓存强制重抓，默认 false'),
});

// —— 可信 URL 集合（模块级，进程生命周期）——
const trustedUrls = new Set<string>();
export function addTrustedUrls(urls: string[]): void {
  for (const u of urls) trustedUrls.add(u);
}
export function isTrustedUrl(url: string): boolean {
  return trustedUrls.has(url);
}

// —— 会话配额（模块级计数，runAgentTurn 每轮重置 = 一个任务）——
const MAX_FETCH_PER_TASK = 8;
let fetchCount = 0;
export function resetWebQuota(): void {
  fetchCount = 0;
}

export const webFetchTool = createDomainTool({
  name: 'webFetch',
  description: '抓取指定网页正文并转为 Markdown，供分析岗位 JD/公司官网/行业文章。参数 url 为目标链接（必须来自 webSearch 结果或用户消息中提供的 URL，直接构造会返回 FETCH_SOURCE_RESTRICTED）、extractPrompt 提取要点提示（可选）、refresh 强制重抓（可选）。命中 24h 缓存不重抓；需登录/验证码的页面返回明确错误（FETCH_NEEDS_LOGIN/FETCH_BLOCKED）。返回 ok、url、title、content（Markdown 截断至 12000 字符）、source（direct/jina/opencli）、cached 与 citations 引用列表。',
  inputSchema,
  progress: { start: '正在抓取网页…', done: '抓取完成' },
  execute: async (args) => {
    // 配额护栏
    fetchCount += 1;
    if (fetchCount > MAX_FETCH_PER_TASK) {
      return {
        ok: false,
        error: {
          code: 'QUOTA_EXCEEDED',
          message: `本次任务 webFetch 已达 ${MAX_FETCH_PER_TASK} 次上限`,
          hint: '减少抓取目标或先调用 webSearch 精确定位；新任务（新一轮对话）会重置配额。',
        },
      };
    }
    // 来源约束
    let url: string;
    try {
      url = normalizeUrl(args.url);
    } catch (err) {
      return { ok: false, error: { code: 'FETCH_SOURCE_RESTRICTED', message: `URL 非法：${err instanceof Error ? err.message : String(err)}`, hint: '仅支持 http/https 公网 URL。' } };
    }
    if (!isTrustedUrl(url)) {
      return {
        ok: false,
        error: {
          code: 'FETCH_SOURCE_RESTRICTED',
          message: '目标 URL 不在可信来源集合',
          hint: 'webFetch 仅接受 webSearch 结果中的 URL 或用户消息中明确提供的 URL；请先用 webSearch 搜索或让用户提供链接。',
        },
      };
    }
    // 缓存优先
    if (!args.refresh) {
      const hit = getFetchCache(url);
      if (hit && isCacheFresh(hit, hit.ttlSec * 1000)) {
        return {
          ok: true,
          url, title: hit.markdown.split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 120) ?? '',
          content: hit.markdown,
          source: hit.source as 'direct' | 'jina' | 'opencli',
          cached: true,
          truncated: false,
          citations: [url],
        };
      }
    }
    // 降级链抓取
    const outcome = await routeFetch({ url });
    if (!outcome.ok) {
      return { ok: false, error: { code: outcome.code, message: outcome.message, hint: outcome.hint } };
    }
    putFetchCache({ url, markdown: outcome.content, source: outcome.source });
    return {
      ok: true,
      url: outcome.url, title: outcome.title, content: outcome.content,
      source: outcome.source, cached: false, truncated: outcome.truncated,
      citations: [outcome.url],
    };
  },
});
