# 语义检索设计（P2-2 批次 B）

日期：2026-08-12
状态：已定稿（讨论纪要 P2-2：直接上 embedding），待写实现计划
依据：`docs/research/2026-08-10-agent-roadmap-discussion.md` P2-2 定稿
关联：批次 D web 工具（独立，无依赖）；P2-3 已验证 provider 缓存（embedding 不受影响）

---

## 1. 背景与目标

Agent 回忆历史事实目前走 getMemory（记忆块）+ 上下文轮数；工具层**没有消息检索工具**（messages FTS 只落库）。定稿决策：

- **直接上 embedding**（用户确认硅基流动提供免费 BAAI/bge-m3 等模型）
- **自算余弦**（向量存 JSON 列，检索时内存计算——个人应用几千条消息 × 1024 维 ≈ 几 MB，毫秒级；不引入 sqlite-vec 的 Windows 原生扩展依赖）
- **范围仅 messages**（lessons 保持 FTS，已有 searchLessons）
- **同步嵌入 + 失败降级**；**时间衰减不做**（最近消息已被轮数截断/会话摘要覆盖）

**目标：新增 `searchMessages` 语义检索工具 + 消息嵌入管线（落库时同步嵌入 + 存量回填脚本）**。

## 2. 关键设计决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| embedding 模型 | 硅基流动 `BAAI/bge-m3`（免费），环境变量 `EMBEDDING_BASE_URL/API_KEY/MODEL` | 用户确认免费额度；OpenAI 兼容 `/embeddings` |
| 向量存储 | `messages` 表加 `embedding_json` 列（JSON 数组），检索时全表加载内存算余弦 | 数据量小；避免 sqlite-vec 原生扩展 |
| 相似度 | 余弦相似度（纯函数），topK 截断 | 标准做法，可单测 |
| 嵌入范围 | user + assistant 消息的 **text parts 拼接**（不含 tool-call JSON 噪声） | 回忆场景两端都有价值 |
| 嵌入时机 | runAgentTurn 消息持久化后同步嵌入，失败降级（日志记录，不阻塞） | 个人应用插入频率低，延迟可接受 |
| 存量回填 | 独立脚本 `npm run embed-backfill`（tsx，批量嵌入无向量消息） | 定稿"嵌入失败的存量消息靠 FTS/上下文"——回填可选 |
| 工具 | `searchMessages`（只读免确认，同构 searchLessons） | 审批分档第一档 |
| 降级 | embedding 未配置（缺 env）→ 消息不嵌入 + searchMessages 返回 `EMBEDDING_NOT_CONFIGURED`；API 调用失败 → `EMBEDDING_FAILED` | 功能可选，配置后自动生效 |
| 评测注入 | `setEmbeddingOverride(fn)`（与 model override 同模式），mock 层固定向量 | 评测不依赖真实 embedding API |

## 3. 架构与模块

```
src/agent/embedding.ts        embedText(text): Promise<number[] | null>（硅基流动调用 + override 注入 + 降级）
src/agent/vector-search.ts    cosineSimilarity(a,b) + searchVectors(queryVec, rows, topK)（纯函数）
src/agent/tools/search-messages.ts   searchMessages 工具（只读免确认）
src/agent/run-agent.ts        消息持久化后同步嵌入钩子（失败降级）
scripts/embed-backfill.cli.ts 存量回填脚本（tsx 运行，npm run embed-backfill）
src/db/schema.ts              messages 表加 embedding_json 列（迁移 0006）
```

数据流（单条消息）：

```
insertMessage(convId, role, json) → 提取 text parts → embedText(text)
  → 成功：UPDATE messages SET embedding_json = '[...]'
  → 失败/未配置：跳过（日志记录），消息本身照常可用
```

检索流（searchMessages）：

```
query → embedText(query)（失败 → EMBEDDING_FAILED/NOT_CONFIGURED）
  → SELECT id, conversation_id, role, message_json, embedding_json FROM messages WHERE embedding_json IS NOT NULL
  → 解析向量 → 余弦 → topK 排序 → 返回 { results: [{ messageId, conversationId, role, text（截断摘要）, score }] }
```

## 4. 工具契约（searchMessages）

```
inputSchema（z.strictObject）：
  query: string（语义检索词，1-200 字符）
  limit: number（1-20，默认 5，可选）
  conversationId: string | undefined（可选，限定会话检索）

输出（ok: true）：
{ ok: true, query, count, results: [{ messageId, conversationId, role, text, score }] }
  // text 为消息文本截断至 200 字符的摘要；score 为余弦相似度（-1~1，保留 4 位小数）

错误码：
  EMBEDDING_NOT_CONFIGURED（缺 EMBEDDING_* 环境变量，hint：提示配置硅基流动 key）
  EMBEDDING_FAILED（API 调用失败，hint：稍后重试或检查 key）
  EMBEDDING_QUERY_FAILED（query 嵌入失败，与 EMBEDDING_FAILED 同语义，可合并——实现时统一为 EMBEDDING_FAILED）
```

- description（3-4 句对齐规范）：首句"语义检索历史对话，按含义匹配（不要求字面一致），供回忆之前提过的偏好/进度/信息"；次句参数（query 检索词、limit 条数、conversationId 限定会话）；第三句边界（仅检索已嵌入的消息——未嵌入的存量消息需先跑 embed-backfill；需要字面精确检索的场合不适用）；末句返回内容与相似度。

## 5. 嵌入管线细节

### 5.1 文本提取（messages → 嵌入文本）

- UIMessage.parts 中 `type === 'text'` 的 text 拼接（`\n` 连接）；无 text parts（纯工具过程消息）不嵌入
- 截断：单条消息嵌入文本上限 8000 字符（bge-m3 上下文 8192；超出截断）

### 5.2 嵌入调用（embedding.ts）

```ts
embedText(text: string): Promise<number[] | null>
// 1. override 优先（评测注入）：setEmbeddingOverride(fn) / clearEmbeddingOverride()
// 2. 环境变量检查：EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL 缺一 → null
// 3. POST {base}/embeddings：{ model, input: [text] }，header Authorization: Bearer <key>
// 4. 解析 data[0].embedding（number[]）；失败/非 2xx → null（调用方降级）
// 5. 超时 10s（AbortSignal.timeout）；返回 null 不抛错（嵌入失败是降级不是异常）
```

- 嵌入结果缓存（进程内 Map<text, vector>）：同一消息文本不重复调用（对话中重复文本少见，但评测多次跑同一场景会命中——**评测隔离**：override 注入时缓存失效）

### 5.3 runAgentTurn 钩子

- 位置：assistant 消息持久化循环（byId 去重 + insertMessage）**之后**，逐条调用 `embedMessage(record)`：
  - 解析 messageJson → 提取 text parts → 超 8000 截断 → embedText → 成功则 `UPDATE messages SET embedding_json`
  - 用户消息同样嵌入（在入站持久化处一并处理）
  - 失败静默（console.warn 一次，不重复刷日志）
- **性能**：每轮 2+ 次 embedding 调用（~100-300ms/次）——个人应用可接受；评测 mock 层无影响（脚本驱动）

### 5.4 存量回填（scripts/embed-backfill.cli.ts）

- `npm run embed-backfill`（package.json script：`node --env-file=.env.local --import tsx scripts/embed-backfill.cli.ts`）
- 逻辑：SELECT 所有 embedding_json IS NULL 的消息 → 逐条提取文本 → 批量嵌入（每批 16 条调一次 /embeddings？bge-m3 支持批量 input）→ UPDATE
  - 简化：逐条嵌入（个人应用量小）；打印进度与失败计数
- 幂等：只处理无向量消息；重复跑不重复嵌入

## 6. 安全与隐私

- **消息内容发送到硅基流动**（与 LLM 调用同 provider 生态）；设计文档明确此边界（讨论纪要已确认"本地优先的边界以 provider 调用为限"）
- 日志：只记 messageId/长度/成功失败，**不记消息文本与向量**
- 向量存本地 SQLite（JSON 列），不落日志

## 7. 测试策略

| 层 | 内容 |
|---|---|
| 纯函数单测 | cosineSimilarity（正交=0/相同=1/反向=-1）、searchVectors topK 排序、embedding 文本提取（text parts 拼接/截断/无文本跳过） |
| 集成（mock） | setEmbeddingOverride 固定向量 → runAgentTurn 一轮后 messages 表有 embedding_json；searchMessages 工具全流程（query 嵌入 → 检索 → 结果） |
| 评测场景 | 新增 `search-messages` 场景（用户问"我之前提过 XX"→ searchMessages 命中；mock 层 setEmbeddingOverride 注入） |
| 真实冒烟 | 配置硅基流动 key 后手动验证（嵌入 + 检索中文语义命中）；不入 CI |

## 8. 明确不做（本批次范围外）

- 时间衰减、FTS+向量混合检索（定稿：不做）
- lessons 语义化（保持 FTS）
- 检索 UI、向量索引优化（数据量小）
- 会话级"最近优先"加权（轮数截断/摘要已覆盖）

## 9. 开放问题（实现计划前确认）

1. **硅基流动 key**：用户注册获取 `EMBEDDING_API_KEY`（与 BRAVE 同模式写 .env.local）；未配置时功能降级（不阻塞其他功能）
2. **批量 vs 逐条嵌入**：回填脚本按逐条实现（简单），若实测慢再改批量
3. **评测注入的 override 范围**：`setEmbeddingOverride` 全局（与 model override 同模式），评测 runner 场景前后设置/清理——runner 需要加钩子（或场景 setup 里直接调）

## 10. 文档链

- 本设计 → 实现计划（`docs/plans/2026-08-12-semantic-search.md`）→ PROJECT_STATUS 更新
- 定稿记录已在讨论纪要 P2-2
