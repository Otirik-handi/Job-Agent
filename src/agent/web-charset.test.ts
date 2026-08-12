import { describe, expect, it } from 'vitest';
import { decodeHtmlBytes } from './web-charset';

describe('decodeHtmlBytes（字符集检测与转码）', () => {
  it('header charset 优先', () => {
    const gbk = Buffer.from([0xD5, 0xC5]); // '张'
    expect(decodeHtmlBytes(gbk, 'text/html; charset=GBK')).toBe('张');
  });
  it('meta 声明兜底', () => {
    const gbk = Buffer.from([0xD5, 0xC5]);
    const html = Buffer.concat([Buffer.from('<meta charset="gb2312">'), gbk]);
    expect(decodeHtmlBytes(html, 'text/html')).toBe('<meta charset="gb2312">张');
  });
  it('无声明按 UTF-8', () => {
    expect(decodeHtmlBytes(Buffer.from('你好'), 'text/html')).toBe('你好');
  });
  it('未知字符集回退 UTF-8 不抛错', () => {
    expect(decodeHtmlBytes(Buffer.from('x'), 'text/html; charset=xxx')).toBe('x');
  });
});
