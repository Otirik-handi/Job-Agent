import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

/** LLM_* 环境变量保存/恢复（vitest 加载 .env.local，用例不依赖进程环境） */
const LLM_KEYS = ['LLM_BASE_URL', 'LLM_API_KEY', 'LLM_MODEL', 'LLM_PROVIDER'] as const;
const saved: Record<string, string | undefined> = {};

afterEach(() => {
  for (const k of LLM_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function saveEnv() {
  for (const k of LLM_KEYS) saved[k] = process.env[k];
}
function clearEnv() {
  for (const k of LLM_KEYS) delete process.env[k];
}
function restoreFromSave() {
  for (const k of LLM_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
}

describe('GET /api/config/llm', () => {
  it('配置齐全返回 configured:true 与 provider/model 投影，不泄露 baseURL/apiKey', async () => {
    saveEnv();
    try {
      process.env.LLM_BASE_URL = 'https://example.com/v1';
      process.env.LLM_API_KEY = 'secret-key';
      process.env.LLM_MODEL = 'test-model';
      process.env.LLM_PROVIDER = 'test-provider';
      const res = GET();
      const body = await res.json();
      expect(body).toEqual({ configured: true, provider: 'test-provider', model: 'test-model' });
      // 敏感信息不进响应（对齐 AGENTS.md 敏感信息边界）
      expect(JSON.stringify(body)).not.toContain('secret-key');
      expect(JSON.stringify(body)).not.toContain('https://example.com');
    } finally {
      restoreFromSave();
    }
  });

  it('配置缺失返回 200 + configured:false（业务状态而非错误）', async () => {
    saveEnv();
    try {
      clearEnv();
      const res = GET();
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ configured: false, provider: null, model: null });
    } finally {
      restoreFromSave();
    }
  });
});
