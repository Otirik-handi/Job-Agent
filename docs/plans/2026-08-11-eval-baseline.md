# 评测基线（P2-1）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立双层评测基线——mock 层（scripted LanguageModel，入 vitest 防编排回归）+ 真实模型层（`npm run eval` CLI，pass^2 能力验证），共用 13 个求职场景定义。

**Architecture:** 前置两个小重构（DB 路径注入 `initDb` + model override 注入点）→ 从 chat 路由抽取 `runAgentTurn` 核心函数 → `tests/eval/` 下建场景定义/scripted mock model/共享 runner → mock 层经 `eval.test.ts` 进 vitest，真实层经 `run-eval.cli.ts`（tsx 运行）。场景 = 用户消息序列 + mock 调用脚本（占位符解析运行时 id）+ 终态断言，两层共用。

**Tech Stack:** vitest、ai SDK v7（`LanguageModelV4` / `ToolLoopAgent` / `createAgentUIStream` / `isStepCount`）、better-sqlite3（`:memory:`）、drizzle-orm migrator、tsx（CLI）。

**设计文档：** `docs/designs/2026-08-11-eval-baseline-design.md`

**相对设计文档的两处修正（实现时按本计划执行）：**
1. **场景 13 `history-recall` → `memory-recall`**：工具层无消息 FTS 检索工具（messages FTS 仅落库无检索工具），历史回忆通道是 `getMemory`（SYSTEM_PROMPT 明示）。场景改为"getMemory 回忆用户偏好"。
2. **`getModel()` 注入点**：`analyzeResume`/`matchJob`/`tailoredResume`/`prepareInterview`/`discoverChannels` 工具内部直接调 `getModel()`（tool-factory.ts:127 的 ctx.callStructured 由调用方传 model）。mock 层需 `model.ts` 增加 override 机制（Task 2），否则工具内部 LLM 调用绕过注入。

**关键事实（已核实，实现时直接引用）：**
- `LanguageModelV4`：`{ specificationVersion: 'v4', provider, modelId, supportedUrls, doGenerate, doStream }`；`doGenerate` 返回 `{ content: LanguageModelV4Content[], finishReason: { unified: 'stop'|'tool-calls'|... }, usage, warnings }`；tool-call 的 `input` 是 **stringified JSON**；`doStream` 返回 `{ stream: ReadableStream<LanguageModelV4StreamPart> }`
- 工具内部 `callStructured`（analyze/match/tailored/interview/channel）也会调 model——**mock 脚本序号必须覆盖这些调用**，返回符合 schema 的 JSON 文本；JSON 非法会触发 repair 重试（llm-call.ts 的 MAX_REPAIR_ATTEMPTS=2），打乱序号导致后续全部错位——脚本 JSON 必须一次合法
- `maybeGenerateSummary` 在 `historyRecords ≤ MAX_HISTORY_ROUNDS*2` 时不触发（summary.ts），评测场景消息量小，不会产生额外 LLM 调用
- planCreate/planUpdate/planRead 写 `data/plans/`（DEFAULT_PLANS_DIR 为模块加载时求值的 const，运行时不可注入）→ 评测用 `eval-` 前缀 taskId，runner 统一清理
- 固定 id 约定：setup 预插数据用固定 id（`resume-eval-1`、`job-eval-1`），运行中工具创建的 id（importResume 等）用占位符 `$<toolName>.<field>` 由 mock-model 从历史 tool-result 中解析

---

### Task 1: DB 路径注入（initDb）

**Files:**
- Modify: `src/db/index.ts`

- [ ] **Step 1: 改写 `src/db/index.ts`**

```ts
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';

let sqlite: Database.Database | null = null;

/** 初始化数据库连接（默认 data/job-helper.db；评测等隔离场景传 :memory: 或临时路径）。
 * 重复调用会关闭旧连接并替换全局 db——所有 repository 经 ESM live binding 读到新连接。 */
export function initDb(path: string = 'data/job-helper.db'): void {
  if (sqlite) sqlite.close();
  const next = new Database(path);
  next.pragma('journal_mode = WAL');
  next.pragma('foreign_keys = ON');
  sqlite = next;
  (db as unknown as { $client: Database.Database }).$client = next;
}

export const db = drizzle(sqlite!, { schema });
export { schema };
```

注意：drizzle 的 `db` 在模块加载时创建（`sqlite!` 非空断言 + 后续 initDb 更换底层 client 由 drizzle 的 `$client` 指向新连接；better-sqlite3 的 `drizzle` 实例内部经 `$client` 访问原生连接）。若实现后 `npm test` 出现连接问题，改用 `export let db` + initDb 内整体重建 db 的方案（repositories 经 live binding 读最新值）：

```ts
export let db: ReturnType<typeof drizzle<typeof schema>>;
export function initDb(path: string = 'data/job-helper.db'): void {
  if (sqlite) sqlite.close();
  const next = new Database(path);
  next.pragma('journal_mode = WAL');
  next.pragma('foreign_keys = ON');
  sqlite = next;
  db = drizzle(next, { schema });
}
```

- [ ] **Step 2: 创建 `vitest.config.ts`（关闭文件并行）**

initDb 是全局连接切换：任何测试文件 initDb 都会影响其他文件。vitest 默认文件并行，必须改为文件串行，否则评测/run-agent 测试会与直连 dev 库的既有测试互相污染。

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // initDb 全局连接切换：文件间串行执行，避免评测临时库与 dev 库测试互相污染
    fileParallelism: false,
  },
});
```

Run: `npx vitest run`
Expected: 184 个测试全绿（串行后耗时略增，秒级可接受）

- [ ] **Step 3: 验证现有测试不受影响**

Run: `npm test`
Expected: 184 个测试全绿（repository 经 live binding 读到默认连接，行为不变）

- [ ] **Step 4: 提交**

```bash
git add src/db/index.ts vitest.config.ts
git commit -m "refactor: db 连接支持 initDb 路径注入 + 测试文件串行化（评测隔离库前置）"
```

---

### Task 2: model override 注入点

**Files:**
- Modify: `src/agent/model.ts`
- Test: `src/agent/model-override.test.ts`

背景：5 个工具内部直接调 `getModel()`（analyzeResume/matchJob/tailoredResume/prepareInterview/discoverChannels）。mock 层必须让这些调用也拿到 scripted model。

- [ ] **Step 1: 写失败测试 `src/agent/model-override.test.ts`**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import type { LanguageModel } from 'ai';
import { getModel, setModelOverride, clearModelOverride, LlmConfigError } from './model';

const fake: LanguageModel = {
  specificationVersion: 'v4',
  provider: 'test',
  modelId: 'fake',
  supportedUrls: {},
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试桩不需要真实实现
  doGenerate: (async () => ({})) as any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- 测试桩不需要真实实现
  doStream: (async () => ({})) as any,
};

afterEach(() => {
  clearModelOverride();
});

describe('setModelOverride（评测注入点）', () => {
  it('设置后 getModel() 返回注入模型', () => {
    setModelOverride(fake);
    expect(getModel()).toBe(fake);
  });

  it('清除后恢复原逻辑（未配置环境变量时抛 LlmConfigError）', () => {
    // 依赖当前进程环境：无 LLM_* 时抛 LlmConfigError；有则返回真实模型实例（两种都可接受，不抛错即通过）
    setModelOverride(fake);
    clearModelOverride();
    if (!process.env.LLM_BASE_URL || !process.env.LLM_API_KEY || !process.env.LLM_MODEL) {
      expect(() => getModel()).toThrow(LlmConfigError);
    } else {
      expect(() => getModel()).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/model-override.test.ts`
Expected: FAIL（`setModelOverride` 未定义）

- [ ] **Step 3: 实现 `src/agent/model.ts` 注入**

在 `getModel` 前增加：

```ts
let modelOverride: LanguageModel | null = null;

/** 评测注入点：mock 层把 scripted model 设为全局 override（工具内部 getModel() 也走注入）；
 * 仅评测 runner 使用，业务路径不调用。 */
export function setModelOverride(model: LanguageModel | null): void {
  modelOverride = model;
}

export function clearModelOverride(): void {
  modelOverride = null;
}
```

`getModel()` 开头加一行：

```ts
export function getModel(): LanguageModel {
  if (modelOverride) return modelOverride;
  // ...原有逻辑不变
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/agent/model-override.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add src/agent/model.ts src/agent/model-override.test.ts
git commit -m "feat: model override 注入点（评测 mock 层前置，工具内部 getModel 可注入）"
```

---

### Task 3: scripted mock model（mock-model.ts）

**Files:**
- Create: `tests/eval/mock-model.ts`
- Test: `tests/eval/mock-model.test.ts`

- [ ] **Step 1: 写失败测试 `tests/eval/mock-model.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createScriptedModel } from './mock-model';

describe('createScriptedModel', () => {
  it('按调用序号依次返回 tool-call 与 text，input 的 JSON 序列化', async () => {
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'listResumes', input: {} },
      { type: 'text', text: '完成' },
    ]);
    const r1 = await model.doGenerate({} as never);
    expect(r1.content[0]).toMatchObject({ type: 'tool-call', toolName: 'listResumes' });
    expect(r1.content[0].type === 'tool-call' && JSON.parse(r1.content[0].input)).toEqual({});
    expect(r1.finishReason.unified).toBe('tool-calls');
    const r2 = await model.doGenerate({} as never);
    expect(r2.content[0]).toMatchObject({ type: 'text', text: '完成' });
    expect(r2.finishReason.unified).toBe('stop');
  });

  it('脚本未覆盖的调用抛错（提示序号）', async () => {
    const model = createScriptedModel([{ type: 'text', text: '只有一条' }]);
    await model.doGenerate({} as never);
    await expect(model.doGenerate({} as never)).rejects.toThrow(/unexpected LLM call #2/);
  });

  it('input 占位符 $<toolName>.<field> 从历史 tool-result 解析', async () => {
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'importResume', input: { text: '简历' } },
      { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: '$importResume.resumeId' } },
    ]);
    // 模拟第二轮调用时消息历史中含 importResume 的 tool-result
    const messages = [
      {
        role: 'assistant' as const,
        content: [
          { type: 'tool-call' as const, toolCallId: 'call_1', toolName: 'importResume', input: '{"text":"简历"}' },
        ],
      },
      {
        role: 'tool' as const,
        content: [
          {
            type: 'tool-result' as const, toolCallId: 'call_1', toolName: 'importResume',
            output: { ok: true, resumeId: 'resume-abc', name: '简历' }, isError: false,
          },
        ],
      },
    ];
    await model.doGenerate({} as never);
    const r2 = await model.doGenerate({ messages } as never);
    expect(r2.content[0].type === 'tool-call' && JSON.parse(r2.content[0].input)).toEqual({ resumeId: 'resume-abc' });
  });

  it('doStream 与 doGenerate 内容一致（tool-call / text / finish 分部）', async () => {
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'listResumes', input: {} },
      { type: 'text', text: '完成' },
    ]);
    const s1 = await model.doStream({} as never);
    const parts1: unknown[] = [];
    for await (const p of s1.stream) parts1.push(p);
    expect(parts1).toEqual([
      expect.objectContaining({ type: 'tool-input-start', toolName: 'listResumes' }),
      expect.objectContaining({ type: 'tool-input-end' }),
      expect.objectContaining({ type: 'tool-call', toolName: 'listResumes' }),
      expect.objectContaining({ type: 'finish' }),
    ]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/eval/mock-model.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `tests/eval/mock-model.ts`**

```ts
import type { LanguageModel } from 'ai';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';

export type MockResponse =
  | { type: 'tool-call'; toolName: string; input: Record<string, unknown> }
  | { type: 'text'; text: string };

type ToolResultRecord = { toolName: string; output: Record<string, unknown> };

/** 从消息历史提取最近的 tool-result 输出（供占位符解析） */
function extractToolResults(messages: unknown[]): ToolResultRecord[] {
  const results: ToolResultRecord[] = [];
  for (const m of messages as Array<{ role?: string; content?: unknown }>) {
    if (m.role !== 'tool' || !Array.isArray(m.content)) continue;
    for (const part of m.content as Array<{ type?: string; toolName?: string; output?: unknown }>) {
      if (part.type === 'tool-result' && part.toolName && part.output && typeof part.output === 'object') {
        results.push({ toolName: part.toolName, output: part.output as Record<string, unknown> });
      }
    }
  }
  return results;
}

/** 占位符 $<toolName>.<field>：取最近一次该工具结果的字段值；找不到则抛错（场景脚本 bug） */
function resolvePlaceholders(input: Record<string, unknown>, results: ToolResultRecord[]): string {
  const json = JSON.stringify(input);
  const resolved = json.replace(/\$([a-zA-Z][a-zA-Z0-9]*)\.([a-zA-Z][a-zA-Z0-9]*)/g, (_, toolName: string, field: string) => {
    const hit = [...results].reverse().find((r) => r.toolName === toolName);
    if (!hit) throw new Error(`占位符 $${toolName}.${field} 无法解析：历史中没有 ${toolName} 的工具结果`);
    const value = hit.output[field];
    if (value === undefined) throw new Error(`占位符 $${toolName}.${field} 无法解析：${toolName} 结果中无 ${field} 字段`);
    return JSON.stringify(value);
  });
  return resolved;
}

/**
 * scripted LanguageModel：按调用序号返回预设响应（跨轮全局累计）。
 * - tool-call 的 input 支持占位符 $<toolName>.<field>（运行时 id 从历史 tool-result 解析）
 * - 脚本未覆盖的调用抛错（unexpected LLM call），保证 mock 层完全确定性
 * - doStream 与 doGenerate 内容一致
 */
export function createScriptedModel(script: MockResponse[]): LanguageModel {
  let calls = 0;
  return {
    specificationVersion: 'v4',
    provider: 'job-helper-eval',
    modelId: 'scripted',
    supportedUrls: {},
    async doGenerate(params) {
      const response = script[calls];
      if (!response) {
        throw new Error(`unexpected LLM call #${calls + 1}：mock 脚本未覆盖（共 ${script.length} 条）。场景 mockScript 需补足该调用；注意工具内部 callStructured 调用也计入序号。`);
      }
      calls += 1;
      const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
      if (response.type === 'text') {
        return {
          content: [{ type: 'text' as const, text: response.text }],
          finishReason: { unified: 'stop' as const },
          usage,
          warnings: [],
        };
      }
      const results = extractToolResults((params.messages ?? []) as unknown[]);
      const input = resolvePlaceholders(response.input, results);
      return {
        content: [{ type: 'tool-call' as const, toolCallId: `call_${calls}`, toolName: response.toolName, input }],
        finishReason: { unified: 'tool-calls' as const },
        usage,
        warnings: [],
      };
    },
    async doStream(params) {
      const generated = await this.doGenerate(params);
      const parts: LanguageModelV4StreamPart[] = [];
      for (const c of generated.content) {
        if (c.type === 'text') {
          parts.push({ type: 'text-start', id: `t${calls}` });
          parts.push({ type: 'text-delta', id: `t${calls}`, delta: c.text });
          parts.push({ type: 'text-end', id: `t${calls}` });
        } else if (c.type === 'tool-call') {
          parts.push({ type: 'tool-input-start', id: c.toolCallId, toolName: c.toolName });
          parts.push({ type: 'tool-input-end', id: c.toolCallId });
          parts.push({ type: 'tool-call', toolCallId: c.toolCallId, toolName: c.toolName, input: c.input });
        }
      }
      parts.push({ type: 'finish', usage: generated.usage, finishReason: generated.finishReason });
      return {
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) {
            for (const p of parts) controller.enqueue(p);
            controller.close();
          },
        }),
      };
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run tests/eval/mock-model.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**

```bash
git add tests/eval/mock-model.ts tests/eval/mock-model.test.ts
git commit -m "feat: scripted mock model（按调用序号返回 + 占位符解析 + 未覆盖抛错）"
```

---

### Task 4: 抽取 runAgentTurn 核心函数

**Files:**
- Create: `src/agent/run-agent.ts`
- Modify: `app/api/chat/route.ts`
- Test: `src/agent/run-agent.test.ts`

背景：把 route.ts 的 Agent 循环组装抽成可复用函数（业务逻辑零变化），route 与评测共用。进度事件经可选回调保留在路由层，会话状态回写留在核心函数内。

- [ ] **Step 1: 写失败测试 `src/agent/run-agent.test.ts`（用 scripted model 跑通一轮）**

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createScriptedModel } from '../../tests/eval/mock-model';
import { initDb } from '../db';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { createConversation } from '../db/repositories/conversations';
import { listMessages } from '../db/repositories/messages';
import { db } from '../db';
import { runAgentTurn } from './run-agent';

function userMsg(text: string) {
  return { id: `u-${Date.now()}-${Math.random()}`, role: 'user' as const, parts: [{ type: 'text' as const, text }] };
}

beforeAll(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterAll(() => {
  // 恢复默认连接（后续测试文件各自初始化）
  initDb();
});

describe('runAgentTurn（完整 Agent 循环）', () => {
  it('mock model 驱动一轮：工具调用 + 最终文本，assistant 消息落库', async () => {
    const conv = createConversation('run-agent 冒烟');
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'importResume', input: { text: '张伟，前端开发 5 年，React、TypeScript' } },
      { type: 'text', text: '简历已导入，可继续分析。' },
    ]);
    const result = await runAgentTurn({
      conversationId: conv.id,
      messages: [userMsg('这是我的简历：张伟，前端开发 5 年，React、TypeScript')],
      model,
    });
    expect(result.messages.length).toBeGreaterThanOrEqual(1);
    const stored = listMessages(conv.id);
    expect(stored.filter((m) => m.role === 'assistant').length).toBeGreaterThanOrEqual(1);
    const allText = result.messages.map((m) => JSON.stringify(m.parts)).join('');
    expect(allText).toContain('简历已导入');
  });

  it('工具失败（不存在 resumeId）后脚本继续，不卡死', async () => {
    const conv = createConversation('run-agent 失败重试');
    const model = createScriptedModel([
      { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: 'not-exist' } },
      { type: 'text', text: '未找到简历，请先导入。' },
    ]);
    const result = await runAgentTurn({
      conversationId: conv.id,
      messages: [userMsg('帮我分析简历')],
      model,
    });
    const allText = result.messages.map((m) => JSON.stringify(m.parts)).join('');
    expect(allText).toContain('未找到简历');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/run-agent.test.ts`
Expected: FAIL（`run-agent` 模块不存在）

- [ ] **Step 3: 创建 `src/agent/run-agent.ts`**

从 route.ts 迁移组装逻辑（progress 事件改为可选回调，状态回写保留在核心内）：

```ts
import { createAgentUIStream, createUIMessageStream, isStepCount, readUIMessageStream, ToolLoopAgent, type UIMessage } from 'ai';
import type { LanguageModel } from 'ai';
import { getModel } from './model';
import { getTools, SYSTEM_PROMPT } from './agent';
import { buildSystemPrompt } from './context';
import { MAX_HISTORY_ROUNDS, maybeGenerateSummary } from './summary';
import { getConversation, touchConversation } from '../db/repositories/conversations';
import { insertMessage, listMessages } from '../db/repositories/messages';
import { listMemoryBlocks } from '../db/repositories/memory-blocks';
import { getSessionState, setSessionState } from '../db/repositories/session-state';

export type SessionStatePatch = { currentResumeId?: string; currentJobId?: string };

/** 从工具成功结果中提取会话状态补丁；无法提取时返回 null（其他工具成功不更新状态） */
export function sessionStatePatchFromTool(toolName: string, output: unknown): SessionStatePatch | null {
  if (typeof output !== 'object' || output === null) return null;
  const o = output as Record<string, unknown>;
  switch (toolName) {
    case 'importJobOpportunity': {
      const id = o.jobOpportunityId;
      return typeof id === 'string' && id ? { currentJobId: id } : null;
    }
    case 'importResume': {
      const id = o.resumeId;
      return typeof id === 'string' && id ? { currentResumeId: id } : null;
    }
    case 'analyzeResume': {
      const id = o.resumeId;
      return o.ok === true && typeof id === 'string' && id ? { currentResumeId: id } : null;
    }
    case 'matchJob': {
      const id = o.jobOpportunityId;
      return o.ok === true && typeof id === 'string' && id ? { currentJobId: id } : null;
    }
    default:
      return null;
  }
}

/** 先读旧会话状态再合并补丁回写（避免覆盖）；异常仅记录日志，不阻断主流程 */
function persistSessionState(conversationId: string, patch: SessionStatePatch): void {
  try {
    const prev = getSessionState(conversationId);
    let prevState: Record<string, unknown> = {};
    if (prev) {
      try {
        const parsed = JSON.parse(prev.stateJson) as unknown;
        if (typeof parsed === 'object' && parsed !== null) {
          prevState = parsed as Record<string, unknown>;
        }
      } catch {
        // 旧状态 JSON 损坏则忽略，从空状态开始合并
      }
    }
    setSessionState(conversationId, JSON.stringify({ ...prevState, ...patch }));
  } catch (err) {
    console.error(`[session-state] 回写失败 conversationId=${conversationId}:`, err);
  }
}

export type ToolProgressEvent = {
  toolName: string;
  status: 'running' | 'completed' | 'failed';
  message: string;
};

export type AgentTurnResult = {
  conversationId: string;
  /** 本轮新增的 assistant 消息（含工具调用过程） */
  messages: UIMessage[];
};

const TOOL_PROGRESS_TEXT: Record<string, string> = {
  importResume: '正在读取简历…',
  analyzeResume: '正在分析简历…',
  importJobOpportunity: '正在保存岗位信息…',
  matchJob: '正在匹配岗位…',
  discoverChannels: '正在发现投递渠道…',
  tailoredResume: '正在生成专属简历…',
  applyJob: '正在更新投递状态…',
  recordApplicationStatus: '正在记录投递后状态…',
  prepareInterview: '正在准备面试…',
};

/** 工具业务失败判定：{ ok:false, error } 结构化错误结果视为失败（对齐 createDomainTool 契约） */
export function isBusinessFailure(toolOutput: unknown): boolean {
  return (
    typeof toolOutput === 'object' &&
    toolOutput !== null &&
    (toolOutput as { ok?: unknown }).ok === false
  );
}

/**
 * Agent 回合核心：查历史 → 合并去重 → 截断 → 组装分层 prompt → ToolLoopAgent 循环
 * → 收集输出 → 持久化 → 返回新增 assistant 消息。route 与评测 runner 共用。
 * 业务逻辑与 route.ts 原 POST 等价（进度事件经 onToolProgress 回调交给路由层渲染）。
 */
export async function runAgentTurn(options: {
  conversationId: string;
  messages: UIMessage[];
  model?: LanguageModel;
  onToolProgress?: (event: ToolProgressEvent) => void;
}): Promise<AgentTurnResult> {
  const { conversationId, messages: incoming, model = getModel(), onToolProgress } = options;

  const historyRecords = listMessages(conversationId);
  const history: UIMessage[] = historyRecords
    .map((r) => {
      try { return JSON.parse(r.messageJson) as UIMessage; } catch { return null; }
    })
    .filter((m): m is UIMessage => m !== null);
  const merged = [...history, ...incoming];
  const trimmed = merged.slice(-MAX_HISTORY_ROUNDS * 2);

  // 入站消息按 id 去重：多步 Agent 循环中客户端会自动重发消息历史，避免同 id 重复记录
  const existingIds = new Set<string>();
  for (const r of historyRecords) {
    try {
      const mid = (JSON.parse(r.messageJson) as { id?: string }).id;
      if (mid) existingIds.add(mid);
    } catch { /* 忽略无法解析的存量记录 */ }
  }
  for (const msg of incoming) {
    const msgId = msg.id;
    if (msgId && existingIds.has(msgId)) continue;
    insertMessage(conversationId, msg.role, JSON.stringify(msg));
    if (msgId) existingIds.add(msgId);
  }

  // 分层 system prompt：基础提示 + 当前记忆块 + 会话级摘要（首次截断时生成，常驻注入）+ 会话结构化状态
  const memoryBlocks = listMemoryBlocks();
  const sessionState = getSessionState(conversationId);
  // 摘要生成/读取走降级通道：失败不影响本次请求（内部不抛错）
  const conversationSummary = await maybeGenerateSummary(conversationId, historyRecords);
  const instructions = buildSystemPrompt({
    memoryBlocks,
    sessionState: sessionState ? sessionState.stateJson : null,
    conversationSummary,
  });

  const agent = new ToolLoopAgent({
    model,
    instructions,
    tools: getTools(),
    stopWhen: isStepCount(5),
    onToolExecutionStart: ({ toolCall }) => {
      if (onToolProgress) {
        onToolProgress({
          toolName: toolCall.toolName,
          status: 'running',
          message: TOOL_PROGRESS_TEXT[toolCall.toolName] ?? '正在处理…',
        });
      }
    },
    onToolExecutionEnd: ({ toolCall, toolOutput }) => {
      const toolName = toolCall.toolName;
      // 业务失败（{ ok:false, error } 结构化错误结果）与抛异常同等视为失败
      const success = toolOutput.type === 'tool-result' && !isBusinessFailure(toolOutput.output);
      if (onToolProgress) {
        onToolProgress({
          toolName,
          status: success ? 'completed' : 'failed',
          message: success ? '完成' : '失败',
        });
      }
      // 工具成功执行后回写会话状态（导入/分析/匹配成功 → currentJobId / currentResumeId）
      if (success) {
        const patch = sessionStatePatchFromTool(toolName, toolOutput.output);
        if (patch) persistSessionState(conversationId, patch);
      }
    },
  });

  const stream = await createAgentUIStream({ agent, uiMessages: trimmed });
  const [, collectSide] = stream.tee();
  const collected: UIMessage[] = [];
  const collector = (async () => {
    for await (const msg of readUIMessageStream({ stream: collectSide })) {
      collected.push(msg);
    }
    const byId = new Map<string, UIMessage>();
    for (const m of collected) byId.set(m.id, m);
    for (const m of byId.values()) {
      if (m.role === 'assistant') {
        // 服务端生成的 UIMessage 可能无 id（id 由客户端 useChat 生成）：持久化前补 UUID
        const withId = m.id ? m : { ...m, id: crypto.randomUUID() };
        insertMessage(conversationId, 'assistant', JSON.stringify(withId));
      }
    }
    touchConversation(conversationId);
  })();
  await collector;

  const byId = new Map<string, UIMessage>();
  for (const m of collected) byId.set(m.id, m);
  return { conversationId, messages: [...byId.values()].filter((m) => m.role === 'assistant') };
}
```

注意：`crypto.randomUUID()` 为 Node 20+ 全局（route.ts 原来用 `node:crypto` 的 randomUUID，等价；若环境不支持全局 crypto，改回 `import { randomUUID } from 'node:crypto'`）。

- [ ] **Step 4: 改造 `app/api/chat/route.ts` 复用 runAgentTurn**

删除 route.ts 内原 execute 中的组装逻辑（`memoryBlocks`/`sessionState`/`maybeGenerateSummary`/`ToolLoopAgent`/`createAgentUIStream`/collector/`sessionStatePatchFromTool`/`persistSessionState`），替换为：

```ts
import { runAgentTurn, sessionStatePatchFromTool } from '@/src/agent/run-agent';
```

（`sessionStatePatchFromTool`/`persistSessionState` 已移至 run-agent.ts，route.ts 不再需要；`getModel`/`getTools`/`buildSystemPrompt`/`MAX_HISTORY_ROUNDS`/`maybeGenerateSummary`/`listMemoryBlocks`/`getSessionState`/`insertMessage`/`listMessages` 的 import 相应移除——以 tsc 报错为准逐一清理。）

execute 内替换为：

```ts
    execute: async ({ writer }) => {
      writer.write({
        type: 'data-conversation-id',
        data: { conversationId: convId },
        transient: true,
      });
      await runAgentTurn({
        conversationId: convId,
        messages: trimmed,
        onToolProgress: (event) => {
          writer.write({
            type: 'data-tool-progress',
            data: { toolName: event.toolName, status: event.status, message: event.message },
            transient: true,
          });
        },
      });
    },
```

注意：`trimmed` 在 route.ts 中原先只用于 `createAgentUIStream`，改造后 runAgentTurn 内部重新读取历史（含本轮已持久化的 incoming 去重逻辑）——**行为等价性要求**：runAgentTurn 内部合并历史与 incoming 的逻辑与 route 原实现完全一致（均已实现于 Task 4 Step 3）。改造后 `trimmed` 变量不再需要，route.ts 删除对应代码。

- [ ] **Step 5: 全量验证**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全部通过（原 184 + run-agent 2 + model-override 2 + mock-model 4）

- [ ] **Step 6: 提交**

```bash
git add src/agent/run-agent.ts src/agent/run-agent.test.ts app/api/chat/route.ts
git commit -m "refactor: 抽取 runAgentTurn 核心函数（route 与评测共用，进度事件回调化）"
```

---
### Task 5: 共享 runner + mock 层入口（eval.test.ts）+ 模板场景

**Files:**
- Create: `tests/eval/runner.ts`
- Create: `tests/eval/scenarios/types.ts`
- Create: `tests/eval/scenarios/resume-analysis.ts`
- Create: `tests/eval/eval.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 定义场景类型 `tests/eval/scenarios/types.ts`**

```ts
import type { UIMessage } from 'ai';
import type { MockResponse } from '../mock-model';

export type ScenarioContext = {
  /** 原生 SQL 查询（返回第一行或 null；query 为参数化 sql 字符串） */
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T | null;
  /** 原生 SQL 执行（写操作） */
  exec: (sql: string, params?: unknown[]) => void;
  /** 读取某次 runAgentTurn 后新增的 assistant 消息全文文本 */
  lastAssistantText: () => string;
  /** 全部轮次的 assistant 消息文本（按顺序拼接） */
  allAssistantText: () => string;
};

export type Scenario = {
  id: string;
  family: 'high-frequency' | 'orchestration' | 'recovery';
  description: string;
  /** 在临时库注入初始数据（固定 id 约定：resume-eval-1 / job-eval-1 …） */
  setup: (ctx: ScenarioContext) => void;
  /** 依次作为用户消息走完整 Agent 循环 */
  userMessages: string[];
  /** mock 层专用：全场景调用序列（跨轮累计；含工具内部 callStructured 调用） */
  mockScript: MockResponse[];
  /** 终态断言（DB + 消息流；vitest expect 直接使用） */
  assertFinalState: (ctx: ScenarioContext) => void;
};

/** 把用户文本构造成 UIMessage */
export function toUserMessage(text: string, index: number): UIMessage {
  return { id: `eval-user-${index}`, role: 'user', parts: [{ type: 'text', text }] };
}
```

- [ ] **Step 2: 实现共享 runner `tests/eval/runner.ts`**

```ts
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { LanguageModel } from 'ai';
import type Database from 'better-sqlite3';
import { initDb, db } from '../../src/db';
import { createConversation } from '../../src/db/repositories/conversations';
import { clearModelOverride, setModelOverride } from '../../src/agent/model';
import { runAgentTurn } from '../../src/agent/run-agent';
import { toUserMessage, type Scenario, type ScenarioContext } from './scenarios/types';
import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const PLANS_DIR = path.resolve(process.cwd(), 'data', 'plans');

/** 清理评测产生的计划文件（eval- 前缀；评测与 dev 库共用 data/plans/，见计划文档 Task 说明） */
function cleanupEvalPlans(): void {
  try {
    for (const file of readdirSync(PLANS_DIR)) {
      if (file.startsWith('eval-')) rmSync(path.join(PLANS_DIR, file));
    }
  } catch { /* 目录不存在则忽略 */ }
}

/** initDb 后的原生 better-sqlite3 连接（drizzle 实例经 $client 暴露） */
function rawDb(): Database.Database {
  return (db as unknown as { $client: Database.Database }).$client;
}

export type ScenarioResult =
  | { ok: true; scenarioId: string; messageCount: number }
  | { ok: false; scenarioId: string; error: string; messageCount: number };

/** 执行单个场景（临时库隔离；mock/真实两层共用）。结束后恢复默认连接（initDb）供后续测试文件使用 */
export async function runScenario(
  scenario: Scenario,
  opts: { model: LanguageModel },
): Promise<ScenarioResult> {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
  cleanupEvalPlans();

  const assistantTexts: string[] = [];
  const ctx: ScenarioContext = {
    query: <T = Record<string, unknown>>(sqlStr: string, params: unknown[] = []): T | null => {
      const row = rawDb().prepare(sqlStr).get(...params);
      return (row as T | undefined) ?? null;
    },
    exec: (sqlStr: string, params: unknown[] = []) => {
      rawDb().prepare(sqlStr).run(...params);
    },
    lastAssistantText: () => assistantTexts[assistantTexts.length - 1] ?? '',
    allAssistantText: () => assistantTexts.join('\n'),
  };

  const conversation = createConversation(scenario.id);
  setModelOverride(opts.model);
  try {
    scenario.setup(ctx);
    for (let i = 0; i < scenario.userMessages.length; i++) {
      const result = await runAgentTurn({
        conversationId: conversation.id,
        messages: [toUserMessage(scenario.userMessages[i], i)],
        model: opts.model,
      });
      for (const m of result.messages) {
        const text = m.parts
          .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
          .map((p) => p.text)
          .join('');
        if (text) assistantTexts.push(text);
      }
    }
    scenario.assertFinalState(ctx);
    return { ok: true, scenarioId: scenario.id, messageCount: assistantTexts.length };
  } catch (err) {
    return {
      ok: false,
      scenarioId: scenario.id,
      error: err instanceof Error ? err.message : String(err),
      messageCount: assistantTexts.length,
    };
  } finally {
    clearModelOverride();
    cleanupEvalPlans();
    // 恢复默认连接：评测临时库只在本场景内有效，供后续测试文件（串行）正常使用 dev 库
    initDb();
  }
}
```

- [ ] **Step 3: 模板场景 `tests/eval/scenarios/resume-analysis.ts`（高频族 1/5）**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript、Node.js\n项目：参与 XX 电商平台前端架构设计，主导组件库建设';

export const resumeAnalysisScenario: Scenario = {
  id: 'resume-analysis',
  family: 'high-frequency',
  description: '用户粘贴简历 → agent 导入并分析，产出评分卡（readSkill + importResume + analyzeResume 完整链路）',
  setup: () => { /* 空库起步，全链路从粘贴开始 */ },
  userMessages: [`这是我的简历，帮我分析一下：\n${RESUME_TEXT}`],
  mockScript: [
    { type: 'tool-call', toolName: 'importResume', input: { text: RESUME_TEXT } },
    { type: 'tool-call', toolName: 'readSkill', input: { skillName: 'resume-analysis' } },
    { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: '$importResume.resumeId' } },
    // analyzeResume 内部 callStructured：符合 resumeAnalysisSchemaV1 的 JSON
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        overallScore: 72,
        strengths: [{ point: '前端经验 5 年，技术栈匹配度高', evidence: '前端开发工程师，5 年经验' }],
        risks: [{ point: '缺少量化成果描述', evidence: '参与 XX 电商平台前端架构设计' }],
        improvements: [{ suggestion: '补充项目量化指标', priority: 'high' }],
        profile: {
          skills: ['React', 'TypeScript', 'Node.js'],
          experienceYears: 5,
          targetRoles: ['前端工程师'],
          targetCities: [],
        },
        pendingConfirmations: ['推测 5 年前端经验，请确认'],
      }),
    },
    { type: 'text', text: '简历分析完成：整体评分 72 分。优势是 5 年前端经验与 React/TypeScript 技术栈；风险是缺少量化成果，建议补充项目指标。' },
  ],
  assertFinalState: (ctx) => {
    const resume = ctx.query<{ analysis_json: string | null }>('SELECT analysis_json FROM resumes LIMIT 1');
    expect(resume?.analysis_json).not.toBeNull();
    expect(JSON.parse(resume!.analysis_json!)).toMatchObject({ overallScore: 72 });
    expect(ctx.allAssistantText()).toContain('72');
    // 会话状态回写：currentResumeId 应指向导入的简历
    const state = ctx.query<{ state_json: string }>('SELECT state_json FROM session_state LIMIT 1');
    expect(state).not.toBeNull();
    expect(JSON.parse(state!.state_json)).toHaveProperty('currentResumeId');
  },
};
```

- [ ] **Step 4: mock 层入口 `tests/eval/eval.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { createScriptedModel } from './mock-model';
import { runScenario } from './runner';
import { scenarios } from './scenarios';

describe.each(scenarios.map((s) => [s.id, s] as const))('评测场景 %s', (_id, scenario) => {
  it(scenario.description, async () => {
    const result = await runScenario(scenario, { model: createScriptedModel(scenario.mockScript) });
    expect(result.ok, result.ok ? '' : `失败：${result.error}\n（若为 unexpected LLM call，需补 mockScript；若为断言失败，见场景 assertFinalState）`).toBe(true);
  }, 60_000);
});
```

注意：`scenarios` 索引文件在 Task 6-8 逐步追加场景，Task 5 先只含 resume-analysis（见 Step 6），后续任务把其余场景加入数组。

- [ ] **Step 5: 场景索引 `tests/eval/scenarios/index.ts`（初始仅 1 个）**

```ts
import type { Scenario } from './types';
import { resumeAnalysisScenario } from './resume-analysis';

export const scenarios: Scenario[] = [
  resumeAnalysisScenario,
];
```

- [ ] **Step 6: 运行确认**

Run: `npx vitest run tests/eval/eval.test.ts`
Expected: PASS（1 个场景；若 unexpected LLM call 或断言失败，按错误信息调整——首次跑通管线是本节目标）

若 `unexpected LLM call`：检查调用序号（importResume/readSkill/analyzeResume 后必须紧跟一个 text JSON 响应，共 5 条）；若断言失败：用 `ctx.allAssistantText()` 输出的实际消息核对。

- [ ] **Step 7: 提交**

```bash
git add tests/eval/runner.ts tests/eval/scenarios/ tests/eval/eval.test.ts
git commit -m "feat: 评测 runner + mock 层入口 + 模板场景（resume-analysis 跑通管线）"
```

---

### Task 6: 高频实用族场景（jd-match / interview-prep / offer-compare / cover-letter）

**Files:**
- Create: `tests/eval/scenarios/jd-match.ts`
- Create: `tests/eval/scenarios/interview-prep.ts`
- Create: `tests/eval/scenarios/offer-compare.ts`
- Create: `tests/eval/scenarios/cover-letter.ts`
- Modify: `tests/eval/scenarios/index.ts`

每个场景独立文件；完成 4 个后统一跑 mock 层验证。

- [ ] **Step 1: `tests/eval/scenarios/jd-match.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n要求：1. 本科及以上学历\n2. 5 年以上前端开发经验，熟悉 React\n3. 有大型电商项目经验\n工作地点：北京\n薪资：25-35k';

const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript、Node.js\n项目：参与 XX 电商平台前端架构设计，主导组件库建设';

/** 与 resumeAnalysisSchemaV1 一致的最小合法分析产物（setup 预插，跳过分析环节） */
const ANALYSIS_JSON = JSON.stringify({
  schemaVersion: 1,
  overallScore: 70,
  strengths: [{ point: '前端经验 5 年' }],
  risks: [],
  improvements: [],
  profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] },
  pendingConfirmations: [],
});

export const jdMatchScenario: Scenario = {
  id: 'jd-match',
  family: 'high-frequency',
  description: '用户给 JD → agent 导入岗位并匹配（importJobOpportunity + matchJob），产出匹配结论',
  setup: (ctx) => {
    ctx.exec(
      "INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))",
      [RESUME_TEXT, ANALYSIS_JSON],
    );
  },
  userMessages: [`帮我看看这个岗位适不适合我：\n${JD_TEXT}`],
  mockScript: [
    { type: 'tool-call', toolName: 'importJobOpportunity', input: { text: JD_TEXT } },
    { type: 'tool-call', toolName: 'matchJob', input: { jobOpportunityId: '$importJobOpportunity.jobOpportunityId' } },
    // matchJob 内部 callStructured：符合 jobMatchResultSchemaV1，fitResults 必须引用存在的 requirementId
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        understanding: {
          company: 'XX 科技',
          title: '高级前端工程师',
          requirements: [
            { id: 'r1', text: '本科及以上学历', type: 'education' },
            { id: 'r2', text: '5 年以上前端经验，熟悉 React', type: 'experience' },
            { id: 'r3', text: '大型电商项目经验', type: 'experience' },
          ],
          city: '北京',
          level: '高级',
          tags: ['React', '电商'],
        },
        fitResults: [
          { requirementId: 'r1', level: 'matched', evidence: '简历未明确学历，需确认', note: '学历未在简历中体现' },
          { requirementId: 'r2', level: 'highly-matched', evidence: '前端开发工程师，5 年经验', note: '经验与技能均匹配' },
          { requirementId: 'r3', level: 'matched', evidence: '参与 XX 电商平台前端架构设计', note: '有电商项目背景' },
        ],
        overallScore: 85,
        risks: [{ point: '学历信息缺失', evidence: '简历无学历字段' }],
        advice: {
          mustFix: ['补充学历信息'],
          resumeAdjustments: ['突出电商架构经验'],
          talkingPoints: ['组件库建设与性能优化'],
          truthBoundary: '不得虚构经历、技能、雇主、证书',
        },
      }),
    },
    { type: 'text', text: '匹配完成：整体匹配度 85 分。经验与 React 技能高度匹配；风险是学历未在简历体现，建议补充。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ fit_result_json: string | null }>('SELECT fit_result_json FROM job_opportunities LIMIT 1');
    expect(job?.fit_result_json).not.toBeNull();
    expect(JSON.parse(job!.fit_result_json!)).toMatchObject({ overallScore: 85 });
    expect(ctx.allAssistantText()).toContain('85');
  },
};
```

- [ ] **Step 2: `tests/eval/scenarios/interview-prep.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n要求：5 年以上前端经验，熟悉 React\n工作地点：北京';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript\n项目：主导 XX 电商平台组件库建设';
const ANALYSIS_JSON = JSON.stringify({
  schemaVersion: 1,
  overallScore: 70,
  strengths: [{ point: '前端经验 5 年' }],
  risks: [],
  improvements: [],
  profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] },
  pendingConfirmations: [],
});
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '5 年以上前端经验', type: 'experience' }], city: '北京', level: '高级', tags: ['React'] },
  fitResults: [{ requirementId: 'r1', level: 'highly-matched', evidence: '前端开发工程师，5 年经验', note: '匹配' }],
  overallScore: 85,
  risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: ['组件库建设'], truthBoundary: '不得虚构' },
});

export const interviewPrepScenario: Scenario = {
  id: 'interview-prep',
  family: 'high-frequency',
  description: '已匹配岗位 → 用户要求面试准备（prepareInterview 生成准备包）',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'saved', ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON]);
  },
  userMessages: ['帮我准备这家公司的面试'],
  mockScript: [
    { type: 'tool-call', toolName: 'prepareInterview', input: { jobOpportunityId: 'job-eval-1' } },
    // prepareInterview 内部 callStructured：符合 interviewPrepSchemaV1
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        companyBrief: 'XX 科技，高级前端工程师岗，要求 5 年前端经验与 React',
        selfIntro: '我是一名有 5 年经验的前端工程师，主导过电商平台组件库建设…',
        questions: [
          { id: 'q1', question: '请介绍一个你主导的组件库项目', intent: '考察项目深度与架构能力', answerPoints: ['背景', '方案', '结果'], evidence: '主导 XX 电商平台组件库建设', risk: null },
        ],
        askThem: ['团队前端技术栈演进方向？'],
      }),
    },
    { type: 'text', text: '面试准备包已生成：1 个核心预测问题 + 提问清单，完整内容可在岗位详情查看。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ interview_prep_json: string | null }>('SELECT interview_prep_json FROM job_opportunities WHERE id = ?', ['job-eval-1']);
    expect(job?.interview_prep_json).not.toBeNull();
    expect(JSON.parse(job!.interview_prep_json!)).toMatchObject({ companyBrief: expect.stringContaining('XX 科技') });
  },
};
```

- [ ] **Step 3: `tests/eval/scenarios/offer-compare.ts`（skill 文本链路，无业务工具）**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

export const offerCompareScenario: Scenario = {
  id: 'offer-compare',
  family: 'high-frequency',
  description: '两个 offer 对比 → readSkill(offer-evaluation) 后输出对比建议',
  setup: () => { /* 纯知识问答，无需初始数据 */ },
  userMessages: ['我现在有两个 offer：A 公司 25k 双休 vs B 公司 30k 大小周，都在北京，帮我对比下'],
  mockScript: [
    { type: 'tool-call', toolName: 'readSkill', input: { skillName: 'offer-evaluation' } },
    { type: 'text', text: '对比建议：A 公司 25k 双休，时薪与生活质量更优；B 公司 30k 大小周，月薪多 5k 但每月多上约 4 天班。建议结合成长空间、通勤与公积金基数综合判断。' },
  ],
  assertFinalState: (ctx) => {
    expect(ctx.allAssistantText()).toContain('25k');
    expect(ctx.allAssistantText()).toContain('30k');
  },
};
```

- [ ] **Step 4: `tests/eval/scenarios/cover-letter.ts`（skill 文本链路）**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

export const coverLetterScenario: Scenario = {
  id: 'cover-letter',
  family: 'high-frequency',
  description: '针对岗位写求职信 → readSkill(cover-letter-generation) 后产出求职信',
  setup: () => { /* 纯知识问答 */ },
  userMessages: ['帮我对 XX 科技的高级前端工程师岗位写一封求职信'],
  mockScript: [
    { type: 'tool-call', toolName: 'readSkill', input: { skillName: 'cover-letter-generation' } },
    { type: 'text', text: '尊敬的招聘团队：\n您好！我是张伟，一名有 5 年经验的前端工程师，看到贵司高级前端工程师岗位后非常感兴趣……\n此致敬礼' },
  ],
  assertFinalState: (ctx) => {
    const text = ctx.allAssistantText();
    expect(text).toContain('尊敬的');
    expect(text).toContain('前端');
  },
};
```

- [ ] **Step 5: 更新 `tests/eval/scenarios/index.ts`**

```ts
import type { Scenario } from './types';
import { resumeAnalysisScenario } from './resume-analysis';
import { jdMatchScenario } from './jd-match';
import { interviewPrepScenario } from './interview-prep';
import { offerCompareScenario } from './offer-compare';
import { coverLetterScenario } from './cover-letter';

export const scenarios: Scenario[] = [
  resumeAnalysisScenario,
  jdMatchScenario,
  interviewPrepScenario,
  offerCompareScenario,
  coverLetterScenario,
];
```

- [ ] **Step 6: 运行确认**

Run: `npx vitest run tests/eval/eval.test.ts`
Expected: PASS（5 个场景）

- [ ] **Step 7: 提交**

```bash
git add tests/eval/scenarios/
git commit -m "feat: 评测高频族场景（jd-match/interview-prep/offer-compare/cover-letter）"
```

---

### Task 7: 编排压力族场景（tailored-resume / apply-job / plan-task / record-status）

**Files:**
- Create: `tests/eval/scenarios/tailored-resume.ts`
- Create: `tests/eval/scenarios/apply-job.ts`
- Create: `tests/eval/scenarios/plan-task.ts`
- Create: `tests/eval/scenarios/record-status.ts`
- Modify: `tests/eval/scenarios/index.ts`

- [ ] **Step 1: `tests/eval/scenarios/tailored-resume.ts`**

关键约束：第一段建议 JSON 的 `sourceText` 必须逐字匹配简历原文（validateEdits 唯一匹配校验）；第二段 `confirmedEdits` 的 `sourceText` 同前。

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n要求：5 年以上前端经验，熟悉 React';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript\n项目：主导 XX 电商平台组件库建设';
const ANALYSIS_JSON = JSON.stringify({
  schemaVersion: 1, overallScore: 70,
  strengths: [{ point: '前端经验 5 年' }], risks: [], improvements: [],
  profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] },
  pendingConfirmations: [],
});
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '5 年以上前端经验', type: 'experience' }], city: '北京', level: '高级', tags: ['React'] },
  fitResults: [{ requirementId: 'r1', level: 'highly-matched', evidence: '前端开发工程师，5 年经验', note: '匹配' }],
  overallScore: 85, risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: [], truthBoundary: '不得虚构' },
});

const SOURCE_FRAGMENT = '前端开发工程师，5 年经验';
const SUGGESTED_TEXT = '前端开发工程师，5 年经验，主导过电商组件库建设';

export const tailoredResumeScenario: Scenario = {
  id: 'tailored-resume',
  family: 'orchestration',
  description: '两段式强确认：出建议清单 → 用户确认 → 生成专属简历落库',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'saved', ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON]);
  },
  userMessages: ['针对这个岗位帮我生成专属简历', '确认，按建议修改'],
  mockScript: [
    // 第一段：tailoredResume 建议阶段
    { type: 'tool-call', toolName: 'tailoredResume', input: { jobOpportunityId: 'job-eval-1', resumeId: 'resume-eval-1' } },
    // 内部 callStructured：resumeEditSuggestionsSchemaV1；sourceText 必须逐字匹配简历原文
    {
      type: 'text',
      text: JSON.stringify({
        schemaVersion: 1,
        edits: [
          { id: 'e1', section: 'experience', sourceText: SOURCE_FRAGMENT, suggestedText: SUGGESTED_TEXT, reason: '对齐 r1：突出 5 年经验与组件库建设', factRisk: 'confirmed' },
        ],
      }),
    },
    { type: 'text', text: '已生成 1 条替换建议（1 条事实重述）：将「前端开发工程师，5 年经验」调整为「前端开发工程师，5 年经验，主导过电商组件库建设」。请确认是否按此修改。' },
    // 第二段：携带 confirmedEdits 生成（用户确认消息后）
    { type: 'tool-call', toolName: 'tailoredResume', input: { jobOpportunityId: 'job-eval-1', resumeId: 'resume-eval-1', confirmedEdits: [{ id: 'e1', sourceText: SOURCE_FRAGMENT, suggestedText: SUGGESTED_TEXT }] } },
    { type: 'text', text: '专属简历 v1 已生成并保存，可在界面「专属简历」中查看。' },
  ],
  assertFinalState: (ctx) => {
    const row = ctx.query<{ content_markdown: string }>('SELECT content_markdown FROM tailored_resumes WHERE resume_id = ? AND job_opportunity_id = ?', ['resume-eval-1', 'job-eval-1']);
    expect(row).not.toBeNull();
    expect(row!.content_markdown).toContain(SUGGESTED_TEXT);
  },
};
```

- [ ] **Step 2: `tests/eval/scenarios/apply-job.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师\n投递：官网 https://xx.tech/careers\n邮箱 hr@xx.tech';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验';
const ANALYSIS_JSON = JSON.stringify({ schemaVersion: 1, overallScore: 70, strengths: [], risks: [], improvements: [], profile: { skills: [], experienceYears: 5, targetRoles: [], targetCities: [] }, pendingConfirmations: [] });
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '前端经验', type: 'experience' }], city: '', level: '', tags: [] },
  fitResults: [{ requirementId: 'r1', level: 'matched', evidence: '前端开发工程师，5 年经验', note: '' }],
  overallScore: 80, risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: [], truthBoundary: '' },
});

export const applyJobScenario: Scenario = {
  id: 'apply-job',
  family: 'orchestration',
  description: '两段式审批：投递预览 → 用户确认 → 状态推进落库（matched→applying）+ status_history',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, channels_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'matched', ?, ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON, JSON.stringify({ schemaVersion: 1, channels: [{ id: 'c1', type: 'official', label: '官网投递页', url: 'https://xx.tech/careers', email: null, verification: 'verified', riskSignals: [] }] })]);
  },
  userMessages: ['帮我把这个岗位投出去', '确认'],
  mockScript: [
    { type: 'tool-call', toolName: 'applyJob', input: { jobOpportunityId: 'job-eval-1', action: 'apply' } },
    { type: 'text', text: '投递摘要：将把岗位从 matched 推进到 applying。推荐渠道：官网投递页（已核验）。请确认后执行投递。' },
    { type: 'tool-call', toolName: 'applyJob', input: { jobOpportunityId: 'job-eval-1', action: 'apply', confirmed: true } },
    { type: 'text', text: '已标记为投递中（applying）。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ status: string }>('SELECT status FROM job_opportunities WHERE id = ?', ['job-eval-1']);
    expect(job?.status).toBe('applying');
    const hist = ctx.query<{ from_status: string; to_status: string }>('SELECT from_status, to_status FROM status_history WHERE job_opportunity_id = ? ORDER BY created_at DESC LIMIT 1', ['job-eval-1']);
    expect(hist).toMatchObject({ from_status: 'matched', to_status: 'applying' });
  },
};
```

- [ ] **Step 3: `tests/eval/scenarios/plan-task.ts`**

计划文件写 `data/plans/eval-*.md`（runner 已做 eval- 前缀清理）；`isStepCount(5)` 限制单轮最多 5 次模型调用，故跨轮推进。

```ts
import { expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Scenario } from './types';

const TASK_ID = 'eval-apply-week';

export const planTaskScenario: Scenario = {
  id: 'plan-task',
  family: 'orchestration',
  description: '复杂任务规划：planCreate 出计划 → 用户确认 → planUpdate 逐步推进',
  setup: (ctx) => {
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
  assertFinalState: (ctx) => {
    const content = readFileSync(path.resolve(process.cwd(), 'data', 'plans', `${TASK_ID}.md`), 'utf-8');
    expect(content).toContain('更新简历');
    // 进度横幅数据：步骤 0 done、步骤 1 in_progress
    expect(content).toMatch(/done/);
  },
};
```

- [ ] **Step 4: `tests/eval/scenarios/record-status.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const JD_TEXT = 'XX 科技 招聘高级前端工程师';
const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验';
const ANALYSIS_JSON = JSON.stringify({ schemaVersion: 1, overallScore: 70, strengths: [], risks: [], improvements: [], profile: { skills: [], experienceYears: 5, targetRoles: [], targetCities: [] }, pendingConfirmations: [] });
const FIT_JSON = JSON.stringify({
  schemaVersion: 1,
  understanding: { company: 'XX 科技', title: '高级前端工程师', requirements: [{ id: 'r1', text: '前端经验', type: 'experience' }], city: '', level: '', tags: [] },
  fitResults: [{ requirementId: 'r1', level: 'matched', evidence: '', note: '' }],
  overallScore: 80, risks: [],
  advice: { mustFix: [], resumeAdjustments: [], talkingPoints: [], truthBoundary: '' },
});

export const recordStatusScenario: Scenario = {
  id: 'record-status',
  family: 'orchestration',
  description: '投递后状态：轻确认两段式（预览 → 确认 → applied→interview 落库 + 时序记录）',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, analysis_json, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, ?, datetime('now'), datetime('now'))", [RESUME_TEXT, ANALYSIS_JSON]);
    ctx.exec("INSERT INTO job_opportunities (id, company, title, jd_text, status, fit_result_json, created_at, updated_at) VALUES ('job-eval-1', 'XX 科技', '高级前端工程师', ?, 'applied', ?, datetime('now'), datetime('now'))", [JD_TEXT, FIT_JSON]);
  },
  userMessages: ['我刚面试完这家公司，进入二面了', '确认'],
  mockScript: [
    { type: 'tool-call', toolName: 'recordApplicationStatus', input: { jobOpportunityId: 'job-eval-1', target: 'interview' } },
    { type: 'text', text: '变更摘要：将把岗位从 applied 记录为 面试中（interview）。界面会展示「确认记录」按钮。' },
    { type: 'tool-call', toolName: 'recordApplicationStatus', input: { jobOpportunityId: 'job-eval-1', target: 'interview', confirmed: true } },
    { type: 'text', text: '已记录为面试中（interview）。' },
  ],
  assertFinalState: (ctx) => {
    const job = ctx.query<{ status: string }>('SELECT status FROM job_opportunities WHERE id = ?', ['job-eval-1']);
    expect(job?.status).toBe('interview');
    const hist = ctx.query<{ from_status: string; to_status: string }>('SELECT from_status, to_status FROM status_history WHERE job_opportunity_id = ? ORDER BY created_at DESC LIMIT 1', ['job-eval-1']);
    expect(hist).toMatchObject({ from_status: 'applied', to_status: 'interview' });
  },
};
```

- [ ] **Step 5: 更新 `tests/eval/scenarios/index.ts`**

```ts
import type { Scenario } from './types';
import { resumeAnalysisScenario } from './resume-analysis';
import { jdMatchScenario } from './jd-match';
import { interviewPrepScenario } from './interview-prep';
import { offerCompareScenario } from './offer-compare';
import { coverLetterScenario } from './cover-letter';
import { tailoredResumeScenario } from './tailored-resume';
import { applyJobScenario } from './apply-job';
import { planTaskScenario } from './plan-task';
import { recordStatusScenario } from './record-status';

export const scenarios: Scenario[] = [
  resumeAnalysisScenario, jdMatchScenario, interviewPrepScenario, offerCompareScenario, coverLetterScenario,
  tailoredResumeScenario, applyJobScenario, planTaskScenario, recordStatusScenario,
];
```

- [ ] **Step 6: 运行确认**

Run: `npx vitest run tests/eval/eval.test.ts`
Expected: PASS（9 个场景）

若 tailored-resume 失败：检查第一段 JSON 的 `sourceText` 是否与 setup 的 `RESUME_TEXT` 逐字一致（含标点）；若 apply-job/record-status 断言失败，用 `SELECT * FROM status_history` 核对时序记录。

- [ ] **Step 7: 提交**

```bash
git add tests/eval/scenarios/
git commit -m "feat: 评测编排压力族场景（tailored-resume/apply-job/plan-task/record-status）"
```

---

### Task 8: 边界恢复族场景（mid-course-correction / tool-failure-retry / memory-limit-recovery / memory-recall）

**Files:**
- Create: `tests/eval/scenarios/mid-course-correction.ts`
- Create: `tests/eval/scenarios/tool-failure-retry.ts`
- Create: `tests/eval/scenarios/memory-limit-recovery.ts`
- Create: `tests/eval/scenarios/memory-recall.ts`
- Modify: `tests/eval/scenarios/index.ts`

- [ ] **Step 1: `tests/eval/scenarios/mid-course-correction.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

export const midCourseCorrectionScenario: Scenario = {
  id: 'mid-course-correction',
  family: 'recovery',
  description: '中途纠正：用户改偏好 → setMemory 覆盖更新 → 后续对话使用新目标',
  setup: (ctx) => {
    ctx.exec("INSERT INTO memory_blocks (label, description, value, limit, updated_at) VALUES ('preferences', '用户求职偏好', '目标：远程岗位；城市不限', 2000, datetime('now'))");
  },
  userMessages: ['我改主意了，只看北京的岗位', '帮我找找合适的岗位'],
  mockScript: [
    { type: 'tool-call', toolName: 'setMemory', input: { label: 'preferences', value: '目标：北京岗位；远程优先' } },
    { type: 'text', text: '已更新偏好：目标北京岗位，远程优先。' },
    { type: 'tool-call', toolName: 'getMemory', input: { label: 'preferences' } },
    { type: 'text', text: '好的，我会按你的最新偏好（北京岗位、远程优先）帮你找合适的岗位。' },
  ],
  assertFinalState: (ctx) => {
    const row = ctx.query<{ value: string }>('SELECT value FROM memory_blocks WHERE label = ?', ['preferences']);
    expect(row?.value).toContain('北京');
    expect(ctx.allAssistantText()).toContain('北京');
  },
};
```

- [ ] **Step 2: `tests/eval/scenarios/tool-failure-retry.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const RESUME_TEXT = '张伟\n前端开发工程师，5 年经验\n技能：React、TypeScript';
const ANALYSIS_JSON = JSON.stringify({ schemaVersion: 1, overallScore: 72, strengths: [{ point: '前端经验' }], risks: [], improvements: [], profile: { skills: ['React'], experienceYears: 5, targetRoles: [], targetCities: [] }, pendingConfirmations: [] });

export const toolFailureRetryScenario: Scenario = {
  id: 'tool-failure-retry',
  family: 'recovery',
  description: '工具失败（RESUME_NOT_FOUND）→ agent 换路 listResumes 找到正确 id → 重试成功',
  setup: (ctx) => {
    ctx.exec("INSERT INTO resumes (id, name, source_type, source_text, created_at, updated_at) VALUES ('resume-eval-1', '张伟', 'paste', ?, datetime('now'), datetime('now'))", [RESUME_TEXT]);
  },
  userMessages: ['分析一下我的简历'],
  mockScript: [
    // 第一次尝试用错 id → RESUME_NOT_FOUND 结构化错误
    { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: 'wrong-id' } },
    // agent 换路：列出现有简历
    { type: 'tool-call', toolName: 'listResumes', input: {} },
    // 用正确 id 重试
    { type: 'tool-call', toolName: 'analyzeResume', input: { resumeId: 'resume-eval-1' } },
    // analyzeResume 内部 callStructured
    { type: 'text', text: JSON.stringify({ schemaVersion: 1, overallScore: 72, strengths: [{ point: '前端经验 5 年' }], risks: [], improvements: [], profile: { skills: ['React', 'TypeScript'], experienceYears: 5, targetRoles: ['前端工程师'], targetCities: [] }, pendingConfirmations: [] }) },
    { type: 'text', text: '简历分析完成：整体评分 72 分。' },
  ],
  assertFinalState: (ctx) => {
    const resume = ctx.query<{ analysis_json: string | null }>('SELECT analysis_json FROM resumes WHERE id = ?', ['resume-eval-1']);
    expect(resume?.analysis_json).not.toBeNull();
    // 消息流同时包含失败处理（listResumes 后重试）与最终成功
    expect(ctx.allAssistantText()).toContain('72');
  },
};
```

- [ ] **Step 3: `tests/eval/scenarios/memory-limit-recovery.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

const OVER_LONG = '超长内容：' + '非常详细的经历描述'.repeat(300); // ≈2400 字符 > 2000 上限

export const memoryLimitRecoveryScenario: Scenario = {
  id: 'memory-limit-recovery',
  family: 'recovery',
  description: '记忆超限（MEMORY_LIMIT_EXCEEDED）→ agent 精简内容重写成功',
  setup: (ctx) => {
    ctx.exec("INSERT INTO memory_blocks (label, description, value, limit, updated_at) VALUES ('preferences', '用户求职偏好', '', 2000, datetime('now'))");
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
};
```

- [ ] **Step 4: `tests/eval/scenarios/memory-recall.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';

export const memoryRecallScenario: Scenario = {
  id: 'memory-recall',
  family: 'recovery',
  description: '历史回忆：用户问此前偏好 → getMemory 读取记忆回答（替代原设计 FTS 检索——工具层无消息检索工具）',
  setup: (ctx) => {
    ctx.exec("INSERT INTO memory_blocks (label, description, value, limit, updated_at) VALUES ('preferences', '用户求职偏好', '目标公司：字节跳动；岗位：前端工程师', 2000, datetime('now'))");
  },
  userMessages: ['我之前说过想去哪家公司？'],
  mockScript: [
    { type: 'tool-call', toolName: 'getMemory', input: { label: 'preferences' } },
    { type: 'text', text: '你之前提到过目标公司是字节跳动，岗位方向是前端工程师。' },
  ],
  assertFinalState: (ctx) => {
    expect(ctx.allAssistantText()).toContain('字节跳动');
  },
};
```

- [ ] **Step 5: 更新 `tests/eval/scenarios/index.ts`（追加 4 个）**

```ts
import { midCourseCorrectionScenario } from './mid-course-correction';
import { toolFailureRetryScenario } from './tool-failure-retry';
import { memoryLimitRecoveryScenario } from './memory-limit-recovery';
import { memoryRecallScenario } from './memory-recall';

export const scenarios: Scenario[] = [
  resumeAnalysisScenario, jdMatchScenario, interviewPrepScenario, offerCompareScenario, coverLetterScenario,
  tailoredResumeScenario, applyJobScenario, planTaskScenario, recordStatusScenario,
  midCourseCorrectionScenario, toolFailureRetryScenario, memoryLimitRecoveryScenario, memoryRecallScenario,
];
```

- [ ] **Step 6: 运行确认**

Run: `npx vitest run tests/eval/eval.test.ts`
Expected: PASS（13 个场景，全量）

- [ ] **Step 7: 全量验证 + 提交**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿（184 + 评测 13 + mock-model 4 + model-override 2 + run-agent 2 = 205）

```bash
git add tests/eval/scenarios/
git commit -m "feat: 评测边界恢复族场景（纠正/失败重试/记忆超限/记忆回忆），13 场景齐"
```

---

### Task 9: 真实模型层 CLI（run-eval.cli.ts）

**Files:**
- Create: `tests/eval/run-eval.cli.ts`
- Modify: `package.json`

- [ ] **Step 1: 安装 tsx（CLI TS 运行环境）**

Run: `npm install -D tsx`
Expected: tsx 进入 devDependencies

- [ ] **Step 2: 实现 `tests/eval/run-eval.cli.ts`**

```ts
import { scenarios } from './scenarios';
import { runScenario } from './runner';
import { getModel } from '../../src/agent/model';

/** 解析 --k <次数>；其余忽略。默认 k=2。模型经环境变量 LLM_MODEL 指定（getModel() 读取） */
function parseArgs(argv: string[]): { k: number } {
  let k = 2;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--k' && argv[i + 1]) k = Number(argv[i + 1]) || 2;
  }
  return { k };
}

async function main() {
  const { k } = parseArgs(process.argv.slice(2));
  const model = getModel(); // 真实模型：环境变量 LLM_BASE_URL/LLM_API_KEY/LLM_MODEL 配置；换模型设 LLM_MODEL 后运行
  // pass^k 一致性：每场景 k 次全过才判 pass
  let passed = 0;
  let failed = 0;
  const startedAt = Date.now();
  for (const scenario of scenarios) {
    let scenarioPassed = true;
    let lastError = '';
    for (let i = 0; i < k; i++) {
      const result = await runScenario(scenario, { model });
      if (!result.ok) {
        scenarioPassed = false;
        lastError = result.error;
      }
    }
    if (scenarioPassed) {
      passed++;
      console.log(`[PASS] ${scenario.id} (${k}/${k})`);
    } else {
      failed++;
      console.log(`[FAIL] ${scenario.id} (${k} 次未全过) 最后失败：${lastError.slice(0, 300)}`);
    }
  }
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n结果：${passed}/${scenarios.length} 通过（pass^${k}），耗时 ${elapsed}s`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('评测运行异常：', err);
  process.exit(1);
});
```

- [ ] **Step 3: package.json 增加脚本**

```json
"eval": "tsx tests/eval/run-eval.cli.ts"
```

- [ ] **Step 4: 验证 CLI 可启动（不真跑真实模型）**

无 LLM_* 环境变量时命令应抛 LlmConfigError 并退出非 0（说明 CLI 骨架可用）：

Run: `npx tsx tests/eval/run-eval.cli.ts`
Expected: 抛 `LLM 环境变量缺失` 错误，exit 非 0

有环境变量时可对 1 个场景试跑：

Run: `npx tsx tests/eval/run-eval.cli.ts --k 1`（若已配置 LLM 环境变量）
Expected: 输出每场景 PASS/FAIL 与汇总（首次跑真实模型建议先 --k 1 观察稳定性）

- [ ] **Step 5: 提交**

```bash
git add tests/eval/run-eval.cli.ts package.json package-lock.json
git commit -m "feat: 真实模型层评测 CLI（npm run eval，pass^k 一致性）"
```

---

### Task 10: 评测有效性验证 + 文档收尾

**Files:**
- Modify: `src/agent/tools/apply-job.ts`（临时破坏，验证后还原）
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/designs/2026-08-10-agent-roadmap-discussion.md`（补实现状态）

- [ ] **Step 1: 故意破坏审批放行逻辑（验证评测能抓回归）**

在 `src/agent/tools/apply-job.ts` 第二段落库处临时注释状态推进（约 93 行 `updateJobApplication(...)` 与 `recordStatusTransition(...)` 两行）：

```ts
    // —— 第二段：状态推进落库 ——
    // updateJobApplication(job.id, transition.next as 'applying' | 'applied' | 'skipped');
    // recordStatusTransition(job.id, job.status, transition.next);
```

- [ ] **Step 2: 运行 mock 层评测确认失败**

Run: `npx vitest run tests/eval/eval.test.ts`
Expected: `apply-job` 场景 FAIL（断言 status=applying 不满足）——证明评测集真能抓回归；其余 12 个场景应仍 PASS

- [ ] **Step 3: 还原破坏**

恢复 Step 1 注释的两行代码。

- [ ] **Step 4: 全量验证**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: 全绿（205 测试）+ build 通过

- [ ] **Step 5: 更新 `PROJECT_STATUS.md`**

在「接下来要做什么」的 P2 队列第 1 项标注状态，并更新「工程基线」测试数：

```markdown
### P2 队列（调研报告路线图）

1. **评测基线** ✅ 已落地（2026-08-11）：双层评测（mock 层入 vitest 13 场景防编排回归 + `npm run eval` 真实模型层 pass^2 能力验证），设计见 docs/designs/2026-08-11-eval-baseline-design.md，实现见 docs/plans/2026-08-11-eval-baseline.md
2. **语义检索**：embedding 存 SQLite（sqlite-vec 或自算余弦），FTS5 + 向量 + 时间衰减混合检索（待讨论）
3. **Prompt caching 优化**：稳定段前置已就位，按 provider 能力启用缓存（待讨论）
4. **子 Agent（最小 supervisor）**：触发信号（并行调研/工具表 >10-15 个）均未出现，维持搁置（待讨论）
5. **其他增强**：skill 库扩展（company-research / salary-benchmark 等）、审计日志、token 预算自监控（待讨论）
```

工程基线测试数改为 `184 + 13 评测场景 + 8 新单测 ≈ 205`（以实际为准）。

- [ ] **Step 6: 提交**

```bash
git add -A src/agent/tools/apply-job.ts PROJECT_STATUS.md
git commit -m "docs: P2-1 评测基线验收（有效性验证通过：故意破坏被评测捕获）并更新 PROJECT_STATUS"
```

---

## 计划自审记录

- **规格覆盖**：设计文档全部章节均有对应任务——双层（Task 3/5/9）、场景 13 个（Task 5-8）、前置重构（Task 1/2/4）、runner（Task 5）、CLI（Task 9）、有效性验证（Task 10）。设计文档两处修正已在本计划头部注明（memory-recall、getModel 注入点）。
- **类型一致性**：`MockResponse`/`Scenario`/`ScenarioContext`/`runAgentTurn`/`initDb`/`setModelOverride` 签名在 Task 3-5 定义、Task 6-9 引用，一致；`MockResponse` 的 input 为 `Record<string, unknown>`，场景中数组参数（confirmedEdits 等）兼容。
- **占位符扫描**：无 TODO/待定；CLI 模型指定统一为环境变量方案（Task 9 Step 2）。
- **自审修正（实现时已并入对应任务）**：
  1. drizzle `db.get/run` 不接受 `{sql, params}` 对象 → runner 改用原生 `$client` 的 `prepare().get(...params)`（Task 5 Step 2）
  2. `initDb` 全局连接切换与 vitest 文件并行冲突 → 新增 `vitest.config.ts`（`fileParallelism: false`），runner 场景结束 `finally` 恢复默认连接（Task 1 Step 2、Task 5 Step 2）
  3. `--model` CLI 参数对 provider 实例展开不可靠 → 统一走 `LLM_MODEL` 环境变量（Task 9 Step 2）


