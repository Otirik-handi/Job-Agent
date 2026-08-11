import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createScriptedModel } from '../../tests/eval/mock-model';
import { db, initDb } from '../db';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createConversation } from '../db/repositories/conversations';
import { listMessages } from '../db/repositories/messages';
import { getSessionState, setSessionState } from '../db/repositories/session-state';
import { runAgentTurn, type ToolProgressEvent } from './run-agent';

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

  it('同 id 入站消息重发不重复入库（多步循环客户端重发历史）', async () => {
    const conv = createConversation('run-agent 入站去重');
    const msg = userMsg('重复发送的同一消息');
    const model = createScriptedModel([{ type: 'text', text: '收到。' }]);
    await runAgentTurn({
      conversationId: conv.id,
      messages: [msg, msg],
      model,
    });
    const stored = listMessages(conv.id);
    expect(stored.filter((m) => m.role === 'user')).toHaveLength(1);
    expect(JSON.parse(stored[0].messageJson).id).toBe(msg.id);
  });

  it('工具成功回写会话状态，且与既有状态合并不覆盖', async () => {
    const conv = createConversation('run-agent 状态回写');
    setSessionState(conv.id, JSON.stringify({ foo: 'bar' }));
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'importResume', input: { text: '李四，后端 3 年，Go' } },
      { type: 'text', text: '已导入。' },
    ]);
    await runAgentTurn({
      conversationId: conv.id,
      messages: [userMsg('导入我的简历')],
      model,
    });
    const state = getSessionState(conv.id);
    expect(state).not.toBeNull();
    const parsed = JSON.parse(state!.stateJson) as Record<string, unknown>;
    expect(parsed.foo).toBe('bar');
    expect(typeof parsed.currentResumeId).toBe('string');
    expect((parsed.currentResumeId as string).length).toBeGreaterThan(0);
  });

  it('onToolProgress 触发 running → completed 序列（含进度文案）', async () => {
    const conv = createConversation('run-agent 进度事件');
    const events: ToolProgressEvent[] = [];
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'importResume', input: { text: '王五，测试 2 年' } },
      { type: 'text', text: '已导入。' },
    ]);
    await runAgentTurn({
      conversationId: conv.id,
      messages: [userMsg('导入简历')],
      model,
      onToolProgress: (event) => {
        events.push(event);
      },
    });
    expect(events).toEqual([
      { toolName: 'importResume', status: 'running', message: '正在读取简历…' },
      { toolName: 'importResume', status: 'completed', message: '完成' },
    ]);
  });
});
