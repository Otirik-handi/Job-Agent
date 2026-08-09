# 第 5 期：投递后阶段实施计划（recordApplicationStatus + 投递后状态机）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-09 · 状态：完成 · 目标：新增 recordApplicationStatus 确定性工具（两段式）+ 投递后状态机纯函数 + 前端四状态可见性（徽标/筛选/抽屉），并同步 02-backend/03-agent 规范 · 关联规范：AGENTS.md、plan-document.md、.agents/specs/02-backend/api-data-conventions.md、.agents/specs/03-agent/agent-tooling-conventions.md

**Goal:** 让 Agent 在对话中经用户确认后记录岗位投递后阶段（applied→interview→offer→hired 或任一→rejected），前端徽标/筛选/抽屉全量可见；状态机严格单向 + 终态不可回退，落库前确认即反悔机会。

**Architecture:** 沿用现有领域工具模式（createDomainTool + 两段式对话化审批，对齐 applyJob）；新增转移规则抽为纯函数 `applicationOutcomeTransition`（与 `applyStateTransition` 并存于 `apply-state.ts`，TDD）；工具为确定性工具（无 LLM 调用），单文件 + 独立输入 schema；数据与 API 零改动（status 列已存在，仅扩展仓储 TS 类型与前端展示）。

**Tech Stack:** AI SDK v7（createDomainTool，复用现有）、zod、Drizzle（无新迁移）、React/shadcn（StatusBadge/现有筛选交互复用）。

**设计依据：** `docs/designs/2026-08-09-phase5-application-followup-design.md`
**验收标准：** 设计文档第 8 节。

**已确认的代码事实**：
- `job_opportunities.status` 列已存在（迁移 0000），本期向其中写入新状态 `interview`/`offer`/`hired`/`rejected`，**无迁移、无新列、无新表**
- 仓储模式：`src/db/repositories/job-opportunities.ts` 的 `updateJobApplication(id, status)` 现仅接受 `'applying' | 'applied' | 'skipped'`，需扩展 TS 类型（SQL 不变）；唯一调用方为 `src/agent/tools/apply-job.ts`
- 状态机：`src/agent/apply-state.ts` 已有 `applyStateTransition`（apply/skip），新增 `applicationOutcomeTransition` 并存不合并；测试文件 `src/agent/apply-state.test.ts`
- 工具模式：`createDomainTool({name, description, inputSchema, progress:{start,done}, execute})`；业务失败返回 `{ok:false, error:{code,message}, ...字段, hint}`；前置缺失可 throw（工厂兜底 TOOL_FAILED）
- 两段式：输入 schema 带 `confirmed?: boolean`；第一段（缺省）出摘要不落库，第二段（true）重新校验后落库（对齐 `src/agent/schemas/apply-job.ts`）
- 工具注册：`src/agent/agent.ts` getTools() + SYSTEM_PROMPT 能力清单；进度文案映射在 `app/api/chat/route.ts` onToolExecutionStart（按 toolName 写死）
- `StatusBadge`：`src/components/ui/status-badge.tsx` 的 `STATUS_STYLES`/`STATUS_LABELS` 两个 Record；现状 5 状态零改动，追加 4 状态
- 岗位筛选：`src/components/sidebar/resource-tabs.tsx` 的 `jobFilter` state 与筛选按钮数组 `(['all','matched','applying','applied','skipped'] as const)`，已有 `flex-wrap` 可容纳 9 枚
- 岗位抽屉：`src/components/artifacts/job-drawer.tsx` 投递状态区块已有 4 条 status 文案（matched/applying/applied/skipped），追加 4 条
- 测试命令：`npm run test`（vitest，单测文件命名 `src/agent/*.test.ts`）；类型检查 `npx tsc --noEmit`；构建 `npm run build`

---

### Task 1: 设计文档（已完成）

- [x] **Step 1: 设计文档**

Create `docs/designs/2026-08-09-phase5-application-followup-design.md`（已创建：决策摘要、状态机、工具契约、前端、数据与 API、规范同步、纯函数与单测、验收）。

- [x] **Step 2: 计划文档**

Create `docs/plans/2026-08-09-phase5-application-followup.md`（本文件）。

---

### Task 2: 规范同步（先改规范再改代码）

**Files:**
- Modify: `.agents/specs/02-backend/api-data-conventions.md`（status 枚举）
- Modify: `.agents/specs/03-agent/agent-tooling-conventions.md`（确定性工具清单 + 两段式审批）

- [x] **Step 1: 02-backend status 枚举补四状态**

在 `.agents/specs/02-backend/api-data-conventions.md` 的 `## status 枚举` 节（约第 41-43 行）修改：

```markdown
- 岗位 `status` 列枚举：`saved` / `analyzed` / `matched` / `applying` / `applied` / `skipped` / `interview` / `offer` / `hired` / `rejected`
- 状态转移规则在 `src/agent/apply-state.ts`（纯函数：`applyStateTransition` 投递动作 / `applicationOutcomeTransition` 投递后结果），仓储只落库不校验转移
- 为什么：投递状态机统一语义，前端 `StatusBadge` 与岗位筛选依赖该枚举
```

- [x] **Step 2: 03-agent 确定性工具清单补 recordApplicationStatus**

在 `.agents/specs/03-agent/agent-tooling-conventions.md` 的 `## 文件组织` 节（约第 16 行）修改确定性工具清单：

```markdown
- **确定性工具**（纯本地逻辑，无 LLM 调用：import-resume / import-job-opportunity / list-resumes / list-job-opportunities / apply-job / record-application-status）单文件 `tools/<name>.ts`（输入 schema 内联或独立 `schemas/` 文件如 apply-job、record-application-status，**不建 prompts**）
```

- [x] **Step 3: 03-agent 两段式审批补 recordApplicationStatus 与理由**

在 `.agents/specs/03-agent/agent-tooling-conventions.md` 的 `## 两段式对话化审批` 节（约第 20-27 行）修改：

```markdown
## 两段式对话化审批

- 高风险 / 数据变更动作（tailoredResume、applyJob、recordApplicationStatus）采用两段式：
  1. **第一段**（不带 `confirmed`）：只读取/生成摘要，**不落库**，返回给用户确认
  2. **第二段**（带 `confirmed: true`）：校验前置条件后落库
- 执行前校验前置条件并返回明确错误（如岗位未匹配 → `JOB_MATCH_REQUIRED`、岗位未投递 → `NOT_APPLIED`，并附 next 指引）
- 为什么：对外关键动作必须有人工确认点（find-work 经验 #4），两段式复刻对话审批流；状态机严格单向 + 终态不可回退，**所有状态变更落库前确认即反悔机会**
```

- [x] **Step 4: 提交**

```bash
git add .agents/specs/02-backend/api-data-conventions.md .agents/specs/03-agent/agent-tooling-conventions.md
git commit -m "docs: 规范同步投递后状态（02-backend 枚举 + 03-agent 两段式清单与理由）"
```

---

### Task 3: applicationOutcomeTransition 纯函数（TDD）

**Files:**
- Modify: `src/agent/apply-state.ts`
- Modify: `src/agent/apply-state.test.ts`

- [x] **Step 1: 追加失败测试**

先修改 `src/agent/apply-state.test.ts` 第 1 行 import（追加 `applicationOutcomeTransition`）：

```ts
import { applyStateTransition, applicationOutcomeTransition } from './apply-state';
```

再在文件末尾追加：

```ts
describe('apply-state: applicationOutcomeTransition 合法链', () => {
  it('applied → interview', () => {
    expect(applicationOutcomeTransition('applied', 'interview')).toEqual({ ok: true, next: 'interview' });
  });
  it('interview → offer', () => {
    expect(applicationOutcomeTransition('interview', 'offer')).toEqual({ ok: true, next: 'offer' });
  });
  it('offer → hired', () => {
    expect(applicationOutcomeTransition('offer', 'hired')).toEqual({ ok: true, next: 'hired' });
  });
  it('applied/interview/offer → rejected', () => {
    expect(applicationOutcomeTransition('applied', 'rejected')).toEqual({ ok: true, next: 'rejected' });
    expect(applicationOutcomeTransition('interview', 'rejected')).toEqual({ ok: true, next: 'rejected' });
    expect(applicationOutcomeTransition('offer', 'rejected')).toEqual({ ok: true, next: 'rejected' });
  });
});

describe('apply-state: applicationOutcomeTransition 非法转移', () => {  it('跳过中间态（applied→offer/hired、interview→hired）→ STATUS_TRANSITION_INVALID', () => {
    expect(applicationOutcomeTransition('applied', 'offer')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('applied', 'hired')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('interview', 'hired')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
  it('回退（offer→interview、interview→applied）→ STATUS_TRANSITION_INVALID', () => {
    expect(applicationOutcomeTransition('offer', 'interview')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('interview', 'applied')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
  it('终态（rejected/hired）再记录 → STATUS_TRANSITION_INVALID', () => {
    expect(applicationOutcomeTransition('rejected', 'interview')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applicationOutcomeTransition('hired', 'rejected')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
  it('未投递（saved/analyzed/matched/applying/skipped）→ NOT_APPLIED', () => {
    for (const s of ['saved', 'analyzed', 'matched', 'applying', 'skipped']) {
      expect(applicationOutcomeTransition(s, 'interview')).toEqual({ ok: false, code: 'NOT_APPLIED' });
    }
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npm run test -- apply-state`
Expected: FAIL（`applicationOutcomeTransition` is not a function）

- [x] **Step 3: 最小实现**

在 `src/agent/apply-state.ts` 末尾追加：

```ts
export type OutcomeTarget = 'interview' | 'offer' | 'hired' | 'rejected';

export type OutcomeResult =
  | { ok: true; next: string }
  | { ok: false; code: 'NOT_APPLIED' | 'STATUS_TRANSITION_INVALID' };

/** 投递后状态转移规则（第 5 期设计第 2 节）：applied→interview→offer→hired 严格单向，任一→rejected；rejected/hired 终态 */
export function applicationOutcomeTransition(status: string, target: OutcomeTarget): OutcomeResult {
  if (status === 'rejected' || status === 'hired') return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
  if (status !== 'applied' && status !== 'interview' && status !== 'offer') return { ok: false, code: 'NOT_APPLIED' };
  if (target === 'rejected') return { ok: true, next: 'rejected' };
  if (status === 'applied' && target === 'interview') return { ok: true, next: 'interview' };
  if (status === 'interview' && target === 'offer') return { ok: true, next: 'offer' };
  if (status === 'offer' && target === 'hired') return { ok: true, next: 'hired' };
  return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npm run test -- apply-state`
Expected: PASS（现有 2 个 describe + 新增 2 个 describe 全部通过）

- [x] **Step 5: 提交**

```bash
git add src/agent/apply-state.ts src/agent/apply-state.test.ts
git commit -m "feat: 投递后状态机纯函数（applicationOutcomeTransition + 单测）"
```

---

### Task 4: 仓储 updateJobApplication 类型扩展

**Files:**
- Modify: `src/db/repositories/job-opportunities.ts`（updateJobApplication status 类型）

- [x] **Step 1: 扩展 status 类型**

在 `src/db/repositories/job-opportunities.ts` 中把 `updateJobApplication` 签名（约第 45 行）修改为：

```ts
export function updateJobApplication(id: string, status: 'applying' | 'applied' | 'skipped' | 'interview' | 'offer' | 'hired' | 'rejected'): void {
  db.update(jobOpportunities)
    .set({ status, updatedAt: nowIso() })
    .where(eq(jobOpportunities.id, id)).run();
}
```

> 注：仅 TS 类型扩展，SQL 语句不变（status 为 text 列，无迁移）。唯一调用方 apply-job.ts 传参不受影响。

- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [x] **Step 3: 提交**

```bash
git add src/db/repositories/job-opportunities.ts
git commit -m "feat: 岗位仓储 updateJobApplication 支持投递后状态（类型扩展，无迁移）"
```

---

### Task 5: recordApplicationStatus 工具（schemas + 工具 + 注册 + 进度文案）

**Files:**
- Create: `src/agent/schemas/record-application-status.ts`
- Create: `src/agent/tools/record-application-status.ts`
- Modify: `src/agent/agent.ts`（import + 能力清单 + getTools）
- Modify: `app/api/chat/route.ts`（onToolExecutionStart 进度文案）

- [x] **Step 1: 输入 schema**

Create `src/agent/schemas/record-application-status.ts`（对齐 `src/agent/schemas/apply-job.ts` 模式）：

```ts
import { z } from 'zod';

/** recordApplicationStatus 输入：confirmed 缺省 → 预览阶段（出变更摘要不落库）；confirmed=true → 执行阶段（状态推进落库） */
export const recordApplicationStatusInputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID'),
  target: z.enum(['interview', 'offer', 'hired', 'rejected'])
    .describe('投递后目标状态：interview 面试中 / offer 拿到 offer / hired 接受 offer 入职 / rejected 已拒绝'),
  confirmed: z.boolean().optional().describe('用户已在对话中确认后传 true 进入执行阶段；缺省为预览阶段'),
});
```

- [x] **Step 2: 工具实现**

Create `src/agent/tools/record-application-status.ts`（确定性工具，对齐 `src/agent/tools/apply-job.ts` 两段式与错误码模式）：

```ts
import { createDomainTool } from '../tool-factory';
import { getJobOpportunity, updateJobApplication } from '../../db/repositories/job-opportunities';
import { recordApplicationStatusInputSchema } from '../schemas/record-application-status';
import { applicationOutcomeTransition } from '../apply-state';

const TARGET_LABELS: Record<string, string> = {
  interview: '面试中', offer: '拿到 offer', hired: '已入职', rejected: '已拒绝',
};

export const recordApplicationStatusTool = createDomainTool({
  name: 'recordApplicationStatus',
  description: '投递后状态记录：将已投递岗位推进到投递后阶段（applied→interview→offer→hired，或任一→rejected）。两段式：先不带 confirmed 调用获取变更摘要（当前/目标状态）并向用户确认；用户确认后带 confirmed=true 再次调用落库。',
  inputSchema: recordApplicationStatusInputSchema,
  progress: { start: '正在记录投递后状态…', done: '投递后状态已记录' },
  execute: async (args) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }

    const transition = applicationOutcomeTransition(job.status, args.target);
    if (!transition.ok) {
      return {
        ok: false,
        error: { code: transition.code, message: transition.code === 'NOT_APPLIED' ? '该岗位尚未投递，无法记录投递后状态' : `当前状态 ${job.status} 不能记录为 ${TARGET_LABELS[args.target]}` },
        jobOpportunityId: job.id,
        currentStatus: job.status,
        hint: transition.code === 'NOT_APPLIED'
          ? '请先调用 applyJob 完成投递，再记录投递后状态。'
          : `当前状态 ${job.status} 不能记录为 ${TARGET_LABELS[args.target]}，请检查目标状态是否正确。`,
      };
    }

    // —— 第一段：出变更摘要（不落库）——
    if (!args.confirmed) {
      return {
        ok: true,
        phase: 'preview',
        jobOpportunityId: job.id,
        currentStatus: job.status,
        targetStatus: transition.next,
        hint: `请向用户呈现变更摘要：将把岗位从 ${job.status} 记录为 ${TARGET_LABELS[transition.next]}（${transition.next}），并请求确认。用户确认后，携带 confirmed=true 再次调用本工具。`,
      };
    }

    // —— 第二段：状态推进落库 ——
    updateJobApplication(job.id, transition.next as 'interview' | 'offer' | 'hired' | 'rejected');
    return {
      ok: true,
      phase: transition.next,
      jobOpportunityId: job.id,
      status: transition.next,
      hint: transition.next === 'rejected'
        ? '该岗位已记录为已拒绝，可删除该岗位或匹配其他机会。'
        : transition.next === 'hired'
          ? '该岗位已记录为已入职，此岗位已完结。'
          : `该岗位已记录为${TARGET_LABELS[transition.next]}，可继续推进或记录结果。`,
    };
  },
});
```

- [x] **Step 3: 注册进 agent.ts**

在 `src/agent/agent.ts` 中：

1. import 区（第 10 行 `tailoredResumeTool` 之后）追加：

```ts
import { recordApplicationStatusTool } from './tools/record-application-status';
```

2. SYSTEM_PROMPT 能力清单（第 28 行 `applyJob` 行之后）追加一行：

```
- recordApplicationStatus：投递后状态记录（两段式：先出变更摘要经用户确认，再推进状态 applied→interview→offer→hired 或任一→rejected）
```

3. SYSTEM_PROMPT 原则区（`applyJob` 相关原则附近）追加一条：

```
- 用户告知投递后进展（进入面试/收到 offer/被拒/入职）时，调用 recordApplicationStatus 记录；两段式流程与 applyJob 一致，须先出摘要经用户确认再落库。
```

4. getTools()（第 50 行 `applyJob: applyJobTool,` 之后）追加：

```ts
    recordApplicationStatus: recordApplicationStatusTool,
```

- [x] **Step 4: 进度文案映射**

在 `app/api/chat/route.ts` 的 `onToolExecutionStart` 中（`applyJob` 分支之后，约第 105 行）追加分支：

```ts
            : toolName === 'recordApplicationStatus' ? '正在记录投递后状态…'
```

- [x] **Step 5: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [x] **Step 6: 提交**

```bash
git add src/agent/schemas/record-application-status.ts src/agent/tools/record-application-status.ts src/agent/agent.ts app/api/chat/route.ts
git commit -m "feat: recordApplicationStatus 投递后状态记录工具（两段式对话化审批）"
```

---

### Task 6: 前端投递后状态可见性（徽标 + 筛选 + 抽屉）

**Files:**
- Modify: `src/components/ui/status-badge.tsx`
- Modify: `src/components/sidebar/resource-tabs.tsx`
- Modify: `src/components/artifacts/job-drawer.tsx`

- [x] **Step 1: StatusBadge 追加四状态**

在 `src/components/ui/status-badge.tsx` 中，向 `STATUS_STYLES` 与 `STATUS_LABELS` 两个 Record 各追加 4 条（现有 5 状态零改动）：

```ts
const STATUS_STYLES: Record<string, string> = {
  saved: 'bg-slate-100 text-slate-600',
  matched: 'bg-indigo-500/10 text-indigo-700',
  applying: 'bg-amber-500/10 text-amber-700',
  applied: 'bg-emerald-500/10 text-emerald-700',
  skipped: 'bg-slate-100 text-slate-500',
  interview: 'bg-sky-500/10 text-sky-700',
  offer: 'bg-violet-500/10 text-violet-700',
  hired: 'bg-teal-500/10 text-teal-700',
  rejected: 'bg-red-500/10 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  saved: '已保存', matched: '已匹配', applying: '投递中', applied: '已投递', skipped: '已跳过',
  interview: '面试中', offer: 'offer', hired: '已入职', rejected: '已拒绝',
};
```

- [x] **Step 2: 岗位筛选 Tab 补四枚**

在 `src/components/sidebar/resource-tabs.tsx` 中：

1. `jobFilter` state 类型（第 32 行）扩展：

```tsx
const [jobFilter, setJobFilter] = useState<'all' | 'matched' | 'applying' | 'applied' | 'skipped' | 'interview' | 'offer' | 'hired' | 'rejected'>('all');
```

2. 筛选按钮数组（第 193 行）与标签映射（第 199 行）扩展：

```tsx
{(['all', 'matched', 'applying', 'applied', 'skipped', 'interview', 'offer', 'hired', 'rejected'] as const).map((f) => (
  <button
    key={f}
    onClick={() => setJobFilter(f)}
    className={`rounded-full px-2.5 py-1 transition-colors ${jobFilter === f ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-slate-100'}`}
  >
    {{ all: '全部', matched: '已匹配', applying: '投递中', applied: '已投递', skipped: '已跳过', interview: '面试中', offer: 'offer', hired: '已入职', rejected: '已拒绝' }[f]}
  </button>
))}
```

> 注：容器已有 `flex flex-wrap gap-1 px-3 pb-1 text-xs`，9 枚按钮自动换行，零样式改动。

- [x] **Step 3: 岗位抽屉状态区块补文案**

在 `src/components/artifacts/job-drawer.tsx` 的投递状态区块（第 152-155 行现有 4 条文案之后）追加 4 条：

```tsx
{detail.status === 'interview' && <span className="text-xs text-muted-foreground">可对助手说：记录面试结果（offer/拒绝）</span>}
{detail.status === 'offer' && <span className="text-xs text-muted-foreground">可对助手说：接受 offer 入职</span>}
{detail.status === 'rejected' && <span className="text-xs text-muted-foreground">已拒绝，可删除该岗位或匹配其他机会</span>}
{detail.status === 'hired' && <span className="text-xs text-muted-foreground">已入职，此岗位已完结</span>}
```

- [x] **Step 4: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 无错误，build 通过

- [x] **Step 5: 提交**

```bash
git add src/components/ui/status-badge.tsx src/components/sidebar/resource-tabs.tsx src/components/artifacts/job-drawer.tsx
git commit -m "feat: 前端投递后状态可见性（徽标/筛选/抽屉文案）"
```

---

### Task 7: 端到端验证与归档

**Files:**
- Modify: `docs/plans/2026-08-09-phase5-application-followup.md`（本文件，任务打勾）
- Modify: `docs/designs/2026-08-09-phase5-application-followup-design.md`（状态 → 完成）

- [x] **Step 1: 单测与构建**

Run: `npm run test && npm run build`
Expected: 全部单测通过 + build 通过

- [x] **Step 2: 端到端场景验证（dev 服务）**

Run: `npm run dev`，在对话中依次验证：

1. **记录面试中**：导入岗位 → 匹配 → applyJob 投递到 applied → 对话说"进入面试了" → 工具出摘要（applied → 面试中）→ 用户确认 → 落库；侧栏岗位徽标变「面试中」、筛选「面试中」可过滤、抽屉文案"可对助手说：记录面试结果（offer/拒绝）"
2. **推进到 offer**：对话说"拿到 offer 了" → 确认 → 徽标「offer」、抽屉文案"可对助手说：接受 offer 入职"
3. **推进到 hired**：对话说"入职了" → 确认 → 徽标「已入职」、抽屉文案"已入职，此岗位已完结"
4. **rejected 路径**：对另一已投递岗位说"被拒了" → 确认 → 徽标「已拒绝」；终态后再说"进入面试" → 返回明确错误（STATUS_TRANSITION_INVALID）
5. **NOT_APPLIED 路径**：对未投递（saved/matched）岗位说"进入面试" → 返回"该岗位尚未投递"错误
6. **未确认不落库**：预览摘要后**不确认**（不携带 confirmed）→ 状态不变

Expected: 6 项全部符合预期；刷新后状态持久（SQLite 落库）

- [x] **Step 3: 计划与设计文档状态更新**

- 计划头部元信息 `状态：草稿` → `状态：完成`；本文件所有任务打勾 `[x]`
- 设计文档头部 `状态：草稿 → 待审阅` → `状态：完成`

- [x] **Step 4: 提交**

```bash
git add docs/plans/2026-08-09-phase5-application-followup.md docs/designs/2026-08-09-phase5-application-followup-design.md
git commit -m "docs: 第 5 期计划完成（recordApplicationStatus + 投递后状态机 + 前端可见性验收通过）"
```
