import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPlan, getActivePlans, updatePlanStep } from '@/src/agent/plans';
import { buildActivePlanProjection, GET } from './route';

/** 每个用例独立临时计划目录，测完即删；不依赖仓库真实 data/plans 目录内容 */
let plansDir: string;

beforeEach(() => {
  plansDir = mkdtempSync(path.join(tmpdir(), 'jh-active-plans-'));
});

afterEach(() => {
  rmSync(plansDir, { recursive: true, force: true });
});

const THREE_STEPS = [
  { title: '梳理本周投递记录', successCriteria: '列出本周全部投递岗位与状态' },
  { title: '生成求职周报', successCriteria: '产出周报 Markdown 文件' },
  { title: '复盘并调整下周计划', successCriteria: '给出下周 3 条行动建议' },
];

describe('buildActivePlanProjection（活跃计划进度投影）', () => {
  it('有进行中步骤：投影 taskId/title/currentStepIndex/totalSteps/currentStepTitle/statusCounts', () => {
    const created = createPlan('weekly-report', THREE_STEPS, { dir: plansDir, title: '求职周报' });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    // 步骤 1 完成、步骤 2 进行中（N 取第一个 in_progress）
    updatePlanStep('weekly-report', 0, 'done', undefined, { dir: plansDir });
    updatePlanStep('weekly-report', 1, 'in_progress', undefined, { dir: plansDir });

    const projected = buildActivePlanProjection(getActivePlans(plansDir), plansDir);
    expect(projected).toEqual([
      {
        taskId: 'weekly-report',
        title: '求职周报',
        currentStepIndex: 1,
        totalSteps: 3,
        currentStepTitle: '生成求职周报',
        statusCounts: { todo: 1, in_progress: 1, done: 1, blocked: 0 },
      },
    ]);
  });

  it('无活跃计划（全部 todo）→ 空列表（对应 { plans: [] }）', () => {
    createPlan('weekly-report', THREE_STEPS, { dir: plansDir });
    expect(getActivePlans(plansDir)).toEqual([]);
    expect(buildActivePlanProjection(getActivePlans(plansDir), plansDir)).toEqual([]);
  });

  it('计划全部完成 → 不再视为活跃，不返回', () => {
    createPlan('weekly-report', THREE_STEPS, { dir: plansDir });
    for (let i = 0; i < THREE_STEPS.length; i++) {
      updatePlanStep('weekly-report', i, 'in_progress', undefined, { dir: plansDir });
      updatePlanStep('weekly-report', i, 'done', undefined, { dir: plansDir });
    }
    expect(getActivePlans(plansDir)).toEqual([]);
  });

  it('blocked 无 in_progress：currentStepIndex 为 null，currentStepTitle 为 null（进度行不渲染，由前端过滤）', () => {
    createPlan('weekly-report', THREE_STEPS, { dir: plansDir });
    updatePlanStep('weekly-report', 0, 'blocked', '模型不可用', { dir: plansDir });
    const projected = buildActivePlanProjection(getActivePlans(plansDir), plansDir);
    expect(projected).toHaveLength(1);
    expect(projected[0].currentStepIndex).toBeNull();
    expect(projected[0].currentStepTitle).toBeNull();
    expect(projected[0].statusCounts).toEqual({ todo: 2, in_progress: 0, done: 0, blocked: 1 });
  });

  it('计划文件缺失时 currentStepTitle 兜底 null，不抛错', () => {
    const created = createPlan('weekly-report', THREE_STEPS, { dir: plansDir });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    updatePlanStep('weekly-report', 1, 'in_progress', undefined, { dir: plansDir });
    const active = getActivePlans(plansDir);
    expect(active).toHaveLength(1);
    // 注入一个不存在的 plansDir（模拟文件丢失），投影不抛错
    const projected = buildActivePlanProjection(active, path.join(plansDir, 'missing'));
    expect(projected[0].currentStepTitle).toBeNull();
    expect(projected[0].totalSteps).toBe(3);
  });
});

describe('GET /api/plans/active（冒烟）', () => {
  it('返回 200 且 plans 为数组（不依赖本地数据目录内容）', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { plans: unknown };
    expect(Array.isArray(body.plans)).toBe(true);
  });
});
