import { expect } from 'vitest';
import type { Scenario } from './types';
import { setEmbeddingOverride } from '../../../src/agent/embedding';
import { db } from '../../../src/db';
import { conversations, messages } from '../../../src/db/schema';

export const searchMessagesScenario: Scenario = {
  id: 'search-messages',
  family: 'recovery',
  description: '历史回忆：用户问之前提过的内容 → searchMessages 语义检索命中（不依赖记忆块）',
  setup: () => {
    // 评测注入：query 与消息共用固定向量（余弦=1 命中），不依赖真实 embedding API
    setEmbeddingOverride(async () => [1, 0, 0]);
    // 预插消息（带向量）；FK 需先建 conversations 行（runner 已 initDb(':memory:') + migrate）
    db.insert(conversations).values({ id: 'eval-conv-1', title: '评测会话', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' }).run();
    db.insert(messages).values([
      { id: 'eval-msg-1', conversationId: 'eval-conv-1', role: 'user', messageJson: JSON.stringify({ id: 'eval-msg-1', role: 'user', parts: [{ type: 'text', text: '我希望能去字节跳动，关注前端岗位' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
    ]).run();
  },
  userMessages: ['我之前说过想去哪家公司吗？'],
  mockScript: [
    { type: 'tool-call', toolName: 'searchMessages', input: { query: '想去的公司', limit: 5 } },
    { type: 'text', text: '你之前提到希望去字节跳动，关注前端岗位。' },
  ],
  assertFinalState: (ctx) => {
    expect(ctx.allAssistantText()).toContain('字节跳动');
  },
};
