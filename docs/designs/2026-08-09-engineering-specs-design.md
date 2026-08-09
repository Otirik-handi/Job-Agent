# 工程规范设计（前端 / 后端 / Agent 工具层）

日期：2026-08-09
状态：草稿 → 待审阅
关联规范：AGENTS.md（目录索引、工程原则）、`.agents/specs/00-governance/spec-autonomy.md`（新增条件、内容边界、修订流程）
设计依据：代码现状（`app/`、`src/` 已稳定一致的约定）

## 1. 背景与需求

`.agents/specs/` 目前仅有 2 份治理规范（spec-autonomy、plan-document），缺少工程规范。

对照 spec-autonomy「新增规范的条件」：同一主题跨 3 处以上重复约定即可立规范。代码中前端、后端（API + 数据）、Agent 工具层均已出现高度一致的重复模式（见第 2 节），满足立规范条件。

**定位：现状沉淀**——把代码中已稳定一致的约定固化为规范，每条含清单/命令 + 一行"为什么"（可执行）。不改现有代码，后续新代码一律遵循。

## 2. 现状核实（规范内容来源）

### 2.1 前端（代码证据）

- 目录约定：`src/components/ui/`（shadcn 原始组件）、`src/components/chat/`、`src/components/sidebar/`、`src/components/artifacts/`（产物抽屉）
- hooks：`src/lib/use-*.ts` 7 个，同一模式（`useState` + `refresh` + `useEffect` 挂载；删除后重新 `refresh`）
- 统一 API 客户端：`src/lib/api.ts`（`apiGet` / `apiSend` / `apiUpload`，错误统一从响应 `{ message }` 提取、兜底中文文案）
- 空状态统一 `EmptyState`；投递状态统一 `StatusBadge`（5 状态）；样式令牌遵循 `SoftUI.md` 与对比度要求

### 2.2 后端（代码证据）

- 路由组织：集合端点 `app/api/<resource>/route.ts`，单资源端点 `app/api/<resource>/[id]/route.ts`
- 列表 GET 返回投影摘要（如岗位 `{id, company, title, status, matched, createdAt, updatedAt}`），非全量记录
- 错误契约 `{ code, message }`：`code` 大写蛇形（`JOB_OPPORTUNITY_NOT_FOUND` 等），`message` 中文，404 语义化
- 仓储纯函数模式：`randomUUID()` 主键、`nowIso()` 时间戳、导出 Record 类型、变更 `.run()` 直接落库
- JSON 列（`fitResultJson`/`channelsJson`/`analysisJson`）字符串落库，路由层 `try/catch` 解析、坏 JSON 降级 `null`

### 2.3 Agent 工具层（代码证据）

- 工具统一经 `createDomainTool` 工厂（注入 `callStructured` + `log`），注册进 `agent.ts` 的 `getTools()`
- 9 个工具薄壳：`tools/<name>.ts` + `prompts/<name>.ts` + `schemas/<name>.ts` 契约
- 两段式对话化审批（tailoredResume / applyJob）：第一段只出摘要不落库 → 用户文字确认 → 第二段带 `confirmed` 落库
- 确定性护栏纯函数：`channel-guard.ts`（URL/邮箱本地正则提取）、`apply-state.ts`（状态机）、`resume-text.ts`、`resume-edits.ts`，均配 vitest 单测

## 3. 范围与决策

| # | 决策 | 结论 |
|---|---|---|
| 1 | 规范拆分 | 前端、后端（API + 数据）、Agent 工具层**各一份**（符合"一个主题一份规范"） |
| 2 | 定位 | **现状沉淀**，不改现有代码，固化为规范供后续遵循 |
| 3 | Agent 层 | 纳入后端工程规范体系，独立成一份（跨 9 工具重复，满足立规范条件） |
| 4 | 目录结构 | `.agents/specs/` 下按域编号：`01-frontend/`、`02-backend/`、`03-agent/`，与 `00-governance/` 并列 |
| 5 | 规范命名 | `frontend-conventions.md`、`api-data-conventions.md`、`agent-tooling-conventions.md` |

### 3.1 规范文件清单

| 路径 | 主题 |
|---|---|
| `.agents/specs/01-frontend/frontend-conventions.md` | 目录组织、hooks、API 客户端、空状态/抽屉/徽章、样式边界 |
| `.agents/specs/02-backend/api-data-conventions.md` | 路由组织、投影、错误契约、仓储模式、JSON 列、status 枚举、外键 |
| `.agents/specs/03-agent/agent-tooling-conventions.md` | 工具工厂、两段式审批、确定性护栏、纯函数 + 单测、prompts/schemas 分离 |

## 4. 各规范内容大纲

> 每条规范遵守 spec-autonomy 内容边界：可执行（命令/清单）+ 一行"为什么"。

### 4.1 前端工程规范（`01-frontend/frontend-conventions.md`）

1. **目录组织**：`ui/` 放 shadcn 原始组件（低自定义）；业务组件按域分目录（`chat/`、`sidebar/`、`artifacts/`）；新增业务域先建目录
   - 为什么：与现有结构一致，组件职责边界清晰
2. **命名**：文件 kebab-case、组件 PascalCase、hook `use` 前缀；需要浏览器 API 的文件首行 `'use client'`
   - 为什么：Next.js App Router 与 React 惯例
3. **数据访问**：一律走 `apiGet/apiSend/apiUpload`，不直接裸 `fetch` 业务端点；错误从响应 `{ message }` 提取、兜底中文文案
   - 为什么：`api.ts` 统一错误解析与敏感信息过滤，避免重复
4. **列表 hooks**：`useState` + `refresh`（`useCallback`）+ `useEffect` 挂载；变更（删除/上传）后重新 `refresh`
   - 为什么：现有 7 个 hook 的一致模式，数据源单一、状态自动同步
5. **UI 约定**：空状态一律 `EmptyState`；产物展示用 `artifacts/` 抽屉；投递状态用 `StatusBadge`
   - 为什么：统一视觉与交互，避免各自实现
6. **样式边界**：遵循 `SoftUI.md` 令牌与 AGENTS.md 对比度要求，禁止风格漂移
   - 为什么：UI 系列已多次验收，风格统一是产品一致性前提

### 4.2 后端工程规范（`02-backend/api-data-conventions.md`）

1. **路由组织**：集合端点 `app/api/<resource>/route.ts`；单资源端点 `app/api/<resource>/[id]/route.ts`
   - 为什么：REST 语义与现有 4 个资源一致
2. **列表投影**：列表 GET 返回投影摘要（`{id, …}` 精选字段 + `createdAt`/`updatedAt`），不返回全量记录（不含 `jdText`/`analysisJson` 等大字段）
   - 为什么：避免列表接口传输与暴露大字段，细节走详情端点
3. **错误契约**：`{ code, message }`；`code` 大写蛇形（如 `JOB_OPPORTUNITY_NOT_FOUND`），`message` 中文；404 语义化；敏感信息不进错误与日志
   - 为什么：前端 `api.ts` 依赖该契约解析；对齐 AGENTS.md 敏感信息边界
4. **仓储纯函数**：`randomUUID()` 主键、`nowIso()` 时间戳、导出 Record 类型、变更 `.run()` 直接落库
   - 为什么：同步直连 better-sqlite3，简单可测
5. **JSON 列**：字符串落库，路由层 `try/catch` 解析、坏 JSON 降级 `null`
   - 为什么：SQLite 无原生 JSON，LLM 产物运行时校验（经验 #8）
6. **状态枚举**：`status` 列枚举 saved/analyzed/matched/applying/applied/skipped；状态转移走 `apply-state` 规则
   - 为什么：投递状态机统一语义，前端 `StatusBadge` 依赖该枚举
7. **外键**：SQLite 连接启用 `PRAGMA foreign_keys = ON`（迁移 `db/index.ts` 已启用）
   - 为什么：级联删除正确性（删除简历/岗位联动清理）

### 4.3 Agent 工具层规范（`03-agent/agent-tooling-conventions.md`）

1. **工具形态**：领域工具一律经 `createDomainTool` 工厂创建；注册进 `agent.ts` 的 `getTools()`；工具内结构化 LLM 调用走 `ctx.callStructured`
   - 为什么：工厂统一注入模型与日志、统一错误包装
2. **文件组织**：`tools/<name>.ts`（薄壳）+ `prompts/<name>.ts` + `schemas/<name>.ts`（契约）
   - 为什么：工具文件只做编排，契约与提示词独立可维护
3. **两段式对话化审批**：高风险/数据变更动作（tailoredResume / applyJob）第一段只出摘要不落库 → 用户文字确认 → 第二段带 `confirmed` 落库；执行前校验前置条件（如岗位未匹配 `JOB_MATCH_REQUIRED`）
   - 为什么：对外关键动作必须有人工确认点（经验 #4）
4. **确定性护栏**：URL/邮箱等事实仅本地正则提取（channel-guard），LLM 只分类不创造；分析结论基于证据引用
   - 为什么：严禁 LLM 臆造事实（经验 #6）
5. **纯函数 + 单测**：状态机/规则/文本处理抽纯函数（apply-state / channel-guard / resume-text / resume-edits），配 vitest 单测（TDD）
   - 为什么：规则逻辑可独立验证，测试服务功能推进
6. **资源发现**：系统已有资源（简历/岗位）经 `listResumes` / `listJobOpportunities` 获取 id，避免重复导入
   - 为什么：对话中已导入的资源可直接复用（经验：上传后无法分析的修复）

## 5. 验收标准

1. `.agents/specs/` 下新增 3 份规范文件，位于 `01-frontend/`、`02-backend/`、`03-agent/` 目录
2. 每份规范遵守 spec-autonomy：条目可执行（清单/命令），每条附一行"为什么"
3. 规范内容与现有代码约定一致（抽查各 1-2 条对照代码）
4. 设计文档 + 计划文档 + 规范文件按流程落盘并 commit
5. `docs/plans/2026-08-09-engineering-specs.md` 记录规范变更（spec-autonomy 修订流程）

## 6. 边界（不在本期）

- ❌ 不重写、重构现有代码对齐规范（定位为现状沉淀）
- ❌ 不新增 UI 组件或业务功能
- ❌ 不建立测试覆盖率门槛
- ❌ 不改动现有 2 份治理规范
