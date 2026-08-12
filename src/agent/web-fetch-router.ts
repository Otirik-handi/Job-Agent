/** 三级降级链：direct → jina → opencli（插件注册表；未注册自动跳过，不可用/失败映射 FETCH_BLOCKED） */
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

/** 网络层失败（fetch reject：连接失败/超时等）映射为结构化错误，避免冒泡为 TOOL_FAILED 并让降级链继续 */
function networkErrorOutcome(phase: string, err: unknown): Extract<FetchOutcome, { ok: false }> {
  const detail = err instanceof Error ? (err.name === 'AbortError' ? '请求超时' : err.message) : String(err);
  return { ok: false, code: 'FETCH_FAILED', message: `${phase}网络请求失败（${detail}）`, hint: '网络不可达或目标站点拒绝连接，触发降级层继续尝试。' };
}

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
  let res: Response;
  try {
    res = await fetchWithTimeout(fetchImpl, url, DIRECT_TIMEOUT_MS);
  } catch (err) {
    return networkErrorOutcome('直接抓取', err);
  }
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
  let res: Response;
  try {
    res = await fetchWithTimeout(fetchImpl, `https://r.jina.ai/${url}`, JINA_TIMEOUT_MS);
  } catch (err) {
    return networkErrorOutcome('Jina 渲染', err);
  }
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
  const direct = await directFetch(fetchImpl, url, maxChars);
  if (direct.ok) return direct;
  const jina = await jinaFetch(fetchImpl, url, maxChars);
  if (jina.ok) return jina;
  // opencli 插件层：经注册表调用（未注册 → 跳过；可用性由插件 fetch 内部判定——冷缓存首次 await doctor，避免首轮误判）
  const openCliPlugin = getPlugin('open-cli');
  if (openCliPlugin && openCliPlugin.canHandle(url)) {
    let outcome: Awaited<ReturnType<typeof openCliPlugin.fetch>>;
    try {
      outcome = await openCliPlugin.fetch(url);
    } catch (err) {
      return networkErrorOutcome('OpenCLI 采集', err);
    }
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
  // 全链路失败：网络层原因（direct/jina 均为 FETCH_FAILED）归为 FETCH_FAILED，站点拦截类归为 FETCH_BLOCKED
  const allNetwork = direct.code === 'FETCH_FAILED' && jina.code === 'FETCH_FAILED';
  return {
    ok: false,
    code: allNetwork ? 'FETCH_FAILED' : 'FETCH_BLOCKED',
    message: `抓取失败：direct（${direct.message}）→ jina（${jina.message}）`,
    hint: '可尝试浏览器手动查看后粘贴导入（importJobOpportunity），或确认 OpenCLI 插件可用后重试。',
  };
}
