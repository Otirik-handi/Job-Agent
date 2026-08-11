import { expect } from 'vitest';
import type { Scenario } from './types';

export const midCourseCorrectionScenario: Scenario = {
  id: 'mid-course-correction',
  family: 'recovery',
  description: '中途纠正：用户改偏好 → setMemory 覆盖更新 → 后续对话使用新目标',
  setup: (ctx) => {
    ctx.exec("INSERT INTO memory_blocks (label, description, value, `limit`, updated_at) VALUES ('preferences', '用户求职偏好', '目标：远程岗位；城市不限', 2000, datetime('now'))");
  },
  userMessages: ['我改主意了，只看北京的岗位', '帮我找找合适的岗位'],
  mockScript: [
    { type: 'tool-call', toolName: 'setMemory', input: { label: 'preferences', value: '目标：北京岗位；远程优先' } },
    { type: 'text', text: '已更新偏好：目标北京岗位，远程优先。' },
    { type: 'tool-call', toolName: 'getMemory', input: { label: 'preferences' } },
    { type: 'text', text: '好的，我会按你的最新偏好（北京岗位、远程优先）帮你找合适的岗位。' },
  ],
  assertFinalState: (ctx) => {
    const row = ctx.query<{ value: string }>('SELECT value FROM memory_blocks WHERE label = ?', ['preferences']);
    expect(row?.value).toContain('北京');
    expect(ctx.allAssistantText()).toContain('北京');
  },
  assertFinalStateReal: (ctx) => {
    // 真实模型可能先追问而非立即 setMemory：只验证对话正常结束，不硬断言记忆内容
    expect(ctx.allAssistantText()).not.toBe('');
  },
};
