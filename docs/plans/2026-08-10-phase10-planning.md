# Phase 10：显式规划（P1-2）

日期：2026-08-10
状态：草稿
目标：为 job-helper 建立显式规划能力——计划文件持久化 + Agent 工具自主管理 + 创建时用户确认，支持长任务中断续跑与进度追踪。
关联规范：`.agents/specs/03-agent/agent-tooling-conventions.md`（需更新）、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（P1-2 定稿）
依据：`docs/designs/2026-08-10-agent-architecture-research.md` 专题 06（规划能力）

## 范围

- 计划载体：`plans/<taskId>.md` 文件（步骤列表/状态 todo·in_progress·done·blocked/依赖 depends_on/产出物路径/失败备注）
- 新增 `planCreate` / `planUpdate` 工具（Agent 自主管理），planCreate 输出计划文本供对话展示确认
- SYSTEM_PROMPT 增加规划原则：复杂任务（多步骤/长链条）先出 3-6 步计划给用户确认再执行；每步执行后更新计划并判定"照计划/调整/提前终止"；简单任务不生成计划
- 中断恢复：会话恢复时注入最近计划（或 planGet 工具读取）
- 不做：独立 planner Agent、DAG 依赖引擎、计划进度 UI（进度联动放 phase13）

## 任务清单

- [ ] **T0 规范先行**：03-agent 规范补充规划约定——计划文件结构（步骤/状态/依赖/产出物/失败备注）、planCreate/planUpdate 工具契约（创建返回计划文本、更新校验状态流转）、规划原则（何时生成计划/用户确认/判定规则）
- [ ] **T1 计划文件读写层**
  - [ ] 新增 `src/agent/plans.ts`（或 `src/agent/plan-fs.ts`）：createPlan(taskId, steps)、readPlan(taskId)、updatePlanStep(taskId, stepIndex, status, note)、listPlans()；计划文件路径限定 `plans/` 目录（防路径穿越）；状态流转校验（todo→in_progress→done/blocked）
  - [ ] 单测：创建/读取/状态流转/越界拒绝/损坏文件容错
  - ✅ **Checkpoint A**：计划读写层单测通过
- [ ] **T2 规划工具**
  - [ ] 新增 `src/agent/tools/plan-create.ts`：inputSchema（taskId、steps[{title, successCriteria}]、dependsOn?）；创建计划文件，返回计划 markdown（供 Agent 展示给用户确认）
  - [ ] 新增 `src/agent/tools/plan-update.ts`：inputSchema（taskId、stepIndex、status、note?）；更新步骤状态；返回更新后计划摘要
  - [ ] SYSTEM_PROMPT 增加「规划」原则段（复杂任务先 planCreate 出计划 → 对话展示请求用户确认 → 确认后逐步执行；每步完成后 planUpdate；blocked 步骤记录原因；结束判定"全部 done 或用户确认的边界"）
  - [ ] 注册两工具进 getTools()
  - ✅ **Checkpoint B**：工具单测（创建/更新/非法状态）；lint/tsc 通过
- [ ] **T3 中断恢复**
  - [ ] 会话恢复（route.ts 或对话组装层）时：若存在该会话最近计划（按 conversationId 关联或注入最近 listPlans），注入计划状态段（进行中步骤/blocked 备注）
  - ✅ **Checkpoint C**：模拟中断后新轮次 system prompt 含计划状态，Agent 可续跑
- [ ] **T4 验证收尾**：`npm run lint && npx tsc --noEmit && npm test` 全绿

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3 → T4
- 计划文件与既有 tmp/plans？无关（项目 .zcode/plans 是 zcode 客户端目录，不冲突；本计划用 `plans/` 项目目录，需确认与 docs/plans 命名不混淆——实现时定：`plans/` 或 `data/plans/`，以 T0 规范定稿为准）

## 验收标准

1. 计划文件创建/更新/读取全链路（单测覆盖），状态流转有校验
2. 复杂任务 Agent 先出计划并请求确认（SYSTEM_PROMPT 原则生效）
3. 中断后会话恢复能读到计划状态续跑
4. 全量 lint/tsc/test 通过
