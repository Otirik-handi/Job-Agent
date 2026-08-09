# 工程规范落盘实施计划

> **元信息**：日期 2026-08-09 · 状态：生效 · 目标：创建前端 / 后端 / Agent 工具层三份工程规范到 `.agents/specs/`（现状沉淀，不改代码） · 关联规范：AGENTS.md、spec-autonomy.md（新增条件/内容边界/修订流程）、plan-document.md
> 前置：设计文档 `docs/designs/2026-08-09-engineering-specs-design.md` 已批准

**Goal:** 把代码中已稳定一致的前端、后端（API + 数据）、Agent 工具层约定固化为三份规范，供后续新代码遵循。

**Architecture:** 三份独立规范文件，按域编号目录放入 `.agents/specs/`，与 `00-governance/` 并列。纯文档任务，零代码改动。规范条目遵守 spec-autonomy：可执行 + 一行"为什么"。

**设计依据：** `docs/designs/2026-08-09-engineering-specs-design.md`
**验收标准：** 设计文档第 5 节（5 项）。

## 已确认的现状事实（内容来源核实）

- 前端：`src/components/{ui,chat,sidebar,artifacts}/`、`src/lib/use-*.ts` × 7、`api.ts` 三函数、`EmptyState`/`StatusBadge`
- 后端：`app/api/<resource>/` 集合+`[id]` 路由、投影列表、`{code,message}` 错误、仓储纯函数、JSON 列字符串化
- Agent：`createDomainTool` 工厂 + `getTools()` 注册、两段式审批（tailoredResume/applyJob）、`channel-guard`/`apply-state`/`resume-text`/`resume-edits` 纯函数 + 单测

---

### Task 1: 设计文档

- [x] 创建 `docs/designs/2026-08-09-engineering-specs-design.md`（范围、决策、三份规范大纲、验收标准）
- [x] `git commit -m "docs: 工程规范设计（前端/后端/Agent 工具层，现状沉淀）"`

### Task 2: 计划文档

- [x] 创建本计划文件 `docs/plans/2026-08-09-engineering-specs.md`
- [x] `git commit -m "docs: 工程规范落盘实施计划"`

### Task 3: 前端工程规范

- [ ] 创建 `.agents/specs/01-frontend/frontend-conventions.md`
  - 内容：目录组织、命名、数据访问（api.ts）、列表 hooks、UI 约定（EmptyState/抽屉/StatusBadge）、样式边界（SoftUI/对比度）
- [ ] 每条附"为什么"；抽查对照 `src/lib/api.ts`、`use-job-opportunities.ts` 一致性
- [ ] `git commit -m "docs: 新增前端工程规范（现状沉淀）"`

### Task 4: 后端工程规范

- [ ] 创建 `.agents/specs/02-backend/api-data-conventions.md`
  - 内容：路由组织、列表投影、错误契约、仓储纯函数、JSON 列、status 枚举、外键
- [ ] 每条附"为什么"；抽查对照 `app/api/job-opportunities/route.ts`、`src/db/repositories/job-opportunities.ts` 一致性
- [ ] `git commit -m "docs: 新增后端工程规范（现状沉淀）"`

### Task 5: Agent 工具层规范

- [ ] 创建 `.agents/specs/03-agent/agent-tooling-conventions.md`
  - 内容：工具工厂、文件组织、两段式审批、确定性护栏、纯函数 + 单测、资源发现
- [ ] 每条附"为什么"；抽查对照 `src/agent/tool-factory.ts`、`src/agent/tools/apply-job.ts` 一致性
- [ ] `git commit -m "docs: 新增 Agent 工具层工程规范（现状沉淀）"`

### Task 6: 收尾验证

- [ ] `.agents/specs/` 下三份规范就位（01-frontend / 02-backend / 03-agent）
- [ ] 每份规范每条含"为什么"，无占位符/TODO
- [ ] 工作树干净；`git log --oneline -6` 展示 5 个提交（设计、计划、三份规范）
- [ ] 本计划头部 `状态：生效` → `状态：完成`

**Checkpoint：** 三份规范文件就位且与现状代码一致；git 历史完整；工作树干净。

## 任务依赖

- Task 3 / 4 / 5 相互独立，可并行（文件不相交）
- Task 1 / 2 前置已完成
- Task 6 最后执行

## 验收清单（对应设计文档第 5 节）

- [ ] `.agents/specs/` 新增 3 份规范，位于 01-frontend / 02-backend / 03-agent
- [ ] 每份规范条目可执行，每条附"为什么"
- [ ] 规范内容与现有代码约定一致（抽查通过）
- [ ] 设计 + 计划 + 规范文件均已 commit
- [ ] 计划文档记录了本次规范变更（spec-autonomy 修订流程）
