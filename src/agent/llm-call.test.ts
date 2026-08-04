import { describe, expect, it, vi, beforeEach } from 'vitest';
import { callStructured } from './llm-call';
import { z } from 'zod';

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return { ...actual, generateObject: vi.fn() };
});
import { generateObject, JSONParseError, NoObjectGeneratedError, TypeValidationError } from 'ai';
const mockGenerate = vi.mocked(generateObject);

const schema = z.object({ score: z.number().int().min(0).max(100) });

const model = {} as never;
const base = { model, systemPrompt: 's', userPrompt: 'u', schema, task: 'test' };

const schemaError = () =>
  new TypeValidationError({
    value: { score: 'not-a-number' },
    cause: new Error('Invalid input: expected number, received string'),
  });
const jsonParseError = () =>
  new JSONParseError({
    text: '{ "score": ',
    cause: new SyntaxError('Unexpected end of JSON input'),
  });
const noObjectError = () =>
  new NoObjectGeneratedError({
    text: '抱歉，我无法生成结构化输出',
    response: {} as never,
    usage: {} as never,
    finishReason: 'stop' as never,
  });

beforeEach(() => { mockGenerate.mockReset(); });

describe('callStructured', () => {
  it('校验失败时 repair 重试，最多 2 次后返回 LLM_OUTPUT_INVALID', async () => {
    mockGenerate
      .mockRejectedValueOnce(schemaError())
      .mockRejectedValueOnce(jsonParseError())
      .mockRejectedValueOnce(noObjectError());
    const result = await callStructured(base);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.code).toBe('LLM_OUTPUT_INVALID');
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('校验失败后重试成功返回数据', async () => {
    mockGenerate
      .mockRejectedValueOnce(schemaError())
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
