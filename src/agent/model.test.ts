import { describe, expect, it } from 'vitest';
import { getLlmConfigSnapshot, getModel, LlmConfigError } from './model';

/** LLM_* 环境变量保存/恢复：vitest 会加载 .env.local，用例必须确定性覆盖配置存在/缺失两种情形 */
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

describe('getLlmConfigSnapshot（配置完整性单一事实来源）', () => {
  it('配置齐全时 missing 为空、字段非空', () => {
    saveEnv();
    try {
      process.env.LLM_BASE_URL = 'https://example.com/v1';
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_MODEL = 'test-model';
      process.env.LLM_PROVIDER = 'test-provider';
      const snapshot = getLlmConfigSnapshot();
      expect(snapshot.missing).toEqual([]);
      expect(snapshot.provider).toBe('test-provider');
      expect(snapshot.modelName).toBe('test-model');
    } finally {
      restoreEnv();
    }
  });

  it('缺 LLM_PROVIDER 时收集进 missing 且 provider 为 null', () => {
    saveEnv();
    try {
      process.env.LLM_BASE_URL = 'https://example.com/v1';
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_MODEL = 'test-model';
      delete process.env.LLM_PROVIDER;
      const snapshot = getLlmConfigSnapshot();
      expect(snapshot.missing).toEqual(['LLM_PROVIDER']);
      expect(snapshot.provider).toBeNull();
    } finally {
      restoreEnv();
    }
  });

  it('getModel 缺任一必填项（含 LLM_PROVIDER）抛 LlmConfigError，配置齐全不抛', () => {
    saveEnv();
    try {
      clearEnv();
      expect(() => getModel()).toThrow(LlmConfigError);
      process.env.LLM_BASE_URL = 'https://example.com/v1';
      process.env.LLM_API_KEY = 'test-key';
      process.env.LLM_MODEL = 'test-model';
      expect(() => getModel()).toThrow(LlmConfigError);
      process.env.LLM_PROVIDER = 'test-provider';
      expect(() => getModel()).not.toThrow();
    } finally {
      restoreEnv();
    }
  });
});
