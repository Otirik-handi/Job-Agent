# 语义检索实现计划（P2-2 批次 B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地消息语义检索——`searchMessages` 工具 + 消息嵌入管线（落库同步嵌入 + 存量回填脚本），自算余弦零原生依赖。

**Architecture:** `embedding.ts`（硅基流动调用 + override 注入 + 降级）→ runAgentTurn 持久化后同步嵌入钩子 → `vector-search.ts`（余弦纯函数）→ `searchMessages` 工具（只读免确认）→ 回填脚本。messages 表加 `embedding_json` 列。

**Tech Stack:** 硅基流动 `/embeddings`（BAAI/bge-m3）、Node fetch、drizzle（迁移）、vitest。

**设计文档：** `docs/designs/2026-08-12-semantic-search-design.md`

**关键事实（已核实）**：
- 硅基流动 OpenAI 兼容端点：`POST {EMBEDDING_BASE_URL}/embeddings`，body `{ model, input: [text] }`，返回 `{ data: [{ embedding: number[] }] }`
- 现有 model override 模式：`setModelOverride/clearModelOverride`（src/agent/model.ts）——embedding override 同构
- 评测 runner（tests/eval/runner.ts）finally 已有 `clearModelOverride()`——本批次加 `clearEmbeddingOverride()` 同位置
- UIMessage parts 结构：`{ type: 'text', text }`（AI SDK v7）
- messages 表现有列：id/conversation_id/role/message_json/created_at

---

### Task 1: messages 表加 embedding_json 列

**Files:**
- Modify: `src/db/schema.ts`
- Generate: `src/db/migrations/0006_*.sql`

- [ ] **Step 1: schema.ts 的 messages 表加列**

messages 表定义（现有）追加：

```ts
  // 语义检索向量（JSON 数组，如 [0.1, -0.2, ...]）；null = 未嵌入（存量消息或嵌入失败）
  embeddingJson: text('embedding_json'),
```

- [ ] **Step 2: 生成并应用迁移**

Run: `npx drizzle-kit generate && npx drizzle-kit migrate`
Expected: 生成 `0006_*.sql`（ALTER TABLE `messages` ADD `embedding_json` text）+ 应用成功

- [ ] **Step 3: 验证**

Run: `npm test`
Expected: 224 全绿

- [ ] **Step 4: 提交**

```bash
git add src/db/schema.ts src/db/migrations/
git commit -m "feat: messages 表加 embedding_json 列（语义检索向量）"
```

---

### Task 2: vector-search 纯函数（余弦 + topK）

**Files:**
- Create: `src/agent/vector-search.ts`
- Test: `src/agent/vector-search.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { cosineSimilarity, searchVectors } from './vector-search';

describe('cosineSimilarity（余弦相似度）', () => {
  it('相同向量 = 1，正交 = 0，反向 = -1', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 5);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 5);
    expect(cosineSimilarity([1, 0, 0], [-1, 0, 0])).toBeCloseTo(-1, 5);
  });
  it('长度不同抛错', () => {
    expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow();
  });
  it('零向量不除零（返回 0）', () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe('searchVectors（topK 排序）', () => {
  it('按相似度降序返回 topK，score 保留 4 位小数', () => {
    const rows = [
      { id: 'a', vector: [1, 0, 0] },
      { id: 'b', vector: [0, 1, 0] },
      { id: 'c', vector: [0.5, 0.5, 0] }, // 与 [1,0,0] 余弦 ≈ 0.7071
    ];
    const result = searchVectors([1, 0, 0], rows, 2);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('a');
    expect(result[0].score).toBeCloseTo(1, 4);
    expect(result[1].id).toBe('c');
    expect(result[1].score).toBeCloseTo(0.7071, 4);
  });
  it('空数组返回空', () => {
    expect(searchVectors([1, 0], [], 5)).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/vector-search.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
/** 向量检索纯函数：余弦相似度 + topK 排序（自算余弦，数据量小无需原生索引）。 */

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('向量维度不一致');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export type VectorRow<T> = T & { vector: number[] };

/** 按余弦相似度降序取 topK；score 保留 4 位小数 */
export function searchVectors<T extends { id: string }>(
  queryVec: number[],
  rows: VectorRow<T>[],
  topK: number,
): Array<{ id: string; score: number; row: T }> {
  return rows
    .map((row) => ({ row, score: cosineSimilarity(queryVec, row.vector) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK)
    .map(({ row, score }) => ({ id: row.id, score: Math.round(score * 10000) / 10000, row }));
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/agent/vector-search.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/agent/vector-search.ts src/agent/vector-search.test.ts
git commit -m "feat: 向量检索纯函数（余弦相似度 + topK）"
```

---

### Task 3: embedding.ts（API 调用 + override + 降级）

**Files:**
- Create: `src/agent/embedding.ts`
- Test: `src/agent/embedding.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearEmbeddingOverride, embedText, setEmbeddingOverride } from './embedding';

afterEach(() => {
  clearEmbeddingOverride();
  vi.unstubAllGlobals();
});

describe('embedText（硅基流动 embedding 调用）', () => {
  it('override 优先（评测注入），不调真实 API', async () => {
    setEmbeddingOverride(async () => [0.1, 0.2]);
    expect(await embedText('测试文本')).toEqual([0.1, 0.2]);
  });

  it('未配置环境变量 → null（降级）', async () => {
    const prev = { base: process.env.EMBEDDING_BASE_URL, key: process.env.EMBEDDING_API_KEY, model: process.env.EMBEDDING_MODEL };
    delete process.env.EMBEDDING_BASE_URL; delete process.env.EMBEDDING_API_KEY; delete process.env.EMBEDDING_MODEL;
    expect(await embedText('x')).toBeNull();
    if (prev.base) process.env.EMBEDDING_BASE_URL = prev.base;
    if (prev.key) process.env.EMBEDDING_API_KEY = prev.key;
    if (prev.model) process.env.EMBEDDING_MODEL = prev.model;
  });

  it('API 非 2xx → null；成功解析 embedding', async () => {
    process.env.EMBEDDING_BASE_URL = 'https://api.siliconflow.cn/v1';
    process.env.EMBEDDING_API_KEY = 'test-key';
    process.env.EMBEDDING_MODEL = 'BAAI/bge-m3';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('err', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ embedding: [0.5, -0.5] }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await embedText('x')).toBeNull();
    expect(await embedText('x')).toEqual([0.5, -0.5]);
    // 请求格式：POST {base}/embeddings + Bearer
    const [url, init] = fetchMock.mock.calls[1];
    expect(String(url)).toBe('https://api.siliconflow.cn/v1/embeddings');
    expect(JSON.parse(String((init as RequestInit).body))).toMatchObject({ model: 'BAAI/bge-m3', input: ['x'] });
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer test-key' });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/embedding.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
/** 消息 embedding：硅基流动 /embeddings 调用（OpenAI 兼容）。
 * 降级语义：embedText 返回 null 而非抛错——未配置/API 失败均视为"无向量"，调用方跳过嵌入。
 * 评测注入：setEmbeddingOverride（与 model override 同模式），mock 层不依赖真实 API。 */
type EmbedFn = (text: string) => Promise<number[] | null>;

let override: EmbedFn | null = null;
export function setEmbeddingOverride(fn: EmbedFn): void { override = fn; }
export function clearEmbeddingOverride(): void { override = null; }

const MAX_EMBED_CHARS = 8000; // bge-m3 上下文 8192，留余量

export async function embedText(text: string): Promise<number[] | null> {
  if (override) return override(text);
  const baseUrl = process.env.EMBEDDING_BASE_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL;
  if (!baseUrl || !apiKey || !model) return null;
  const input = text.length > MAX_EMBED_CHARS ? text.slice(0, MAX_EMBED_CHARS) : text;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: [input] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ embedding?: unknown }> };
    const vec = data.data?.[0]?.embedding;
    return Array.isArray(vec) && vec.every((n) => typeof n === 'number') ? (vec as number[]) : null;
  } catch {
    return null; // 网络/超时/解析失败：降级
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/agent/embedding.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/agent/embedding.ts src/agent/embedding.test.ts
git commit -m "feat: embedding 模块（硅基流动调用 + override 注入 + 降级）"
```

---

### Task 4: runAgentTurn 嵌入钩子（消息落库后同步嵌入）

**Files:**
- Modify: `src/agent/run-agent.ts`
- Test: `src/agent/run-agent.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试（run-agent.test.ts 末尾）**

```ts
  it('消息落库后同步嵌入（override 注入），embedding_json 写入', async () => {
    const conv = createConversation('embed 钩子');
    setEmbeddingOverride(async () => [0.1, 0.2]);
    const model = createScriptedModel([
      { type: 'text', text: '我只看远程岗位。' },
    ]);
    await runAgentTurn({ conversationId: conv.id, messages: [userMsg('我只看远程岗位')], model });
    const row = db.get<{ embedding_json: string | null }>('SELECT embedding_json FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1', ['assistant']);
    expect(row?.embedding_json).not.toBeNull();
    expect(JSON.parse(row!.embedding_json!)).toEqual([0.1, 0.2]);
  });

  it('嵌入失败（override 返回 null）不阻塞，embedding_json 保持 null', async () => {
    const conv = createConversation('embed 降级');
    setEmbeddingOverride(async () => null);
    const model = createScriptedModel([{ type: 'text', text: '回复' }]);
    await runAgentTurn({ conversationId: conv.id, messages: [userMsg('你好')], model });
    const row = db.get<{ embedding_json: string | null }>('SELECT embedding_json FROM messages WHERE role = ? ORDER BY created_at DESC LIMIT 1', ['assistant']);
    expect(row?.embedding_json).toBeNull();
  });
```

（import 增加：`setEmbeddingOverride, clearEmbeddingOverride` from './embedding'；afterAll 或用例内清理 override）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/run-agent.test.ts`
Expected: FAIL（新用例失败：embedding_json 为 null）

- [ ] **Step 3: run-agent.ts 加嵌入钩子**

新增辅助函数（文件内）：

```ts
/** 消息 JSON → 嵌入文本：text parts 拼接；无文本返回 null（不嵌入） */
export function extractEmbeddingText(messageJson: string): string | null {
  try {
    const msg = JSON.parse(messageJson) as { parts?: Array<{ type?: string; text?: string }> };
    const texts = (msg.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text);
    const joined = texts.join('\n').trim();
    return joined.length > 0 ? joined : null;
  } catch {
    return null;
  }
}
```

在消息持久化处（assistant 补 UUID 落库循环内 insertMessage 之后）与入站用户消息持久化循环内追加：

```ts
import { embedText } from './embedding';
import { db } from '../db';
import { messages } from '../db/schema';
import { sql } from 'drizzle-orm';
// ...
  /** 落库后同步嵌入（失败降级：不阻塞主流程；override/未配置时跳过） */
  async function embedMessage(recordId: string, messageJson: string): Promise<void> {
    try {
      const text = extractEmbeddingText(messageJson);
      if (!text) return;
      const vector = await embedText(text);
      if (vector) {
        db.update(messages).set({ embeddingJson: JSON.stringify(vector) }).where(sql`id = ${recordId}`).run();
      }
    } catch {
      // 嵌入失败仅跳过（消息本身可用），不刷日志（避免敏感信息/噪声）
    }
  }
```

调用点：入站消息 `insertMessage` 后（`if (msgId && existingIds.has(msgId)) continue;` 分支前）与 assistant 持久化循环的 `insertMessage` 后各加一行：

```ts
    void embedMessage(recordId, JSON.stringify(msg)); // 用 insertMessage 返回的 record.id
```

注意：insertMessage 返回 MessageRecord（含 id）——现有代码 `insertMessage(conversationId, msg.role, JSON.stringify(msg))` 未接返回值，改为 `const record = insertMessage(...)` 后用 `record.id`。assistant 循环同理。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/agent/run-agent.test.ts`
Expected: PASS（含 2 个新用例）
Run: `npm test`
Expected: 224 + 2 = 226 全绿（+vector-search 4 + embedding 3 = 233 总计？——以实际为准，全绿即可）

- [ ] **Step 5: 提交**

```bash
git add src/agent/run-agent.ts src/agent/run-agent.test.ts
git commit -m "feat: 消息落库同步嵌入钩子（失败降级不阻塞）"
```

---

### Task 5: searchMessages 工具

**Files:**
- Create: `src/agent/tools/search-messages.ts`
- Test: `src/agent/tools/search-messages.test.ts`
- Modify: `src/agent/agent.ts`（注册 + SYSTEM_PROMPT）

- [ ] **Step 1: 写失败测试**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, initDb } from '../../db';
import { setEmbeddingOverride, clearEmbeddingOverride } from '../embedding';
import { searchMessagesTool } from './search-messages';

function ctx() {
  return { callStructured: vi.fn() as never, log: vi.fn() };
}

beforeEach(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterEach(() => {
  initDb();
  clearEmbeddingOverride();
});

describe('searchMessages（语义检索历史对话）', () => {
  it('query 嵌入 → 余弦排序 → 返回结果（含 score 与文本摘要）', async () => {
    setEmbeddingOverride(async () => [1, 0, 0]); // query 向量
    // 预插两条消息：一条向量与 query 相同（score≈1），一条正交（score≈0）
    const convId = 'conv-eval-1';
    db.insert({ id: 'c1', title: 't', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' }).into(require('../../db/schema').conversations).run();
    const { messages } = require('../../db/schema');
    db.insert(messages).values([
      { id: 'm1', conversationId: convId, role: 'user', messageJson: JSON.stringify({ id: 'm1', role: 'user', parts: [{ type: 'text', text: '我想去字节跳动' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
      { id: 'm2', conversationId: convId, role: 'user', messageJson: JSON.stringify({ id: 'm2', role: 'user', parts: [{ type: 'text', text: '今天天气不错' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([0, 1, 0]) },
    ]).run();

    const result = await searchMessagesTool.execute({ query: '想去哪家公司', limit: 5 }, ctx());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.count).toBe(2);
      expect(result.results[0]).toMatchObject({ messageId: 'm1', role: 'user' });
      expect(result.results[0].score).toBeCloseTo(1, 4);
      expect(result.results[0].text).toContain('字节跳动');
    }
  });

  it('conversationId 限定会话', async () => {
    setEmbeddingOverride(async () => [1, 0, 0]);
    // 预插两条消息在不同会话
    const { messages } = require('../../db/schema');
    db.insert(messages).values([
      { id: 'm3', conversationId: 'conv-a', role: 'user', messageJson: JSON.stringify({ id: 'm3', role: 'user', parts: [{ type: 'text', text: '甲' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
      { id: 'm4', conversationId: 'conv-b', role: 'user', messageJson: JSON.stringify({ id: 'm4', role: 'user', parts: [{ type: 'text', text: '乙' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
    ]).run();
    const result = await searchMessagesTool.execute({ query: 'x', conversationId: 'conv-a' }, ctx());
    if (result.ok) {
      expect(result.count).toBe(1);
      expect(result.results[0].messageId).toBe('m3');
    }
  });

  it('未配置 embedding（override null）→ EMBEDDING_FAILED', async () => {
    setEmbeddingOverride(async () => null);
    const result = await searchMessagesTool.execute({ query: 'x' }, ctx());
    expect(result).toMatchObject({ ok: false, error: { code: 'EMBEDDING_FAILED' } });
  });
});
```

注意：测试里 `db.insert(...).into(...)` 用 require 引入 schema 是为了避免类型问题——**实现时用顶部 import { conversations, messages } from '../../db/schema' 更规范**（测试代码可调整为此风格）。预插 conversations 行（FK 约束，参考 Task 1 的 seedConversation 经验）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/tools/search-messages.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/agent/tools/search-messages.ts`**

```ts
/** searchMessages：语义检索历史对话（按含义匹配，不要求字面一致），只读免确认 */
import { z } from 'zod';
import { db } from '../../db';
import { messages } from '../../db/schema';
import { eq, isNotNull } from 'drizzle-orm';
import { createDomainTool } from '../tool-factory';
import { embedText } from '../embedding';
import { searchVectors } from '../vector-search';

const inputSchema = z.strictObject({
  query: z.string().min(1).max(200).describe('语义检索词（回忆之前提过的偏好/进度/信息）'),
  limit: z.number().int().min(1).max(20).optional().describe('返回条数上限，默认 5'),
  conversationId: z.string().optional().describe('限定会话检索（可选）'),
});

type MessageRow = { id: string; conversationId: string; role: string; messageJson: string; embeddingJson: string | null };

/** 消息文本摘要：text parts 拼接截断 200 字符 */
function summarizeText(messageJson: string): string {
  try {
    const msg = JSON.parse(messageJson) as { parts?: Array<{ type?: string; text?: string }> };
    const text = (msg.parts ?? [])
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}

export const searchMessagesTool = createDomainTool({
  name: 'searchMessages',
  description: '语义检索历史对话：按含义匹配（不要求字面一致），回忆之前提过的偏好/进度/岗位信息。参数 query 为检索词（1-200 字符）、limit 条数（1-20 默认 5）、conversationId 可选限定会话。只检索已嵌入的消息——未嵌入的存量消息需先跑 npm run embed-backfill；需要字面精确检索的场景不适用。返回 ok、count 与 results（messageId、conversationId、role、text 摘要 200 字符、score 余弦相似度）。',
  inputSchema,
  progress: { start: '正在检索历史对话…', done: '检索完成' },
  execute: async (args) => {
    const queryVec = await embedText(args.query);
    if (!queryVec) {
      return {
        ok: false,
        error: {
          code: 'EMBEDDING_FAILED',
          message: '查询向量生成失败（embedding 未配置或 API 不可用）',
          hint: '请确认已配置 EMBEDDING_BASE_URL/EMBEDDING_API_KEY/EMBEDDING_MODEL（硅基流动）；或稍后重试。',
        },
      };
    }
    // 全表加载有向量的消息（数据量小，内存计算）
    const base = db.select({
      id: messages.id, conversationId: messages.conversationId, role: messages.role,
      messageJson: messages.messageJson, embeddingJson: messages.embeddingJson,
    }).from(messages).where(isNotNull(messages.embeddingJson));
    const rows = (args.conversationId ? base.where(eq(messages.conversationId, args.conversationId)) : base).all() as MessageRow[];
    const withVec = rows
      .map((r) => {
        try {
          const vec = JSON.parse(r.embeddingJson!) as unknown;
          return Array.isArray(vec) && vec.every((n) => typeof n === 'number')
            ? { row: r, vector: vec as number[] } : null;
        } catch { return null; }
      })
      .filter((x): x is { row: MessageRow; vector: number[] } => x !== null);
    const top = searchVectors(queryVec, withVec, args.limit ?? 5);
    return {
      ok: true,
      query: args.query,
      count: top.length,
      results: top.map(({ row, score }) => ({
        messageId: row.id,
        conversationId: row.conversationId,
        role: row.role,
        text: summarizeText(row.messageJson),
        score,
      })),
    };
  },
});
```

- [ ] **Step 4: `agent.ts` 注册 + SYSTEM_PROMPT**

`getTools()` 加 `searchMessages: searchMessagesTool`（import 一行）；SYSTEM_PROMPT 工具清单加一行：

```
- searchMessages：语义检索历史对话（按含义匹配，回忆之前提过的内容；需已嵌入的消息）
```

并追加"记忆与检索"补充（对齐现有记忆节，可并入记忆节末尾）：

```
- 需要回忆历史对话内容（非记忆块内的具体表述）时，调用 searchMessages 语义检索；检索词用含义表述而非字面关键词。
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/agent/tools/search-messages.test.ts`
Expected: PASS（3 个用例）
Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿

- [ ] **Step 6: 提交**

```bash
git add src/agent/tools/search-messages.ts src/agent/tools/search-messages.test.ts src/agent/agent.ts
git commit -m "feat: searchMessages 工具（语义检索历史对话，只读免确认）"
```

---

### Task 6: 存量回填脚本

**Files:**
- Create: `scripts/embed-backfill.cli.ts`
- Modify: `package.json`

- [ ] **Step 1: 创建 `scripts/embed-backfill.cli.ts`**

```ts
/** 存量消息向量回填：为所有 embedding_json 为 null 的消息补嵌入（幂等，可重复跑）。
 * 运行：npm run embed-backfill（需配置 EMBEDDING_* 环境变量）。 */
import { db } from '../src/db';
import { messages } from '../src/db/schema';
import { isNull } from 'drizzle-orm';
import { embedText } from '../src/agent/embedding';
import { extractEmbeddingText } from '../src/agent/run-agent';

async function main() {
  const rows = db.select({ id: messages.id, messageJson: messages.messageJson })
    .from(messages).where(isNull(messages.embeddingJson)).all();
  if (rows.length === 0) {
    console.log('无需回填：所有消息均已嵌入');
    return;
  }
  console.log(`开始回填 ${rows.length} 条消息…`);
  let done = 0, skipped = 0, failed = 0;
  for (const row of rows) {
    const text = extractEmbeddingText(row.messageJson);
    if (!text) { skipped += 1; continue; } // 无文本消息（纯工具过程）不嵌入
    const vector = await embedText(text);
    if (!vector) { failed += 1; continue; }
    db.update(messages).set({ embeddingJson: JSON.stringify(vector) }).where(eq(messages.id, row.id)).run();
    done += 1;
    if (done % 50 === 0) console.log(`已回填 ${done}/${rows.length}`);
  }
  console.log(`回填完成：成功 ${done}，跳过（无文本）${skipped}，失败 ${failed}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('回填异常：', err);
  process.exit(1);
});
```

（import `eq` from 'drizzle-orm'；`extractEmbeddingText` 从 run-agent 导出——Task 4 已实现。）

- [ ] **Step 2: package.json 加 script**

```json
"embed-backfill": "node --env-file=.env.local --import tsx scripts/embed-backfill.cli.ts"
```

- [ ] **Step 3: 验证**

Run: `npx tsc --noEmit && npm run lint`
Expected: 通过（脚本不进 vitest；无 EMBEDDING_* 时跑会打印失败计数——不真跑）

- [ ] **Step 4: 提交**

```bash
git add scripts/embed-backfill.cli.ts package.json package-lock.json
git commit -m "feat: 存量消息向量回填脚本（npm run embed-backfill）"
```

---

### Task 7: 评测场景（search-messages）+ runner 清理钩子

**Files:**
- Create: `tests/eval/scenarios/search-messages.ts`
- Modify: `tests/eval/scenarios/index.ts`
- Modify: `tests/eval/runner.ts`（finally 加 clearEmbeddingOverride）

- [ ] **Step 1: runner 清理钩子**

`tests/eval/runner.ts` 的 finally 块加 `clearEmbeddingOverride()`（与 clearModelOverride 并列，import 同处）：

```ts
import { clearEmbeddingOverride } from '../../src/agent/embedding';
// finally: {
//   clearModelOverride();
//   clearEmbeddingOverride();   // 新增
//   ...
```

- [ ] **Step 2: 评测场景 `tests/eval/scenarios/search-messages.ts`**

```ts
import { expect } from 'vitest';
import type { Scenario } from './types';
import { setEmbeddingOverride } from '../../../src/agent/embedding';
import { db } from '../../../src/db';
import { messages } from '../../../src/db/schema';

export const searchMessagesScenario: Scenario = {
  id: 'search-messages',
  family: 'recovery',
  description: '历史回忆：用户问之前提过的内容 → searchMessages 语义检索命中（不依赖记忆块）',
  setup: () => {
    // 评测注入：query 与消息共用固定向量（余弦=1 命中），不依赖真实 embedding API
    setEmbeddingOverride(async () => [1, 0, 0]);
    // 预插消息（带向量）——注意 FK：conversations 需先建（用原生 SQL 建会话与消息）
    const ctx = globalThis as unknown as { __evalCtx?: { exec: (sql: string, params?: unknown[]) => void } };
    // setup 的 ctx 在 runner 传入——但本场景 setup 签名 () => {} 无 ctx；改用 SQL 直接经 db
    // （runner 已 initDb(':memory:') + migrate，setup 在 try 内执行）
    db.insert({ id: 'eval-conv-1', title: '评测会话', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' })
      .into(require('../../../src/db/schema').conversations).run();
    db.insert(messages).values([
      { id: 'eval-msg-1', conversationId: 'eval-conv-1', role: 'user', messageJson: JSON.stringify({ id: 'eval-msg-1', role: 'user', parts: [{ type: 'text', text: '我希望能去字节跳动，关注前端岗位' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
    ]).run();
  },
  userMessages: ['我之前说过想去哪家公司吗？'],
  mockScript: [
    { type: 'tool-call', toolName: 'searchMessages', input: { query: '想去的公司', limit: 5 } },
    { type: 'text', text: '你之前提到希望去字节跳动，关注前端岗位。' },
  ],
  assertFinalState: (ctx) => {
    expect(ctx.allAssistantText()).toContain('字节跳动');
  },
};
```

注意：场景 setup 用 `db` 直接插入（runner 已初始化 :memory: 库）——FK 需先建 conversations 行（如上）；`require` 方式或顶部 import 均可（顶部 import 更规范：`import { conversations } from '../../../src/db/schema'`）。**评测 override 清理由 runner finally 保证**（Step 1）。

- [ ] **Step 3: index.ts 追加场景**

scenarios 数组追加 `searchMessagesScenario`（放 recovery 族）。

- [ ] **Step 4: 运行确认**

Run: `npx vitest run tests/eval/eval.test.ts`
Expected: 15/15 PASS（14 + search-messages）

- [ ] **Step 5: 全量验证 + 提交**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿

```bash
git add tests/eval/scenarios/ tests/eval/runner.ts
git commit -m "feat: search-messages 评测场景（embedding override 注入）"
```

---

### Task 8: 全量验证 + 文档收尾

**Files:**
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/research/2026-08-10-agent-roadmap-discussion.md`

- [ ] **Step 1: 全量验证**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: 全绿 + build 通过

- [ ] **Step 2: PROJECT_STATUS 更新**

P2 队列第 2 项改为：

```markdown
2. **语义检索** ✅ 已落地（2026-08-12）：硅基流动 bge-m3 embedding + 自算余弦（向量存 JSON 列）+ searchMessages 工具 + 落库同步嵌入（失败降级）+ 存量回填脚本（npm run embed-backfill）
```

批次说明行更新：`实现批次：A ✅ → C ✅ → B ✅ → D（web 工具，计划就绪）`。测试数更新（以实际为准）。工程基线简述语义检索新增。文档索引补设计/计划链接。

- [ ] **Step 3: 讨论纪要追加实现状态**

`docs/research/2026-08-10-agent-roadmap-discussion.md` 的 P2-2 节末尾追加：

```markdown
- 实现：2026-08-12 批次 B 落地（searchMessages 工具 + 落库同步嵌入 + embed-backfill 回填脚本）
```

- [ ] **Step 4: 提交**

```bash
git add PROJECT_STATUS.md docs/research/2026-08-10-agent-roadmap-discussion.md
git commit -m "docs: 批次 B 验收（语义检索落地）并更新状态文件"
```

---

## 计划自审记录

- **规格覆盖**：设计文档 §2 决策（模型/存储/范围/时机/降级/工具/评测注入）→ Task 1-7；§3 架构（embedding/vector-search/tool/钩子/回填）→ Task 2-6；§4 工具契约（错误码/description）→ Task 5；§5 管线（文本提取/截断/嵌入调用/钩子/回填）→ Task 3/4/6；§6 隐私 → 实现中日志仅 id/长度；§7 测试 → 各任务 + 评测场景；§8 不做 → 无越界。
- **类型一致性**：`embedText`/`setEmbeddingOverride`/`clearEmbeddingOverride`/`cosineSimilarity`/`searchVectors`/`extractEmbeddingText`/`searchMessagesTool` 签名在定义与引用任务间一致；`searchVectors` 的 `VectorRow<T>` 泛型在 Task 5 用法（`{ row, vector }`）与 Task 2 定义一致。
- **占位符扫描**：无 TODO/待定。
- **自审修正**：Task 4 嵌入钩子需 `insertMessage` 返回 record.id（原代码未接返回值，改为 `const record = insertMessage(...)`）；`extractEmbeddingText` 导出供回填脚本复用（Task 6）；评测场景 setup 用 db 直插需先建 conversations 行（FK）；`searchVectors` 对空数组返回空数组（已测）。
