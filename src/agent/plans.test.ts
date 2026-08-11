import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createPlan,
  getActivePlans,
  listPlans,
  parsePlanMarkdown,
  readPlan,
  renderPlanMarkdown,
  summarizeStatus,
  updatePlanStep,
  type Plan,
} from './plans';

/** 每个用例独立临时计划目录，测完即删；不依赖仓库真实 data/plans 目录内容 */
let plansDir: string;

beforeEach(() => {
  plansDir = mkdtempSync(path.join(tmpdir(), 'jh-plans-'));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  rmSync(plansDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

const THREE_STEPS = [
  { title: '梳理本周投递记录', successCriteria: '列出本周全部投递岗位与状态' },
  { title: '生成求职周报', successCriteria: '产出周报 Markdown 文件' },
  { title: '复盘并调整下周计划', successCriteria: '给出下周 3 条行动建议' },
];

describe('createPlan（创建 + 校验）', () => {
  it('创建成功：文件落盘、内容含标题/步骤/createdAt，readPlan 可解析回同构对象', () => {
    const result = createPlan('weekly-report', THREE_STEPS, { dir: plansDir });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const plan = result.value;
    expect(plan.taskId).toBe('weekly-report');
    expect(plan.title).toBe('weekly-report'); // 未传 title 时默认取 taskId
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.every((step) => step.status === 'todo' && step.note === null)).toBe(true);
    expect(typeof plan.createdAt).toBe('string');

    const file = readFileSync(path.join(plansDir, 'weekly-report.md'), 'utf-8');
    expect(file).toContain(`# 计划：weekly-report`);
    expect(file).toContain('> taskId: weekly-report');
    expect(file).toContain('### 步骤 1：梳理本周投递记录');
    expect(file).toContain('- 成功标准：列出本周全部投递岗位与状态');

    expect(readPlan('weekly-report', plansDir)).toEqual(plan);
  });

  it('opts.title 覆盖任务标题', () => {
    const result = createPlan('weekly-report', THREE_STEPS, { dir: plansDir, title: '求职周报生成' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('求职周报生成');
    expect(readPlan('weekly-report', plansDir)?.title).toBe('求职周报生成');
  });

  it('dependsOn 声明的依赖写入文件并 round-trip 保留', () => {
    const steps = [
      { title: '收集数据', successCriteria: '数据齐备' },
      { title: '生成周报', successCriteria: '周报产出', dependsOn: [0] },
    ];
    const result = createPlan('roundtrip', steps, { dir: plansDir });
    expect(result.ok).toBe(true);
    const plan = readPlan('roundtrip', plansDir);
    expect(plan?.steps[1].dependsOn).toEqual([0]);
  });

  it('已存在 taskId → PLAN_EXISTS（不覆盖原文件）', () => {
    createPlan('weekly-report', THREE_STEPS, { dir: plansDir });
    const result = createPlan('weekly-report', [{ title: '覆盖', successCriteria: 'x' }], { dir: plansDir });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('PLAN_EXISTS');
    expect(result.error.hint).toContain('planCreate');
    expect(readPlan('weekly-report', plansDir)?.steps).toHaveLength(3); // 原文件未变
  });

  it('路径穿越一律拒绝：../、绝对路径、嵌套路径、含点号', () => {
    for (const evil of ['../agent', '..', 'a/b', 'a\\b', '..\\x', '', '.', 'a.b', '-a']) {
      const result = createPlan(evil, THREE_STEPS, { dir: plansDir });
      expect(result.ok, `taskId「${evil}」应被拒绝`).toBe(false);
      if (result.ok) continue;
      expect(result.error.code).toBe('PLAN_INVALID');
    }
  });

  it('taskId 过长（>64）与非法字符（大写/空格）→ PLAN_INVALID', () => {
    const tooLong = 'a'.repeat(65);
    const result = createPlan(tooLong, THREE_STEPS, { dir: plansDir });
    expect(result).toMatchObject({ ok: false, error: { code: 'PLAN_INVALID' } });
    expect(createPlan('UPPER-CASE', THREE_STEPS, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_INVALID' },
    });
    expect(createPlan('has space', THREE_STEPS, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_INVALID' },
    });
  });

  it('步骤数越界（空 / 9 步）→ PLAN_INVALID', () => {
    expect(createPlan('empty', [], { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_INVALID' },
    });
    const nineSteps = Array.from({ length: 9 }, (_, i) => ({
      title: `步骤 ${i}`,
      successCriteria: 'x',
    }));
    expect(createPlan('too-many', nineSteps, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_INVALID' },
    });
  });

  it('dependsOn 越界 / 自引用 → PLAN_INVALID', () => {
    const steps = [
      { title: 'a', successCriteria: 'x' },
      { title: 'b', successCriteria: 'y', dependsOn: [5] },
    ];
    expect(createPlan('bad-dep', steps, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_INVALID' },
    });
    const selfDep = [{ title: 'a', successCriteria: 'x', dependsOn: [0] }];
    expect(createPlan('self-dep', selfDep, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_INVALID' },
    });
  });
});

describe('readPlan（读取 + 容错）', () => {
  it('计划不存在返回 null（不抛错）', () => {
    expect(readPlan('no-such-plan', plansDir)).toBeNull();
  });

  it('损坏文件返回 null：无标题 / 无 taskId / 缺成功标准 / 状态非法 / 步骤序号不连续', () => {
    writeFileSync(path.join(plansDir, 'broken-a.md'), '随便的文本', 'utf-8');
    writeFileSync(
      path.join(plansDir, 'broken-b.md'),
      '# 计划：x\n\n> createdAt: 2026-01-01T00:00:00.000Z\n\n### 步骤 1：s\n- 状态：todo\n- 成功标准：c\n',
      'utf-8',
    );
    writeFileSync(
      path.join(plansDir, 'broken-c.md'),
      '# 计划：x\n\n> taskId: broken-c\n> createdAt: 2026-01-01T00:00:00.000Z\n\n### 步骤 1：s\n- 状态：todo\n- 成功标准：\n',
      'utf-8',
    );
    writeFileSync(
      path.join(plansDir, 'broken-d.md'),
      '# 计划：x\n\n> taskId: broken-d\n> createdAt: 2026-01-01T00:00:00.000Z\n\n### 步骤 1：s\n- 状态：weird\n- 成功标准：c\n',
      'utf-8',
    );
    writeFileSync(
      path.join(plansDir, 'broken-e.md'),
      '# 计划：x\n\n> taskId: broken-e\n> createdAt: 2026-01-01T00:00:00.000Z\n\n### 步骤 2：s\n- 状态：todo\n- 成功标准：c\n',
      'utf-8',
    );
    // 内容 taskId 与文件名不一致视为损坏
    writeFileSync(
      path.join(plansDir, 'broken-f.md'),
      '# 计划：x\n\n> taskId: other-id\n> createdAt: 2026-01-01T00:00:00.000Z\n\n### 步骤 1：s\n- 状态：todo\n- 成功标准：c\n',
      'utf-8',
    );
    for (const name of ['broken-a', 'broken-b', 'broken-c', 'broken-d', 'broken-e', 'broken-f']) {
      expect(readPlan(name, plansDir), `「${name}」应解析失败`).toBeNull();
    }
  });
});

describe('updatePlanStep（状态机单向推进）', () => {
  function createPlanWithOneStep(taskId = 'single') {
    const result = createPlan(taskId, [{ title: '唯一步骤', successCriteria: '完成' }], { dir: plansDir });
    if (!result.ok) throw new Error('setup failed');
    return result.value;
  }

  it('合法流转：todo → in_progress → done', () => {
    createPlanWithOneStep();
    const r1 = updatePlanStep('single', 0, 'in_progress', undefined, { dir: plansDir });
    expect(r1).toMatchObject({ ok: true });
    expect(readPlan('single', plansDir)?.steps[0].status).toBe('in_progress');

    const r2 = updatePlanStep('single', 0, 'done', undefined, { dir: plansDir });
    expect(r2.ok).toBe(true);
    if (!r2.ok) return;
    expect(r2.value.steps[0].status).toBe('done');
    expect(readPlan('single', plansDir)?.steps[0].status).toBe('done');
  });

  it('todo 直接 done / blocked（带 note）合法', () => {
    createPlanWithOneStep();
    expect(updatePlanStep('single', 0, 'done', undefined, { dir: plansDir })).toMatchObject({ ok: true });
    createPlanWithOneStep('single2');
    const blocked = updatePlanStep('single2', 0, 'blocked', '等待用户补充材料', { dir: plansDir });
    expect(blocked.ok).toBe(true);
    if (!blocked.ok) return;
    expect(blocked.value.steps[0].note).toBe('等待用户补充材料');
    expect(readPlan('single2', plansDir)?.steps[0].note).toBe('等待用户补充材料');
  });

  it('终态不可回退：done 不能再流转（done→todo / done→blocked）', () => {
    createPlanWithOneStep();
    updatePlanStep('single', 0, 'done', undefined, { dir: plansDir });
    for (const status of ['todo', 'in_progress', 'blocked', 'done'] as const) {
      expect(updatePlanStep('single', 0, status, 'x', { dir: plansDir })).toMatchObject({
        ok: false,
        error: { code: 'PLAN_STATUS_INVALID' },
      });
    }
  });

  it('终态不可回退：blocked 不能再流转（blocked→done / blocked→in_progress）', () => {
    createPlanWithOneStep();
    updatePlanStep('single', 0, 'blocked', '受阻', { dir: plansDir });
    expect(updatePlanStep('single', 0, 'done', undefined, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_STATUS_INVALID' },
    });
    expect(updatePlanStep('single', 0, 'in_progress', undefined, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_STATUS_INVALID' },
    });
  });

  it('非法回退：in_progress → todo 拒绝', () => {
    createPlanWithOneStep();
    updatePlanStep('single', 0, 'in_progress', undefined, { dir: plansDir });
    expect(updatePlanStep('single', 0, 'todo', undefined, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_STATUS_INVALID' },
    });
  });

  it('blocked 必须提供 note（缺失/空白拒绝）', () => {
    createPlanWithOneStep();
    expect(updatePlanStep('single', 0, 'blocked', undefined, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_STEP_INVALID' },
    });
    expect(updatePlanStep('single', 0, 'blocked', '   ', { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_STEP_INVALID' },
    });
  });

  it('stepIndex 越界 → PLAN_STEP_INVALID', () => {
    createPlanWithOneStep();
    expect(updatePlanStep('single', 1, 'done', undefined, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_STEP_INVALID' },
    });
    expect(updatePlanStep('single', -1, 'done', undefined, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_STEP_INVALID' },
    });
  });

  it('计划不存在 → PLAN_NOT_FOUND（hint 指向 planCreate）', () => {
    expect(updatePlanStep('missing', 0, 'done', undefined, { dir: plansDir })).toMatchObject({
      ok: false,
      error: { code: 'PLAN_NOT_FOUND', hint: expect.stringContaining('planCreate') },
    });
  });

  it('非法流转不落盘：文件保持原状态', () => {
    createPlanWithOneStep();
    updatePlanStep('single', 0, 'done', undefined, { dir: plansDir });
    updatePlanStep('single', 0, 'in_progress', undefined, { dir: plansDir });
    expect(readPlan('single', plansDir)?.steps[0].status).toBe('done');
  });
});

describe('listPlans（目录遍历 + 状态汇总）', () => {
  it('目录不存在返回空列表，不抛错', () => {
    expect(listPlans(path.join(plansDir, 'not-exists'))).toEqual([]);
  });

  it('列出全部计划并汇总状态（含当前进行中步骤）', () => {
    createPlan('plan-b', THREE_STEPS, { dir: plansDir, title: 'B 计划' });
    createPlan('plan-a', THREE_STEPS, { dir: plansDir });
    updatePlanStep('plan-b', 0, 'in_progress', undefined, { dir: plansDir });
    updatePlanStep('plan-b', 1, 'blocked', '数据缺失', { dir: plansDir });
    updatePlanStep('plan-a', 0, 'done', undefined, { dir: plansDir });

    const result = listPlans(plansDir);
    expect(result.map((item) => item.taskId)).toEqual(['plan-a', 'plan-b']); // 按 taskId 排序
    expect(result[0].summary).toMatchObject({ total: 3, done: 1, in_progress: 0, blocked: 0, todo: 2 });
    expect(result[1].summary).toMatchObject({ total: 3, in_progress: 1, blocked: 1, todo: 1 });
    expect(result[1].summary.currentStepIndex).toBe(0);
    expect(result[1].title).toBe('B 计划');
  });

  it('损坏文件跳过并 console.warn，不整体失败', () => {
    createPlan('good', THREE_STEPS, { dir: plansDir });
    writeFileSync(path.join(plansDir, 'broken.md'), '不是合法计划', 'utf-8');
    const result = listPlans(plansDir);
    expect(result.map((item) => item.taskId)).toEqual(['good']);
    expect(console.warn).toHaveBeenCalled();
  });
});

describe('getActivePlans（中断恢复用：进行中计划判定）', () => {
  it('目录不存在返回空数组，不抛错', () => {
    expect(getActivePlans(path.join(plansDir, 'not-exists'))).toEqual([]);
  });

  it('仅返回存在 in_progress 或 blocked 步骤的计划，并附 blocked 备注', () => {
    createPlan('plan-b', THREE_STEPS, { dir: plansDir, title: 'B 计划' });
    createPlan('plan-a', THREE_STEPS, { dir: plansDir });
    createPlan('plan-done', THREE_STEPS, { dir: plansDir });
    updatePlanStep('plan-b', 0, 'in_progress', undefined, { dir: plansDir });
    updatePlanStep('plan-b', 1, 'blocked', '数据缺失', { dir: plansDir });
    updatePlanStep('plan-a', 0, 'in_progress', undefined, { dir: plansDir });
    updatePlanStep('plan-done', 0, 'done', undefined, { dir: plansDir });
    updatePlanStep('plan-done', 1, 'done', undefined, { dir: plansDir });
    updatePlanStep('plan-done', 2, 'done', undefined, { dir: plansDir });

    const active = getActivePlans(plansDir);
    expect(active.map((item) => item.taskId).sort()).toEqual(['plan-a', 'plan-b']); // 全部 done 的计划不返回
    const b = active.find((item) => item.taskId === 'plan-b')!;
    expect(b).toMatchObject({
      title: 'B 计划',
      total: 3,
      in_progress: 1,
      blocked: 1,
      currentStepIndex: 0,
      blockedNotes: ['步骤 2：数据缺失'],
    });
    expect(b.createdAt).toBe(readPlan('plan-b', plansDir)?.createdAt);
  });

  it('按创建时间倒序；仅 blocked（无 in_progress）也视为进行中', () => {
    // old 用手写文件固定早期 createdAt（2026-01），保证与运行时创建的 newer 顺序确定
    const oldPlan: Plan = {
      taskId: 'old',
      title: 'old',
      createdAt: '2026-01-01T00:00:00.000Z',
      steps: [
        {
          title: 's1',
          successCriteria: 'x',
          status: 'blocked',
          dependsOn: [],
          artifactPath: null,
          note: '外部依赖缺失',
        },
        { title: 's2', successCriteria: 'x', status: 'done', dependsOn: [], artifactPath: null, note: null },
      ],
    };
    writeFileSync(path.join(plansDir, 'old.md'), renderPlanMarkdown(oldPlan), 'utf-8');
    createPlan('newer', THREE_STEPS, { dir: plansDir });
    updatePlanStep('newer', 0, 'in_progress', undefined, { dir: plansDir });

    const active = getActivePlans(plansDir);
    expect(active.map((item) => item.taskId)).toEqual(['newer', 'old']); // 创建时间倒序
    const old = active.find((item) => item.taskId === 'old')!;
    expect(old.currentStepIndex).toBeNull(); // 无 in_progress 步骤
    expect(old.blockedNotes).toEqual(['步骤 1：外部依赖缺失']);
  });

  it('blocked 无 note 的步骤不进入 blockedNotes（手写文件模拟工具校验外的数据）', () => {
    const plan: Plan = {
      taskId: 'no-note',
      title: 'no-note',
      createdAt: '2026-08-11T00:00:00.000Z',
      steps: [
        { title: 's1', successCriteria: 'x', status: 'blocked', dependsOn: [], artifactPath: null, note: null },
        { title: 's2', successCriteria: 'x', status: 'blocked', dependsOn: [], artifactPath: null, note: '原因' },
        { title: 's3', successCriteria: 'x', status: 'done', dependsOn: [], artifactPath: null, note: null },
      ],
    };
    writeFileSync(path.join(plansDir, 'no-note.md'), renderPlanMarkdown(plan), 'utf-8');
    const active = getActivePlans(plansDir);
    expect(active).toHaveLength(1);
    expect(active[0].blockedNotes).toEqual(['步骤 2：原因']);
  });
});

describe('renderPlanMarkdown / parsePlanMarkdown（往返一致）', () => {
  it('完整计划（依赖/产出物/备注/标题）渲染后解析回同构对象', () => {
    const plan: Plan = {
      taskId: 'full-plan',
      title: '完整计划标题',
      createdAt: '2026-08-11T08:00:00.000Z',
      steps: [
        {
          title: '步骤一',
          successCriteria: '成功标准 A',
          status: 'done',
          dependsOn: [],
          artifactPath: 'output/a.md',
          note: null,
        },
        {
          title: '步骤二',
          successCriteria: '成功标准 B',
          status: 'blocked',
          dependsOn: [0],
          artifactPath: null,
          note: '依赖方未响应',
        },
      ],
    };
    expect(parsePlanMarkdown(renderPlanMarkdown(plan))).toEqual(plan);
  });

  it('字段含换行时渲染单行化（保持固定小节可逐行解析）', () => {
    const plan: Plan = {
      taskId: 'multi-line',
      title: '标题\n第二行',
      createdAt: '2026-08-11T08:00:00.000Z',
      steps: [
        {
          title: '步骤一\n带换行标题',
          successCriteria: '成功标准\n含换行',
          status: 'todo',
          dependsOn: [],
          artifactPath: null,
          note: null,
        },
      ],
    };
    const parsed = parsePlanMarkdown(renderPlanMarkdown(plan));
    expect(parsed).toEqual({
      ...plan,
      title: '标题 第二行',
      steps: [{ ...plan.steps[0], title: '步骤一 带换行标题', successCriteria: '成功标准 含换行' }],
    });
  });

  it('parsePlanMarkdown 失败返回 null（不抛错）', () => {
    expect(parsePlanMarkdown('')).toBeNull();
    expect(parsePlanMarkdown('## 没有标题')).toBeNull();
  });

  it('summarizeStatus 汇总正确', () => {
    const plan: Plan = {
      taskId: 's',
      title: 's',
      createdAt: '2026-01-01T00:00:00.000Z',
      steps: [
        { title: 'a', successCriteria: 'x', status: 'done', dependsOn: [], artifactPath: null, note: null },
        { title: 'b', successCriteria: 'x', status: 'in_progress', dependsOn: [], artifactPath: null, note: null },
        { title: 'c', successCriteria: 'x', status: 'todo', dependsOn: [], artifactPath: null, note: null },
        { title: 'd', successCriteria: 'x', status: 'blocked', dependsOn: [], artifactPath: null, note: '原因' },
      ],
    };
    expect(summarizeStatus(plan)).toEqual({
      total: 4,
      todo: 1,
      in_progress: 1,
      done: 1,
      blocked: 1,
      currentStepIndex: 1,
    });
  });
});
