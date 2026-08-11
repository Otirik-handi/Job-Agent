import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export class LlmConfigError extends Error {}

let modelOverride: LanguageModel | null = null;

/** 评测注入点：mock 层把 scripted model 设为全局 override（工具内部 getModel() 也走注入）；
 * 仅评测 runner 使用，业务路径不调用。 */
export function setModelOverride(model: LanguageModel | null): void {
  modelOverride = model;
}

export function clearModelOverride(): void {
  modelOverride = null;
}

export function getModel(): LanguageModel {
  if (modelOverride) return modelOverride;
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL;
  const missing = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL'].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new LlmConfigError(`LLM 环境变量缺失：${missing.join('、')}（请配置 .env.local）`);
  }
  const provider = createOpenAICompatible({ name: 'local', baseURL: baseURL!, apiKey });
  return provider(modelName!);
}

export function getTemperature(): number {
  const raw = Number(process.env.LLM_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : 0.3;
}
