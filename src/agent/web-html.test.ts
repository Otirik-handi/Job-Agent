import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './web-html';

describe('htmlToMarkdown（轻量转换，复用 trafilatura/readability 思路）', () => {
  it('剥离 script/style，标题/段落/列表/链接保留', () => {
    const html = `<html><head><style>.x{}</style></head><body>
      <script>var _0x=1;</script>
      <h1>岗位名称</h1>
      <p>工作职责：<a href="https://a.com/x">详情</a></p>
      <ul><li>要求一</li><li>要求二</li></ul>
    </body></html>`;
    const md = htmlToMarkdown(html);
    expect(md).toContain('# 岗位名称');
    expect(md).toContain('工作职责：[详情](https://a.com/x)');
    expect(md).toContain('- 要求一');
    expect(md).not.toContain('var _0x');
    expect(md).not.toContain('<style>');
  });
  it('表格转 Markdown 表格', () => {
    const html = '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>';
    const md = htmlToMarkdown(html);
    expect(md).toContain('| A | B |');
    expect(md).toContain('| 1 | 2 |');
  });
  it('压缩空白：连续空行合并、行内多余空格去除', () => {
    const md = htmlToMarkdown('<p>你好    世界</p><p>  </p><p>下一段</p>');
    expect(md).toBe('你好 世界\n\n下一段');
  });
});
