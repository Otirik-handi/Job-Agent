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

- LLM 产物（`analysisJson`/`fitResultJson`/`channelsJson`）以 JSON 字符串落库
- 路由层读取时 `try/catch` 解析，坏 JSON 降级 `null`（防御旧数据/损坏数据）
- 为什么：SQLite 无原生 JSON 类型；LLM 产物运行时校验（find-work 经验 #8）

## status 枚举

- 岗位 `status` 列枚举：`saved` / `analyzed` / `matched` / `applying` / `applied` / `skipped`
- 状态转移规则在 `src/agent/apply-state.ts`（纯函数），仓储只落库不校验转移
- 为什么：投递状态机统一语义，前端 `StatusBadge` 与岗位筛选依赖该枚举

## 外键

- SQLite 连接启用 `PRAGMA foreign_keys = ON`（`src/db/index.ts`）
- 为什么：级联删除正确性（删除简历/岗位后联动清理专属简历等子记录）
