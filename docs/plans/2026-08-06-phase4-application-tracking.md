# 第 4 期：投递管理闭环实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-06 · 状态：完成 · 目标：applyJob 两段式工具（投递摘要 → 用户确认 → 状态推进）+ 状态机纯函数 + 前端投递状态可见性（岗位筛选、抽屉提示） · 关联规范：AGENTS.md、plan-document.md

**Goal:** 实现 applyJob 工具与投递状态机（matched→applying→applied / 非终态→skipped），让 Agent 在对话中经用户确认后推进岗位投递状态；前端岗位列表支持按投递状态筛选、岗位抽屉展示投递状态与下一步引导。

**Architecture:** 沿用现有领域工具模式（createDomainTool + 两段式对话化审批，参考 tailoredResume）；状态转移规则抽为纯函数 `apply-state.ts`（TDD，对齐 channel-guard 模式）；工具第一段纯本地读取（channels_json/fit_result_json，无 LLM 调用）出摘要，第二段校验后落库；数据与 API 零改动（status 列已存在，前端只读）。

**Tech Stack:** AI SDK v7（createDomainTool，复用现有）、zod、Drizzle（无新迁移）、React/shadcn（StatusBadge/现有筛选交互复用）。

**设计依据：** `docs/designs/2026-08-06-phase4-application-tracking-design.md`
**验收标准：** 设计文档第 6 节 5 项。

**已确认的代码事实**：
- `job_opportunities.status` 列已存在（迁移 0000），默认 'saved'；枚举流转目标：'applying' | 'applied' | 'skipped'
- `StatusBadge` 已支持 5 状态（saved/matched/applying/applied/skipped）样式与中文标签，**零改动**
- 仓储模式：`src/db/repositories/job-opportunities.ts`（db.update(...).set({..., updatedAt: nowIso()}).where(eq(...)).run()）
- 工具模式：`createDomainTool({name, description, inputSchema, progress:{start,done}, execute})`；业务失败返回 `{ok:false, error:{code,message}, ...字段, hint}`；前置缺失可 throw（工厂兜底 TOOL_FAILED）
- 工具注册：`src/agent/agent.ts` getTools() + SYSTEM_PROMPT 能力清单；进度文案映射在 `app/api/chat/route.ts` onToolExecutionStart（按 toolName 写死）
- 渠道数据：`channels_json` 结构 `{ schemaVersion:1, channels:[{id,type,label,url,email,verification,riskSignals,note}] }`（前端 job-drawer.tsx 已宽容解析，工具端照此模式）
- 岗位列表（resource-tabs.tsx `tab==='job'` 区块）**无状态筛选**，需新增本地过滤；jobs 来自 `useJobOpportunities()`
- 岗位抽屉（job-drawer.tsx）已有"投递建议"（fit.advice）与"投递渠道"区块，需插入"投递状态"区块
- 测试命令：`npm run test`（vitest）；单测文件命名 `src/agent/*.test.ts`

---

### Task 1: 设计文档（已完成）

- [x] **Step 1: 设计文档**

Create `docs/designs/2026-08-06-phase4-application-tracking-design.md`（已创建：工具契约、前端、数据与 API、纯函数与单测、验收标准）。

- [x] **Step 2: 计划文档**

Create `docs/plans/2026-08-06-phase4-application-tracking.md`（本文件）。

---

### Task 2: apply-state 状态机纯函数（TDD）

**Files:**
- Create: `src/agent/apply-state.ts`
- Test: `src/agent/apply-state.test.ts`

^- [x] **Step 1: 写失败测试**

Create `src/agent/apply-state.test.ts`（对齐 channel-guard.test.ts 模式）：

```ts
import { describe, expect, it } from 'vitest';
import { applyStateTransition } from './apply-state';

describe('apply-state: apply 动作', () => {
  it('matched → applying', () => {
    expect(applyStateTransition('matched', 'apply')).toEqual({ ok: true, next: 'applying' });
  });
  it('applying → applied', () => {
    expect(applyStateTransition('applying', 'apply')).toEqual({ ok: true, next: 'applied' });
  });
  it('saved/analyzed 未匹配投递 → JOB_MATCH_REQUIRED', () => {
    expect(applyStateTransition('saved', 'apply')).toEqual({ ok: false, code: 'JOB_MATCH_REQUIRED' });
    expect(applyStateTransition('analyzed', 'apply')).toEqual({ ok: false, code: 'JOB_MATCH_REQUIRED' });
  });
  it('applied/skipped 再投递 → STATUS_TRANSITION_INVALID', () => {
    expect(applyStateTransition('applied', 'apply')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
    expect(applyStateTransition('skipped', 'apply')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
});

describe('apply-state: skip 动作', () => {
  it('非终态 → skipped', () => {
    for (const s of ['saved', 'analyzed', 'matched', 'applying']) {
      expect(applyStateTransition(s, 'skip')).toEqual({ ok: true, next: 'skipped' });
    }
  });
  it('applied 不可跳过 → STATUS_TRANSITION_INVALID', () => {
    expect(applyStateTransition('applied', 'skip')).toEqual({ ok: false, code: 'STATUS_TRANSITION_INVALID' });
  });
});
```

^- [x] **Step 2: 跑测试确认失败**

Run: `npm run test -- apply-state`
Expected: FAIL（`Cannot find module './apply-state'`）

^- [x] **Step 3: 最小实现**

Create `src/agent/apply-state.ts`：

```ts
export type ApplyAction = 'apply' | 'skip';

export type ApplyStateResult =
  | { ok: true; next: string }
  | { ok: false; code: 'JOB_MATCH_REQUIRED' | 'STATUS_TRANSITION_INVALID' };

/** 投递状态机转移规则（第 4 期设计第 2 节）：apply 推进、skip 跳过 */
export function applyStateTransition(status: string, action: ApplyAction): ApplyStateResult {
  if (action === 'apply') {
    if (status === 'matched') return { ok: true, next: 'applying' };
    if (status === 'applying') return { ok: true, next: 'applied' };
    if (status === 'saved' || status === 'analyzed') return { ok: false, code: 'JOB_MATCH_REQUIRED' };
    return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
  }
  if (status === 'applied') return { ok: false, code: 'STATUS_TRANSITION_INVALID' };
  return { ok: true, next: 'skipped' };
}
```

^- [x] **Step 4: 跑测试确认通过**

Run: `npm run test -- apply-state`
Expected: PASS（2 个 describe 全部通过）

^- [x] **Step 5: 提交**

```bash
git add src/agent/apply-state.ts src/agent/apply-state.test.ts
git commit -m "feat: 投递状态机纯函数（apply 推进/skip 跳过 + 单测）"
```

---

### Task 3: 仓储 updateJobApplication

**Files:**
- Modify: `src/db/repositories/job-opportunities.ts`（在 updateJobChannels 之后新增）

^- [x] **Step 1: 新增函数**

在 `src/db/repositories/job-opportunities.ts` 的 `updateJobChannels` 函数之后追加：

```ts
export function updateJobApplication(id: string, status: 'applying' | 'applied' | 'skipped'): void {
  db.update(jobOpportunities)
    .set({ status, updatedAt: nowIso() })
    .where(eq(jobOpportunities.id, id)).run();
}
```

^- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

^- [x] **Step 3: 提交**

```bash
git add src/db/repositories/job-opportunities.ts
git commit -m "feat: 岗位仓储新增 updateJobApplication（投递状态落库）"
```

---

### Task 4: applyJob 工具（schemas + 工具 + 注册 + 进度文案）

**Files:**
- Create: `src/agent/schemas/apply-job.ts`
- Create: `src/agent/tools/apply-job.ts`
- Modify: `src/agent/agent.ts`（import + 能力清单 + getTools）
- Modify: `app/api/chat/route.ts`（onToolExecutionStart 进度文案）

^- [x] **Step 1: 输入 schema**

Create `src/agent/schemas/apply-job.ts`（对齐 schemas/tailored-resume.ts 模式）：

```ts
import { z } from 'zod';

/** applyJob 输入：confirmed 缺省 → 预览阶段（出摘要不落库）；confirmed=true → 执行阶段（状态推进落库） */
export const applyJobInputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID'),
  action: z.enum(['apply', 'skip']).describe('apply：投递推进（matched→applying→applied）；skip：跳过（非终态→skipped）'),
  confirmed: z.boolean().optional().describe('用户已在对话中确认后传 true 进入执行阶段；缺省为预览阶段'),
});
```

^- [x] **Step 2: 工具实现**

Create `src/agent/tools/apply-job.ts`（对齐 tools/tailored-resume.ts 的两段式与错误码模式）：

```ts
import { createDomainTool } from '../tool-factory';
import { getJobOpportunity, updateJobApplication } from '../../db/repositories/job-opportunities';
import { applyJobInputSchema } from '../schemas/apply-job';
import { applyStateTransition } from '../apply-state';

type Channel = {
  id: string; type: string; label: string; url: string | null; email: string | null;
  verification: string; riskSignals: string[];
};

/** 宽容解析 channels_json（对齐前端 use-job-detail 模式）；解析失败返回 null */
function parseChannels(json: string | null): { channels: Channel[] } | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return parsed && Array.isArray(parsed.channels) ? parsed : null;
  } catch {
    return null;
  }
}

export const applyJobTool = createDomainTool({
  name: 'applyJob',
  description: '投递管理：将岗位投递状态向前推进（matched→applying→applied）或标记跳过（→skipped）。两段式：先不带 confirmed 调用获取投递摘要（当前/目标状态、推荐渠道）并向用户确认；用户确认后带 confirmed=true 再次调用落库。',
  inputSchema: applyJobInputSchema,
  progress: { start: '正在更新投递状态…', done: '投递状态已更新' },
  execute: async (args) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }
    if (args.action === 'apply' && !job.fitResultJson) {
      return {
        ok: false,
        error: { code: 'JOB_MATCH_REQUIRED', message: '该岗位尚未完成匹配，无法投递' },
        jobOpportunityId: job.id,
        hint: '请先调用 matchJob 完成岗位匹配，再执行投递。',
      };
    }

    const transition = applyStateTransition(job.status, args.action);
    if (!transition.ok) {
      return {
        ok: false,
        error: { code: transition.code, message: transition.code === 'JOB_MATCH_REQUIRED' ? '该岗位尚未完成匹配，无法投递' : `当前状态 ${job.status} 不能执行 ${args.action}` },
        jobOpportunityId: job.id,
        currentStatus: job.status,
        hint: transition.code === 'JOB_MATCH_REQUIRED'
          ? '请先调用 matchJob 完成岗位匹配，再执行投递。'
          : args.action === 'apply'
            ? '岗位已处于终态（已投递/已跳过），无需重复投递。'
            : '岗位已投递，不能标记为跳过。',
      };
    }

    // —— 第一段：出投递摘要（不落库）——
    if (!args.confirmed) {
      const channels = parseChannels(job.channelsJson);
      return {
        ok: true,
        phase: 'preview',
        jobOpportunityId: job.id,
        currentStatus: job.status,
        targetStatus: transition.next,
        channels: (channels?.channels ?? []).map((c) => ({
          id: c.id, type: c.type, label: c.label, url: c.url, email: c.email,
          verification: c.verification, riskSignals: c.riskSignals,
        })),
        hint: `请向用户呈现投递摘要：将把岗位从 ${job.status} 推进到 ${transition.next}` +
          (channels && channels.channels.length > 0
            ? '，推荐渠道如下（优先已核验渠道），并请求确认。'
            : '（未发现渠道，可直接确认投递）。') +
          '用户确认后，携带 confirmed=true 再次调用本工具。',
      };
    }

    // —— 第二段：状态推进落库 ——
    updateJobApplication(job.id, transition.next as 'applying' | 'applied' | 'skipped');
    return {
      ok: true,
      phase: transition.next,
      jobOpportunityId: job.id,
      status: transition.next,
      hint: transition.next === 'skipped'
        ? '该岗位已标记为跳过，可继续处理其他岗位。'
        : `该岗位已标记为${transition.next === 'applying' ? '投递中' : '已投递'}，可继续为其他岗位执行投递。`,
    };
  },
});
```

^- [x] **Step 3: 注册工具 + 能力清单**

Modify `src/agent/agent.ts`：
1. import 区追加：`import { applyJobTool } from './tools/apply-job';`
2. SYSTEM_PROMPT 能力清单（tailoredResume 行之后）追加：
   `- applyJob：投递管理（两段式：先出投递摘要经用户确认，再推进状态 matched→applying→applied 或标记跳过 skipped）`
3. getTools() 返回对象追加：`applyJob: applyJobTool,`

^- [x] **Step 4: 进度文案映射**

Modify `app/api/chat/route.ts` onToolExecutionStart（tailoredResume 行之后）追加：

```ts
: toolName === 'applyJob' ? '正在更新投递状态…'
```

^- [x] **Step 5: 类型检查 + 提交**

Run: `npx tsc --noEmit`
Expected: 无错误

```bash
git add src/agent/schemas/apply-job.ts src/agent/tools/apply-job.ts src/agent/agent.ts app/api/chat/route.ts
git commit -m "feat: applyJob 投递工具（两段式对话化审批 + 状态机推进）"
```

---

### Task 5: 前端投递状态可见性（岗位筛选 + 抽屉提示）

**Files:**
- Modify: `src/components/sidebar/resource-tabs.tsx`（岗位区块加状态筛选）
- Modify: `src/components/artifacts/job-drawer.tsx`（加投递状态区块）

^- [x] **Step 1: 岗位列表状态筛选**

Modify `src/components/sidebar/resource-tabs.tsx`：

1. 组件内 state 区（`const [tab, setTab] = ...` 之后）追加：

```tsx
const [jobFilter, setJobFilter] = useState<'all' | 'matched' | 'applying' | 'applied' | 'skipped'>('all');
```

2. `tab === 'job'` 区块（`{jobs.length === 0 && (...)}` 之前）插入筛选行：

```tsx
<div className="flex flex-wrap gap-1 px-3 pb-1 text-xs">
  {(['all', 'matched', 'applying', 'applied', 'skipped'] as const).map((f) => (
    <button
      key={f}
      onClick={() => setJobFilter(f)}
      className={`rounded-full px-2.5 py-1 transition-colors ${jobFilter === f ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:bg-slate-100'}`}
    >
      {{ all: '全部', matched: '已匹配', applying: '投递中', applied: '已投递', skipped: '已跳过' }[f]}
    </button>
  ))}
</div>
```

3. 岗位渲染处（`{jobs.map((job) => (`）改为过滤：

```tsx
{jobs.filter((job) => jobFilter === 'all' || job.status === jobFilter).map((job) => (
```

^- [x] **Step 2: 抽屉投递状态区块**

Modify `src/components/artifacts/job-drawer.tsx`：在"投递渠道"区块（`<Separator />` + `<div><p ...>投递渠道</p>` 之前）插入：

```tsx
<Separator />
<div>
  <p className="mb-2 font-medium">投递状态</p>
  <div className="flex items-center gap-2">
    <StatusBadge status={detail.status} />
    {detail.status === 'matched' && <span className="text-xs text-muted-foreground">可对助手说"投递该岗位"或"跳过该岗位"</span>}
    {detail.status === 'applying' && <span className="text-xs text-muted-foreground">可对助手说"已投递该岗位"完成投递</span>}
    {detail.status === 'applied' && <span className="text-xs text-muted-foreground">已投递，等待对方反馈</span>}
    {detail.status === 'skipped' && <span className="text-xs text-muted-foreground">已跳过，可随时重新匹配</span>}
  </div>
</div>
```

（插入位置：现有"投递渠道"区块开头 `<div>` 之前，即 `{detail && (` 容器内第二个 `<Separator />` 之后、渠道区块 `<div>` 之前）

^- [x] **Step 3: 构建 + 提交**

Run: `npm run lint && npx tsc --noEmit`
Expected: 无错误

```bash
git add src/components/sidebar/resource-tabs.tsx src/components/artifacts/job-drawer.tsx
git commit -m "feat: 前端投递状态可见性（岗位筛选 + 抽屉投递状态区块）"
```

---

### Task 6: 端到端验证与归档

**Files:**
- Modify: `docs/designs/2026-08-06-phase4-application-tracking-design.md`（状态改为完成）
- Modify: `docs/plans/2026-08-06-phase4-application-tracking.md`（本文件打勾 + 状态完成）

^- [x] **Step 1: 自动化验证**

Run: `npm run test && npm run lint && npm run build`
Expected: 单测全绿、lint 无错误、build 成功

^- [x] **Step 2: 真实 LLM 端到端验证（对话场景）**

启动 `npm run dev`，在对话中验证（需 .env.local 已配置模型）：
1. 对已匹配岗位说"投递这个岗位" → 第一段出摘要（当前/目标状态 + 推荐渠道）→ 确认 → 落库 applying；再次确认 → applied
2. 对未匹配岗位说"投递" → JOB_MATCH_REQUIRED + 引导先匹配
3. 对已投递岗位再投/再跳 → STATUS_TRANSITION_INVALID + 引导
4. 说"跳过这个岗位" → skipped 落库
5. 侧栏岗位列表筛选（全部/已匹配/投递中/已投递/已跳过）与抽屉"投递状态"区块展示正确

^- [x] **Step 3: 归档**

1. 设计文档状态行 `状态：草稿 → 待审阅` 改为 `状态：完成`
2. 本计划头部 `状态：草稿` 改为 `状态：完成`，全部任务打勾

```bash
git add docs/designs/2026-08-06-phase4-application-tracking-design.md docs/plans/2026-08-06-phase4-application-tracking.md
git commit -m "docs: 第 4 期计划完成（applyJob + 状态机 + 前端可见性验收通过）"
```

---

## 自审记录

（执行者填写：设计覆盖核对、占位符检查、类型一致性检查结果）
