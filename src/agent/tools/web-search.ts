/** webSearch：多供应商实时搜索（Tavily/智谱/Brave 按 key 自动选择），只返回元数据，正文由 webFetch 承接 */
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { searchWeb } from '../web-search-provider';
import { addTrustedUrls } from './web-fetch';

const inputSchema = z.strictObject({
  query: z.string().min(1).max(200).describe('搜索词（职位/公司/行业信息）'),
  maxResults: z.number().int().min(1).max(10).optional().describe('结果条数，默认 5'),
  freshness: z.enum(['day', 'week', 'month']).optional().describe('时间过滤（Tavily/Brave 支持）'),
});

export const webSearchTool = createDomainTool({
  name: 'webSearch',
  description: '实时网络搜索：返回职位/公司/行业信息的结果列表（标题+URL+摘要）。参数 query 为搜索词（1-200 字符）、maxResults 条数（1-10 默认 5）、freshness 时间过滤（day/week/month）。只返回元数据不取正文，需要正文请调用 webFetch；结果中的 URL 来自可信搜索索引，可直接用于 webFetch 参数。返回 ok、count 与 results（title/url/snippet/source 域名），结果 URL 自动加入可信集合。',
  inputSchema,
  progress: { start: '正在搜索…', done: '搜索完成' },
  execute: async (args) => {
    let results;
    try {
      results = await searchWeb({ query: args.query, maxResults: args.maxResults ?? 5 });
    } catch (err) {
      return {
        ok: false,
        error: {
          code: 'SEARCH_FAILED',
          message: `搜索失败：${err instanceof Error ? err.message : String(err)}`,
          hint: '网络异常或供应商 API 不可用，可稍后重试。',
        },
      };
    }
    if (results === null) {
      return {
        ok: false,
        error: {
          code: 'SEARCH_NOT_CONFIGURED',
          message: '未配置任何搜索供应商 key',
          hint: '请配置 TAVILY_API_KEY（免费层，推荐）或 ZHIPU_API_KEY（智谱）或 BRAVE_API_KEY 之一到本地环境变量后重试。',
        },
      };
    }
    addTrustedUrls(results.map((r) => r.url));
    return { ok: true, query: args.query, results, count: results.length, cached: false };
  },
});
