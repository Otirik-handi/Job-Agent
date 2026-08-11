# Phase 10：显式规划（P1-2）

日期：2026-08-10
状态：完成（2026-08-10 验收通过，分支 phase10-planning）
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

- [x] **T0 规范先行**：03-agent 补充「显式规划」约定（data/plans/ 文件结构/planCreate·planUpdate 契约/规划原则/中断恢复与 scratchpad 边界）——提交 ceb8a44，审查通过
- [x] **T1 计划读写层**
  - [x] `src/agent/plans.ts`：createPlan（taskId 正则+resolve 前缀双防护、1-8 步、PLAN_EXISTS 不覆盖）/ readPlan（不存在 null、损坏容错）/ updatePlanStep（状态机单向推进、done/blocked 终态无出口、blocked 须附 note、PLAN_NOT_FOUND/PLAN_STEP_INVALID/PLAN_STATUS_INVALID）/ listPlans（状态汇总、损坏跳过）；文件 Markdown 固定小节、round-trip 可解析
  - [x] plans.test.ts 26 用例（创建/读取/更新/流转/终态回退/越界/路径穿越/损坏容错）
  - ✅ **Checkpoint A**：提交 60edd11 + db9c813，审查通过（planUpdate description 歧义已修 cb107e8）
- [x] **T2 规划工具**
  - [x] planCreate（返回 planMarkdown 供对话确认）/ planUpdate（返回 planSummary）；description 4 句；免 confirmed（可逆本地操作）
  - [x] SYSTEM_PROMPT「规划（计划）」段（复杂任务 3-6 步→对话确认→逐步执行+planUpdate→判定继续/调整/终止；简单任务不建计划）+ getTools 注册
- [x] **T3 中断恢复**
  - [x] getActivePlans（活跃计划过滤/blockedNotes/倒序）+ buildSystemPrompt「进行中计划」段（签名不变，仅摘要不泄漏全文，占位与既有段一致）
  - [x] planRead 工具（读全文支持续跑；PLAN_NOT_FOUND + hint）——审查发现缺口后补充
  - [x] 新增 4 用例
  - ✅ **Checkpoint C**：提交 e7b0bb6 + 1f4f072，审查通过（中断恢复闭环完整：摘要注入→planRead 全文→planUpdate 续跑）
- [x] **T4 验证收尾**：`npm run lint && npx tsc --noEmit && npm test`（116/116）通过；`npm run build` 通过

## 验收记录（2026-08-10）

1. ✅ 计划文件创建/更新/读取全链路（26+4 单测），状态机终态不可回退，路径防护双闸
2. ✅ planCreate/planUpdate/planRead 三工具生效（结构化错误契约）
3. ✅ 复杂任务先出计划并请求确认（SYSTEM_PROMPT 规划原则）
4. ✅ 中断恢复：会话组装注入进行中计划摘要，Agent 可读全文续跑
5. ✅ 全量 lint/tsc/116 测试/build 通过

已知限制（后续处理）：blocked→done 不允许（终态严格，重做需新建计划）；仅 blocked 的计划摘要行缺总步数（cosmetic）；getActivePlans 两次读文件存在理论 TOCTOU（本地单用户可忽略）。

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3 → T4
- 计划文件与既有 tmp/plans？无关（项目 .zcode/plans 是 zcode 客户端目录，不冲突；本计划用 `plans/` 项目目录，需确认与 docs/plans 命名不混淆——实现时定：`plans/` 或 `data/plans/`，以 T0 规范定稿为准）

## 验收标准

1. 计划文件创建/更新/读取全链路（单测覆盖），状态流转有校验
2. 复杂任务 Agent 先出计划并请求确认（SYSTEM_PROMPT 原则生效）
3. 中断后会话恢复能读到计划状态续跑
4. 全量 lint/tsc/test 通过
