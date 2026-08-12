import { describe, expect, it, vi } from 'vitest';
import { routeFetch, decideRoute } from './web-fetch-router';

describe('decideRoute（域名路由矩阵，设计 §4.1）', () => {
  it('zhaopin → direct 优先', () => {
    expect(decideRoute('https://sou.zhaopin.com/jobs/1')).toBe('direct');
  });
  it('liepin 列表页 → jina，详情页 → direct', () => {
    expect(decideRoute('https://www.liepin.com/zhaopin/?key=x')).toBe('jina');
    expect(decideRoute('https://www.liepin.com/job/123.shtml')).toBe('direct');
  });
  it('51job / zhipin → opencli（D1 暂以 jina 兜底占位，D2 切换）', () => {
    expect(decideRoute('https://we.51job.com/job/1.html')).toBe('opencli');
    expect(decideRoute('https://www.zhipin.com/job_detail/1.html')).toBe('opencli');
  });
  it('其他域名 → direct', () => {
    expect(decideRoute('https://example.com/page')).toBe('direct');
  });
});

describe('routeFetch（direct → jina 降级）', () => {
  it('direct 成功直接返回（不降级）', async () => {
    const result = await routeFetch({
      url: 'https://a.com/x',
      fetchImpl: async () => new Response('<h1>OK</h1>', { status: 200, headers: { 'content-type': 'text/html' } }),
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('direct');
      expect(result.content).toContain('OK');
    }
  });
  it('direct 被 WAF 拦截 → 降级 jina', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('<html>aliyun_waf</html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('# 渲染内容', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const result = await routeFetch({ url: 'https://we.51job.com/job/1.html', fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('jina');
      expect(result.content).toContain('渲染内容');
    }
  });
  it('两层都失败返回结构化失败（含原因链）', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('waf', { status: 403 }));
    const result = await routeFetch({ url: 'https://a.com/x', fetchImpl });
    expect(result.ok).toBe(false);
  });
});
