# 第 2 期：岗位导入 + 岗位匹配（含自动续问）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-05 · 状态：生效 · 目标：岗位导入与三段式匹配闭环，一条消息自动多步完成 · 关联规范：AGENTS.md、plan-document.md

**Goal:** 实现 importJobOpportunity（文本导入）+ matchJob（理解→匹配→建议三段式）两个领域工具，/api/chat 改造为 ToolLoopAgent 服务端自动多步循环（一条消息完成"导入岗位并匹配"），前端新增岗位资源列表与匹配结果抽屉。

**Architecture:** 仓储/API 参照第 1 期模式；matchJob 用 callStructured（generateObject）+ zod 契约（JobMatchResultV1，prompt 内嵌契约示例）；/api/chat 由 streamText 改为 `ToolLoopAgent` + `createAgentUIStream`（`stopWhen: isStepCount(5)`），进度事件与消息持久化机制沿用（tee + readUIMessageStream）。

**Tech Stack:** AI SDK v7（ToolLoopAgent/createAgentUIStream/createAgentUIStreamResponse/isStepCount）、zod、Drizzle（已有表）、React/shadcn（Soft UI 令牌）。

**设计依据：** `docs/designs/2026-08-05-phase2-job-match-design.md`、`docs/designs/2026-08-04-find-work-experience-borrowing.md`（经验 #1/#3/3.1）
**验收标准：** 设计文档第 6 节 6 项。

**已确认的 API 事实**（类型调研）：
- `new ToolLoopAgent({ model, system, tools, stopWhen })`（settings 含 LanguageModelCallOptions；默认 stopWhen 为 isStepCount(20)）
- `createAgentUIStream({ agent, uiMessages, options, ...uiMessageStreamOptions })` 返回 UI 消息流；`createAgentUIStreamResponse({ stream })` 返回 Response
- `isStepCount(n)` 返回 StopCondition
- 停止条件：finishReason 非 tool-calls / 工具无 execute / 需审批 / stopWhen 满足

---

### Task 1: 岗位仓储与查询端点

**Files:**
- Create: `src/db/repositories/job-opportunities.ts`
- Create: `app/api/job-opportunities/route.ts`
- Create: `app/api/job-opportunities/[id]/route.ts`

- [ ] **Step 1: 岗位仓储**

Create `src/db/repositories/job-opportunities.ts`（参照 `resumes.ts` 模式）：
```ts
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { jobOpportunities } from '../schema';
import { nowIso } from './conversations';

export type JobOpportunityRecord = {
  id: string; company: string; title: string; jdText: string; url: string | null;
  status: string; fitResultJson: string | null; channelsJson: string | null;
  createdAt: string; updatedAt: string;
};

export function createJobOpportunity(jdText: string): JobOpportunityRecord {
  const record: JobOpportunityRecord = {
    id: randomUUID(), company: '', title: '', jdText, url: null,
    status: 'saved', fitResultJson: null, channelsJson: null,
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  db.insert(jobOpportunities).values(record).run();
  return record;
}

export function listJobOpportunities(status?: string): JobOpportunityRecord[] {
  const base = db.select().from(jobOpportunities);
  const rows = status ? base.where(eq(jobOpportunities.status, status)) : base;
  return rows.orderBy(desc(jobOpportunities.updatedAt)).all();
}

export function getJobOpportunity(id: string): JobOpportunityRecord | null {
  return db.select().from(jobOpportunities).where(eq(jobOpportunities.id, id)).get() ?? null;
}

export function updateJobMatch(id: string, input: { company: string; title: string; fitResultJson: string }): void {
  db.update(jobOpportunities)
    .set({ company: input.company, title: input.title, fitResultJson: input.fitResultJson, status: 'matched', updatedAt: nowIso() })
    .where(eq(jobOpportunities.id, id)).run();
}
```

- [ ] **Step 2: 列表端点**

Create `app/api/job-opportunities/route.ts`：
```ts
import { listJobOpportunities } from '@/src/db/repositories/job-opportunities';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = url.searchParams.get('status') ?? undefined;
  const records = listJobOpportunities(status);
  return Response.json(records.map((r) => ({
    id: r.id,
    company: r.company,
    title: r.title,
    status: r.status,
    matched: r.fitResultJson !== null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
}
```

- [ ] **Step 3: 详情端点**

Create `app/api/job-opportunities/[id]/route.ts`：
```ts
import { getJobOpportunity } from '@/src/db/repositories/job-opportunities';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = getJobOpportunity(id);
  if (!record) return Response.json({ code: 'JOB_OPPORTUNITY_NOT_FOUND', message: '岗位不存在' }, { status: 404 });
  let fitResult = null;
  if (record.fitResultJson) {
    try { fitResult = JSON.parse(record.fitResultJson); } catch { fitResult = null; }
  }
  return Response.json({
    id: record.id,
    company: record.company,
    title: record.title,
    jdText: record.jdText,
    url: record.url,
    status: record.status,
    fitResult,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  });
}
```

- [ ] **Step 4: 验证与提交**

Run: `node_modules/.bin/tsc --noEmit` → 0 错误；`npm run build` → 通过
```bash
git add src/db/repositories app/api && git commit -m "feat: 岗位仓储与查询端点"
```

### Task 2: importJobOpportunity 工具

**Files:**
- Create: `src/agent/tools/import-job-opportunity.ts`

- [ ] **Step 1: 实现工具**

Create `src/agent/tools/import-job-opportunity.ts`（参照 `import-resume.ts` 模式；文本上限/归一化复用 resume-text 的函数，注释说明语义复用）：
```ts
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createJobOpportunity } from '../../db/repositories/job-opportunities';
import { assertTextLength, normalizeResumeText } from '../resume-text';

const inputSchema = z.object({
  text: z.string().min(1).describe('岗位 JD 文本（粘贴）'),
});

export const importJobOpportunityTool = createDomainTool({
  name: 'importJobOpportunity',
  description: '导入岗位：接受粘贴的 JD 文本。导入后返回 jobOpportunityId，可用 matchJob 进行匹配分析。',
  inputSchema,
  progress: { start: '正在保存岗位信息…', done: '岗位导入完成' },
  execute: async (args) => {
    const jdText = normalizeResumeText(args.text);
    assertTextLength(jdText); // 复用文本上限（80000 字符）

    const record = createJobOpportunity(jdText);

    return {
      jobOpportunityId: record.id,
      charCount: jdText.length,
      preview: jdText.slice(0, 120),
      next: '可以调用 matchJob 对这份岗位进行匹配分析',
    };
  },
});
```

- [ ] **Step 2: 接入 agent.ts**

Modify `src/agent/agent.ts`：取消 `importJobOpportunityTool` 的注释（若无注释则新增 import），`getTools()` 返回增加 `importJobOpportunity: importJobOpportunityTool`；SYSTEM_PROMPT 的能力清单补充一行 `- importJobOpportunity：导入岗位（粘贴 JD 文本）`。

- [ ] **Step 3: 验证与提交**

Run: `node_modules/.bin/tsc --noEmit` → 0 错误
```bash
git add src/agent && git commit -m "feat: importJobOpportunity 工具（JD 文本导入）"
```

### Task 3: matchJob 契约与 prompt

**Files:**
- Create: `src/agent/schemas/job-match.ts`
- Create: `src/agent/prompts/job-match.ts`

- [ ] **Step 1: 契约（JobMatchResultV1）**

Create `src/agent/schemas/job-match.ts`：
```ts
import { z } from 'zod';

/** 岗位匹配契约 v1（三段式：理解 → 匹配矩阵 → 投递建议；产物内嵌 schemaVersion） */
export const jobMatchResultSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  understanding: z.object({
    company: z.string().describe('公司名称（从 JD 中提取，未知则为空串）'),
    title: z.string().describe('职位名称（从 JD 中提取，未知则为空串）'),
    requirements: z.array(z.object({
      id: z.string().regex(/^r\d+$/).describe('要求编号，稳定 id：r1、r2…'),
      text: z.string().describe('要求内容（从 JD 提炼）'),
      type: z.enum(['skill', 'experience', 'education', 'responsibility', 'other']).describe('要求类型'),
    })).min(1).max(8),
    city: z.string().nullable().describe('工作城市，未知为 null'),
    level: z.string().nullable().describe('职级/资历要求，未知为 null'),
    tags: z.array(z.string()).max(10).describe('岗位标签（技术栈/关键词）'),
  }),
  fitResults: z.array(z.object({
    requirementId: z.string().regex(/^r\d+$/).describe('对应 understanding.requirements 的 id'),
    level: z.enum(['highly-matched', 'matched', 'partial', 'mismatch'])
      .describe('匹配度：highly-matched 高度匹配 / matched 匹配 / partial 部分匹配 / mismatch 不匹配'),
    evidence: z.string().describe('简历原文中的证据片段；无证据则说明缺失'),
    note: z.string().describe('说明：匹配点或不匹配点（针对 mismatch 说明差距）'),
  })).min(1).max(8),
  overallScore: z.number().int().min(0).max(100).describe('整体匹配评分 0-100'),
  risks: z.array(z.object({
    point: z.string().describe('风险点'),
    evidence: z.string().optional().describe('简历原文证据片段'),
  })).max(8),
  advice: z.object({
    mustFix: z.array(z.string()).max(8).describe('必备修改：针对 partial/mismatch 项的简历修改建议'),
    resumeAdjustments: z.array(z.string()).max(8).describe('简历调整：如何突出 highly-matched 项'),
    talkingPoints: z.array(z.string()).max(8).describe('面试/沟通谈话要点'),
    truthBoundary: z.string().describe('真实性边界提示：不得虚构经历、技能、雇主、证书'),
  }),
});

export type JobMatchResultV1 = z.infer<typeof jobMatchResultSchemaV1>;
```

- [ ] **Step 2: prompt（契约示例内嵌，经验 3.1）**

Create `src/agent/prompts/job-match.ts`：
```ts
import type { JobMatchResultV1 } from '../schemas/job-match';

export function buildJobMatchSystemPrompt(): string {
  return `你是一名资深招聘匹配专家。请将岗位 JD 与候选人简历进行匹配分析，按输出契约产出结构化结果（三段式：岗位理解 → 逐条匹配矩阵 → 投递建议）。

要求：
1. 岗位理解：从 JD 提炼 ≤8 条要求，编号固定为 r1、r2…（id 必须稳定，后续引用依赖它）。
2. 匹配矩阵：对每条要求逐条匹配，引用简历原文作为 evidence；简历中没有对应证据的必须如实说明缺失，严禁编造证据。
3. 匹配度 level 仅允许四个值：highly-matched（高度匹配）/ matched（匹配）/ partial（部分匹配）/ mismatch（不匹配）。
4. 评分 overallScore 依据匹配矩阵计算，0-100 整数。
5. 投递建议中的 mustFix 针对不匹配/部分匹配项给出可执行的简历修改建议；truthBoundary 必须提醒用户不得虚构经历、技能、雇主、证书或成果。
6. 严格按输出契约的 JSON 结构输出，字段名与枚举值不得更改。

输出契约结构（字段名与枚举必须严格一致）：
{
  "schemaVersion": 1,
  "understanding": {
    "company": "某某科技",
    "title": "高级前端工程师",
    "requirements": [
      { "id": "r1", "text": "5 年以上前端开发经验", "type": "experience" },
      { "id": "r2", "text": "精通 TypeScript 与 React", "type": "skill" }
    ],
    "city": "杭州",
    "level": "高级",
    "tags": ["React", "TypeScript"]
  },
  "fitResults": [
    { "requirementId": "r1", "level": "matched", "evidence": "简历中写明 5 年前端开发经验", "note": "满足年限要求" }
  ],
  "overallScore": 78,
  "risks": [
    { "point": "缺少 React 项目证据", "evidence": "简历技能列表无 React" }
  ],
  "advice": {
    "mustFix": ["补充 React 项目经历描述"],
    "resumeAdjustments": ["将 TypeScript 经验前置到技能区首位"],
    "talkingPoints": ["强调大型项目架构经验"],
    "truthBoundary": "所有补充内容必须基于真实经历，不得虚构"
  }
}`;
}

export function buildJobMatchUserPrompt(jdText: string, resumeName: string, resumeText: string, resumeProfileJson: string): string {
  return `岗位 JD：\n${jdText}\n\n候选人简历名称：${resumeName}\n简历原文：\n${resumeText}\n\n简历结构化画像（仅作参考，证据必须引用简历原文）：\n${resumeProfileJson}`;
}
```

- [ ] **Step 3: 提交**

```bash
git add src/agent/schemas src/agent/prompts && git commit -m "feat: matchJob 契约与 prompt（JobMatchResultV1 三段式）"
```

### Task 4: matchJob 工具实现

**Files:**
- Create: `src/agent/tools/match-job.ts`
- Modify: `src/agent/agent.ts`

- [ ] **Step 1: 实现工具**

Create `src/agent/tools/match-job.ts`：
```ts
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getJobOpportunity, updateJobMatch } from '../../db/repositories/job-opportunities';
import { listResumes, getResume } from '../../db/repositories/resumes';
import { jobMatchResultSchemaV1 } from '../schemas/job-match';
import { buildJobMatchSystemPrompt, buildJobMatchUserPrompt } from '../prompts/job-match';

const inputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID（由 importJobOpportunity 返回）'),
});

export const matchJobTool = createDomainTool({
  name: 'matchJob',
  description: '岗位匹配：将岗位 JD 与已分析的简历做三段式匹配（岗位理解 → 逐条匹配矩阵 → 投递建议）。输入 jobOpportunityId。',
  inputSchema,
  progress: { start: '正在匹配岗位…', done: '岗位匹配完成' },
  execute: async (args, ctx) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }

    // 简历：取最近分析过的简历
    const resumes = listResumes();
    const analyzed = resumes.find((r) => r.analysisJson !== null);
    if (!analyzed || !analyzed.analysisJson) {
      return {
        ok: false,
        error: { code: 'RESUME_ANALYSIS_REQUIRED', message: '需要先导入并分析简历，才能进行岗位匹配' },
        jobOpportunityId: job.id,
        hint: '请先在对话中粘贴简历并分析，然后再进行匹配。',
      };
    }
    const resume = getResume(analyzed.id)!;
    let profileJson = '{}';
    try { profileJson = resume.analysisJson ? (JSON.parse(resume.analysisJson) as { profile?: unknown }).profile ? JSON.stringify((JSON.parse(resume.analysisJson) as { profile: unknown }).profile) : '{}' : '{}'; } catch { profileJson = '{}'; }

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildJobMatchSystemPrompt(),
      userPrompt: buildJobMatchUserPrompt(job.jdText, resume.name, resume.sourceText, profileJson),
      schema: jobMatchResultSchemaV1,
      task: 'job-match',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        jobOpportunityId: job.id,
        hint: '匹配失败。可重试一次；若持续失败，检查模型配置或缩短 JD 文本。',
      };
    }

    const data = result.data;
    // 业务规则校验：requirementId 必须存在于 understanding.requirements（跨字段一致性）
    const validIds = new Set(data.understanding.requirements.map((r) => r.id));
    for (const fit of data.fitResults) {
      if (!validIds.has(fit.requirementId)) {
        return { ok: false, error: { code: 'JOB_MATCH_CONSISTENCY_FAILED', message: '匹配结果引用不存在的要求编号' }, jobOpportunityId: job.id, hint: '匹配结果内部不一致，请重试。' };
      }
    }

    updateJobMatch(job.id, {
      company: data.understanding.company,
      title: data.understanding.title,
      fitResultJson: JSON.stringify(data),
    });

    return {
      ok: true,
      jobOpportunityId: job.id,
      overallScore: data.overallScore,
      summary: {
        requirementsCount: data.understanding.requirements.length,
        risksCount: data.risks.length,
        mustFixCount: data.advice.mustFix.length,
      },
      hint: '完整匹配结果已保存，可直接在界面中查看岗位详情。',
    };
  },
});
```
> profileJson 的提取逻辑较绕——若实现时可简化为一次 JSON.parse 后取 profile 字段，保持语义（提取简历画像供参考）即可。

- [ ] **Step 2: 接入 agent.ts**

Modify `src/agent/agent.ts`：import `matchJobTool`，`getTools()` 增加 `matchJob: matchJobTool`；SYSTEM_PROMPT 能力清单补一行 `- matchJob：岗位匹配（三段式：理解/匹配/建议）`。

- [ ] **Step 3: 验证与提交**

Run: `node_modules/.bin/tsc --noEmit` → 0 错误
```bash
git add src/agent && git commit -m "feat: matchJob 工具（三段式匹配 + 一致性校验 + 落库）"
```

### Task 5: /api/chat Agent 循环改造（自动续问）

**Files:**
- Modify: `app/api/chat/route.ts`

- [ ] **Step 1: 改造为 ToolLoopAgent**

Modify `app/api/chat/route.ts`：
1. import 变更：移除 `convertToModelMessages`；新增 `ToolLoopAgent, isStepCount, createAgentUIStream, createAgentUIStreamResponse`（保留 streamText 不再使用则移除；保留 readUIMessageStream/toUIMessageStream/tee 持久化逻辑）
2. execute 内改造：
```ts
const agent = new ToolLoopAgent({
  model,
  system: SYSTEM_PROMPT,
  tools: getTools(),
  stopWhen: isStepCount(5),
});

const stream = createAgentUIStream({
  agent,
  uiMessages: trimmed,
  options: {
    onToolExecutionStart: ({ toolName }) => {
      const progressText =
        toolName === 'importResume' ? '正在读取简历…'
        : toolName === 'analyzeResume' ? '正在分析简历…'
        : toolName === 'importJobOpportunity' ? '正在保存岗位信息…'
        : toolName === 'matchJob' ? '正在匹配岗位…' : '正在处理…';
      writer.write({ type: 'data-tool-progress', data: { toolName, status: 'running', message: progressText }, transient: true });
    },
    onToolExecutionEnd: ({ toolName, toolOutput }) => {
      const success = toolOutput.type === 'tool-result';
      writer.write({ type: 'data-tool-progress', data: { toolName, status: success ? 'completed' : 'failed', message: success ? '完成' : '失败' }, transient: true });
    },
  },
});

const uiStream = toUIMessageStream({ stream });
// tee + readUIMessageStream 收集持久化（沿用现有逻辑）
```
> 关键适配点（以实际类型为准最小修正）：
> - `createAgentUIStream` 的 `uiMessages` 参数类型若为 UIMessage[]，直接传 trimmed；`options` 为 AgentCallParameters——`onToolExecutionStart/End` 若不在其中，改为在 `new ToolLoopAgent({...})` 的 settings 中传（settings 含 LanguageModelCallOptions 的回调），或经 `onStepEnd` 内读取步骤工具信息推送进度（若两处都不支持，进度事件退化为仅发送"正在处理…"的单一事件，报告说明）
> - `ToolLoopAgent` 构造的 `system` 参数（settings 含 LanguageModelCallOptions 支持 system；若类型要求用 `instructions` 则用 instructions）
> - `uiStream` 的类型与 tee 兼容性按实际类型处理
3. 持久化逻辑（tee + readUIMessageStream + 按 id 去重 + assistant 消息落库 + touchConversation）**保持不动**

- [ ] **Step 2: 类型检查**

Run: `node_modules/.bin/tsc --noEmit` → 0 错误。修正点记录在报告。

- [ ] **Step 3: 冒烟验证（无 key 或错误路径）**

Run: `npm run dev`（后台）
1. `curl -s -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" -d '{}'` → 400 INVALID_REQUEST
2. 最小有效请求（无 key 时）→ SSE 流含错误事件，服务不崩溃
停止 dev。
> 完整多步链路在 Task 7 端到端验证（有 key）。

- [ ] **Step 4: 提交**

```bash
git add app/api/chat && git commit -m "feat: /api/chat 改造为 ToolLoopAgent 自动多步循环"
```

### Task 6: 前端岗位列表与状态徽标

**Files:**
- Create: `src/lib/use-job-opportunities.ts`
- Modify: `src/components/sidebar/resource-tabs.tsx`
- Create: `src/components/ui/status-badge.tsx`

- [ ] **Step 1: 岗位列表 hook**

Create `src/lib/use-job-opportunities.ts`：
```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

export type JobOpportunitySummary = {
  id: string; company: string; title: string; status: string; matched: boolean;
  createdAt: string; updatedAt: string;
};

export function useJobOpportunities() {
  const [jobs, setJobs] = useState<JobOpportunitySummary[]>([]);
  const refresh = useCallback(async () => {
    setJobs(await apiGet<JobOpportunitySummary[]>('/api/job-opportunities'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { jobs, refresh };
}
```

- [ ] **Step 2: 状态徽标组件**

Create `src/components/ui/status-badge.tsx`：
```tsx
import { cn } from '@/src/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  saved: 'bg-slate-100 text-slate-600',
  matched: 'bg-indigo-500/10 text-indigo-700',
  applying: 'bg-amber-500/10 text-amber-700',
  applied: 'bg-emerald-500/10 text-emerald-700',
  skipped: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  saved: '已保存', matched: '已匹配', applying: '投递中', applied: '已投递', skipped: '已跳过',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-600')}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
```

- [ ] **Step 3: 资源库岗位 Tab 激活**

Modify `src/components/sidebar/resource-tabs.tsx`：
1. 引入 `useJobOpportunities` 与 `StatusBadge`；props 增加 `onOpenJob: (id: string) => void`
2. 增加子 Tab 切换状态（useState：`'resume' | 'job'`，默认 'resume'）；"岗位"标签可点击
3. 岗位列表渲染（与简历列表同构）：名称 = `company ? \`${company} · ${title}\` : '未命名岗位'`，副行 = StatusBadge + 更新时间；空状态"暂无岗位，可在对话中粘贴 JD 导入"
4. "专属简历"标签保持禁用样式（第 3 期）

- [ ] **Step 4: 验证与提交**

Run: `npm run build` → 通过
```bash
git add src && git commit -m "feat: 岗位资源列表与状态徽标"
```

### Task 7: 匹配结果展示（对话卡片 + 详情抽屉）

**Files:**
- Create: `src/lib/use-job-detail.ts`
- Create: `src/components/artifacts/job-drawer.tsx`
- Modify: `src/components/sidebar/resource-tabs.tsx`（onOpenJob 接线）
- Modify: `app/page.tsx`（JobDrawer 接入）

- [ ] **Step 1: 岗位详情 hook**

Create `src/lib/use-job-detail.ts`：
```ts
'use client';
import { useEffect, useState } from 'react';
import { apiGet } from './api';

export type JobDetail = {
  id: string; company: string; title: string; jdText: string; url: string | null;
  status: string;
  fitResult: {
    schemaVersion: number; overallScore: number;
    understanding: { company: string; title: string; requirements: Array<{ id: string; text: string; type: string }>; city: string | null; level: string | null; tags: string[] };
    fitResults: Array<{ requirementId: string; level: 'highly-matched' | 'matched' | 'partial' | 'mismatch'; evidence: string; note: string }>;
    risks: Array<{ point: string; evidence?: string }>;
    advice: { mustFix: string[]; resumeAdjustments: string[]; talkingPoints: string[]; truthBoundary: string };
  } | null;
  createdAt: string; updatedAt: string;
};

export function useJobDetail(id: string | null) {
  const [detail, setDetail] = useState<JobDetail | null>(null);
  useEffect(() => {
    setDetail(null);
    if (!id) return;
    void apiGet<JobDetail>(`/api/job-opportunities/${id}`).then(setDetail).catch(() => setDetail(null));
  }, [id]);
  return { detail };
}
```

- [ ] **Step 2: 岗位/匹配详情抽屉**

Create `src/components/artifacts/job-drawer.tsx`：
```tsx
'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { MarkdownText } from '@/src/components/chat/markdown-text';
import { cn } from '@/src/lib/utils';
import { useJobDetail } from '@/src/lib/use-job-detail';

const LEVEL_LABELS: Record<string, string> = {
  'highly-matched': '高度匹配', matched: '匹配', partial: '部分匹配', mismatch: '不匹配',
};
const LEVEL_STYLES: Record<string, string> = {
  'highly-matched': 'bg-emerald-500/10 text-emerald-700',
  matched: 'bg-indigo-500/10 text-indigo-700',
  partial: 'bg-amber-500/10 text-amber-700',
  mismatch: 'bg-red-500/10 text-red-700',
};

export function JobDrawer({ jobId, open, onOpenChange }: {
  jobId: string | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { detail } = useJobDetail(open ? jobId : null);
  const fit = detail?.fitResult ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {detail ? (detail.company ? `${detail.company} · ${detail.title}` : '未命名岗位') : '岗位详情'}
          </SheetTitle>
          {detail && <div><StatusBadge status={detail.status} /></div>}
        </SheetHeader>
        {!detail && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail && !fit && (
          <p className="mt-4 text-sm text-muted-foreground">尚未匹配，可在对话中让 Agent 匹配这份岗位。</p>
        )}
        {detail && fit && (
          <div className="mt-4 space-y-5 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold">{fit.overallScore}</span>
              <span className="text-muted-foreground">/ 100 匹配评分</span>
            </div>

            <div>
              <p className="mb-2 font-medium">岗位理解</p>
              {fit.understanding.city && <p className="mb-1 text-muted-foreground">城市：{fit.understanding.city}</p>}
              {fit.understanding.level && <p className="mb-1 text-muted-foreground">职级：{fit.understanding.level}</p>}
              <ul className="space-y-1">
                {fit.understanding.requirements.map((r) => (
                  <li key={r.id} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-muted-foreground">{r.id}</span>
                    <span>{r.text}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="mb-2 font-medium">逐条匹配</p>
              <ul className="space-y-2">
                {fit.fitResults.map((f) => (
                  <li key={f.requirementId} className="rounded-2xl bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{f.requirementId} · {f.note}</span>
                      <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', LEVEL_STYLES[f.level])}>
                        {LEVEL_LABELS[f.level]}
                      </span>
                    </div>
                    <p className="mt-1 text-muted-foreground">证据：{f.evidence}</p>
                  </li>
                ))}
              </ul>
            </div>

            {fit.risks.length > 0 && (
              <div>
                <p className="mb-1 font-medium">风险</p>
                <ul className="list-disc space-y-1 pl-4">
                  {fit.risks.map((r, i) => <li key={i}>{r.point}</li>)}
                </ul>
              </div>
            )}

            <div>
              <p className="mb-1 font-medium">投递建议</p>
              <div className="space-y-2">
                <div>
                  <p className="text-muted-foreground">必备修改</p>
                  <ul className="list-disc space-y-1 pl-4">{fit.advice.mustFix.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
                <div>
                  <p className="text-muted-foreground">简历调整</p>
                  <ul className="list-disc space-y-1 pl-4">{fit.advice.resumeAdjustments.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
                <div>
                  <p className="text-muted-foreground">谈话要点</p>
                  <ul className="list-disc space-y-1 pl-4">{fit.advice.talkingPoints.map((m, i) => <li key={i}>{m}</li>)}</ul>
                </div>
                <div className="rounded-2xl bg-amber-500/5 p-3 text-muted-foreground">
                  <MarkdownText text={fit.advice.truthBoundary} />
                </div>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [ ] **Step 3: 接线**

Modify `app/page.tsx`：新增 `const [drawerJobId, setDrawerJobId] = useState<string | null>(null);`；Sidebar 的 `onOpenJob={setDrawerJobId}`（Sidebar/ResourceTabs 相应透传）；渲染 `<JobDrawer jobId={drawerJobId} open={drawerJobId !== null} onOpenChange={(open) => { if (!open) setDrawerJobId(null); }} />`。

- [ ] **Step 4: 验证与提交**

Run: `npm run build` → 通过
```bash
git add app src && git commit -m "feat: 岗位匹配结果展示（列表/状态徽标/三段式抽屉）"
```

### Task 8: 端到端验证与验收归档

**Files:**
- Modify: `docs/plans/2026-08-05-phase2-job-match.md`（本计划，归档）

- [ ] **Step 1: 回归**

Run: `npm test && npm run build`
Expected: 6 单测全绿；构建通过。

- [ ] **Step 2: 端到端验证（真实 LLM，需 .env.local key）**

Run: `npm run dev`（后台，轮询就绪）。
**验收场景 1（自动多步闭环）**——一条消息完成"导入岗位并匹配"：
```bash
cat > /tmp/jh2-payload.json <<'EOF'
{"messages":[{"id":"p2-1","role":"user","parts":[{"type":"text","text":"帮我匹配这个岗位：\n\n高级前端工程师（杭州）\n职责：负责公司核心业务前端开发，要求：\n1. 5 年以上前端开发经验\n2. 精通 TypeScript 和 React\n3. 熟悉 Node.js\n4. 有大型项目架构经验"}]}]}
EOF
curl -s -N -X POST http://localhost:3000/api/chat -H "Content-Type: application/json" --data-binary @/tmp/jh2-payload.json -o /tmp/jh2-stream.txt -w "HTTP %{http_code}\n" --max-time 300
```
预期：
- HTTP 200；SSE 流中**连续出现多个工具事件**：importResume（若对话无简历则模型可能先问/或自动导入？——注意：若用户库中已有分析过的简历（第 1 期验证数据），模型应直接 importJobOpportunity → matchJob；若无数，模型应引导。验收时以库中现有简历为准，记录实际工具序列）
- 至少出现 importJobOpportunity 与 matchJob 的 `data-tool-progress`（running/completed）
- 流中含 `overallScore` 与 assistant 总结文本
> 提示：若模型未自动调用工具链（如直接文字回答），重试并调整提示词更明确（如"请导入岗位并立即匹配，简历已存在"）。记录实际行为与工具序列。
**验收场景 2（失败路径）**：删除全部简历后发送同一请求 → matchJob 应返回 RESUME_ANALYSIS_REQUIRED 且模型引导（或用不存在的 jobOpportunityId 验证错误路径）。验证后恢复数据。

- [ ] **Step 3: 数据库与端点验证**

```bash
node_modules/.bin/tsx -e "import { db } from './src/db'; import { sql } from 'drizzle-orm'; const j = db.all(sql\`select id, company, title, status, fit_result_json is not null as fitted from job_opportunities order by created_at desc limit 1\`)[0]; console.log(JSON.stringify(j));"
```
预期：最近一条岗位 status='matched'、fitted=1、company/title 已回填。
`curl -s http://localhost:3000/api/job-opportunities | head -c 300` → 列表含该岗位。
停止 dev（taskkill 端口 3000）；清理临时文件。

- [ ] **Step 4: 计划归档**

- 本文件头部 `状态：生效` → `状态：完成`；全部 `- [ ]` 打勾
```bash
git add -A && git commit -m "docs: 第 2 期计划完成归档"
```

---

## 自审记录

**规格覆盖**：设计文档第 2 节工具契约→Task 2/3/4；第 3 节 Agent 循环→Task 5；第 4 节前端→Task 6/7；第 5 节数据与 API→Task 1；第 6 节验收→Task 8。经验 #3（枚举归一化）与 3.1（契约内嵌 prompt）在契约/prompt 中落实；跨字段一致性校验在 Task 4 落实。

**占位符**：无 TBD；"以实际类型为准最小修正"是 experimental API 的等价适配说明（类型已调研）。

**类型一致性**：`updateJobMatch`/`createJobOpportunity` 仓储签名 Task 1 定义、Task 4 调用一致；`JobMatchResultV1` 契约 Task 3 定义、Task 4 落库与 Task 7 前端类型引用一致（字段名：understanding/fitResults/overallScore/risks/advice）；状态枚举（saved/matched/applying/applied/skipped）与数据库 schema 及 StatusBadge 一致。
