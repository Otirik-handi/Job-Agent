# API 接口设计（Next.js Route Handlers）

日期：2026-08-04
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）
设计依据：`docs/designs/2026-08-04-agent-architecture-design.md`（第 5、7 节）、`docs/designs/2026-08-04-data-model-design.md`（第 7 节）

## 1. 设计决策（2026-08-04 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | API 形态 | 全部 Route Handlers（REST 风格），与 /api/chat 统一；不用 Server Actions |
| 2 | 确认态存储 | 进程内存 Map + 失效提示，不落库 |
| 3 | 对话协议 | AI SDK useChat 标准协议 + 自定义进度事件 |
| 4 | 校验体系 | zod 入参校验 + 产物 schemaVersion 宽容解析（无 OpenAPI） |

## 2. 端点全景

| 端点 | 职责 | 说明 |
|---|---|---|
| `POST /api/chat` | 对话流式端点 | SSE 流：文本 + 工具调用/结果 + 自定义进度事件 |
| `GET /api/conversations` | 会话列表 | 含 lastMessagePreview（服务端聚合） |
| `POST /api/conversations` | 新建会话 | |
| `PATCH /api/conversations/[id]` | 重命名 | |
| `DELETE /api/conversations/[id]` | 删除会话 | 级联删消息 |
| `GET /api/conversations/[id]/messages` | 加载会话消息 | message_json 数组原样回填 useChat |
| `POST /api/confirmations/[id]/approve` | 确认点：批准 | 触发续跑对话轮（SSE 流式） |
| `POST /api/confirmations/[id]/reject` | 确认点：拒绝 | 注入"已拒绝"后续跑 |
| `GET /api/resumes` / `[id]` | 简历列表/详情 | 列表轻量（不含 analysis_json），详情完整（版本宽容解析） |
| `GET /api/job-opportunities` / `[id]` | 岗位列表/详情 | 列表支持 `?status=` 过滤 |
| `GET /api/tailored-resumes` | 专属简历 | `?jobOpportunityId=` 取最新版本 |

**无文件上传端点**——简历导入走 `importResume` 工具（粘贴文本或本地路径）。

## 3. 对话端点协议

### 请求（useChat sendMessage 标准）

```json
{ "conversationId": "uuid" | null, "messages": [{ "role": "user", "content": "…" }] }
```

- `conversationId` 为 null 时服务端创建新会话（标题由首条消息规则截断生成，YAGNI 不做 LLM 生成）

### 响应（SSE 流，两类内容混合）

1. AI SDK 标准流部分：文本增量 / tool-call / tool-result
2. 自定义事件：`tool_started / tool_progress / tool_completed / tool_failed`，载荷 `{ toolName, status, message }`——驱动进度卡片；载荷不含敏感内容（AGENTS.md 硬约束）

### 服务端流程

```
加载/创建会话 → 组装系统提示 + 历史（最近 20 轮）→
streamText({ model, messages, tools }) →
工具 execute（含确认点工具）→ 工具事件推送 → 流结束
```

## 4. 确认点协议

### 确认流程（两轮）

```
第 1 轮（普通对话流）：
  工具 execute 到确认点 → 返回结构化 pending 结果（确认内容预览）
  → 流正常结束，模型提示"需要确认"
  → 前端渲染确认卡片（数据来自 tool-result）

第 2 轮（确认续跑）：
  用户点"确认/拒绝" → POST /api/confirmations/[id]/approve|reject
  → 服务端把"确认结果"作为一条 tool-result part 注入消息历史
  → 触发新一轮 streamText（SSE 流回）
  → 模型总结"已执行 / 已取消"，流结束
```

### 内存态

- `confirmationId → { conversationId, 注入的 tool-result part, 过期时间 }`，进程内存 Map
- 过期/重启后失效：对话流提示"确认已失效，请重新发起"（模型自然接话）
- approve/reject 端点响应 = SSE 流（复用 chat 流式管线）

## 5. 错误契约与校验

- **统一错误响应**（对齐 Agent 架构 6.2）：`{ code, message }`
- HTTP 状态语义：400 校验失败 / 404 不存在 / 409 冲突 / 500 兜底
- **入参校验**：每端点 zod schema（`src/app/api/**/schema.ts`，风格与工具 schemas 一致）
- **响应宽容解析**：产物 JSON 按 schemaVersion 解析（数据结构设计第 4 节）
- 错误信息遵循敏感信息边界

## 6. 查询细节

- `GET /api/conversations` 含 `lastMessagePreview`（服务端子查询最新消息摘要）
- `GET /api/resumes` 列表不含 analysis_json；详情含完整产物
- `GET /api/tailored-resumes?jobOpportunityId=x` 返回最新 version 内容
- 全部无分页（本地数据量，出现规模问题时再加）

## 7. 边界

- ❌ 无鉴权 / 无 OpenAPI 体系（zod 贯穿）
- ❌ 无文件上传端点（导入走工具）
- ❌ 无分页 / 无服务端推送之外的实时通道
- ⏸ 端点实现细节（streamText 配置、事件序列化）在实现计划阶段细化

## 8. 与前端主题的接口

- 前端使用 `useChat`（POST /api/chat）+ 会话/产物查询端点 + 确认卡片（tool-result 渲染 + approve/reject 调用）
- 进度事件经 useChat `onCustomMessage` 接收（具体 hook 用法见前端主题）
