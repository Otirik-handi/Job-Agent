import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createScriptedModel } from '../../tests/eval/mock-model';
import { db, initDb } from '../db';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createConversation } from '../db/repositories/conversations';
import { listMessages } from '../db/repositories/messages';
import { runAgentTurn } from './run-agent';

function userMsg(text: string) {
  return { id: `u-${Date.now()}-${Math.random()}`, role: 'user' as const, parts: [{ type: 'text' as const, text }] };
}

beforeAll(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterAll(() => {
  // 恢复默认连接（后续测试文件各自初始化）
  initDb();
});

describe('runAgentTurn（完整 Agent 循环）', () => {
  it('mock model 驱动一轮：工具调用 + 最终文本，assistant 消息落库', async () => {
    const conv = createConversation('run-agent 冒烟');
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'importResume', input: { text: '张伟，前端开发 5 年，React、TypeScript' } },
      { type: 'text', text: '简历已导入，可继续分析。' },
    ]);
    const result = await runAgentTurn({
      conversationId: conv.id,
      messages: [userMsg('这是我的简历：张伟，前端开发 5 年，React、TypeScript')],
      model,
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    const stored = listMessages(conv.id);
    expect(stored.filter((m) => m.role === 'assistant').length).toBeGreaterThanOrEqual(1);
    const allText = result.messages.map((m) => JSON.stringify(m.parts)).join('');
    expect(allText).toContain('简历已导入');
  });

  it('工具失败（不存在 resumeId）后脚本继续，不卡死', async () => {
    const conv = createConversation('run-agent 失败重试');
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: 'not-exist' } },
      { type: 'text', text: '未找到简历，请先导入。' },
    ]);
    const result = await runAgentTurn({
      conversationId: conv.id,
      messages: [userMsg('帮我分析简历')],
      model,
    });
    const allText = result.messages.map((m) => JSON.stringify(m.parts)).join('');
    expect(allText).toContain('未找到简历');
  });
});
