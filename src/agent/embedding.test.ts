import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEmbeddingOverride, embedText, setEmbeddingOverride } from './embedding';

afterEach(() => {
  clearEmbeddingOverride();
  vi.unstubAllGlobals();
});

describe('embedText（硅基流动 embedding 调用）', () => {
  it('override 优先（评测注入），不调真实 API', async () => {
    setEmbeddingOverride(async () => [0.1, 0.2]);
    expect(await embedText('测试文本')).toEqual([0.1, 0.2]);
  });

  it('未配置环境变量 → null（降级）', async () => {
    const prev = { base: process.env.EMBEDDING_BASE_URL, key: process.env.EMBEDDING_API_KEY, model: process.env.EMBEDDING_MODEL };
    delete process.env.EMBEDDING_BASE_URL; delete process.env.EMBEDDING_API_KEY; delete process.env.EMBEDDING_MODEL;
    expect(await embedText('x')).toBeNull();
    if (prev.base) process.env.EMBEDDING_BASE_URL = prev.base;
    if (prev.key) process.env.EMBEDDING_API_KEY = prev.key;
    if (prev.model) process.env.EMBEDDING_MODEL = prev.model;
  });

  it('API 非 2xx → null；成功解析 embedding；请求格式正确', async () => {
    process.env.EMBEDDING_BASE_URL = 'https://api.siliconflow.cn/v1';
    process.env.EMBEDDING_API_KEY = 'test-key';
    process.env.EMBEDDING_MODEL = 'BAAI/bge-m3';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ embedding: [0.5, -0.5] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await embedText('x')).toBeNull();
    expect(await embedText('x')).toEqual([0.5, -0.5]);
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toBe('https://api.siliconflow.cn/v1/embeddings');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ model: 'BAAI/bge-m3', input: ['x'] });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });
});
