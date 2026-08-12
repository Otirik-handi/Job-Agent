import { describe, expect, it } from 'vitest';
import { isSafeFetchUrl, normalizeUrl } from './web-url-guard';

describe('normalizeUrl（规范化）', () => {
  it('去 fragment、排序 query 参数、补默认端口', () => {
    expect(normalizeUrl('https://a.com/p?b=2&a=1#sec')).toBe('https://a.com/p?a=1&b=2');
    expect(normalizeUrl('HTTP://A.com:443/x')).toBe('https://a.com/x');
  });
  it('非 http/https 或非法 URL 抛错', () => {
    expect(() => normalizeUrl('ftp://a.com/x')).toThrow();
    expect(() => normalizeUrl('not a url')).toThrow();
  });
});

describe('isSafeFetchUrl（SSRF 防护）', () => {
  it('拒绝内网/环回/链路本地地址', async () => {
    expect(await isSafeFetchUrl('http://127.0.0.1:3000/x')).toBe(false);
    expect(await isSafeFetchUrl('http://localhost/x')).toBe(false);
    expect(await isSafeFetchUrl('http://192.168.1.1/x')).toBe(false);
    expect(await isSafeFetchUrl('http://[::1]/x')).toBe(false);
    expect(await isSafeFetchUrl('http://10.0.0.1/x')).toBe(false);
    expect(await isSafeFetchUrl('http://169.254.169.254/x')).toBe(false); // 云元数据
  });
  it('放行公网地址', async () => {
    expect(await isSafeFetchUrl('https://www.zhaopin.com/jobdetail/1.htm')).toBe(true);
    expect(await isSafeFetchUrl('https://liepin.com/job/123.shtml')).toBe(true);
  });
});
