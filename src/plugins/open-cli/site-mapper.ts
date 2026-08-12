/** URL → opencli 命令映射（实测 CLI：opencli <site> <cmd> <arg> -f json）。
 * 只映射只读命令（detail/search）；写命令（boss greet/send 等）不暴露。 */
export type SiteCommand = { site: '51job' | 'boss'; cmd: 'detail' | 'search'; args: string[] };

/** 从 URL query 提取搜索词（keyword/query 参数）；无则空数组（search 无参由模型/调用方补） */
function searchQuery(url: URL): string[] {
  const kw = url.searchParams.get('keyword') ?? url.searchParams.get('query') ?? '';
  return kw.trim() ? [kw.trim()] : [];
}

export function mapUrlToCommand(rawUrl: string): SiteCommand | null {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (host.includes('51job.com')) {
    const detail = path.match(/\/jobs\/([^/]+)\.html$/);
    if (detail) return { site: '51job', cmd: 'detail', args: [detail[1]] };
    const kw = searchQuery(url);
    return { site: '51job', cmd: 'search', args: kw };
  }
  if (host.includes('zhipin.com')) {
    const detail = path.match(/\/job_detail\/([^/]+)\.html/);
    if (detail) return { site: 'boss', cmd: 'detail', args: [detail[1]] };
    return { site: 'boss', cmd: 'search', args: searchQuery(url) };
  }
  return null;
}
