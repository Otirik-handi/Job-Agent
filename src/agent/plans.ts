import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 计划读写层（规范见 .agents/specs/03-agent/agent-tooling-conventions.md「显式规划」）。
 *
 * - 计划文件持久化在 `data/plans/<taskId>.md`（Markdown 固定小节：人可读、可解析回结构化对象），不入库。
 * - 计划文件是当前任务执行状态的单一事实来源：中断后 readPlan 读文件即续跑。
 * - 纯函数 + 可注入目录：默认走 data/plans，测试注入临时目录。
 * - 业务错误以结构化结果返回（{ ok:false, error }），不抛错；错误形态由工具层决定。
 * - 状态机单向推进：todo → in_progress → done/blocked；done/blocked 为终态不可回退。
 */

export const PLAN_STEP_STATUSES = ['todo', 'in_progress', 'done', 'blocked'] as const;
export type PlanStepStatus = (typeof PLAN_STEP_STATUSES)[number];

export type PlanStep = {
  /** 步骤标题 */
  title: string;
  /** 成功标准：可判定该步完成与否 */
  successCriteria: string;
  /** 状态：todo · in_progress · done · blocked（done/blocked 为终态不可回退） */
  status: PlanStepStatus;
  /** 依赖的步骤索引（可空；简单字段，不做 DAG 引擎） */
  dependsOn: number[];
  /** 产出物路径（可选，默认空） */
  artifactPath: string | null;
  /** 失败备注（blocked 时必填原因） */
  note: string | null;
};

export type Plan = {
  taskId: string;
  /** 任务标题（默认取 taskId） */
  title: string;
  /** 创建时间（ISO 字符串） */
  createdAt: string;
  steps: PlanStep[];
};

/** 计划层结构化错误（三字段契约对齐「结构化错误契约」） */
export type PlanError = { code: string; message: string; hint: string };
/** 业务结果：成功携带值，失败携带结构化错误；不抛异常 */
export type PlanResult<T> = { ok: true; value: T } | { ok: false; error: PlanError };

/** 计划目录根（默认项目根/data/plans）；测试可注入临时目录 */
const DEFAULT_PLANS_DIR = path.resolve(process.cwd(), 'data', 'plans');

/** taskId 合法性：仅小写字母/数字/连字符，≤64 字符（防路径穿越的第一道闸，与 skill 名同构） */
const TASK_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const TASK_ID_MAX = 64;

/** 步骤数边界：1-8 步（对齐 planCreate inputSchema） */
const STEPS_MIN = 1;
const STEPS_MAX = 8;

/**
 * 状态单向流转表：todo → in_progress → done/blocked；done/blocked 为终态（无出口，不可回退）。
 * 允许 todo 直接 done/blocked（执行中发现无需做/直接受阻），仍是单向推进，不破坏进度可信。
 */
const ALLOWED_TRANSITIONS: Record<PlanStepStatus, readonly PlanStepStatus[]> = {
  todo: ['in_progress', 'done', 'blocked'],
  in_progress: ['done', 'blocked'],
  done: [],
  blocked: [],
};

export type CreatePlanStepInput = {
  title: string;
  successCriteria: string;
  dependsOn?: number[];
};

export type CreatePlanOptions = {
  /** 计划目录（测试注入） */
  dir?: string;
  /** 任务标题（默认取 taskId） */
  title?: string;
};

function planError(code: string, message: string, hint: string): { ok: false; error: PlanError } {
  return { ok: false, error: { code, message, hint } };
}

/** 单行化：字段值内换行替换为空格（保持 Markdown 固定小节可逐行解析） */
function singleLine(text: string): string {
  return text.replace(/\r?\n/g, ' ').trim();
}

/**
 * 解析计划文件路径（纵深防御）：归一化后必须仍在 plans 目录内，防路径穿越。
 * 非法 taskId 由 TASK_ID_RE 拦截，此处兜底理论上不可达的分支（如符号链接逃逸）。
 */
function resolvePlanPath(taskId: string, dir: string): string | null {
  const resolvedDir = path.resolve(dir);
  const filePath = path.resolve(resolvedDir, `${taskId}.md`);
  if (!filePath.startsWith(resolvedDir + path.sep)) return null;
  return filePath;
}

/** 渲染计划为 Markdown（固定小节：标题 / taskId / createdAt / 步骤列表），供展示与持久化 */
export function renderPlanMarkdown(plan: Plan): string {
  const lines: string[] = [
    `# 计划：${singleLine(plan.title)}`,
    '',
    `> taskId: ${plan.taskId}`,
    `> createdAt: ${plan.createdAt}`,
    '',
    '## 步骤',
    '',
  ];
  plan.steps.forEach((step, i) => {
    const deps =
      step.dependsOn.length > 0 ? step.dependsOn.map((dep) => `步骤 ${dep + 1}`).join('、') : '无';
    lines.push(`### 步骤 ${i + 1}：${singleLine(step.title)}`, '');
    lines.push(`- 状态：${step.status}`);
    lines.push(`- 成功标准：${singleLine(step.successCriteria)}`);
    lines.push(`- 依赖：${deps}`);
    lines.push(`- 产出物：${step.artifactPath ? singleLine(step.artifactPath) : ''}`);
    lines.push(`- 备注：${step.note ? singleLine(step.note) : ''}`);
    lines.push('');
  });
  return lines.join('\n');
}

function isCompleteStep(step: Partial<PlanStep>): boolean {
  return Boolean(step.title && step.successCriteria && step.status);
}

/** 解析「步骤 1、步骤 3」文本为步骤索引列表（0-based） */
function parseDependsOn(text: string): number[] {
  const result: number[] = [];
  const re = /步骤\s*(\d+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    result.push(Number(match[1]) - 1);
  }
  return result;
}

/**
 * 解析计划 Markdown 为结构化对象。失败（缺标题/缺 taskId/缺 createdAt/步骤缺关键字段/
 * 状态非法/步骤序号不连续）返回 null；多余行忽略保持容错。文件损坏与否由调用方决定。
 */
export function parsePlanMarkdown(content: string): Plan | null {
  const lines = content.split(/\r?\n/);
  const titleMatch = lines[0]?.match(/^# 计划：(.+)$/);
  if (!titleMatch) return null;
  const title = titleMatch[1].trim();

  let taskId: string | undefined;
  let createdAt: string | undefined;
  const steps: PlanStep[] = [];
  let current: Partial<PlanStep> | null = null;

  for (const rawLine of lines.slice(1)) {
    const line = rawLine.trim();
    if (line.startsWith('> taskId:')) {
      taskId = line.slice('> taskId:'.length).trim();
      continue;
    }
    if (line.startsWith('> createdAt:')) {
      createdAt = line.slice('> createdAt:'.length).trim();
      continue;
    }
    const stepStart = line.match(/^### 步骤 (\d+)：(.+)$/);
    if (stepStart) {
      // 步骤序号必须连续（1..n），错位/跳号视为文件损坏，进度不可信
      const expectedIndex = steps.length + 1;
      if (Number(stepStart[1]) !== expectedIndex) return null;
      if (current && !isCompleteStep(current)) return null;
      current = {
        title: stepStart[2].trim(),
        status: 'todo',
        dependsOn: [],
        artifactPath: null,
        note: null,
      };
      steps.push(current as PlanStep);
      continue;
    }
    if (!current) continue;
    if (line.startsWith('- 状态：')) {
      const status = line.slice('- 状态：'.length).trim() as PlanStepStatus;
      if (!PLAN_STEP_STATUSES.includes(status)) return null;
      current.status = status;
    } else if (line.startsWith('- 成功标准：')) {
      current.successCriteria = line.slice('- 成功标准：'.length).trim();
    } else if (line.startsWith('- 依赖：')) {
      const depsText = line.slice('- 依赖：'.length).trim();
      current.dependsOn = depsText === '无' ? [] : parseDependsOn(depsText);
    } else if (line.startsWith('- 产出物：')) {
      const value = line.slice('- 产出物：'.length).trim();
      current.artifactPath = value || null;
    } else if (line.startsWith('- 备注：')) {
      const value = line.slice('- 备注：'.length).trim();
      current.note = value || null;
    }
    // 其他行（空行/额外说明）忽略，保持容错
  }

  if (current && !isCompleteStep(current)) return null;
  if (!taskId || !createdAt || !TASK_ID_RE.test(taskId) || steps.length === 0) return null;
  return { taskId, title, createdAt, steps };
}

/**
 * 创建计划：校验 taskId 格式（小写字母数字连字符 ≤64，防路径穿越）与步骤边界
 * （1-8 步、dependsOn 不越界/不自引用），写入 `data/plans/<taskId>.md`。
 * 已存在 taskId 返回 PLAN_EXISTS；不覆盖既有计划。
 */
export function createPlan(
  taskId: string,
  steps: CreatePlanStepInput[],
  opts: CreatePlanOptions = {},
): PlanResult<Plan> {
  const dir = opts.dir ?? DEFAULT_PLANS_DIR;
  if (!TASK_ID_RE.test(taskId) || taskId.length > TASK_ID_MAX) {
    return planError(
      'PLAN_INVALID',
      `taskId「${taskId}」不合法：仅允许小写字母/数字/连字符，且 ≤${TASK_ID_MAX} 字符`,
      '请使用小写字母/数字/连字符组成的 taskId（如 weekly-report、q3-job-hunting），修正后重试。',
    );
  }
  if (steps.length < STEPS_MIN || steps.length > STEPS_MAX) {
    return planError(
      'PLAN_INVALID',
      `计划步骤数不合法：${steps.length}（允许 ${STEPS_MIN}-${STEPS_MAX} 步）`,
      `请把任务拆成 ${STEPS_MIN}-${STEPS_MAX} 步（每步含标题与成功标准）后重试。`,
    );
  }
  for (const [i, step] of steps.entries()) {
    for (const dep of step.dependsOn ?? []) {
      if (dep < 0 || dep >= steps.length || dep === i) {
        return planError(
          'PLAN_INVALID',
          `步骤 ${i + 1} 的 dependsOn 引用不合法：索引 ${dep}（不存在或为自身）`,
          'dependsOn 只能引用其他步骤的索引（0 到总步数-1），且不能依赖自身；修正后重试。',
        );
      }
    }
  }
  const filePath = resolvePlanPath(taskId, dir);
  if (filePath === null) {
    return planError('PLAN_INVALID', `taskId「${taskId}」无法解析为合法文件路径`, '请更换 taskId 后重试。');
  }
  if (existsSync(filePath)) {
    return planError(
      'PLAN_EXISTS',
      `计划「${taskId}」已存在`,
      '如需重新规划，请调用 planCreate 换一个新的 taskId（如加日期/序号后缀）创建新计划，或继续用 planUpdate 更新既有计划。',
    );
  }

  const plan: Plan = {
    taskId,
    title: opts.title && opts.title.trim() ? opts.title.trim() : taskId,
    createdAt: new Date().toISOString(),
    steps: steps.map((step) => ({
      title: step.title,
      successCriteria: step.successCriteria,
      status: 'todo',
      dependsOn: step.dependsOn ?? [],
      artifactPath: null,
      note: null,
    })),
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(filePath, renderPlanMarkdown(plan), 'utf-8');
  return { ok: true, value: plan };
}

/**
 * 读取计划并解析为结构化对象。taskId 非法 / 文件不存在 / 内容损坏（无法解析）返回 null，
 * 不抛错（错误形态由工具层决定，损坏与不存在都归 PLAN_NOT_FOUND）。
 */
export function readPlan(taskId: string, dir: string = DEFAULT_PLANS_DIR): Plan | null {
  if (!TASK_ID_RE.test(taskId) || taskId.length > TASK_ID_MAX) return null;
  const filePath = resolvePlanPath(taskId, dir);
  if (filePath === null || !existsSync(filePath)) return null;
  try {
    const plan = parsePlanMarkdown(readFileSync(filePath, 'utf-8'));
    // 文件名即 key：内容 taskId 与文件名不一致视为损坏（防止错位/篡改读取）
    if (!plan || plan.taskId !== taskId) return null;
    return plan;
  } catch {
    return null;
  }
}

/**
 * 更新步骤状态：状态单向推进（todo → in_progress → done/blocked），done/blocked 为终态
 * 不可回退；blocked 必须附 note 失败原因。越界/非法流转/缺原因均返回结构化错误，不落盘。
 */
export function updatePlanStep(
  taskId: string,
  stepIndex: number,
  status: PlanStepStatus,
  note?: string,
  opts: { dir?: string } = {},
): PlanResult<Plan> {
  const dir = opts.dir ?? DEFAULT_PLANS_DIR;
  const plan = readPlan(taskId, dir);
  if (!plan) {
    return planError(
      'PLAN_NOT_FOUND',
      `计划「${taskId}」不存在`,
      '请先调用 planCreate 创建计划，或调用 listPlans 核对 taskId 后重试。',
    );
  }
  const step = plan.steps[stepIndex];
  if (!step) {
    return planError(
      'PLAN_STEP_INVALID',
      `步骤索引 ${stepIndex} 越界：计划「${taskId}」共 ${plan.steps.length} 步（索引 0-${plan.steps.length - 1}）`,
      '请核对步骤索引后重试；不确定时可先读取计划全文确认步骤顺序。',
    );
  }
  if (!PLAN_STEP_STATUSES.includes(status)) {
    return planError(
      'PLAN_STATUS_INVALID',
      `状态「${status}」不合法：仅允许 ${PLAN_STEP_STATUSES.join(' / ')}`,
      '请使用枚举内的状态值重试。',
    );
  }
  if (!ALLOWED_TRANSITIONS[step.status].includes(status)) {
    return planError(
      'PLAN_STATUS_INVALID',
      `状态流转非法：步骤 ${stepIndex + 1} 当前为 ${step.status}，不能流转为 ${status}（进度单向推进，done/blocked 为终态不可回退）`,
      '计划进度必须单向推进：todo → in_progress → done/blocked；如需重做已终态步骤，请创建新计划。',
    );
  }
  if (status === 'blocked' && !note?.trim()) {
    return planError(
      'PLAN_STEP_INVALID',
      `步骤 ${stepIndex + 1} 标记为 blocked 必须提供 note 说明失败原因`,
      '请补充 note（失败原因）后重试，便于中断恢复时了解阻塞点。',
    );
  }

  step.status = status;
  if (note !== undefined) step.note = note.trim() || null;
  writeFileSync(resolvePlanPath(taskId, dir)!, renderPlanMarkdown(plan), 'utf-8');
  return { ok: true, value: plan };
}

export type PlanStatusSummary = {
  total: number;
  todo: number;
  in_progress: number;
  done: number;
  blocked: number;
  /** 当前进行中步骤索引（第一个 in_progress）；无则为 null */
  currentStepIndex: number | null;
};

/** 状态汇总（总步数 / 各状态计数 / 当前进行中步骤） */
export function summarizeStatus(plan: Plan): PlanStatusSummary {
  const counts = { todo: 0, in_progress: 0, done: 0, blocked: 0 };
  let currentStepIndex: number | null = null;
  plan.steps.forEach((step, i) => {
    counts[step.status] += 1;
    if (step.status === 'in_progress' && currentStepIndex === null) currentStepIndex = i;
  });
  return { total: plan.steps.length, ...counts, currentStepIndex };
}

export type PlanSummary = PlanStatusSummary & {
  taskId: string;
  title: string;
  currentStepTitle: string | null;
};

/** 计划摘要（工具返回用）：状态汇总 + 当前进行中步骤标题 */
export function summarizePlan(plan: Plan): PlanSummary {
  const summary = summarizeStatus(plan);
  return {
    taskId: plan.taskId,
    title: plan.title,
    ...summary,
    currentStepTitle: summary.currentStepIndex === null ? null : plan.steps[summary.currentStepIndex].title,
  };
}

export type PlanListItem = {
  taskId: string;
  title: string;
  summary: PlanStatusSummary;
};

/**
 * 列出 plans 目录下全部计划（taskId + 标题 + 状态汇总）。
 * 目录不存在返回空列表；损坏/无法解析的文件跳过并 console.warn，不整体失败。
 */
export function listPlans(dir: string = DEFAULT_PLANS_DIR): PlanListItem[] {
  if (!existsSync(dir)) return [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    console.warn(`[plans] 读取计划目录失败：${err instanceof Error ? err.message : String(err)}`);
    return [];
  }

  const result: PlanListItem[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    const taskId = entry.name.slice(0, -3);
    if (!TASK_ID_RE.test(taskId)) continue;
    const plan = readPlan(taskId, dir);
    if (!plan) {
      console.warn(`[plans] 跳过计划「${taskId}」：文件损坏或无法解析`);
      continue;
    }
    result.push({ taskId: plan.taskId, title: plan.title, summary: summarizeStatus(plan) });
  }
  // 按 taskId 排序：输出顺序确定性，便于模型与测试依赖
  result.sort((a, b) => a.taskId.localeCompare(b.taskId));
  return result;
}

export type ActivePlanSummary = PlanStatusSummary & {
  taskId: string;
  title: string;
  /** 创建时间（ISO 字符串），用于按创建时间倒序 */
  createdAt: string;
  /** blocked 步骤的失败备注（`步骤 N：原因`），无 blocked 或备注为空则为空数组 */
  blockedNotes: string[];
};

/**
 * 列出「进行中计划」：存在 in_progress 或 blocked 步骤的计划摘要，
 * 供会话组装注入上下文做中断恢复（规范见 agent-tooling-conventions.md「中断恢复」）。
 *
 * - 复用 listPlans 的遍历/损坏跳过/状态汇总，仅对活跃计划二次读文件取 createdAt 与 blocked 备注。
 * - 按创建时间倒序（最近创建在前）；createdAt 相同时按 taskId 升序兜底，保持输出确定性。
 * - 全部步骤 done 的计划不返回；目录不存在返回空数组。
 */
export function getActivePlans(dir: string = DEFAULT_PLANS_DIR): ActivePlanSummary[] {
  const active: ActivePlanSummary[] = [];
  for (const item of listPlans(dir)) {
    if (item.summary.in_progress === 0 && item.summary.blocked === 0) continue;
    const plan = readPlan(item.taskId, dir);
    if (!plan) continue; // listPlans 已跳过损坏文件，理论上不可达；兜底防空
    const blockedNotes = plan.steps
      .map((step, i) => (step.status === 'blocked' && step.note ? `步骤 ${i + 1}：${step.note}` : null))
      .filter((note): note is string => note !== null);
    active.push({
      taskId: plan.taskId,
      title: plan.title,
      createdAt: plan.createdAt,
      ...summarizeStatus(plan),
      blockedNotes,
    });
  }
  active.sort((a, b) => {
    const byCreated = b.createdAt.localeCompare(a.createdAt);
    return byCreated !== 0 ? byCreated : a.taskId.localeCompare(b.taskId);
  });
  return active;
}
