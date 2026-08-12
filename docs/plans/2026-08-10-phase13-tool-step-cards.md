# Phase 13：UX 三态步骤卡片（P1-5）

日期：2026-08-10
状态：完成（2026-08-10 验收通过，分支 phase13-tool-step-cards）
目标：工具执行过程在对话流中留下正式步骤卡片（运行/完成/失败三态，完成折叠一行、失败附重试），并与规划进度（phase10）联动显示"第 N 步"。
关联规范：`.agents/specs/01-frontend/frontend-conventions.md`（需更新）、`docs/research/2026-08-10-agent-roadmap-discussion.md`（P1-5 定稿）
依据：`docs/research/2026-08-10-agent-architecture-research.md` 专题 12（对话 UX）

## 范围

- 前端：工具调用渲染为三态步骤卡片并**留在消息流**（AI SDK tool part 渲染：工具名 + 状态徽章 + 一句话摘要，默认折叠可展开详情）
- 失败态：红色 + 错误摘要 + 「重试」按钮（复用会话 id 发重试消息，触发该工具重跑）
- 运行态：流式状态保留（phase8 已有 running/failed 瞬时卡，本阶段改为正式卡片并持久化）
- 规划进度联动：有进行中计划（phase10 的 plans 文件）时显示"第 N 步（共 M 步）"轻量进度（依赖 phase10 已合并）
- 不做：深研式来源侧栏、完成通知

## 任务清单

- [x] **T0 规范先行**：01-frontend 补充「工具步骤卡片」与「规划进度联动」约定（渲染来源/三态语义/持久化/重试/组件边界/可访问性/横幅格式）——提交 7ddc2de，自查通过
- [x] **T1 步骤卡片组件**
  - [x] `tool-step-card.tsx`：collectToolSteps 纯函数（isToolUIPart 识别 tool-<name>/dynamic-tool，state 判定三态）；运行中徽章/完成折叠一行可展开（extractSuccessSummary 按工具映射摘要 + extractSuccessDetails 详情）/失败红色 + error.message + hint；随消息持久化从 part 还原；预览态排除走确认卡
  - [x] 26 个组件纯函数单测
  - ✅ **Checkpoint A**：提交 e5b9e8f（含 T2）
- [x] **T2 失败重试**
  - [x] 「重试」按钮：buildRetryMessage 经 onRetryTool=sendText 复用会话 id 发重试消息；busy/clicked 防重复；与确认卡同构
- [x] **T3 规划进度联动（依赖 phase10）**
  - [x] 后端 GET /api/plans/active（getActivePlans 投影 taskId/title/currentStepIndex/totalSteps/currentStepTitle/statusCounts；buildActivePlanProjection 二次 readPlan 补步骤标题；空 {plans:[]}）；6 个 API 单测
  - [x] 前端 use-active-plans hook（挂载拉取 + onFinish 刷新信号 + 失败静默降级）；横幅「计划「标题」第 N 步（共 M 步）：当前步骤名」（N=第一个 in_progress 转 1-based，M=总步数；全 done/无计划不渲染）
  - ✅ **Checkpoint C**：提交 a9929a3；审查通过（blocked-only 不显示已文档化）
- [x] **T4 验证收尾**：`npm run lint && npx tsc --noEmit && npm test`（184/184）通过；`npm run build` 通过（/api/plans/active 注册）

## 验收记录（2026-08-10）

1. ✅ 工具调用以三态步骤卡片留在消息流（从 tool part 还原，刷新后仍在）；完成态折叠一行可展开
2. ✅ 失败卡片红色 + 错误摘要 + 重试按钮（防重复点击）
3. ✅ 有活跃计划时横幅显示"第 N 步（共 M 步）：当前步骤名"；无计划不显示
4. ✅ record-status-card 确认卡独立共存；tool-progress-card 瞬时卡保留（职责互补）
5. ✅ 全量 lint/tsc/184 测试/build 通过

已知限制（后续处理）：blocked-only 活跃计划横幅不显示（无 N 可展示，已测试文档化）；重试按钮点击后永久置灰至重跑结束（与确认卡一致）；chevron/图标 aria-hidden 与详情键中文标签等细节可后续打磨。

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3 → T4
- T3 依赖 phase10 合并（plans 文件读取）；若 phase10 未完成则 T3 延后，T1/T2 先行

## 验收标准

1. 工具调用以三态步骤卡片留在消息流（刷新后仍在），完成态折叠一行可展开
2. 失败卡片红色 + 错误摘要 + 重试按钮（防重复点击）
3. 有进行中计划时显示"第 N 步"轻量进度
4. 全量 lint/tsc/test/build 通过 + GUI 实测确认
