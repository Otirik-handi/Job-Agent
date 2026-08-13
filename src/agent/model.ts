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

/** LLM 环境变量快照：配置完整性的单一事实来源（指示灯路由与 getModel 共用） */
export type LlmConfigSnapshot = {
  baseURL: string | null;
  apiKey: string | null;
  modelName: string | null;
  provider: string | null;
  missing: string[];
};

/** 读取 LLM_* 环境变量（env 可注入便于单测）；空值视为缺失。
 * 为什么：指示灯红灯与 getModel 抛错必须同源，避免两处校验漂移。 */
export function getLlmConfigSnapshot(env: NodeJS.ProcessEnv = process.env): LlmConfigSnapshot {
  const baseURL = env.LLM_BASE_URL || null;
  const apiKey = env.LLM_API_KEY || null;
  const modelName = env.LLM_MODEL || null;
  const provider = env.LLM_PROVIDER || null;
  const missing = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_PROVIDER'].filter((k) => !env[k]);
  return { baseURL, apiKey, modelName, provider, missing };
}

export function getModel(): LanguageModel {
  if (modelOverride) return modelOverride;
  const snapshot = getLlmConfigSnapshot();
  if (snapshot.missing.length > 0) {
    throw new LlmConfigError(`LLM 环境变量缺失：${snapshot.missing.join('、')}（请配置 .env.local）`);
  }
  const provider = createOpenAICompatible({ name: 'local', baseURL: snapshot.baseURL!, apiKey: snapshot.apiKey! });
  return provider(snapshot.modelName!);
}

export function getTemperature(): number {
  const raw = Number(process.env.LLM_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : 0.3;
}
