/**
 * URL 规范化与 SSRF 防护（webFetch 前置护栏）。
 * 规范化：小写 host、去默认端口、去 fragment、排序 query 参数（对齐 fetch_cache 主键稳定性）。
 * SSRF：DNS 解析后拒绝内网/环回/链路本地/保留地址（对齐官方 MCP fetch 的已知教训）。
 */
import { lookup } from 'node:dns/promises';

export function normalizeUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`仅支持 http/https URL：${raw.slice(0, 80)}`);
  }
  url.hash = '';
  url.search = new URLSearchParams([...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b))).toString();
  url.hostname = url.hostname.toLowerCase();
  if (url.protocol === 'http:' && url.port === '443') {
    url.protocol = 'https:'; // http:443 视为 https 默认端口
    url.port = '';
  }
  if ((url.protocol === 'http:' && url.port === '80') || (url.protocol === 'https:' && url.port === '443')) {
    url.port = '';
  }
  return url.toString().replace(/\/$/, '');
}

/** 私网/保留地址段判定（含 IPv6 映射） */
function isPrivateIp(ip: string): boolean {
  const v4 = ip.includes(':') ? ip.split(':').pop() ?? ip : ip;
  const parts = v4.split('.').map(Number);
  if (parts.length === 4) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;   // 链路本地（云元数据）
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;                 // 组播/保留
  }
  if (ip === '::1' || ip === '::' || ip.startsWith('fe80:')) return true;
  if (ip.toLowerCase() === 'localhost') return true;
  return false;
}

/** 解析 host 后校验非私网地址；解析失败（DNS 不通）视为安全（后续 fetch 层会失败） */
export async function isSafeFetchUrl(raw: string): Promise<boolean> {
  const url = new URL(raw);
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (hostname === 'localhost') return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) return !isPrivateIp(hostname);
  try {
    const addrs = await lookup(hostname, { all: true });
    return addrs.every(({ address }) => !isPrivateIp(address));
  } catch {
    return true; // DNS 解析失败交给 fetch 层报错
  }
}
