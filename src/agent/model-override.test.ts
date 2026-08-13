import { afterEach, describe, expect, it } from 'vitest';
import type { LanguageModel } from 'ai';
import { getModel, setModelOverride, clearModelOverride, LlmConfigError } from './model';

const fake: LanguageModel = {
  specificationVersion: 'v4',
  provider: 'test',
  modelId: 'fake',
  supportedUrls: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试桩不需要真实实现
  doGenerate: (async () => ({})) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试桩不需要真实实现
  doStream: (async () => ({})) as any,
};

/** LLM_* 环境变量保存/恢复（vitest 加载 .env.local，用例不依赖进程环境） */
const LLM_KEYS = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_PROVIDER'] as const;
const saved: Record<string, string | undefined> = {};

function saveEnv() {
  for (const k of LLM_KEYS) saved[k] = process.env[k];
}
function clearEnv() {
  for (const k of LLM_KEYS) delete process.env[k];
}
function restoreEnv() {
  for (const k of LLM_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

afterEach(() => {
  clearModelOverride();
});

describe('setModelOverride（评测注入点）', () => {
  it('设置后 getModel() 返回注入模型', () => {
    setModelOverride(fake);
    expect(getModel()).toBe(fake);
  });

  it('清除后恢复原逻辑（未配置环境变量时抛 LlmConfigError）', () => {
    setModelOverride(fake);
    clearModelOverride();
    saveEnv();
    try {
      clearEnv();
      expect(() => getModel()).toThrow(LlmConfigError);
    } finally {
      restoreEnv();
    }
  });
});
