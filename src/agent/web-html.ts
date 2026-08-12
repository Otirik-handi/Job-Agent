/**
 * HTML → Markdown 轻量转换（自研，复用 trafilatura/readability 思路）：
 * 剥离 script/style/注释 → 块级标签换行 → 标题/列表/链接/表格转换 → 空白压缩。
 * 不追求完整规范，目标是职位页/JD/官网正文的可读文本。
 */

export function htmlToMarkdown(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  // 块级标签前后插换行
  s = s.replace(/<\/(?:p|div|section|article|li|tr|h[1-6]|ul|ol|table|thead|tbody|blockquote)>/gi, '\n\n$&');
  s = s.replace(/<(?:br|hr)\s*\/?>/gi, '\n\n');

  // 标题
  s = s.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level: string, inner: string) =>
    `${'#'.repeat(Number(level))} ${inner.replace(/<[^>]+>/g, '').trim()}\n\n`);

  // 列表项
  s = s.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, inner: string) => `- ${inner.replace(/<[^>]+>/g, '').trim()}\n`);

  // 表格：逐行
  s = s.replace(/<table[\s\S]*?<\/table>/gi, (tableHtml: string) => {
    const rows: string[][] = [];
    for (const tr of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
      const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
        .map((m) => m[1].replace(/<[^>]+>/g, '').trim());
      rows.push(cells);
    }
    if (rows.length === 0) return '';
    const header = rows[0];
    const sep = header.map(() => '---').join(' | ');
    const lines = [`| ${header.join(' | ')} |`, `| ${sep} |`];
    for (const row of rows.slice(1)) lines.push(`| ${row.join(' | ')} |`);
    return lines.join('\n') + '\n\n';
  });

  // 链接
  s = s.replace(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href: string, text: string) => {
    const label = text.replace(/<[^>]+>/g, '').trim();
    return label ? `[${label}](${href})` : href;
  });

  // 剩余标签剥离
  s = s.replace(/<[^>]+>/g, ' ');

  // 空白压缩：行内多空格 → 单空格；连续空行 → 单个
  s = s.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').replace(/ *\n */g, '\n').trim();
  return s;
}
