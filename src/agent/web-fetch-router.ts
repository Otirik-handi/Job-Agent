/** 三级降级链：direct → jina → opencli（插件注册表；未注册/不可用自动跳过） */
import { decodeHtmlBytes } from './web-charset';
import { htmlToMarkdown } from './web-html';
import { detectWaf } from './web-waf-detect';
import { isSafeFetchUrl, normalizeUrl } from './web-url-guard';
import { getPlugin } from '../plugins/registry';

export type FetchSource = 'direct' | 'jina' | 'opencli';

export type FetchOutcome =
  | { ok: true; url: string; title: string; content: string; source: FetchSource; truncated: boolean; maxChars: number }
  | { ok: false; code: 'FETCH_BLOCKED' | 'FETCH_SSRF_BLOCKED' | 'FETCH_FAILED' | 'FETCH_NEEDS_LOGIN'; message: string; hint: string };

const DIRECT_TIMEOUT_MS = 5_000;
const JINA_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_CHARS = 12_000;

/** 域名路由矩阵（设计 §4.1；liepin 列表 vs 详情区分，51job/zhipin 预留 opencli） */
export function decideRoute(url: string): FetchSource {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes('zhaopin.com')) return 'direct';
  if (host.includes('liepin.com')) {
    return /\/job\/|jobdetail|job_detail/i.test(url) ? 'direct' : 'jina';
  }
  if (host.includes('51job.com') || host.includes('zhipin.com')) return 'opencli';
  return 'direct';
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>;

async function fetchWithTimeout(fetchImpl: FetchImpl, url: string, timeoutMs: number): Promise<Response> {
  return fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(timeoutMs) });
}

async function directFetch(fetchImpl: FetchImpl, url: string, maxChars: number): Promise<FetchOutcome> {
  const res = await fetchWithTimeout(fetchImpl, url, DIRECT_TIMEOUT_MS);
  const raw = Buffer.from(await res.arrayBuffer());
  const html = decodeHtmlBytes(raw, res.headers.get('content-type'));
  const waf = detectWaf(res.status, res.headers.get('content-type'), html);
  if (waf) {
    return { ok: false, code: 'FETCH_BLOCKED', message: `直接抓取被拦截（${waf}）`, hint: '触发降级层继续尝试。' };
  }
  const markdown = htmlToMarkdown(html);
  if (!markdown) {
    return { ok: false, code: 'FETCH_BLOCKED', message: '直接抓取内容为空', hint: '页面可能为 JS 渲染壳，触发降级层。' };
  }
  const truncated = markdown.length > maxChars;
  const title = markdown.split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 120) ?? '';
  return { ok: true, url, title, content: markdown.slice(0, maxChars), source: 'direct', truncated, maxChars };
}

async function jinaFetch(fetchImpl: FetchImpl, url: string, maxChars: number): Promise<FetchOutcome> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetchWithTimeout(fetchImpl, jinaUrl, JINA_TIMEOUT_MS);
  if (res.status < 200 || res.status >= 300) {
    return { ok: false, code: 'FETCH_BLOCKED', message: `Jina 渲染失败（HTTP ${res.status}）`, hint: '该站点可能需 OpenCLI 后端（D2）或人工查看。' };
  }
  const content = await res.text();
  if (!content.trim()) {
    return { ok: false, code: 'FETCH_BLOCKED', message: 'Jina 渲染内容为空', hint: '尝试 OpenCLI 后端或人工查看。' };
  }
  const truncated = content.length > maxChars;
  const title = content.split('\n').find((l) => l.startsWith('Title:'))?.slice(6).trim() ?? '';
  return { ok: true, url, title, content: content.slice(0, maxChars), source: 'jina', truncated, maxChars };
}

/** 降级链入口：direct → jina → opencli 插件层；全败返回 FETCH_BLOCKED */
export async function routeFetch(args: {
  url: string;
  fetchImpl?: FetchImpl;
  maxChars?: number;
}): Promise<FetchOutcome> {
  const fetchImpl = args.fetchImpl ?? ((u: string, init?: RequestInit) => fetch(u, init));
  const url = normalizeUrl(args.url);
  const maxChars = args.maxChars ?? DEFAULT_MAX_CHARS;
  if (!(await isSafeFetchUrl(url))) {
    return { ok: false, code: 'FETCH_SSRF_BLOCKED', message: '目标地址为内网/环回地址，已阻断', hint: '仅允许公网 http/https URL。' };
  }
  const route = decideRoute(url);
  const direct = await directFetch(fetchImpl, url, maxChars);
  if (direct.ok) return direct;
  const jina = await jinaFetch(fetchImpl, url, maxChars);
  if (jina.ok) return jina;
  // opencli 插件层：经注册表调用（未注册/不可用 → 跳过，保持 D1 行为）
  const openCliPlugin = getPlugin('open-cli');
  if (openCliPlugin && openCliPlugin.canHandle(url) && openCliPlugin.isAvailable()) {
    const outcome = await openCliPlugin.fetch(url);
    if (outcome.ok) {
      const truncated = outcome.content.length > maxChars;
      return {
        ok: true, url, title: outcome.title,
        content: outcome.content.slice(0, maxChars),
        source: 'opencli', truncated, maxChars,
      };
    }
    if (outcome.code === 'NEEDS_LOGIN') {
      return { ok: false, code: 'FETCH_NEEDS_LOGIN', message: outcome.message, hint: outcome.hint };
    }
    return { ok: false, code: 'FETCH_BLOCKED', message: outcome.message, hint: outcome.hint };
  }
  return {
    ok: false,
    code: 'FETCH_BLOCKED',
    message: `抓取失败：direct（${direct.ok ? '' : direct.message}）→ jina（${jina.ok ? '' : jina.message}）`,
    hint: '可尝试浏览器手动查看后粘贴导入（importJobOpportunity），或确认 OpenCLI 插件可用后重试。',
  };
}
