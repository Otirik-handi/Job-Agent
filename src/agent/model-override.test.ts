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

afterEach(() => {
  clearModelOverride();
});

describe('setModelOverride（评测注入点）', () => {
  it('设置后 getModel() 返回注入模型', () => {
    setModelOverride(fake);
    expect(getModel()).toBe(fake);
  });

  it('清除后恢复原逻辑（未配置环境变量时抛 LlmConfigError）', () => {
    // 依赖当前进程环境：无 LLM_* 时抛 LlmConfigError；有则返回真实模型实例（两种都可接受，不抛错即通过）
    setModelOverride(fake);
    clearModelOverride();
    if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY || !process.env.LLM_MODEL) {
      expect(() => getModel()).toThrow(LlmConfigError);
    } else {
      expect(() => getModel()).not.toThrow();
    }
  });
});
