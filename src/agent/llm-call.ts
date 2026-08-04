import { generateObject, JSONParseError, NoObjectGeneratedError, TypeValidationError } from 'ai';
import type { LanguageModel } from 'ai';
import type { ZodType } from 'zod';
import { getTemperature } from './model';

export type CallStructuredResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: 'LLM_OUTPUT_INVALID' | 'LLM_CALL_FAILED'; message: string } };

const MAX_REPAIR_ATTEMPTS = 2;

export async function callStructured<T>(options: {
  model: LanguageModel;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  task: string;
}): Promise<CallStructuredResult<T>> {
  const { model, systemPrompt, userPrompt, schema, task } = options;
  let lastError = '';

  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: attempt === 0 ? userPrompt : `${userPrompt}\n\n【上次输出无效，请修正后重新输出】\n原因：${lastError}` },
    ];
    try {
      const result = await generateObject({
        model,
        temperature: getTemperature(),
        messages,
        schema,
      });
      if (result.object === undefined) {
        lastError = '模型未返回结构化输出';
        continue;
      }
      return { ok: true, data: result.object as T };
    } catch (err) {
      if (err instanceof TypeValidationError || err instanceof JSONParseError || err instanceof NoObjectGeneratedError) {
        lastError = err.message;
        continue;
      }
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: { code: 'LLM_CALL_FAILED', message: `模型调用失败（${task}）：${message}` } };
    }
  }
  return { ok: false, error: { code: 'LLM_OUTPUT_INVALID', message: `结构化输出校验失败（${task}），已重试 ${MAX_REPAIR_ATTEMPTS} 次仍无效` } };
}
