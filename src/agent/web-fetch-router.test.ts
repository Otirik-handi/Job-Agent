import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routeFetch, decideRoute } from './web-fetch-router';
import { clearPlugins } from '../plugins/registry';

beforeEach(() => {
  // 注册表是模块级 Map：清空防用例间污染（真实 open-cli 插件不会被连带注册——测试未 import 其模块）
  clearPlugins();
});

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

describe('routeFetch（direct → jina → opencli 降级）', () => {
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
  it('direct 网络异常 → 降级 jina（网络失败不中断降级链）', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('# 渲染内容', { status: 200, headers: { 'content-type': 'text/plain' } }));
    const result = await routeFetch({ url: 'https://a.com/x', fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('jina');
      expect(result.content).toContain('渲染内容');
    }
  });
  it('全链路网络异常 → 结构化 FETCH_FAILED（不冒泡为未知异常）', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const result = await routeFetch({ url: 'https://a.com/x', fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('FETCH_FAILED');
      expect(result.message).toContain('网络请求失败');
      expect(result.message).toContain('fetch failed');
    }
  });
  it('direct 网络异常 + jina 被拦截 → 归为 FETCH_BLOCKED（混合原因按站点拦截处理）', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(new Response('jina error', { status: 500 }));
    const result = await routeFetch({ url: 'https://a.com/x', fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FETCH_BLOCKED');
  });
  it('超时（AbortError）→ 映射为「请求超时」', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));
    const result = await routeFetch({ url: 'https://a.com/x', fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('FETCH_FAILED');
      expect(result.message).toContain('请求超时');
    }
  });
});

describe('routeFetch（opencli 插件层，Task 6）', () => {
  it('opencli 层走插件：插件成功 → source=opencli', async () => {
    const { registerPlugin } = await import('../plugins/registry');
    registerPlugin({
      id: 'open-cli', name: 'mock',
      isAvailable: () => true,
      canHandle: (u: string) => u.includes('51job.com'),
      fetch: async () => ({ ok: true as const, title: '职位', content: '采集内容', citations: ['https://we.51job.com/jobs/1.html'] }),
    });
    // direct 被 WAF 拦截 → jina HTTP 500 → opencli 插件成功
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response('<html>aliyun_waf</html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('jina error', { status: 500 }));
    const result = await routeFetch({ url: 'https://we.51job.com/jobs/1.html', fetchImpl });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('opencli');
      expect(result.content).toContain('采集内容');
    }
  });
  it('插件不可用 → opencli 层跳过（保持 D1 行为：FETCH_BLOCKED）', async () => {
    // 注册 canHandle=true 但 isAvailable=false 的占位插件模拟"不可用"效果
    const { registerPlugin } = await import('../plugins/registry');
    registerPlugin({
      id: 'open-cli', name: 'unavailable',
      isAvailable: () => false,
      canHandle: () => true,
      fetch: async () => ({ ok: false, code: 'BLOCKED' as const, message: '', hint: '' }),
    });
    const result = await routeFetch({
      url: 'https://we.51job.com/jobs/1.html',
      fetchImpl: async () => new Response('waf', { status: 403 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FETCH_BLOCKED');
  });
});
