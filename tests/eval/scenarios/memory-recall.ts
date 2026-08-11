import { expect } from 'vitest';
import type { Scenario } from './types';

export const memoryRecallScenario: Scenario = {
  id: 'memory-recall',
  family: 'recovery',
  description: '历史回忆：用户问此前偏好 → getMemory 读取记忆回答（替代原设计 FTS 检索——工具层无消息检索工具）',
  setup: (ctx) => {
    ctx.exec("INSERT INTO memory_blocks (label, description, value, `limit`, updated_at) VALUES ('preferences', '用户求职偏好', '目标公司：字节跳动；岗位：前端工程师', 2000, datetime('now'))");
  },
  userMessages: ['我之前说过想去哪家公司？'],
  mockScript: [
    { type: 'tool-call', toolName: 'getMemory', input: { label: 'preferences' } },
    { type: 'text', text: '你之前提到过目标公司是字节跳动，岗位方向是前端工程师。' },
  ],
  assertFinalState: (ctx) => {
    expect(ctx.allAssistantText()).toContain('字节跳动');
  },
};
