# 第 6 期：面试准备实施计划（prepareInterview + 面试准备包 + Markdown 导出）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-09 · 状态：完成 · 目标：新增 prepareInterview LLM 工具（基于匹配结果+简历生成完整面试准备包）+ interview_prep_json 列（一次迁移）+ 岗位抽屉「面试准备」区块 + Markdown 导出（纯函数+原生下载）· 关联规范：AGENTS.md、plan-document.md、`.agents/specs/02-backend/api-data-conventions.md`、`.agents/specs/03-agent/agent-tooling-conventions.md`

**Goal:** 让 Agent 在对话中为已匹配岗位生成完整面试准备包（背景要点 / 自我介绍话术 / 预测问题含应答与证据 / 向面试官提问清单），落库挂靠岗位，抽屉查看，可导出 Markdown。

**Architecture:** 沿用现有 LLM 生成类工具模式（analyzeResume/matchJob：createDomainTool + ctx.callStructured + zod 契约 + repair + 落库）；`job_opportunities` 加一列 `interview_prep_json`（一次迁移），一岗一份覆盖式；前端岗位抽屉加「面试准备」区块，导出拼装抽纯函数 `toInterviewPrepMarkdown`（`src/lib/`，可单测）+ 浏览器原生 Blob 下载。

**Tech Stack:** AI SDK v7（createDomainTool + callStructured，复用现有）、zod、Drizzle（一次迁移 0001）、React/shadcn（抽屉 + 现有下载按钮模式）。

**设计依据：** `docs/designs/2026-08-09-phase6-interview-prep-design.md`
**验收标准：** 设计文档第 8 节。

**已确认的代码事实**：
- 工具模式（LLM 生成类）：`createDomainTool({name, description, inputSchema, progress:{start,done}, execute})`；`execute(args, ctx)` 内 `ctx.callStructured({model, systemPrompt, userPrompt, schema, task})` → `{ok:true,data}|{ok:false,error:{code,message}}`（对齐 `src/agent/tools/analyze-resume.ts` / `match-job.ts`）；`getModel()` 取自 `src/agent/model.ts`
- 契约文件：`src/agent/schemas/<name>.ts` 输出契约内嵌 `schemaVersion: z.literal(1)` + `export type <Name>V1 = z.infer<...>`；输出契约完整示例必须写进 system prompt（find-work 第 1 期经验：deepseek 等 provider 不支持 structuredOutputs 时 zod schema 不进提示词）
- prompt 文件：`src/agent/prompts/<name>.ts` 导出 `build<Name>SystemPrompt()` / `build<Name>UserPrompt(...)`（对齐 job-match.ts）
- 仓储：`src/db/repositories/job-opportunities.ts`（Record 类型 + nowIso 来自 shared.ts）；`getJobOpportunity(id)` 取行，`updateJobMatch` 为 JSON 列写入先例
- 迁移：`src/db/migrations/` 现状 `0000_sweet_multiple_man.sql` + `meta/_journal.json`（idx 0）；drizzle-kit generate 后新增 `0001_<name>.sql` + journal idx 1
- 详情端点：`app/api/job-opportunities/[id]/route.ts` GET 对 `fitResultJson`/`channelsJson` 用 try/catch 宽容解析降级 null，返回体需补 `interviewPrep`
- 前端详情 hook：`src/lib/use-job-detail.ts` 的 `JobDetail` 类型加字段，`useJobDetail` 逻辑零改动（apiGet 直接透传）
- 抽屉：`src/components/artifacts/job-drawer.tsx`；区块分隔用 `Separator`；投递状态引导文案已含 interview 行（"可对助手说：记录面试结果（offer/拒绝）"），append 第二行不覆盖
- 进度文案：`app/api/chat/route.ts` `onToolExecutionStart` 按 toolName 写死三元链，追加 `prepareInterview` 分支
- 工具注册：`src/agent/agent.ts` getTools() + SYSTEM_PROMPT 能力清单与原则区
- 纯函数先例：`src/lib/format-time.ts` + `format-time.test.ts`（vitest）；`npm run test` 跑全部
- 测试命令：`npm run test`；类型检查 `npx tsc --noEmit`；构建 `npm run build`
- 规范现状：03-agent 文件组织清单已列 LLM 工具四枚（analyze-resume/match-job/discover-channels/tailored-resume），02-backend JSON 列已列 analysisJson/fitResultJson/channelsJson，均需追加 prepareInterview / interview_prep_json

---

### Task 1: 设计文档（已完成）

- [x] **Step 1: 设计文档**

Create `docs/designs/2026-08-09-phase6-interview-prep-design.md`（已创建：范围与决策、工具契约、数据模型、前端展示、工具注册、规范同步、边界、验收；4.1 节含导出技术选型理由）。

- [x] **Step 2: 计划文档**

Create `docs/plans/2026-08-09-phase6-interview-prep.md`（本文件）。

---

### Task 2: 规范同步（先改规范再改代码）

**Files:**
- Modify: `.agents/specs/02-backend/api-data-conventions.md`（JSON 列）
- Modify: `.agents/specs/03-agent/agent-tooling-conventions.md`（LLM 工具清单）

- [x] **Step 1: 02-backend JSON 列补 interview_prep_json**

在 `.agents/specs/02-backend/api-data-conventions.md` 的 `## JSON 列` 节（第 34 行）修改：

```markdown
- LLM 产物（`analysisJson`/`fitResultJson`/`channelsJson`/`interviewPrepJson`）以 JSON 字符串落库
```

- [x] **Step 2: 03-agent LLM 工具清单补 prepareInterview**

在 `.agents/specs/03-agent/agent-tooling-conventions.md` 的 `## 文件组织` 节（第 15 行）修改 LLM 工具清单：

```markdown
- **LLM 工具**（需调模型产出结构化结果：analyze-resume / match-job / discover-channels / tailored-resume / prepare-interview）三文件：`tools/<name>.ts`（薄壳：校验 + 业务规则 + 落库）、`prompts/<name>.ts`（提示词）、`schemas/<name>.ts`（zod 契约，输入 + 输出同文件）
```

- [x] **Step 3: 提交**

```bash
git add .agents/specs/02-backend/api-data-conventions.md .agents/specs/03-agent/agent-tooling-conventions.md
git commit -m "docs: 规范同步面试准备（02-backend interviewPrepJson + 03-agent prepareInterview 工具清单）"
```

---

### Task 3: interview_prep_json 列（schema + 迁移 + 仓储 + 详情端点）

**Files:**
- Modify: `src/db/schema.ts`（jobOpportunities 表）
- Modify: `src/db/repositories/job-opportunities.ts`（Record 类型 + 两函数）
- Modify: `app/api/job-opportunities/[id]/route.ts`（GET 返回体）
- Modify: `src/lib/use-job-detail.ts`（JobDetail 类型）

- [x] **Step 1: schema 加列**

在 `src/db/schema.ts` 的 `jobOpportunities` 表定义（第 36 行 `channelsJson` 之后）追加：

```ts
  interviewPrepJson: text('interview_prep_json'),
```

- [x] **Step 2: 生成迁移**

Run: `npx drizzle-kit generate --name add-interview-prep-json`
Expected: 新建 `src/db/migrations/0001_<hash>.sql`（内容为 `ALTER TABLE \`job_opportunities\` ADD \`interview_prep_json\` text;`），`meta/_journal.json` 新增 idx 1 条目

- [x] **Step 3: 仓储 Record 类型加字段**

在 `src/db/repositories/job-opportunities.ts` 的 `JobOpportunityRecord` 类型（第 9 行）追加：

```ts
  interviewPrepJson: string | null;
```

- [x] **Step 4: 仓储 createJobOpportunity 初始值**

`createJobOpportunity`（第 16 行）的 record 对象补 `interviewPrepJson: null`：

```ts
    status: 'saved', fitResultJson: null, channelsJson: null, interviewPrepJson: null,
```

- [x] **Step 5: 仓储新增 getInterviewPrep / setInterviewPrep**

在 `src/db/repositories/job-opportunities.ts` 文件末尾追加：

```ts
export function getInterviewPrep(id: string): string | null {
  const row = db.select({ interviewPrepJson: jobOpportunities.interviewPrepJson })
    .from(jobOpportunities).where(eq(jobOpportunities.id, id)).get();
  return row?.interviewPrepJson ?? null;
}

export function setInterviewPrep(id: string, interviewPrepJson: string): void {
  db.update(jobOpportunities)
    .set({ interviewPrepJson, updatedAt: nowIso() })
    .where(eq(jobOpportunities.id, id)).run();
}
```

> 注：选型用 `getJobOpportunity(id).interviewPrepJson` 更省函数，但单独取值避免整行投影，且 `getInterviewPrep` 提供给前端详情端点直接复用。

- [x] **Step 6: 详情端点返回 interviewPrep**

在 `app/api/job-opportunities/[id]/route.ts` 中，`channels` 解析（第 14 行）之后追加宽容解析，并在返回体（第 24 行）追加字段：

```ts
  let interviewPrep = null;
  if (record.interviewPrepJson) {
    try { interviewPrep = JSON.parse(record.interviewPrepJson); } catch { interviewPrep = null; }
  }
```

```ts
    fitResult,
    channels,
    interviewPrep,
```

- [x] **Step 7: 前端 JobDetail 类型加字段**

在 `src/lib/use-job-detail.ts` 的 `JobDetail` 类型（第 22 行 `channels` 之后、`createdAt` 之前）追加：

```ts
  interviewPrep: {
    schemaVersion: number; companyBrief: string; selfIntro: string;
    questions: Array<{ id: string; question: string; intent: string; answerPoints: string[]; evidence: string | null; risk: string | null }>;
    askThem: string[];
  } | null;
```

- [x] **Step 8: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [x] **Step 9: 提交**

```bash
git add src/db/schema.ts src/db/migrations src/db/repositories/job-opportunities.ts app/api/job-opportunities/[id]/route.ts src/lib/use-job-detail.ts
git commit -m "feat: 岗位 interview_prep_json 列（迁移+仓储+详情端点+前端类型）"
```

---

### Task 4: 输出契约 interview-prep schema

**Files:**
- Create: `src/agent/schemas/interview-prep.ts`

- [x] **Step 1: 新建契约文件**

Create `src/agent/schemas/interview-prep.ts`（输出契约内嵌 schemaVersion，字段对齐设计第 2 节；`id` 用 `q\d+` 正则对齐 matchJob 的 r\d+ 模式）：

```ts
import { z } from 'zod';

/** 面试准备包契约 v1（产物内嵌 schemaVersion，读取按版本宽容解析） */
export const interviewPrepSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  companyBrief: z.string().describe('公司/岗位背景要点（面试前必读，基于 JD 与简历原文）'),
  selfIntro: z.string().describe('自我介绍话术（约 1 分钟，基于简历原文，不虚构）'),
  questions: z.array(z.object({
    id: z.string().regex(/^q\d+$/).describe('问题编号，稳定 id：q1、q2…'),
    question: z.string().describe('预测的面试问题'),
    intent: z.string().describe('考察意图（该问题在考察什么）'),
    answerPoints: z.array(z.string()).min(1).max(6).describe('应答思路要点（STAR 结构）'),
    evidence: z.string().nullable().describe('简历原文证据引用；无支撑时为 null'),
    risk: z.string().nullable().describe('证据薄弱时的风险提示 + 建议；无风险时为 null'),
  })).min(1).max(8),
  askThem: z.array(z.string()).max(8).describe('向面试官提问清单（面试尾段用，基于岗位/公司）'),
});

export type InterviewPrepV1 = z.infer<typeof interviewPrepSchemaV1>;
```

- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [x] **Step 3: 提交**

```bash
git add src/agent/schemas/interview-prep.ts
git commit -m "feat: 面试准备包输出契约 v1（interviewPrepSchemaV1）"
```

---

### Task 5: 面试准备提示词

**Files:**
- Create: `src/agent/prompts/interview-prep.ts`

- [x] **Step 1: 新建 prompt 文件**

Create `src/agent/prompts/interview-prep.ts`（system prompt 内嵌输出契约完整示例，对齐 find-work 第 1 期经验；user prompt 接收匹配结果 + 简历，不接收完整 JD 文本，对齐设计"匹配结果作为输入"）：

```ts
export function buildInterviewPrepSystemPrompt(): string {
  return `你是一名资深求职面试辅导专家。请基于岗位匹配结果与候选人简历原文，为候选人准备一场面试，按下面的 JSON 输出契约产出结构化准备包（只输出 JSON，不要输出其他文字或 markdown 代码块）。

输出契约（字段名与枚举值必须完全一致，不得增删改）：
{
  "schemaVersion": 1,
  "companyBrief": "公司/岗位背景要点（面试前必读，基于 JD 与简历原文，不得编造公司事实）",
  "selfIntro": "自我介绍话术（约 1 分钟，需口语化、突出匹配点，基于简历原文，不得虚构经历）",
  "questions": [
    {
      "id": "q1",
      "question": "预测的面试问题",
      "intent": "该问题在考察什么（如：技术深度/项目经验/沟通表达/求职动机）",
      "answerPoints": ["应答思路要点 1", "应答思路要点 2"],
      "evidence": "简历原文证据引用（绑定原文片段，无支撑时为 null）",
      "risk": "简历证据薄弱时的风险提示与建议；无风险时为 null"
    }
  ],
  "askThem": ["向面试官提问清单项 1", "向面试官提问清单项 2"]
}

要求：
1. questions 优先覆盖岗位匹配结果中标记为 highly-matched / partial / mismatch 的能力点与风险点，逐条引用简历原文作为 evidence。
2. 每条 question 都要给出 intent（考察意图）与 answerPoints（STAR 结构应答要点）；简历中无对应证据支撑的问题，evidence 置 null，并在 risk 中提示"简历缺此证据，需如实准备或补证"，严禁编造经历。
3. selfIntro 必须口语化、约 1 分钟、突出岗位匹配点，全部基于简历原文，不虚构、不夸大。
4. companyBrief 只基于 JD 文本中已出现的信息与常识性岗位理解，不编造公司具体数据或细节。
5. askThem 给出对候选人真正有用的向面试官提问清单（基于岗位与公司背景）。
6. 严格按上述契约的 JSON 结构输出，字段名与枚举值不得更改。`;
}

export function buildInterviewPrepUserPrompt(
  jobCompany: string,
  jobTitle: string,
  fitResultJson: string,
  resumeName: string,
  resumeText: string,
): string {
  return `公司：${jobCompany}
职位：${jobTitle}

岗位匹配结果（引用其中的逐条匹配 level、风险与投递建议来预测问题）：
${fitResultJson}

候选人简历名称：${resumeName}
简历原文：
${resumeText}`;
}
```

- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [x] **Step 3: 提交**

```bash
git add src/agent/prompts/interview-prep.ts
git commit -m "feat: 面试准备提示词（准备包契约示例内嵌 + 匹配结果/简历输入）"
```

---

### Task 6: prepareInterview 工具

**Files:**
- Create: `src/agent/tools/prepare-interview.ts`

- [x] **Step 1: 新建工具文件**

Create `src/agent/tools/prepare-interview.ts`（对齐 `src/agent/tools/match-job.ts` 的 JOB_MATCH_REQUIRED 前置校验 + analyzeResume 的重复覆盖提示）：

```ts
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getJobOpportunity, setInterviewPrep, getInterviewPrep } from '../../db/repositories/job-opportunities';
import { listResumes } from '../../db/repositories/resumes';
import { interviewPrepSchemaV1 } from '../schemas/interview-prep';
import { buildInterviewPrepSystemPrompt, buildInterviewPrepUserPrompt } from '../prompts/interview-prep';

const inputSchema = z.object({
  jobOpportunityId: z.string().min(1).describe('岗位 ID（须已匹配）'),
});

export const prepareInterviewTool = createDomainTool({
  name: 'prepareInterview',
  description: '面试准备：基于岗位匹配结果与已分析简历生成完整面试准备包（公司/岗位背景要点、自我介绍话术、预测面试问题含考察意图/STAR 应答要点/简历证据引用/风险提示、向面试官提问清单）。输入 jobOpportunityId，须已匹配。',
  inputSchema,
  progress: { start: '正在准备面试…', done: '面试准备完成' },
  execute: async (args, ctx) => {
    const job = getJobOpportunity(args.jobOpportunityId);
    if (!job) {
      throw new Error('岗位不存在，请先调用 importJobOpportunity 导入');
    }
    if (!job.fitResultJson) {
      return {
        ok: false,
        error: { code: 'JOB_MATCH_REQUIRED', message: '该岗位尚未完成匹配，无法准备面试' },
        jobOpportunityId: job.id,
        hint: '请先调用 matchJob 完成岗位匹配，再进行面试准备。',
      };
    }
    const resumes = listResumes();
    const analyzed = resumes.find((r) => r.analysisJson !== null);
    if (!analyzed || !analyzed.analysisJson) {
      return {
        ok: false,
        error: { code: 'RESUME_ANALYSIS_REQUIRED', message: '需要先导入并分析简历，才能准备面试' },
        jobOpportunityId: job.id,
        hint: '请先在对话中粘贴简历并分析，然后再进行面试准备。',
      };
    }

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildInterviewPrepSystemPrompt(),
      userPrompt: buildInterviewPrepUserPrompt(job.company, job.title, job.fitResultJson, analyzed.name, analyzed.sourceText),
      schema: interviewPrepSchemaV1,
      task: 'interview-prep',
    });

    if (!result.ok) {
      return {
        ok: false,
        error: result.error,
        jobOpportunityId: job.id,
        hint: '面试准备失败。可重试一次；若持续失败，检查模型配置或缩短 JD 文本。',
      };
    }

    const data = result.data;
    const hasExisting = getInterviewPrep(job.id) !== null;
    setInterviewPrep(job.id, JSON.stringify(data));

    return {
      ok: true,
      jobOpportunityId: job.id,
      summary: {
        questionsCount: data.questions.length,
        hasRisk: data.questions.some((q) => q.risk !== null),
        askThemCount: data.askThem.length,
      },
      hint: hasExisting
        ? '面试准备包已重新生成并覆盖旧版本，完整内容可在岗位详情中查看，支持导出 Markdown。'
        : '面试准备包已生成，完整内容可在岗位详情中查看，支持导出 Markdown。',
    };
  },
});
```

- [x] **Step 2: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [x] **Step 3: 提交**

```bash
git add src/agent/tools/prepare-interview.ts
git commit -m "feat: prepareInterview 面试准备工具（匹配前置校验 + 生成落库 + 覆盖提示）"
```

---

### Task 7: 注册工具 + 进度文案

**Files:**
- Modify: `src/agent/agent.ts`
- Modify: `app/api/chat/route.ts`

- [x] **Step 1: agent.ts import**

在 `src/agent/agent.ts` 第 10 行 `recordApplicationStatusTool` import 之后追加：

```ts
import { prepareInterviewTool } from './tools/prepare-interview';
```

- [x] **Step 2: agent.ts 能力清单**

在 SYSTEM_PROMPT 能力清单（第 30 行 `recordApplicationStatus` 行之后）追加：

```
- prepareInterview：面试准备（基于岗位匹配结果与简历生成完整准备包：背景要点/自我介绍话术/预测面试问题含应答与证据/向面试官提问清单）
```

- [x] **Step 3: agent.ts 原则区**

在 SYSTEM_PROMPT 原则区（`recordApplicationStatus` 相关原则之后）追加：

```
- 用户提出准备面试、面试这家公司、帮我准备问题等意图时，若岗位已匹配（status 含 matched/applying/applied/interview/offer/hired），直接调用 prepareInterview；未匹配则先 matchJob 再准备。
```

- [x] **Step 4: agent.ts getTools**

在 `getTools()`（第 55 行 `recordApplicationStatus` 之后）追加：

```ts
    prepareInterview: prepareInterviewTool,
```

- [x] **Step 5: route.ts 进度文案**

在 `app/api/chat/route.ts` 的 `onToolExecutionStart` 三元链（第 106 行 `recordApplicationStatus` 分支之后）追加：

```ts
            : toolName === 'prepareInterview' ? '正在准备面试…'
```

- [x] **Step 6: 类型检查**

Run: `npx tsc --noEmit`
Expected: 无错误

- [x] **Step 7: 提交**

```bash
git add src/agent/agent.ts app/api/chat/route.ts
git commit -m "feat: prepareInterview 注册进 agent（能力清单/原则/getTools）+ 进度文案"
```

---

### Task 8: toInterviewPrepMarkdown 纯函数（TDD）

**Files:**
- Create: `src/lib/interview-prep-md.ts`
- Create: `src/lib/interview-prep-md.test.ts`

- [x] **Step 1: 写失败测试**

Create `src/lib/interview-prep-md.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { toInterviewPrepMarkdown } from './interview-prep-md';

const sample = {
  schemaVersion: 1,
  companyBrief: '云雀科技 · 高级前端工程师：负责 React 应用架构与性能优化。',
  selfIntro: '你好，我是张三，5 年前端经验，主要使用 React 与 TypeScript。',
  questions: [
    {
      id: 'q1', question: '讲一下你最复杂的前端项目',
      intent: '考察技术深度与项目经验',
      answerPoints: ['按 STAR 描述项目背景与难点', '突出架构设计与性能优化'],
      evidence: '简历项目经历：自研组件库支撑 3 个业务线',
      risk: null,
    },
    {
      id: 'q2', question: '你如何处理项目延期',
      intent: '考察沟通与项目管理',
      answerPoints: ['先说评估与拆解', '再谈透明同步'],
      evidence: null,
      risk: '简历无项目延期处理经验，建议补充真实案例',
    },
  ],
  askThem: ['团队目前的技术栈演进方向？', '这个岗位的考核重点？'],
};

describe('interview-prep-md', () => {
  it('包含标题与背景要点节', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('# 面试准备');
    expect(md).toContain('## 公司与岗位背景');
    expect(md).toContain('云雀科技 · 高级前端工程师：负责 React 应用架构与性能优化。');
  });
  it('包含自我介绍节与话术', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('## 自我介绍');
    expect(md).toContain('你好，我是张三，5 年前端经验，主要使用 React 与 TypeScript。');
  });
  it('预测问题渲染考察意图与应答要点', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('### q1 讲一下你最复杂的前端项目');
    expect(md).toContain('考察意图：考察技术深度与项目经验');
    expect(md).toContain('- 按 STAR 描述项目背景与难点');
    expect(md).toContain('简历证据：简历项目经历：自研组件库支撑 3 个业务线');
  });
  it('无证据问题渲染风险提示', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('### q2 你如何处理项目延期');
    expect(md).toContain('风险提示：简历无项目延期处理经验，建议补充真实案例');
  });
  it('包含向面试官提问节', () => {
    const md = toInterviewPrepMarkdown(sample);
    expect(md).toContain('## 向面试官提问');
    expect(md).toContain('- 团队目前的技术栈演进方向？');
  });
});
```

- [x] **Step 2: 跑测试确认失败**

Run: `npm run test -- interview-prep-md`
Expected: FAIL（`Cannot find module './interview-prep-md'`）

- [x] **Step 3: 最小实现**

Create `src/lib/interview-prep-md.ts`（返回 Markdown 字符串；risk 为空时省略该行）：

```ts
export type InterviewPrepMdInput = {
  companyBrief: string;
  selfIntro: string;
  questions: Array<{ id: string; question: string; intent: string; answerPoints: string[]; evidence: string | null; risk: string | null }>;
  askThem: string[];
};

/** 面试准备包 → Markdown 文本（导出用；风险为空的问题省略风险行） */
export function toInterviewPrepMarkdown(prep: InterviewPrepMdInput): string {
  const lines: string[] = ['# 面试准备', ''];

  lines.push('## 公司与岗位背景', '', prep.companyBrief, '');

  lines.push('## 自我介绍', '', prep.selfIntro, '');

  lines.push('## 预测面试问题', '');
  for (const q of prep.questions) {
    lines.push(`### ${q.id} ${q.question}`, '');
    lines.push(`考察意图：${q.intent}`, '');
    lines.push('应答思路：');
    for (const p of q.answerPoints) lines.push(`- ${p}`);
    lines.push('');
    if (q.evidence) lines.push(`简历证据：${q.evidence}`, '');
    if (q.risk) lines.push(`风险提示：${q.risk}`, '');
  }

  lines.push('## 向面试官提问', '');
  for (const q of prep.askThem) lines.push(`- ${q}`);
  lines.push('');

  return lines.join('\n');
}
```

- [x] **Step 4: 跑测试确认通过**

Run: `npm run test -- interview-prep-md`
Expected: PASS（5 个用例全过）

- [x] **Step 5: 提交**

```bash
git add src/lib/interview-prep-md.ts src/lib/interview-prep-md.test.ts
git commit -m "feat: 面试准备包 Markdown 导出纯函数（toInterviewPrepMarkdown + 单测）"
```

---

### Task 9: 岗位抽屉「面试准备」区块 + 导出按钮

**Files:**
- Modify: `src/components/artifacts/job-drawer.tsx`

- [x] **Step 1: import 扩展**

在 `src/components/artifacts/job-drawer.tsx` 顶部追加 import（`Download` 图标 + 纯函数）：

```tsx
import { Download } from 'lucide-react';
import { toInterviewPrepMarkdown } from '@/src/lib/interview-prep-md';
```

> 注：现有 import 首行 `import { Briefcase, FilePen, Globe, Mail } from 'lucide-react';`，`Download` 追加进同一花括号即可。

- [x] **Step 2: 导出处理函数**

在 `JobDrawer` 组件函数体内（`const channels = ...` 之后）追加：

```tsx
  const handleExportPrep = () => {
    if (!detail?.interviewPrep) return;
    const md = toInterviewPrepMarkdown(detail.interviewPrep);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${detail.company || '岗位'}-${detail.title || '未知职位'}-面试准备.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
```

- [x] **Step 3: 面试准备区块**

在「专属简历」区块之后（`</div>` 收尾处，约第 236 行）追加新区块（未生成 → 引导文案；已生成 → 背景要点 / 自我介绍 / 预测问题 / 提问清单 + 导出按钮）：

```tsx
            <Separator />
            {/* 面试准备 */}
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-medium">面试准备</p>
                {detail.interviewPrep && (
                  <button
                    onClick={handleExportPrep}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                  >
                    <Download className="size-3.5" />
                    导出 Markdown
                  </button>
                )}
              </div>
              {!detail.interviewPrep && (
                <p className="text-muted-foreground">可在对话中让 Agent 准备面试</p>
              )}
              {detail.interviewPrep && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-50 p-3.5">
                    <p className="mb-1 text-xs font-medium text-slate-500">公司与岗位背景</p>
                    <p className="text-sm">{detail.interviewPrep.companyBrief}</p>
                  </div>
                  <div className="rounded-2xl bg-slate-50 p-3.5">
                    <p className="mb-1 text-xs font-medium text-slate-500">自我介绍</p>
                    <p className="text-sm">{detail.interviewPrep.selfIntro}</p>
                  </div>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">预测面试问题</p>
                    <ul className="space-y-2.5">
                      {detail.interviewPrep.questions.map((q) => (
                        <li key={q.id} className="rounded-2xl bg-slate-50 p-3.5">
                          <p className="font-medium">{q.id} · {q.question}</p>
                          <p className="mt-1 text-xs text-muted-foreground">考察意图：{q.intent}</p>
                          <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-sm">
                            {q.answerPoints.map((p, i) => <li key={i}>{p}</li>)}
                          </ul>
                          {q.evidence && (
                            <p className="mt-2 border-t border-slate-200/60 pt-2 text-xs italic leading-relaxed text-slate-500">
                              简历证据：{q.evidence}
                            </p>
                          )}
                          {q.risk && (
                            <p className="mt-1 text-xs text-amber-700">风险提示：{q.risk}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {detail.interviewPrep.askThem.length > 0 && (
                    <div>
                      <p className="mb-1.5 text-xs font-medium text-slate-500">向面试官提问</p>
                      <ul className="list-disc space-y-0.5 pl-5 text-sm">
                        {detail.interviewPrep.askThem.map((q, i) => <li key={i}>{q}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
```

- [x] **Step 4: 投递状态引导文案补面试准备提示**

在 `src/components/artifacts/job-drawer.tsx` 的投递状态区块（第 156 行 `interview` 行）追加一行（不覆盖现有行）：

```tsx
                {detail.status === 'interview' && <span className="text-xs text-muted-foreground">可对助手说：准备这家公司的面试</span>}
```

> 注：加在现有 `interview` 行之后，两行并存。若需为其他投递后状态提供入口，按同样模式追加，但本期仅加 interview。

- [x] **Step 5: 类型检查 + 构建**

Run: `npx tsc --noEmit && npm run build`
Expected: 无错误，build 通过

- [x] **Step 6: 提交**

```bash
git add src/components/artifacts/job-drawer.tsx
git commit -m "feat: 岗位抽屉面试准备区块（展示 + 导出 Markdown 按钮 + 引导文案）"
```

---

### Task 10: 端到端验证与归档

**Files:**
- Modify: `docs/plans/2026-08-09-phase6-interview-prep.md`（本文件，任务打勾）
- Modify: `docs/designs/2026-08-09-phase6-interview-prep-design.md`（状态 → 完成）

- [x] **Step 1: 单测与构建**

Run: `npm run test && npm run build`
Expected: 全部单测通过（含新增 interview-prep-md）+ build 通过

- [x] **Step 2: 端到端场景验证（dev 服务）**

Run: `npm run dev`，在对话中依次验证：

1. **生成准备包**：导入并分析简历 → 导入岗位 → matchJob → 对话说"帮我准备这家公司的面试" → prepareInterview 生成 → 抽屉「面试准备」区块展示背景要点/自介话术/预测问题（含考察意图/应答要点/证据引用）/提问清单；岗位详情接口返回 `interviewPrep`
2. **导出 Markdown**：抽屉点「导出 Markdown」→ 下载 `<公司>-<职位>-面试准备.md`，内容完整可读（标题/各节/问题清单）
3. **JOB_MATCH_REQUIRED**：对未匹配岗位说"准备面试" → 返回明确错误 + 引导先 matchJob
4. **重复生成覆盖**：再次说"重新准备" → 工具提示"已重新生成并覆盖旧版本"，抽屉内容更新
5. **引导文案**：岗位状态推进到 interview 后，抽屉投递状态区块显示"可对助手说：准备这家公司的面试"

Expected: 5 项全部符合预期；刷新后数据持久（SQLite 落库）；对话落库后抽屉自动刷新（refreshSignal 机制，无需手动刷新）

- [x] **Step 3: 计划与设计文档状态更新**

- 计划头部元信息 `状态：草稿` → `状态：完成`；本文件所有任务打勾 `[x]`
- 设计文档头部 `状态：草稿` → `状态：完成`

- [x] **Step 4: 提交**

```bash
git add docs/plans/2026-08-09-phase6-interview-prep.md docs/designs/2026-08-09-phase6-interview-prep-design.md
git commit -m "docs: 第 6 期计划完成（prepareInterview + 面试准备包 + Markdown 导出验收通过）"
```
