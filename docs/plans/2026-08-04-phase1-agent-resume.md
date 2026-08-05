# 第 1 期：Agent 骨架 + 简历导入/分析闭环 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-04 · 状态：完成 · 目标：打通"对话中导入并分析简历"闭环 · 关联规范：AGENTS.md、plan-document.md

**Goal:** 搭建 Agent 运行时骨架（模型注册 / llm-call / tool-factory / 会话持久化 / 流式对话端点），实现 importResume + analyzeResume 两个领域工具，前端完成聊天界面（消息流/输入/进度卡片）与简历产物展示，实现"对话中导入并分析简历 → 产物落库 → 展示"闭环。

**Architecture:** 薄编排（方案 A+）：`/api/chat` Route Handler 用 AI SDK v7 `createUIMessageStream` + `streamText` 组装；领域工具经 `tool-factory` 统一创建（注入模型/日志），工具内部用 `callStructured`（`generateText` + `output` 结构化输出 + repair ≤2 次重试 + 降级）；消息以 AI SDK UIMessage 整体 JSON 持久化（tee + `readUIMessageStream` 收集），会话恢复原样回填 `useChat`。

**Tech Stack:** Next.js 16（App Router）、AI SDK v7（ai、@ai-sdk/react、@ai-sdk/openai-compatible）、Drizzle ORM 0.45 + better-sqlite3 13、zod、mammoth、react-markdown、dompurify、lucide-react、shadcn/ui、Vitest（仅核心纯逻辑）。

**设计依据：** `docs/designs/2026-08-04-agent-architecture-design.md`（第 3 节基础设施、6.4 分期）、`2026-08-04-data-model-design.md`（5 表）、`2026-08-04-api-design.md`（端点与协议）、`2026-08-04-frontend-design.md`（第 8 节分步）

**验收标志：** 启动 `npm run dev` → 新会话输入"帮我导入桌面上的 resume.docx 并分析" → 看到导入结果卡片 → 看到分析进度卡片（"正在分析…"）→ 完成卡片显示评分/优势/风险/建议 → 左栏"资源→简历"列表出现该简历且带分析状态 → SQLite 中 resumes 表 analysis_json 已落库 → 刷新页面会话与消息完整恢复。

**环境注意（已实测）**：
- 直接 `npm install` 正常（本项目无 EALLOWSCRIPTS 问题；`npx` 触发的 install 会因用户 `~/.npmrc` 的 allow-scripts 报错——不要用 npx 装包）
- `drizzle-kit` 依赖 esbuild（当前已可运行，`node_modules/.bin/esbuild --version` 输出正常）

---

### Task 1: 安装第 1 期依赖与环境配置

**Files:**
- Modify: `package.json`（依赖）
- Create: `.env.example`、`.env.local`
- Modify: `.gitignore`

- [x] **Step 1: 安装运行时依赖**

Run（在项目根，Git Bash）:
```bash
npm install ai @ai-sdk/react @ai-sdk/openai-compatible drizzle-orm better-sqlite3 zod mammoth react-markdown dompurify lucide-react --no-audit --no-fund
```
Expected: `added N packages`，无错误。（若出现 `EALLOWSCRIPTS` 报错，说明环境变化，改用 `npm install --allow-scripts=false ...` 并在报告中标出）

- [x] **Step 2: 安装开发依赖**

```bash
npm install -D drizzle-kit @types/better-sqlite3 @types/dompurify vitest --no-audit --no-fund
```

- [x] **Step 3: package.json 增加测试脚本**

Modify `package.json` 的 `scripts` 增加：
```json
"test": "vitest run"
```

- [x] **Step 4: 创建环境变量模板与本地配置**

Create `.env.example`:
```
# OpenAI 兼容端点（任意供应商）
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=
LLM_MODEL=deepseek-chat
LLM_TEMPERATURE=0.3
```
Create `.env.local`：复制 `.env.example` 并填入真实可用的 `LLM_API_KEY`（用户提供；`LLM_BASE_URL`/`LLM_MODEL` 按用户实际供应商修改）。

- [x] **Step 5: .gitignore 补充**

Modify `.gitignore`，在 `.env*` 行之后追加：
```
!.env.example
/data/
```

- [x] **Step 6: 验证安装与提交**

```bash
node_modules/.bin/esbuild --version && node -e "require('better-sqlite3')" 2>&1 | head -1
git add package.json package-lock.json .env.example .gitignore
git commit -m "chore: 第 1 期依赖安装（ai/drizzle/sqlite/zod/mammoth）与环境配置"
```
Expected: esbuild 打印版本号；`node -e "require('better-sqlite3')"` 无报错（原生模块加载成功）。`.env.local` 不入库（gitignore 已覆盖）。

### Task 2: Drizzle 数据层（schema + client + 迁移）

**Files:**
- Create: `src/db/schema.ts`
- Create: `src/db/index.ts`
- Create: `drizzle.config.ts`
- Create: `src/db/migrations/`（由 drizzle-kit 生成）

- [x] **Step 1: 编写 schema**

Create `src/db/schema.ts`：
```ts
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  messageJson: text('message_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('messages_conversation_id_idx').on(t.conversationId)]);

export const resumes = sqliteTable('resumes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(),
  sourceText: text('source_text').notNull(),
  analysisJson: text('analysis_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const jobOpportunities = sqliteTable('job_opportunities', {
  id: text('id').primaryKey(),
  company: text('company').notNull().default(''),
  title: text('title').notNull().default(''),
  jdText: text('jd_text').notNull(),
  url: text('url'),
  status: text('status').notNull().default('saved'),
  fitResultJson: text('fit_result_json'),
  channelsJson: text('channels_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const tailoredResumes = sqliteTable('tailored_resumes', {
  id: text('id').primaryKey(),
  resumeId: text('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  jobOpportunityId: text('job_opportunity_id').notNull()
    .references(() => jobOpportunities.id, { onDelete: 'cascade' }),
  contentMarkdown: text('content_markdown').notNull(),
  version: integer('version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('tailored_resumes_resume_idx').on(t.resumeId),
  index('tailored_resumes_job_idx').on(t.jobOpportunityId),
]);
```
> 注：job_opportunities / tailored_resumes 表第 2-4 期才使用，但数据结构设计已定稿，一次建齐避免后续迁移（YAGNI 权衡：字段默认值占位）。

- [x] **Step 2: 创建 drizzle 配置**

Create `drizzle.config.ts`：
```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dbCredentials: { url: 'file:./data/job-helper.db' },
});
```

- [x] **Step 3: 生成并执行迁移**

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```
> 若 `npx` 触发 EALLOWSCRIPTS 失败，改用：`node_modules/.bin/drizzle-kit generate` 与 `node_modules/.bin/drizzle-kit migrate`。
Expected: generate 输出 SQL 迁移文件（含 5 张表与 3 个索引）；migrate 输出应用成功；`data/job-helper.db` 文件生成。

- [x] **Step 4: 编写 DB client**

Create `src/db/index.ts`：
```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

const sqlite = new Database('data/job-helper.db');
sqlite.pragma('journal_mode = WAL');

export const db = drizzle(sqlite, { schema });
export { schema };
```

- [x] **Step 5: 验证与提交**

```bash
node -e "const {db}=require('./src/db'); console.log('db ok')" 2>&1 | head -3
git add src/db drizzle.config.ts && git commit -m "feat: Drizzle 数据层（5 表 schema + 迁移 + client）"
```
> 注：`node -e` 直接 require TS 会失败——本步验证改为：`npx tsx -e "import { db } from './src/db'; console.log('db ok')"`（tsx 在 create-next-app 依赖中）。若 tsx 不可用则跳过本步运行时验证，以 migrate 成功为准。

### Task 3: 仓储层（conversations / messages / resumes）

**Files:**
- Create: `src/db/repositories/conversations.ts`
- Create: `src/db/repositories/messages.ts`
- Create: `src/db/repositories/resumes.ts`

- [x] **Step 1: conversations 仓储**

Create `src/db/repositories/conversations.ts`：
```ts
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { conversations } from '../schema';

export const nowIso = () => new Date().toISOString();

export type ConversationRecord = {
  id: string; title: string; createdAt: string; updatedAt: string;
};

export function createConversation(title: string): ConversationRecord {
  const record: ConversationRecord = { id: randomUUID(), title, createdAt: nowIso(), updatedAt: nowIso() };
  db.insert(conversations).values(record).run();
  return record;
}

export function listConversations(): ConversationRecord[] {
  return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all();
}

export function getConversation(id: string): ConversationRecord | null {
  return db.select().from(conversations).where(eq(conversations.id, id)).get() ?? null;
}

export function renameConversation(id: string, title: string): void {
  db.update(conversations).set({ title, updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
}

export function touchConversation(id: string): void {
  db.update(conversations).set({ updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
}

export function deleteConversation(id: string): void {
  db.delete(conversations).where(eq(conversations.id, id)).run();
}
```

- [x] **Step 2: messages 仓储**

Create `src/db/repositories/messages.ts`：
```ts
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '../index';
import { messages } from '../schema';
import { nowIso } from './conversations';

export type MessageRecord = {
  id: string; conversationId: string; role: string; messageJson: string; createdAt: string;
};

export function insertMessage(conversationId: string, role: string, messageJson: string): MessageRecord {
  const record: MessageRecord = { id: randomUUID(), conversationId, role, messageJson, createdAt: nowIso() };
  db.insert(messages).values(record).run();
  return record;
}

export function listMessages(conversationId: string): MessageRecord[] {
  return db.select().from(messages).where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt)).all();
}

export function deleteMessagesByConversation(conversationId: string): void {
  db.delete(messages).where(eq(messages.conversationId, conversationId)).run();
}
```

- [x] **Step 3: resumes 仓储**

Create `src/db/repositories/resumes.ts`：
```ts
import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { resumes } from '../schema';
import { nowIso } from './conversations';

export type ResumeRecord = {
  id: string; name: string; sourceType: string; sourceText: string;
  analysisJson: string | null; createdAt: string; updatedAt: string;
};

export function createResume(input: { name: string; sourceType: string; sourceText: string }): ResumeRecord {
  const record: ResumeRecord = {
    id: randomUUID(), name: input.name, sourceType: input.sourceType,
    sourceText: input.sourceText, analysisJson: null, createdAt: nowIso(), updatedAt: nowIso(),
  };
  db.insert(resumes).values(record).run();
  return record;
}

export function listResumes(): ResumeRecord[] {
  return db.select().from(resumes).orderBy(desc(resumes.updatedAt)).all();
}

export function getResume(id: string): ResumeRecord | null {
  return db.select().from(resumes).where(eq(resumes.id, id)).get() ?? null;
}

export function updateResumeAnalysis(id: string, analysisJson: string): void {
  db.update(resumes).set({ analysisJson, updatedAt: nowIso() }).where(eq(resumes.id, id)).run();
}
```

- [x] **Step 4: 提交**

```bash
git add src/db/repositories && git commit -m "feat: 仓储层（会话/消息/简历）"
```

### Task 4: 模型注册 + callStructured（llm-call）

**Files:**
- Create: `src/agent/model.ts`
- Create: `src/agent/llm-call.ts`
- Test: `src/agent/llm-call.test.ts`

- [x] **Step 1: 模型注册**

Create `src/agent/model.ts`：
```ts
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import type { LanguageModel } from 'ai';

export class LlmConfigError extends Error {}

export function getModel(): LanguageModel {
  const baseURL = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const modelName = process.env.LLM_MODEL;
  const missing = [baseURL && 'LLM_BASE_URL', apiKey && 'LLM_API_KEY', modelName && 'LLM_MODEL'].filter(Boolean);
  if (missing.length > 0) {
    throw new LlmConfigError(`LLM 环境变量缺失：${missing.join('、')}（请配置 .env.local）`);
  }
  const provider = createOpenAICompatible({ name: 'local', baseURL: baseURL!, apiKey });
  return provider(modelName!);
}

export function getTemperature(): number {
  const raw = Number(process.env.LLM_TEMPERATURE);
  return Number.isFinite(raw) && raw >= 0 && raw <= 2 ? raw : 0.3;
}
```

- [x] **Step 2: callStructured 实现**

Create `src/agent/llm-call.ts`：
```ts
import { generateText } from 'ai';
import type { LanguageModel } from 'ai';
import type { ZodType } from 'zod';
import { getTemperature } from './model';

export type CallStructuredResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: 'LLM_OUTPUT_INVALID' | 'LLM_CALL_FAILED'; message: string } };

const MAX_REPAIR_ATTEMPTS = 2;

/**
 * 结构化 LLM 调用：generateText + output(zod) 结构化输出；
 * 校验失败（JSON 解析/缺字段/枚举非法）→ repair 重试（≤2 次，注入错误详情）；
 * 模型调用失败（网络/限流/密钥）→ 直接失败，不重试（避免重复计费）。
 */
export async function callStructured<T>(options: {
  model: LanguageModel;
  systemPrompt: string;
  userPrompt: string;
  schema: ZodType<T>;
  task: string;
}): Promise<CallStructuredResult<T>> {
  const { model, systemPrompt, userPrompt, schema, task } = options;
  let lastError = '';

  for (let attempt = 0; attempt <= MAX_REPAIR_ATTEMPTS; attempt++) {
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: attempt === 0 ? userPrompt : `${userPrompt}\n\n【上次输出无效，请修正后重新输出】\n原因：${lastError}` },
    ];
    try {
      const result = await generateText({
        model,
        temperature: getTemperature(),
        messages,
        output: schema,
      });
      if (result.structuredOutput === undefined) {
        lastError = '模型未返回结构化输出';
        continue;
      }
      return { ok: true, data: result.structuredOutput as T };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isSchemaFailure =
        message.includes('output') && (message.includes('schema') || message.includes('JSON') || message.includes('parse'));
      if (isSchemaFailure) {
        lastError = message;
        continue; // repair 重试
      }
      return { ok: false, error: { code: 'LLM_CALL_FAILED', message: `模型调用失败（${task}）：${message}` } };
    }
  }
  return { ok: false, error: { code: 'LLM_OUTPUT_INVALID', message: `结构化输出校验失败（${task}），已重试 ${MAX_REPAIR_ATTEMPTS} 次仍无效` } };
}
```
> 注：schema 失败判定用错误消息关键词（AI SDK 的 ZodSchemaError 消息含 schema/JSON 字样）。若实现时发现判定不精确，可将 `result.structuredOutput` 校验失败路径改为：catch 后对错误对象 `(err as { name?: string }).name === 'ZodSchemaError'` 判定，两者取一并在代码注释中说明。

- [x] **Step 3: 编写纯逻辑单测（repair 计数与失败分类）**

Create `src/agent/llm-call.test.ts`：
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { callStructured } from './llm-call';
import { z } from 'zod';

vi.mock('ai', () => ({
  generateText: vi.fn(),
}));
import { generateText } from 'ai';
const mockGenerate = vi.mocked(generateText);

const schema = z.object({ score: z.number().int().min(0).max(100) });

const model = {} as any;
const base = { model, systemPrompt: 's', userPrompt: 'u', schema, task: 'test' };

beforeEach(() => { mockGenerate.mockReset(); });

describe('callStructured', () => {
  it('校验失败时 repair 重试，最多 2 次后返回 LLM_OUTPUT_INVALID', async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'))
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'))
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'));
    const result = await callStructured(base);
    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.code).toBe('LLM_OUTPUT_INVALID');
    expect(mockGenerate).toHaveBeenCalledTimes(3);
  });

  it('校验失败后重试成功返回数据', async () => {
    mockGenerate
      .mockRejectedValueOnce(new Error('output JSON schema parse failed'))
      .mockResolvedValueOnce({ structuredOutput: { score: 85 } });
    const result = await callStructured(base);
    expect(result).toEqual({ ok: true, data: { score: 85 } });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
  });

  it('网络类错误不重试，直接返回 LLM_CALL_FAILED', async () => {
    mockGenerate.mockRejectedValueOnce(new Error('fetch failed: ECONNREFUSED'));
    const result = await callStructured(base);
    expect(result.ok ? '' : result.error.code).toBe('LLM_CALL_FAILED');
    expect(mockGenerate).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 4: 运行测试**

Run: `npm test -- src/agent/llm-call.test.ts`
Expected: 3 个用例全部 PASS。

- [x] **Step 5: 提交**

```bash
git add src/agent package.json && git commit -m "feat: 模型注册与 callStructured（结构化输出 + repair 重试）"
```

### Task 5: tool-factory + 主对话 Agent（agent.ts）

**Files:**
- Create: `src/agent/tool-factory.ts`
- Create: `src/agent/agent.ts`

- [x] **Step 1: tool-factory**

Create `src/agent/tool-factory.ts`：
```ts
import { tool } from 'ai';
import type { ZodType } from 'zod';

export type ToolContext = {
  /** 结构化 LLM 调用（工具内部再调模型） */
  callStructured: typeof import('./llm-call').callStructured;
  /** 日志（敏感信息过滤后写入，见 AGENTS.md 硬约束） */
  log: (level: 'info' | 'warn' | 'error', message: string) => void;
};

export type DomainToolOptions<INPUT extends ZodType, OUTPUT> = {
  name: string;
  description: string;
  inputSchema: INPUT;
  progress: { start: string; done: string };
  execute: (args: z.infer<INPUT>, ctx: ToolContext) => Promise<OUTPUT>;
};

export function createDomainTool<INPUT extends ZodType, OUTPUT>(
  options: DomainToolOptions<INPUT, OUTPUT>,
) {
  const { name, description, inputSchema, progress, execute } = options;
  return tool({
    description,
    inputSchema,
    execute: async (args) => {
      const startedAt = Date.now();
      try {
        const result = await execute(args as z.infer<INPUT>, {
          callStructured: (await import('./llm-call')).callStructured,
          log: (level, message) => {
            // 结构化一行日志：工具名 + 级别 + 内容（调用方保证不含敏感信息）
            console.log(`[tool:${name}] ${level} ${message} ${Date.now() - startedAt}ms`);
          },
        });
        console.log(`[tool:${name}] info completed ${Date.now() - startedAt}ms`);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`[tool:${name}] error failed ${Date.now() - startedAt}ms: ${message}`);
        // 错误统一为 { code, message }，避免堆栈泄漏给客户端
        throw new Error(JSON.stringify({ code: 'TOOL_FAILED', message }));
      }
    },
  });
}
```
> 注：`z` 类型需要 import：文件顶部补 `import type { z } from 'zod';`（`z.infer` 是类型层面用法）。

- [x] **Step 2: 主对话 Agent（系统提示 + 工具注册表）**

Create `src/agent/agent.ts`：
```ts
import type { ToolSet } from 'ai';
import { analyzeResumeTool } from './tools/analyze-resume';
import { importResumeTool } from './tools/import-resume';

export const SYSTEM_PROMPT = `你是 job-helper，一个本地运行的个人求职助手 Agent。

工作方式：
- 用户通过对话向你下达求职任务，你通过调用工具完成实际工作。
- 工具执行的结果会以卡片形式展示给用户，你需要用自然语言总结结果并给出下一步建议。

能力（工具）：
- importResume：导入简历（用户粘贴文本或提供本地文件路径 .docx/.txt/.md）
- analyzeResume：分析已导入的简历，产出结构化画像与改进建议

原则：
- 绝不编造、补造或夸大用户经历、技能、雇主、证书或成果；所有分析结论必须基于简历原文证据。
- 不支持的格式（PDF/图片/扫描件/旧版 .doc）要明确告知用户不支持。
- 用户提供本地文件路径时，路径来自用户本人，直接读取即可。
- 默认使用中文回复。`;

export function getTools(): ToolSet {
  return { importResume: importResumeTool, analyzeResume: analyzeResumeTool };
}
```

- [x] **Step 3: 提交**

```bash
git add src/agent && git commit -m "feat: tool-factory 与主对话 Agent 骨架"
```

### Task 6: importResume 工具（含简历文本处理）

**Files:**
- Create: `src/agent/resume-text.ts`
- Create: `src/agent/tools/import-resume.ts`
- Test: `src/agent/resume-text.test.ts`

- [x] **Step 1: 简历文本处理纯逻辑**

Create `src/agent/resume-text.ts`：
```ts
export const MAX_RESUME_TEXT_LENGTH = 80_000;

export class ResumeTextError extends Error {}

export function normalizeResumeText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

export function assertTextLength(text: string): void {
  if (text.length > MAX_RESUME_TEXT_LENGTH) {
    throw new ResumeTextError(`简历文本超过 ${MAX_RESUME_TEXT_LENGTH} 字符上限`);
  }
}

const SUPPORTED_EXTENSIONS = new Set(['.docx', '.txt', '.md']);

export function isSupportedFilePath(path: string): boolean {
  const lower = path.toLowerCase();
  return SUPPORTED_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
}

export function formatNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || '未命名简历';
}
```

- [x] **Step 2: 单测**

Create `src/agent/resume-text.test.ts`：
```ts
import { describe, expect, it } from 'vitest';
import { normalizeResumeText, assertTextLength, isSupportedFilePath, MAX_RESUME_TEXT_LENGTH } from './resume-text';

describe('resume-text', () => {
  it('归一化换行', () => {
    expect(normalizeResumeText('a\r\nb\rc')).toBe('a\nb\nc');
  });
  it('超过上限抛错', () => {
    expect(() => assertTextLength('x'.repeat(MAX_RESUME_TEXT_LENGTH + 1))).toThrow();
  });
  it('支持与拒绝的扩展名', () => {
    expect(isSupportedFilePath('C:/a/b/resume.docx')).toBe(true);
    expect(isSupportedFilePath('resume.pdf')).toBe(false);
    expect(isSupportedFilePath('resume')).toBe(false);
  });
});
```

- [x] **Step 3: 运行测试**

Run: `npm test -- src/agent/resume-text.test.ts`
Expected: 3 用例 PASS。

- [x] **Step 4: importResume 工具**

Create `src/agent/tools/import-resume.ts`：
```ts
import { readFile } from 'node:fs/promises';
import mammoth from 'mammoth';
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { createResume } from '../../db/repositories/resumes';
import { assertTextLength, formatNameFromPath, isSupportedFilePath, normalizeResumeText, ResumeTextError } from '../resume-text';

const inputSchema = z.object({
  text: z.string().min(1).optional().describe('简历文本内容（粘贴方式）'),
  filePath: z.string().min(1).optional().describe('本地简历文件路径，支持 .docx/.txt/.md'),
});

async function extractFromFile(filePath: string): Promise<string> {
  if (!isSupportedFilePath(filePath)) {
    throw new ResumeTextError('不支持的格式：仅支持 .docx / .txt / .md（不支持 PDF、图片、扫描件、旧版 .doc）');
  }
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }
  return readFile(filePath, 'utf-8');
}

export const importResumeTool = createDomainTool({
  name: 'importResume',
  description: '导入简历：接受粘贴的简历文本，或本地 .docx/.txt/.md 文件路径。导入后返回 resumeId，可用 analyzeResume 分析。',
  inputSchema,
  progress: { start: '正在读取简历…', done: '简历导入完成' },
  execute: async (args) => {
    const hasText = typeof args.text === 'string' && args.text.length > 0;
    const hasPath = typeof args.filePath === 'string' && args.filePath.length > 0;
    if (hasText === hasPath) {
      throw new Error('请提供且仅提供一种简历来源：text（粘贴）或 filePath（本地文件路径）');
    }

    const raw = hasText ? args.text! : await extractFromFile(args.filePath!);
    const sourceText = normalizeResumeText(raw);
    assertTextLength(sourceText);

    const record = createResume({
      name: hasPath ? formatNameFromPath(args.filePath!) : `粘贴简历 ${new Date().toISOString().slice(0, 10)}`,
      sourceType: hasPath ? args.filePath!.toLowerCase().slice(args.filePath!.lastIndexOf('.') + 1) : 'paste',
      sourceText,
    });

    return {
      resumeId: record.id,
      name: record.name,
      sourceType: record.sourceType,
      charCount: sourceText.length,
      preview: sourceText.slice(0, 120),
      next: '可以调用 analyzeResume 对这份简历进行分析',
    };
  },
});
```

- [x] **Step 5: 提交**

```bash
git add src/agent && git commit -m "feat: importResume 工具（文本/本地文件 + mammoth 解析）"
```

### Task 7: analyzeResume 工具（契约 + prompt + 实现）

**Files:**
- Create: `src/agent/schemas/resume-analysis.ts`
- Create: `src/agent/prompts/resume-analysis.ts`
- Create: `src/agent/tools/analyze-resume.ts`

- [x] **Step 1: 分析契约（v1）**

Create `src/agent/schemas/resume-analysis.ts`：
```ts
import { z } from 'zod';

/** 简历分析契约 v1（产物 JSON 内嵌 schemaVersion，读取按版本宽容解析） */
export const resumeAnalysisSchemaV1 = z.object({
  schemaVersion: z.literal(1),
  overallScore: z.number().int().min(0).max(100).describe('简历整体评分 0-100'),
  strengths: z.array(z.object({
    point: z.string().describe('优势要点'),
    evidence: z.string().optional().describe('简历原文中的证据片段'),
  })).max(8),
  risks: z.array(z.object({
    point: z.string().describe('风险/短板要点'),
    evidence: z.string().optional().describe('简历原文中的证据片段'),
  })).max(8),
  improvements: z.array(z.object({
    suggestion: z.string().describe('改进建议'),
    priority: z.enum(['high', 'medium', 'low']).describe('优先级'),
  })).max(8),
  profile: z.object({
    skills: z.array(z.string()).max(30).describe('简历中出现的技能关键词'),
    experienceYears: z.number().min(0).max(60).nullable().describe('估计的工作年限，无法判断为 null'),
    targetRoles: z.array(z.string()).max(10).describe('推测的目标岗位方向'),
    targetCities: z.array(z.string()).max(10).describe('推测的目标城市'),
  }),
  pendingConfirmations: z.array(z.string()).max(10).describe('需要用户确认的推断项（如"推测 3 年前端经验，请确认"）'),
});

export type ResumeAnalysisV1 = z.infer<typeof resumeAnalysisSchemaV1>;
```

- [x] **Step 2: 分析 prompt**

Create `src/agent/prompts/resume-analysis.ts`：
```ts
export function buildResumeAnalysisSystemPrompt(): string {
  return `你是一名资深求职简历分析专家。请分析用户提供的简历原文，按输出契约产出结构化分析结果。

要求：
1. 所有分析必须基于简历原文证据，严禁编造、补造或夸大用户的经历、技能、雇主、证书或成果。
2. strengths/risks/improvements 中的每条都要尽量给出 evidence（简历原文片段，原文中没有的不要写）。
3. 无法从简历判断的信息（如工作年限）输出 null 或留空，不要猜测。
4. 推断项（目标岗位/城市/年限）放入 pendingConfirmations，提示用户确认。
5. 严格按输出契约的 JSON 结构输出，字段名与枚举值不得更改。`;
}

export function buildResumeAnalysisUserPrompt(resumeName: string, sourceText: string): string {
  return `简历名称：${resumeName}\n\n简历原文如下：\n\n${sourceText}`;
}
```

- [x] **Step 3: analyzeResume 工具**

Create `src/agent/tools/analyze-resume.ts`：
```ts
import { z } from 'zod';
import { createDomainTool } from '../tool-factory';
import { getModel } from '../model';
import { getResume, updateResumeAnalysis } from '../../db/repositories/resumes';
import { resumeAnalysisSchemaV1 } from '../schemas/resume-analysis';
import { buildResumeAnalysisSystemPrompt, buildResumeAnalysisUserPrompt } from '../prompts/resume-analysis';

const inputSchema = z.object({
  resumeId: z.string().min(1).describe('要分析的简历 ID（由 importResume 返回）'),
});

export const analyzeResumeTool = createDomainTool({
  name: 'analyzeResume',
  description: '分析已导入的简历：产出结构化画像（技能/目标/年限）、评分、优势、风险与改进建议。输入 resumeId。',
  inputSchema,
  progress: { start: '正在分析简历…', done: '简历分析完成' },
  execute: async (args, ctx) => {
    const resume = getResume(args.resumeId);
    if (!resume) {
      throw new Error('简历不存在，请先调用 importResume 导入');
    }
    if (!resume.sourceText.trim()) {
      throw new Error('简历内容为空，无法分析');
    }

    const result = await ctx.callStructured({
      model: getModel(),
      systemPrompt: buildResumeAnalysisSystemPrompt(),
      userPrompt: buildResumeAnalysisUserPrompt(resume.name, resume.sourceText),
      schema: resumeAnalysisSchemaV1,
      task: 'resume-analysis',
    });

    if (!result.ok) {
      // 降级：不落库坏数据，返回结构化失败信息供模型向用户解释
      return {
        ok: false,
        error: result.error,
        resumeId: resume.id,
        hint: '分析失败。可重试一次；若持续失败，可尝试导入文本更短的简历或检查模型配置。',
      };
    }

    updateResumeAnalysis(resume.id, JSON.stringify(result.data));

    return {
      ok: true,
      resumeId: resume.id,
      overallScore: result.data.overallScore,
      summary: {
        strengthsCount: result.data.strengths.length,
        risksCount: result.data.risks.length,
        improvementsCount: result.data.improvements.length,
        pendingConfirmations: result.data.pendingConfirmations,
      },
      hint: '完整分析结果已保存，可直接在界面中查看简历详情。',
    };
  },
});
```

- [x] **Step 4: 提交**

```bash
git add src/agent && git commit -m "feat: analyzeResume 工具（v1 契约 + prompt + 落库）"
```

### Task 8: /api/chat 对话端点（流式 + 进度事件 + 持久化）

**Files:**
- Create: `app/api/chat/route.ts`

- [x] **Step 1: 实现对话端点**

Create `app/api/chat/route.ts`：
```ts
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  readUIMessageStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { getModel } from '@/src/agent/model';
import { getTools, SYSTEM_PROMPT } from '@/src/agent/agent';
import {
  createConversation, getConversation, listMessages, insertMessage, touchConversation,
} from '@/src/db/repositories/conversations';
import { deleteMessagesByConversation } from '@/src/db/repositories/messages';

const MAX_HISTORY_ROUNDS = 20;

const requestSchema = z.object({
  conversationId: z.string().min(1).nullable().optional(),
  messages: z.array(z.object({ id: z.string(), role: z.enum(['user', 'assistant']), parts: z.array(z.unknown()) })).min(1),
});

function titleFromFirstMessage(messages: UIMessage[]): string {
  const first = messages[0];
  const text = first.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 20) || '新对话';
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, { status: 400 });
  }
  const { conversationId, messages } = parsed.data;
  const incoming = messages as UIMessage[];

  // 会话解析：无 id → 创建；有 id → 校验存在
  let convId: string;
  if (!conversationId) {
    convId = createConversation(titleFromFirstMessage(incoming)).id;
  } else {
    const existing = getConversation(conversationId);
    if (!existing) {
      return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
    }
    convId = conversationId;
  }

  // 组装历史：DB 历史 + 本次入站消息
  const historyRecords = listMessages(convId);
  const history: UIMessage[] = historyRecords
    .map((r) => {
      try { return JSON.parse(r.messageJson) as UIMessage; } catch { return null; }
    })
    .filter((m): m is UIMessage => m !== null);
  const merged = [...history, ...incoming];
  const trimmed = merged.slice(-MAX_HISTORY_ROUNDS * 2);

  // 持久化入站消息
  for (const msg of incoming) {
    insertMessage(convId, msg.role, JSON.stringify(msg));
  }

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const model = getModel();
      const result = streamText({
        model,
        system: SYSTEM_PROMPT,
        messages: await convertToModelMessages(trimmed),
        tools: getTools(),
        onToolExecutionStart: ({ toolName }) => {
          const progressText = toolName === 'importResume' ? '正在读取简历…'
            : toolName === 'analyzeResume' ? '正在分析简历…' : '正在处理…';
          writer.write({
            type: 'tool-progress',
            data: { toolName, status: 'running', message: progressText },
            transient: true,
          });
        },
        onToolExecutionEnd: ({ toolName, success }) => {
          writer.write({
            type: 'tool-progress',
            data: {
              toolName,
              status: success ? 'completed' : 'failed',
              message: success ? '完成' : '失败',
            },
            transient: true,
          });
        },
      });

      // tee 分流：一路合并进响应流，一路收集完整 UIMessage 用于持久化
      const uiStream = toUIMessageStream({ stream: result.stream });
      const [clientSide, collectSide] = uiStream.tee();
      const collected: UIMessage[] = [];
      const collector = (async () => {
        for await (const msg of readUIMessageStream({ stream: collectSide })) {
          collected.push(msg);
        }
        // 按 id 取最终状态持久化
        const byId = new Map<string, UIMessage>();
        for (const m of collected) byId.set(m.id, m);
        for (const m of byId.values()) {
          if (m.role === 'assistant') insertMessage(convId, 'assistant', JSON.stringify(m));
        }
        touchConversation(convId);
      })();
      writer.merge(clientSide);
      await collector;
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```
> 注：`deleteMessagesByConversation` 本任务未用到——移除该 import（保持无未使用导入）；`historyRecords` 的 role 列冗余可用。

- [x] **Step 2: 冒烟验证（需真实 LLM key）**

Run: `npm run dev`
Expected: 服务启动无编译错误。用 curl 验证（`LLM_API_KEY` 已配置）：
```bash
curl -s -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"id":"m1","role":"user","parts":[{"type":"text","text":"你好"}]}]}' | head -c 300
```
Expected: 返回 SSE 流片段（`data: {...}` 行，含 assistant 文本）。验证后停止 dev 进程。

- [x] **Step 3: 提交**

```bash
git add app/api && git commit -m "feat: /api/chat 流式对话端点（进度事件 + 消息持久化）"
```

### Task 9: 会话与简历查询端点

**Files:**
- Create: `app/api/conversations/route.ts`
- Create: `app/api/conversations/[id]/route.ts`
- Create: `app/api/conversations/[id]/messages/route.ts`
- Create: `app/api/resumes/route.ts`
- Create: `app/api/resumes/[id]/route.ts`

- [x] **Step 1: 会话列表与新建**

Create `app/api/conversations/route.ts`：
```ts
import { z } from 'zod';
import { createConversation, listConversations } from '@/src/db/repositories/conversations';
import { listMessages } from '@/src/db/repositories/messages';

export async function GET() {
  const convs = listConversations();
  const withPreview = convs.map((c) => {
    const msgs = listMessages(c.id);
    const last = msgs[msgs.length - 1];
    let preview = '';
    if (last) {
      try {
        const parsed = JSON.parse(last.messageJson) as { parts?: Array<{ type?: string; text?: string }> };
        preview = parsed.parts?.filter((p) => p.type === 'text').map((p) => p.text ?? '').join(' ').slice(0, 60) ?? '';
      } catch { preview = ''; }
    }
    return { id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt, lastMessagePreview: preview };
  });
  return Response.json(withPreview);
}

const createSchema = z.object({ title: z.string().max(50).optional() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, { status: 400 });
  const conv = createConversation(parsed.data.title ?? '新对话');
  return Response.json(conv, { status: 201 });
}
```

- [x] **Step 2: 会话重命名与删除**

Create `app/api/conversations/[id]/route.ts`：
```ts
import { z } from 'zod';
import { getConversation, renameConversation, deleteConversation } from '@/src/db/repositories/conversations';

const patchSchema = z.object({ title: z.string().min(1).max(50) });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getConversation(id)) return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: 'INVALID_REQUEST', message: '请求格式无效' }, { status: 400 });
  renameConversation(id, parsed.data.title);
  return Response.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getConversation(id)) return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
  deleteConversation(id); // messages 由外键级联删除
  return Response.json({ ok: true });
}
```
> 注：Next.js 16 中 `params` 为 Promise，须 `await params`。

- [x] **Step 3: 会话消息加载**

Create `app/api/conversations/[id]/messages/route.ts`：
```ts
import { getConversation } from '@/src/db/repositories/conversations';
import { listMessages } from '@/src/db/repositories/messages';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getConversation(id)) return Response.json({ code: 'CONVERSATION_NOT_FOUND', message: '会话不存在' }, { status: 404 });
  const records = listMessages(id);
  const messages = records
    .map((r) => {
      try { return JSON.parse(r.messageJson); } catch { return null; }
    })
    .filter((m) => m !== null);
  return Response.json(messages);
}
```

- [x] **Step 4: 简历列表与详情**

Create `app/api/resumes/route.ts`：
```ts
import { listResumes } from '@/src/db/repositories/resumes';

export async function GET() {
  const records = listResumes();
  return Response.json(records.map((r) => ({
    id: r.id,
    name: r.name,
    sourceType: r.sourceType,
    analyzed: r.analysisJson !== null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  })));
}
```

Create `app/api/resumes/[id]/route.ts`：
```ts
import { getResume } from '@/src/db/repositories/resumes';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resume = getResume(id);
  if (!resume) return Response.json({ code: 'RESUME_NOT_FOUND', message: '简历不存在' }, { status: 404 });
  let analysis = null;
  if (resume.analysisJson) {
    try { analysis = JSON.parse(resume.analysisJson); } catch { analysis = null; }
  }
  return Response.json({
    id: resume.id,
    name: resume.name,
    sourceType: resume.sourceType,
    sourceText: resume.sourceText,
    analysis,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  });
}
```

- [x] **Step 5: 验证与提交**

Run: `npm run build`
Expected: 编译通过。
```bash
git add app/api && git commit -m "feat: 会话与简历查询端点"
```

### Task 10: 前端基础（shadcn + 布局 + 聊天核心）

**Files:**
- Create: `components.json`、`src/lib/utils.ts`、`src/components/ui/*`（shadcn CLI 生成）
- Create: `src/components/layout/app-layout.tsx`
- Create: `src/components/chat/*`（markdown-text、message-list、message-bubble、tool-progress-card、chat-input）
- Create: `src/lib/api.ts`
- Modify: `app/page.tsx`、`app/layout.tsx`

- [x] **Step 1: 初始化 shadcn/ui**

Run:
```bash
npx shadcn@latest init --base-color neutral --yes
npx shadcn@latest add button input textarea card scroll-area tabs sheet badge separator --yes
```
> 若 `npx` 报 EALLOWSCRIPTS：检查 `components.json` 与 `components/ui` 是否已生成，缺失的包手动 `npm install reka-ui class-variance-authority clsx tailwind-merge lucide-react`（lucide 已装）后重试 add。
Expected: `components.json` 生成、`src/components/ui/*` 出现对应组件、`src/lib/utils.ts` 生成。

- [x] **Step 2: API 客户端**

Create `src/lib/api.ts`：
```ts
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { message?: string } | null)?.message ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}

export async function apiSend<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => null);
    throw new Error((errBody as { message?: string } | null)?.message ?? `请求失败（${res.status}）`);
  }
  return res.json() as Promise<T>;
}
```

- [x] **Step 3: Markdown 渲染组件**

Create `src/components/chat/markdown-text.tsx`：
```tsx
'use client';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

export function MarkdownText({ text }: { text: string }) {
  const safe = DOMPurify.sanitize(text);
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown>{safe}</ReactMarkdown>
    </div>
  );
}
```
> 注：Next.js 默认无 `prose` 类（未装 typography 插件）——将外层类改为 `text-sm leading-relaxed`，保留段落间距即可：
```tsx
export function MarkdownText({ text }: { text: string }) {
  const safe = DOMPurify.sanitize(text);
  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown>{safe}</ReactMarkdown>
    </div>
  );
}
```

- [x] **Step 4: 聊天核心（消息流 + 输入 + 进度卡片）**

Create `src/components/chat/chat-panel.tsx`：
```tsx
'use client';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState } from 'react';
import { MessageBubble } from './message-bubble';
import { ToolProgressCard } from './tool-progress-card';
import { ChatInput } from './chat-input';

export type ToolProgress = { toolName: string; status: 'running' | 'completed' | 'failed'; message: string };

export function ChatPanel({
  conversationId,
  initialMessages,
  onConversationCreated,
  onChatSettled,
}: {
  conversationId: string | null;
  initialMessages: Parameters<typeof useChat>[0]['initialMessages'];
  onConversationCreated: (id: string) => void;
  onChatSettled: () => void;
}) {
  const [progress, setProgress] = useState<ToolProgress | null>(null);
  const settledRef = useRef(false);

  const { messages, sendMessage, stop, status, setMessages, id } = useChat({
    id: conversationId ?? undefined,
    initialMessages,
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onData: (part) => {
      if (part.type === 'tool-progress') {
        const data = part.data as ToolProgress;
        setProgress(data);
        if (data.status === 'completed' || data.status === 'failed') settledRef.current = true;
      }
    },
    onFinish: () => {
      settledRef.current = true;
      onChatSettled();
      setProgress(null);
    },
  });

  useEffect(() => {
    if (id && !conversationId && messages.length > 0) {
      // 服务端在首条消息后创建了会话，把会话 id 提升到父级
      onConversationCreated(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, messages.length]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {progress && progress.status === 'running' && <ToolProgressCard progress={progress} />}
      </div>
      <ChatInput
        disabled={status === 'streaming' || status === 'submitted'}
        streaming={status === 'streaming' || status === 'submitted'}
        onSend={(text) => sendMessage({ text })}
        onStop={stop}
      />
    </div>
  );
}
```
> 注：`useChat` 的 `id` 会作为 chat id 传给服务端——但本设计会话 id 由服务端创建/管理。第 1 期简化：客户端不设 `id`（服务端根据 body 中 conversationId 管理），`onConversationCreated` 第 1 期仅预留（前端会话切换见 Task 11）；若 `useChat` 类型强制要求 id，可去掉 `id` 与 `conversationId` 参数。**实现时以类型报错为准微调。**

Create `src/components/chat/message-bubble.tsx`：
```tsx
'use client';
import type { UIMessage } from 'ai';
import { MarkdownText } from './markdown-text';
import { cn } from '@/src/lib/utils';

export function MessageBubble({ message }: { message: UIMessage }) {
  const textParts = message.parts.filter((p) => p.type === 'text');
  if (textParts.length === 0) return null;
  const isUser = message.role === 'user';
  return (
    <div className={cn('mb-3 flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3 py-2',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted',
        )}
      >
        <MarkdownText text={textParts.map((p) => (p as { text: string }).text).join('\n')} />
      </div>
    </div>
  );
}
```

Create `src/components/chat/tool-progress-card.tsx`：
```tsx
'use client';
import type { ToolProgress } from './chat-panel';

export function ToolProgressCard({ progress }: { progress: ToolProgress }) {
  return (
    <div className="mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
      <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
      <span>{progress.message}</span>
    </div>
  );
}
```

Create `src/components/chat/chat-input.tsx`：
```tsx
'use client';
import { useState } from 'react';
import { Button } from '@/src/components/ui/button';
import { Textarea } from '@/src/components/ui/textarea';

export function ChatInput({
  disabled, streaming, onSend, onStop,
}: {
  disabled: boolean; streaming: boolean;
  onSend: (text: string) => void; onStop: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="border-t p-3">
      <Textarea
        value={text}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        disabled={disabled}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (text.trim() && !disabled) {
              onSend(text.trim());
              setText('');
            }
          }
        }}
      />
      <div className="mt-2 flex justify-end gap-2">
        {streaming ? (
          <Button size="sm" variant="outline" onClick={onStop}>停止</Button>
        ) : (
          <Button size="sm" disabled={disabled || !text.trim()} onClick={() => { onSend(text.trim()); setText(''); }}>
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [x] **Step 5: 组装主页面（临时单页，Task 11 再接入会话栏）**

Modify `app/page.tsx` 全文替换：
```tsx
'use client';
import { ChatPanel } from '@/src/components/chat/chat-panel';

export default function Home() {
  return (
    <main className="flex h-screen flex-col">
      <ChatPanel
        conversationId={null}
        initialMessages={[]}
        onConversationCreated={() => {}}
        onChatSettled={() => {}}
      />
    </main>
  );
}
```

- [x] **Step 6: 构建验证与提交**

Run: `npm run build`
Expected: 编译通过（如有类型报错按报错微调：重点检查 useChat 泛型与 parts 类型收窄）。
```bash
git add app src components.json && git commit -m "feat: 前端基础（shadcn + 聊天核心 UI）"
```

### Task 11: 会话栏（左栏双区 Tabs + 会话列表 + 资源库简历列表）

**Files:**
- Create: `src/components/sidebar/sidebar.tsx`
- Create: `src/components/sidebar/conversation-list.tsx`
- Create: `src/components/sidebar/resource-tabs.tsx`
- Create: `src/lib/use-conversations.ts`
- Create: `src/lib/use-resumes.ts`
- Modify: `app/page.tsx`

- [x] **Step 1: 数据 hooks**

Create `src/lib/use-conversations.ts`：
```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type ConversationSummary = {
  id: string; title: string; createdAt: string; updatedAt: string; lastMessagePreview: string;
};

export function useConversations() {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setConversations(await apiGet<ConversationSummary[]>('/api/conversations'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const create = useCallback(async (title?: string) => {
    const conv = await apiSend<{ id: string }>('/api/conversations', 'POST', { title });
    await refresh();
    return conv.id;
  }, [refresh]);

  const rename = useCallback(async (id: string, title: string) => {
    await apiSend(`/api/conversations/${id}`, 'PATCH', { title });
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/conversations/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { conversations, loading, refresh, create, rename, remove };
}
```

Create `src/lib/use-resumes.ts`：
```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

export type ResumeSummary = {
  id: string; name: string; sourceType: string; analyzed: boolean;
  createdAt: string; updatedAt: string;
};

export function useResumes() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const refresh = useCallback(async () => {
    setResumes(await apiGet<ResumeSummary[]>('/api/resumes'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  return { resumes, refresh };
}
```

- [x] **Step 2: 会话列表**

Create `src/components/sidebar/conversation-list.tsx`：
```tsx
'use client';
import { Button } from '@/src/components/ui/button';
import { cn } from '@/src/lib/utils';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function ConversationList({
  conversations, activeId, onSelect, onNew,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-1 p-2">
      <Button size="sm" variant="outline" className="mb-1" onClick={onNew}>＋ 新对话</Button>
      {conversations.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">暂无会话</p>
      )}
      {conversations.map((c) => (
        <button
          key={c.id}
          onClick={() => onSelect(c.id)}
          className={cn(
            'rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted',
            c.id === activeId && 'bg-muted font-medium',
          )}
        >
          <div className="truncate">{c.title}</div>
          {c.lastMessagePreview && (
            <div className="truncate text-xs text-muted-foreground">{c.lastMessagePreview}</div>
          )}
        </button>
      ))}
    </div>
  );
}
```

- [x] **Step 3: 资源库（第 1 期：简历列表）**

Create `src/components/sidebar/resource-tabs.tsx`：
```tsx
'use client';
import { useResumes } from '@/src/lib/use-resumes';
import { cn } from '@/src/lib/utils';

export function ResourceTabs({ onOpenResume }: { onOpenResume: (id: string) => void }) {
  const { resumes } = useResumes();
  return (
    <div className="flex h-full flex-col gap-1 p-2">
      <div className="flex gap-1 text-xs text-muted-foreground">
        <span className="rounded bg-muted px-2 py-1">简历</span>
        <span className="px-2 py-1">岗位（第 2 期）</span>
        <span className="px-2 py-1">专属简历（第 3 期）</span>
      </div>
      {resumes.length === 0 && (
        <p className="px-2 py-4 text-center text-xs text-muted-foreground">
          暂无简历，可在对话中粘贴文本或提供文件路径导入
        </p>
      )}
      {resumes.map((r) => (
        <button
          key={r.id}
          onClick={() => onOpenResume(r.id)}
          className={cn('rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted')}
        >
          <div className="truncate">{r.name}</div>
          <div className="text-xs text-muted-foreground">
            {r.analyzed ? '已分析' : '未分析'} · {r.sourceType}
          </div>
        </button>
      ))}
    </div>
  );
}
```

- [x] **Step 4: 左栏组装 + 主页面接入**

Create `src/components/sidebar/sidebar.tsx`：
```tsx
'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ConversationList } from './conversation-list';
import { ResourceTabs } from './resource-tabs';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function Sidebar({
  conversations, activeConversationId, onSelectConversation, onNewConversation, onOpenResume,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onOpenResume: (id: string) => void;
}) {
  const [tab, setTab] = useState<'conversations' | 'resources'>('conversations');
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'conversations' | 'resources')}>
        <TabsList className="m-2 grid w-[calc(100%-1rem)] grid-cols-2">
          <TabsTrigger value="conversations">会话</TabsTrigger>
          <TabsTrigger value="resources">资源</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="h-[calc(100%-3rem)]">
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={onSelectConversation}
            onNew={onNewConversation}
          />
        </TabsContent>
        <TabsContent value="resources" className="h-[calc(100%-3rem)]">
          <ResourceTabs onOpenResume={onOpenResume} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
```

Modify `app/page.tsx` 全文替换：
```tsx
'use client';
import { useCallback, useState } from 'react';
import { ChatPanel } from '@/src/components/chat/chat-panel';
import { Sidebar } from '@/src/components/sidebar/sidebar';
import { useConversations } from '@/src/lib/use-conversations';
import { apiGet } from '@/src/lib/api';
import type { UIMessage } from 'ai';

export default function Home() {
  const { conversations, refresh, create } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);

  const selectConversation = useCallback(async (id: string) => {
    setActiveId(id);
    setInitialMessages(await apiGet<UIMessage[]>(`/api/conversations/${id}/messages`));
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setInitialMessages([]);
  }, []);

  const handleCreated = useCallback(async () => {
    await refresh();
  }, [refresh]);

  return (
    <main className="flex h-screen">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={selectConversation}
        onNewConversation={newConversation}
        onOpenResume={() => {}}
      />
      <div className="flex-1">
        <ChatPanel
          key={activeId ?? 'new'}
          conversationId={activeId}
          initialMessages={initialMessages}
          onConversationCreated={handleCreated}
          onChatSettled={refresh}
        />
      </div>
    </main>
  );
}
```
> 注：`ChatPanel` 内 `useChat` 的 id 与服务端会话 id 的联动第 1 期以"服务端创建会话 + 刷新列表"为准（不做自动选中）；`create` 未用则从 useConversations 解构中移除。实现时按类型报错微调。

- [x] **Step 5: 构建验证与提交**

Run: `npm run build`
Expected: 编译通过。
```bash
git add app src && git commit -m "feat: 左栏双区（会话列表 + 资源库简历列表）"
```

### Task 12: 简历产物展示（卡片 + 抽屉）

**Files:**
- Create: `src/components/artifacts/resume-drawer.tsx`
- Create: `src/lib/use-resume-detail.ts`
- Modify: `src/components/sidebar/resource-tabs.tsx`、`app/page.tsx`

- [x] **Step 1: 简历详情 hook**

Create `src/lib/use-resume-detail.ts`：
```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet } from './api';

export type ResumeDetail = {
  id: string; name: string; sourceType: string; sourceText: string;
  analysis: {
    schemaVersion: number; overallScore: number;
    strengths: Array<{ point: string; evidence?: string }>;
    risks: Array<{ point: string; evidence?: string }>;
    improvements: Array<{ suggestion: string; priority: 'high' | 'medium' | 'low' }>;
    profile: { skills: string[]; experienceYears: number | null; targetRoles: string[]; targetCities: string[] };
    pendingConfirmations: string[];
  } | null;
  createdAt: string; updatedAt: string;
};

export function useResumeDetail(id: string | null) {
  const [detail, setDetail] = useState<ResumeDetail | null>(null);
  useEffect(() => {
    setDetail(null);
    if (!id) return;
    void apiGet<ResumeDetail>(`/api/resumes/${id}`).then(setDetail).catch(() => setDetail(null));
  }, [id]);
  return { detail };
}
```

- [x] **Step 2: 简历详情抽屉**

Create `src/components/artifacts/resume-drawer.tsx`：
```tsx
'use client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/src/components/ui/sheet';
import { Badge } from '@/src/components/ui/badge';
import { Separator } from '@/src/components/ui/separator';
import { useResumeDetail } from '@/src/lib/use-resume-detail';

export function ResumeDrawer({ resumeId, open, onOpenChange }: {
  resumeId: string | null; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  const { detail } = useResumeDetail(open ? resumeId : null);
  const analysis = detail?.analysis ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[480px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{detail?.name ?? '简历详情'}</SheetTitle>
        </SheetHeader>
        {!detail && <p className="text-sm text-muted-foreground">加载中…</p>}
        {detail && !analysis && (
          <p className="mt-4 text-sm text-muted-foreground">尚未分析，可在对话中让 Agent 分析这份简历。</p>
        )}
        {detail && analysis && (
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">{analysis.overallScore}</span>
              <span className="text-muted-foreground">/ 100 综合评分</span>
            </div>
            <div>
              <p className="mb-1 font-medium">技能</p>
              <div className="flex flex-wrap gap-1">
                {analysis.profile.skills.map((s) => <Badge key={s} variant="secondary">{s}</Badge>)}
              </div>
            </div>
            <div>
              <p className="mb-1 font-medium">优势</p>
              <ul className="list-disc space-y-1 pl-4">
                {analysis.strengths.map((s, i) => (
                  <li key={i}>{s.point}{s.evidence ? <span className="text-muted-foreground">（{s.evidence}）</span> : null}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium">风险 / 短板</p>
              <ul className="list-disc space-y-1 pl-4">
                {analysis.risks.map((r, i) => <li key={i}>{r.point}</li>)}
              </ul>
            </div>
            <div>
              <p className="mb-1 font-medium">改进建议</p>
              <ul className="list-disc space-y-1 pl-4">
                {analysis.improvements.map((im, i) => (
                  <li key={i}>
                    <span className={im.priority === 'high' ? 'font-medium' : undefined}>{im.suggestion}</span>
                  </li>
                ))}
              </ul>
            </div>
            {analysis.pendingConfirmations.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="mb-1 font-medium">待确认项</p>
                  <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                    {analysis.pendingConfirmations.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
```

- [x] **Step 3: 资源库接入抽屉 + 页面状态**

Modify `src/components/sidebar/resource-tabs.tsx`：保持 `onOpenResume` 签名不变。

Modify `app/page.tsx`：增加 `const [drawerResumeId, setDrawerResumeId] = useState<string | null>(null);`；`Sidebar onOpenResume={setDrawerResumeId}`；主区下方渲染 `<ResumeDrawer resumeId={drawerResumeId} open={drawerResumeId !== null} onOpenChange={(open) => { if (!open) setDrawerResumeId(null); }} />`；import ResumeDrawer。

- [x] **Step 4: 构建验证与提交**

Run: `npm run build`
Expected: 编译通过。
```bash
git add app src && git commit -m "feat: 简历产物展示（详情抽屉 + 资源库入口）"
```

### Task 13: 端到端验证与验收归档

**Files:**
- Modify: `docs/plans/2026-08-04-phase1-agent-resume.md`（归档状态）

- [x] **Step 1: 端到端验证（需真实 LLM key）**

Run: `npm run dev`
手动验证（浏览器 http://localhost:3000）：
1. 新会话输入："帮我分析这份简历：\n\n张三，3 年前端开发经验，熟练 Vue、TypeScript、Tailwind CSS…"（粘贴文本方式）
2. Expected：进度卡片依次出现"正在读取简历…"（importResume）→"正在分析简历…"（analyzeResume）→"完成"；assistant 消息总结评分与要点
3. 左栏"资源→简历"出现新简历且标记"已分析"
4. 点击简历项打开抽屉：评分、技能、优势、风险、建议完整渲染
5. 刷新页面：会话仍存在，消息完整恢复（标题、历史消息、分析摘要）
6. 验证 SQLite：`node -e "const D=require('better-sqlite3');const d=new D('data/job-helper.db');console.log(d.prepare('select id,name,analysis_json is not null as analyzed from resumes').all())"` → resumes 行存在且 analyzed=1

- [x] **Step 2: 验证异常路径**

1. 发送"帮我分析这份简历"（未导入）→ 模型应调用 analyzeResume 前先要求导入，或 importResume 提示缺参数（模型侧行为，确认不崩溃即可）
2. 输入 PDF 路径 → importResume 返回"不支持的格式"错误信息
3. 停止生成按钮可用

- [x] **Step 3: 回归构建与单测**

Run: `npm test && npm run build`
Expected: 单测全绿（resume-text 3 例、llm-call 3 例）；构建通过。

- [x] **Step 4: 计划归档**

- 本文件头部 `状态` 改为 `完成`
- 全部步骤 `- [ ]` 打勾
```bash
git add -A && git commit -m "docs: 第 1 期计划完成归档"
```

---

## 自审记录

**规格覆盖**：Agent 架构设计 3.1（llm-call→Task 4）、3.2（tool-factory→Task 5）、3.5（日志→工厂内 console 结构化行）、4.1（importResume/analyzeResume→Task 6/7）、5.1（对话协议→Task 8）、5.3（上下文 20 轮截断→Task 8 常量）、6.1（环境变量→Task 1/4）；数据结构 5 表→Task 2；API 设计端点（chat/conversations/messages/resumes）→Task 8/9；前端设计（聊天核心/会话栏/产物抽屉/资源库）→Task 10/11/12。确认点机制（applyJob 专属）第 1 期不实现，符合 6.4 分期。

**占位符**：无 TBD；环境变量值（LLM_API_KEY）由用户填写属预期输入。

**类型一致性**：`callStructured` 签名在 llm-call（Task 4）定义、tool-factory ctx（Task 5）引用、analyze-resume（Task 7）调用——三者一致；仓储函数名（createConversation/listMessages/createResume/updateResumeAnalysis 等）Task 3 定义、Task 8/9 引用一致；`resumeAnalysisSchemaV1` Task 7 定义、ToolProgress 类型 Task 10 定义、Task 10-12 组件间引用一致。
