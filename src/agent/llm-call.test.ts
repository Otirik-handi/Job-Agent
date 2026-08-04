import { describe, expect, it, vi, beforeEach } from 'vitest';
import { callStructured } from './llm-call';
import { z } from 'zod';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));
import { generateObject } from 'ai';
const mockGenerate = vi.mocked(generateObject);

const schema = z.object({ score: z.number().int().min(0).max(100) });

const model = {} as never;
const base = { model, systemPrompt: 's', userPrompt: 'u', schema, task: 'test' };

beforeEach(() => { mockGenerate.mockReset(); });

describe('callStructured', () => {
  it('校验失败时 repair 重试，最多 2 次后返回 LLM_OUTPUT_INVALID', async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'))
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'))
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'));
    const result = await callStructured(base);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.code).toBe('LLM_OUTPUT_INVALID');
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('校验失败后重试成功返回数据', async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'))
      .mockResolvedValueOnce({ object: { score: 85 } } as never);
    const result = await callStructured(base);
    expect(result).toEqual({ ok: true, data: { score: 85 } });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('网络类错误不重试，直接返回 LLM_CALL_FAILED', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));
    const result = await callStructured(base);
    expect(result.ok ? '' : result.error.code).toBe('LLM_CALL_FAILED');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
