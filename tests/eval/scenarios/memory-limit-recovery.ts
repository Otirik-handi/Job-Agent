import { expect } from 'vitest';
import type { Scenario } from './types';

const OVER_LONG = '超长内容：' + '非常详细的经历描述'.repeat(300); // ≈2400 字符 > 2000 上限

export const memoryLimitRecoveryScenario: Scenario = {
  id: 'memory-limit-recovery',
  family: 'recovery',
  description: '记忆超限（MEMORY_LIMIT_EXCEEDED）→ agent 精简内容重写成功',
  setup: (ctx) => {
    ctx.exec("INSERT INTO memory_blocks (label, description, value, `limit`, updated_at) VALUES ('preferences', '用户求职偏好', '', 2000, datetime('now'))");
  },
  userMessages: ['帮我记住我的求职偏好：' + OVER_LONG],
  mockScript: [
    { type: 'tool-call', toolName: 'setMemory', input: { label: 'preferences', value: OVER_LONG } },
    { type: 'tool-call', toolName: 'setMemory', input: { label: 'preferences', value: '目标：远程岗位；北京优先；薪资 25k 以上' } },
    { type: 'text', text: '已精简后写入偏好。' },
  ],
  assertFinalState: (ctx) => {
    const row = ctx.query<{ value: string }>('SELECT value FROM memory_blocks WHERE label = ?', ['preferences']);
    expect(row?.value).toContain('远程岗位');
    expect(row!.value.length).toBeLessThan(2000);
  },
  assertFinalStateReal: (ctx) => {
    // 真实模型可能先追问而非立即 setMemory：只验证对话正常结束，不硬断言记忆内容
    expect(ctx.allAssistantText()).not.toBe('');
  },
};
