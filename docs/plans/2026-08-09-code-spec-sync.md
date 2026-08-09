# 代码与工程规范同步实施计划

> **元信息**：日期 2026-08-09 · 状态：完成 · 目标：审计并修复代码与 01-04 工程规范的偏差（2 处） · 关联规范：AGENTS.md、spec-autonomy.md（修订流程）、01-frontend/02-backend/03-agent/04-comments 工程规范
> 依据：工程规范均为现状沉淀定位，审计以"代码是否符合规范"为判据；规范与实现脱节处按"代码先于规范"还原规范

**Goal:** 系统性审计代码对 4 份工程规范的符合度，修复全部真实偏差，使代码与规范一致。

**Architecture:** 审计覆盖 5 组规范点（前端目录/hooks/API 客户端/空状态/use-client、后端投影/错误契约/仓储/JSON 列/枚举、Agent 三件套/纯函数/错误契约/审批流、注释四原则）。修复分两类：代码偏差改代码，规范偏差改规范。

**设计依据：** 无独立设计文档（纯对齐任务，变更记录在本计划）
**验收标准：** 全部审计点符合；test + build 通过；工作树干净。

## 审计结论（Task 1 已执行）

符合项：前端裸 fetch（无）、use-*.ts hooks 模式、EmptyState 全覆盖、'use client' 标注、列表投影、错误契约 `{code,message}`、仓储 Record/nowIso、JSON 列 try/catch、status 枚举、注释四原则（全中文/克制/选择性 JSDoc/eslint-disable 附原因）。

**偏差 2 处：**

| # | 位置 | 偏差 | 方向 |
|---|---|---|---|
| 1 | 后端·代码 | `nowIso` 定义在 `conversations.ts`，被 messages/resumes/job-opportunities/tailored-resumes 4 仓储跨模块导入（通用函数寄生业务仓储，重构 conversations 牵连全部） | 改代码 |
| 2 | Agent·规范 | 03-agent「每个工具三文件」与实现脱节：确定性工具（import/list ×4）无 prompts/schemas（schema 内联），apply-job 有 schema 无 prompt | 改规范 |

---

### Task 1: 全量审计

- [x] 前端：目录组织、hooks 模式、API 客户端、EmptyState、'use client'、空状态文本
- [x] 后端：列表投影、错误契约、仓储模式、JSON 列、status 枚举、外键
- [x] Agent：三件套结构、纯函数 + 单测、错误 `{code,message}`、createDomainTool 使用
- [x] 注释：语言、克制、选择性 JSDoc、eslint-disable 原因、TODO 禁令
- [x] 产出偏差清单（2 处）并确认修复范围（两处都修）

### Task 2: 偏差 1 修复（代码）

- [x] 新建 `src/db/repositories/shared.ts`（`nowIso` 共享模块）
- [x] 5 个仓储（conversations/messages/resumes/job-opportunities/tailored-resumes）改 `import { nowIso } from './shared'`
- [x] 确认无残留 `from './conversations'` 导入

### Task 3: 偏差 2 修复（规范）

- [x] 修订 `03-agent/agent-tooling-conventions.md` 文件组织条目：区分 **LLM 工具三件套**（tools+prompts+schemas）与 **确定性工具单文件**（schema 内联或独立，不建 prompts，YAGNI）
- [x] 同步 02-backend 规范仓储条目：`nowIso` 定义于 `shared.ts`（含"为什么"）

### Task 4: 回归验证

- [x] `npm run test`（47/47 通过）
- [x] `npm run build`（TypeScript 编译 + 生产构建通过）
- [x] `npm run lint`（无告警）
- [x] 工作树干净；规范变更已在本计划记录
- [x] 本计划头部 `状态：生效` → `状态：完成`

**Checkpoint：** 代码与规范一致；test/build 通过；git 历史完整。

## 任务依赖

- Task 2 / 3 相互独立（代码 vs 规范文件不相交），可并行
- Task 4 依赖 2/3
