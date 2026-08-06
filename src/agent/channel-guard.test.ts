import { describe, expect, it } from 'vitest';
import {
  extractCandidates, isJobBoardDomain, verifyChannel,
} from './channel-guard';

describe('channel-guard: extractCandidates', () => {
  it('提取 JD 中的 URL 与邮箱', () => {
    const jd = '投递邮箱 hr@example.com，官网 https://example.com/careers，详情见 https://www.example.com/jobs/1。';
    const { urls, emails } = extractCandidates(jd);
    expect(urls).toEqual(['https://example.com/careers', 'https://www.example.com/jobs/1']);
    expect(emails).toEqual(['hr@example.com']);
  });
  it('URL 尾部标点被清洗', () => {
    const { urls } = extractCandidates('官网 https://example.com/careers。');  // 中文句号
    expect(urls).toEqual(['https://example.com/careers']);
    const { urls: urls2 } = extractCandidates('官网 https://example.com/careers).');
    expect(urls2).toEqual(['https://example.com/careers']);
  });
  it('重复 URL/邮箱去重保序', () => {
    const { urls, emails } = extractCandidates('https://example.com/a https://example.com/a hr@x.com HR@X.COM');
    expect(urls).toEqual(['https://example.com/a']);
    expect(emails).toEqual(['hr@x.com']);
  });
  it('无匹配时返回空数组', () => {
    const { urls, emails } = extractCandidates('没有链接也没有邮箱的文本');
    expect(urls).toEqual([]);
    expect(emails).toEqual([]);
  });
  it('非 http(s) 协议链接不提取', () => {
    const { urls } = extractCandidates('ftp://example.com/file');
    expect(urls).toEqual([]);
  });
});

describe('channel-guard: isJobBoardDomain', () => {
  it('裸域命中黑名单', () => {
    expect(isJobBoardDomain('https://zhipin.com')).toBe(true);
  });
  it('子域名命中黑名单', () => {
    expect(isJobBoardDomain('https://www.zhipin.com/jobs/1')).toBe(true);
    expect(isJobBoardDomain('https://m.lagou.com/')).toBe(true);
  });
  it('普通域名不命中', () => {
    expect(isJobBoardDomain('https://example.com')).toBe(false);
    expect(isJobBoardDomain('https://acme-corp.com/careers')).toBe(false);
  });
  it('黑名单前缀相似的域名不误伤', () => {
    expect(isJobBoardDomain('https://evilzhipin.com')).toBe(false);
    expect(isJobBoardDomain('https://zhipin.com.evil.com')).toBe(false);
  });
  it('非法 URL 不命中', () => {
    expect(isJobBoardDomain('not a url')).toBe(false);
  });
});

describe('channel-guard: verifyChannel', () => {
  const allowedUrls = ['https://example.com/careers'];
  const allowedEmails = ['hr@example.com'];

  it('引用提取集合内的 URL 与邮箱 → verified', () => {
    expect(verifyChannel({ url: 'https://example.com/careers', email: null }, allowedUrls, allowedEmails)).toBe('verified');
    expect(verifyChannel({ url: null, email: 'HR@example.com' }, allowedUrls, allowedEmails)).toBe('verified');
    expect(verifyChannel({ url: 'https://example.com/careers/', email: 'hr@example.com' }, allowedUrls, allowedEmails)).toBe('verified');
  });
  it('引用集合外 URL/邮箱 → needs_check', () => {
    expect(verifyChannel({ url: 'https://evil.example.net', email: null }, allowedUrls, allowedEmails)).toBe('needs_check');
    expect(verifyChannel({ url: null, email: 'fake@nowhere.dev' }, allowedUrls, allowedEmails)).toBe('needs_check');
  });
  it('URL 与邮箱都为空 → needs_check', () => {
    expect(verifyChannel({ url: null, email: null }, allowedUrls, allowedEmails)).toBe('needs_check');
  });
});
