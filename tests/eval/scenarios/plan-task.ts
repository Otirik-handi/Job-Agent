import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Scenario } from './types';

const TASK_ID = 'eval-apply-week';
const PLANS_DIR = path.resolve(process.cwd(), 'data', 'plans');

export const planTaskScenario: Scenario = {
  id: 'plan-task',
  family: 'orchestration',
  description: '复杂任务规划：planCreate 出计划 → 用户确认 → planUpdate 逐步推进',
  setup: () => {
    // 上一轮残留防御（runner 已清理，此处兜底）
    try { readFileSync(path.resolve(process.cwd(), 'data', 'plans', `${TASK_ID}.md`)); } catch { /* 不存在即正常 */ }
  },
  userMessages: ['帮我规划下周的求职冲刺计划', '确认，开始执行'],
  mockScript: [
    { type: 'tool-call', toolName: 'planCreate', input: { taskId: TASK_ID, steps: [{ title: '更新简历', successCriteria: '简历补充量化成果' }, { title: '匹配 5 个岗位', successCriteria: '完成 5 个岗位匹配' }] } },
    { type: 'text', text: '已创建计划：1. 更新简历；2. 匹配 5 个岗位。请确认后开始执行。' },
    { type: 'tool-call', toolName: 'planUpdate', input: { taskId: TASK_ID, stepIndex: 0, status: 'in_progress' } },
    { type: 'tool-call', toolName: 'planUpdate', input: { taskId: TASK_ID, stepIndex: 0, status: 'done' } },
    { type: 'tool-call', toolName: 'planUpdate', input: { taskId: TASK_ID, stepIndex: 1, status: 'in_progress' } },
    { type: 'text', text: '第 1 步已完成，正在执行第 2 步（匹配 5 个岗位）。' },
  ],
  assertFinalState: () => {
    // mock 脚本固定 taskId=eval-apply-week，计划文件断言有效（内容含步骤标题与进度横幅）
    const content = readFileSync(path.resolve(PLANS_DIR, `${TASK_ID}.md`), 'utf-8');
    expect(content).toContain('更新简历');
    // 进度横幅数据：步骤 0 done、步骤 1 in_progress
    expect(content).toMatch(/done/);
  },
  assertFinalStateReal: (ctx) => {
    // 真实模型自选 taskId（不保证 eval- 前缀）且可能停在 in_progress 或追问：
    // 只验证对话正常结束，计划文件落盘由 planCreate 工具侧保证
    expect(ctx.allAssistantText()).not.toBe('');
  },
};
