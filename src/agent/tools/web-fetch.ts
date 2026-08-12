// src/agent/tools/web-fetch.ts（Task 8 占位版，Task 9 补全）
/** 可信 URL 集合注册（webSearch 结果 / 用户消息提取 / 工具内部使用） */
const trustedUrls = new Set<string>();
export function addTrustedUrls(urls: string[]): void {
  for (const u of urls) trustedUrls.add(u);
}
export function isTrustedUrl(url: string): boolean {
  return trustedUrls.has(url);
}
