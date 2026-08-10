# 后端工程规范（api-data-conventions.md）

> 后端（API 路由 + 数据层）的组织与写法约定（现状沉淀：固化 `app/api/`、`src/db/` 已稳定一致的实践）。
> 为什么：后端跨 4 个资源（会话/简历/岗位/专属简历）重复一致的 REST 路由、错误契约与仓储模式，需要权威清单。

## 路由组织

- 集合端点：`app/api/<resource>/route.ts`（GET 列表 / POST 创建）
- 单资源端点：`app/api/<resource>/[id]/route.ts`（GET 详情 / PATCH / DELETE）
- 路由只做参数解析、JSON 解析与响应组装，业务查询/变更调仓储
- 为什么：REST 语义与现有 4 个资源一致，路由薄、仓储承载数据访问

## 列表投影

- 列表 GET 返回**投影摘要**，精选字段 + `createdAt`/`updatedAt`；不返回 `jdText`、`analysisJson`、`fitResultJson`、`channelsJson` 等大字段（分别由 `matched`/`analyzed` 布尔摘要代替）
- 需要大字段走详情端点（`[id]`）
- 为什么：列表接口避免传输与暴露大字段，详情按需拉取

## 错误契约

- 统一 `{ code, message }`：`code` 大写蛇形（`RESUME_NOT_FOUND`、`JOB_OPPORTUNITY_NOT_FOUND` 等），`message` 中文可读
- 资源不存在返回 404 语义化错误；成功返回 `{ ok: true }`
- 敏感信息（token、完整简历/JD 文本）不进错误与日志
- 为什么：前端 `api.ts` 依赖该契约解析 message；对齐 AGENTS.md 敏感信息边界

## 仓储模式（repositories）

- 每个资源一个 `src/db/repositories/<resource>.ts`，纯函数导出，直接操作 `db`
- 主键 `randomUUID()`；时间戳 `nowIso()`（ISO 字符串，定义于 `src/db/repositories/shared.ts` 共享模块）；每表导出 Record 类型
- 变更操作 `.run()` 直接落库；查询 `.get()` / `.all()` / `.orderBy(desc(...))`
- 为什么：better-sqlite3 同步直连，纯函数简单可测；Record 类型让路由层免掉类型推断；nowIso 独立成共享模块避免仓储间跨模块依赖

## JSON 列

- LLM 产物（`analysisJson`/`fitResultJson`/`channelsJson`/`interviewPrepJson`）以 JSON 字符串落库
- 路由层读取时 `try/catch` 解析，坏 JSON 降级 `null`（防御旧数据/损坏数据）
- 为什么：SQLite 无原生 JSON 类型；LLM 产物运行时校验（find-work 经验 #8）

## status 枚举

- 岗位 `status` 列枚举：`saved` / `analyzed` / `matched` / `applying` / `applied` / `skipped` / `interview` / `offer` / `hired` / `rejected`
- 状态转移规则在 `src/agent/apply-state.ts`（纯函数：`applyStateTransition` 投递动作 / `applicationOutcomeTransition` 投递后结果），仓储只落库不校验转移
- 为什么：投递状态机统一语义，前端 `StatusBadge` 与岗位筛选依赖该枚举

## 外键

- SQLite 连接启用 `PRAGMA foreign_keys = ON`（`src/db/index.ts`）
- 为什么：级联删除正确性（删除简历/岗位后联动清理专属简历等子记录）

## memory_blocks 表（Agent 记忆块）

- 主键 `label`，枚举固定：`resume` / `preferences` / `status_scratchpad`；`description` 说明该块用途（供 Agent 判断何时读写），`value` 存记忆内容文本，`limit` 为该块字符上限，`updatedAt` 为最后写入时间
- 约定：`label` 枚举固定，新增记忆块必须先更新本规范再落库；`value` 长度不得超过对应 `limit`；写入前由 Agent 依据 `description` 与现值核对后再写（写前核对原则）
- 为什么：记忆块常驻上下文，固定枚举避免语义漂移；limit 防单块写坏上下文预算，写前核对防误写覆盖

## session_state 表（会话结构化状态）

- 主键 `conversationId`，同时外键指向 `conversations.id`（级联删除）；`stateJson` 存会话级结构化状态（JSON 字符串），`updatedAt` 为最后更新时间
- 约定：`stateJson` 为机器可读 JSON、程序可校验（如 `currentResumeId` 必须引用存在的简历）；状态绑定会话，不跨会话共享；每轮请求将本会话 `stateJson` 注入上下文
- 为什么：会话内跨轮状态以结构化 JSON 持久化，校验保证引用完整性，注入上下文让 Agent 延续会话记忆

## status_history 表（投递状态时序）

- 主键 `id`；`jobOpportunityId` 外键指向 `job_opportunities.id`；`fromStatus` / `toStatus` 记录一次状态转移；`createdAt` 记录发生时间；`supersededBy` 可空，指向覆盖本记录的新记录 id
- 约定：状态变更只追加不覆盖（时序作废语义：新记录写入后，旧记录置 `supersededBy` 指向新记录 id）；用于追溯投递状态历史
- 为什么：追加式时序记录保留完整历史可回溯，`supersededBy` 标记当前有效链，避免覆盖式更新丢失过程信息

## messages_fts（FTS5 全文检索）

- `messages_fts` 为 FTS5 虚拟表，索引 `messages.messageJson` 中的文本内容；插入消息时应用层同步写入 FTS 行
- 约定：FTS 表仅为检索辅助，不承担业务数据；内容与 `messages` 表同生命周期（删除消息需同步删除对应 FTS 行）
- 为什么：SQLite FTS5 提供高效全文检索；虚拟表不落业务约束，应用层同步保证检索内容与消息一致
