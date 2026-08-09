# 代码注释规范实施计划

> **元信息**：日期 2026-08-09 · 状态：生效 · 目标：创建代码注释规范到 `.agents/specs/04-comments/comments-conventions.md`（现状沉淀，横切三层，不改代码） · 关联规范：AGENTS.md、spec-autonomy.md（新增条件/内容边界/修订流程）、plan-document.md
> 前置：设计文档 `docs/designs/2026-08-09-comments-conventions-design.md` 已批准

**Goal:** 把代码中已稳定一致的中文注释、JSDoc 选择性覆盖、"为什么"注释、eslint-disable 原因等约定固化为一份规范，供后续新代码遵循。

**Architecture:** 单份规范文件，放入 `.agents/specs/04-comments/`（横切约定，延续按域编号体系，与 00 治理、01-03 代码域并列）。纯文档任务，零代码改动。

**设计依据：** `docs/designs/2026-08-09-comments-conventions-design.md`
**验收标准：** 设计文档第 5 节（4 项）。

## 已确认的现状事实（内容来源核实）

- 注释几乎全中文；`/** */` 用于导出函数/类型/契约（apply-state、resume-text、resume-edits、schemas、tool-factory、message-bubble）
- 自解释导出（use-*.ts hooks、仓储 CRUD）无 JSDoc——选择性覆盖
- `tool-factory.ts` 泛型桥接大段"为什么"注释；`eslint-disable` 均附中文原因
- JSX `{/* 区块 */}`（message-bubble）；无 TODO/FIXME/XXX

---

### Task 1: 设计文档

- [x] 创建 `docs/designs/2026-08-09-comments-conventions-design.md`（背景、现状核实、决策、9 条大纲、验收标准）
- [x] `git commit -m "docs: 代码注释规范设计（横切三层，现状沉淀）"`

### Task 2: 计划文档

- [x] 创建本计划文件 `docs/plans/2026-08-09-comments-conventions.md`
- [x] `git commit -m "docs: 代码注释规范实施计划"`

### Task 3: 注释规范

- [ ] 创建 `.agents/specs/04-comments/comments-conventions.md`
  - 内容（9 条）：语言、克制原则、JSDoc 覆盖、复杂逻辑"为什么"、eslint-disable 原因、JSX 区块标记、来源引用、敏感信息禁入、TODO 禁令
- [ ] 每条附"为什么"；抽查对照 `src/agent/tool-factory.ts`、`src/components/chat/message-bubble.tsx` 一致性
- [ ] `git commit -m "docs: 新增代码注释工程规范（现状沉淀）"`

### Task 4: 收尾验证

- [ ] `.agents/specs/04-comments/comments-conventions.md` 就位；每条含"为什么"，无占位符
- [ ] 工作树干净；`git log --oneline -4` 展示 3 个提交（设计、计划、规范）
- [ ] 本计划头部 `状态：生效` → `状态：完成`

**Checkpoint：** 规范文件就位且与现状注释实践一致；git 历史完整；工作树干净。

## 任务依赖

- Task 3 依赖 Task 1/2（前置已完成）
- Task 4 最后执行

## 验收清单（对应设计文档第 5 节）

- [ ] `.agents/specs/04-comments/comments-conventions.md` 就位
- [ ] 规范遵守 spec-autonomy：条目可执行，每条附"为什么"
- [ ] 规范内容与现有注释实践一致（抽查通过）
- [ ] 设计 + 计划 + 规范文件均已 commit
