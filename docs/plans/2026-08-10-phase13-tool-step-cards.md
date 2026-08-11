# Phase 13：UX 三态步骤卡片（P1-5）

日期：2026-08-10
状态：草稿
目标：工具执行过程在对话流中留下正式步骤卡片（运行/完成/失败三态，完成折叠一行、失败附重试），并与规划进度（phase10）联动显示"第 N 步"。
关联规范：`.agents/specs/01-frontend/frontend-conventions.md`（需更新）、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（P1-5 定稿）
依据：`docs/designs/2026-08-10-agent-architecture-research.md` 专题 12（对话 UX）

## 范围

- 前端：工具调用渲染为三态步骤卡片并**留在消息流**（AI SDK tool part 渲染：工具名 + 状态徽章 + 一句话摘要，默认折叠可展开详情）
- 失败态：红色 + 错误摘要 + 「重试」按钮（复用会话 id 发重试消息，触发该工具重跑）
- 运行态：流式状态保留（phase8 已有 running/failed 瞬时卡，本阶段改为正式卡片并持久化）
- 规划进度联动：有进行中计划（phase10 的 plans 文件）时显示"第 N 步（共 M 步）"轻量进度（依赖 phase10 已合并）
- 不做：深研式来源侧栏、完成通知

## 任务清单

- [ ] **T0 规范先行**：01-frontend 规范补充步骤卡片约定——渲染来源（AI SDK tool part）、三态样式与语义、折叠/展开交互、重试按钮行为、与规划进度联动的数据来源（plans 文件）
- [ ] **T1 步骤卡片组件**
  - [ ] 改造/新增组件（如 `src/components/chat/tool-step-card.tsx`）：从消息 tool part（tool-<name>/dynamic-tool，参照 record-status-card 的识别模式）渲染正式卡片——工具名 + 状态（运行/完成/失败）+ 一句话摘要（成功摘要从输出提取或固定文案）；完成态折叠成一行，可展开看详情（输出要点）；运行态流式更新
  - [ ] 消息流渲染接入（message-bubble/chat-panel）：卡片随消息持久化（刷新后仍在，从 tool part 还原状态）
  - ✅ **Checkpoint A**：build 通过；组件单测或冒烟（三态渲染/折叠展开）
- [ ] **T2 失败重试**
  - [ ] 失败卡片附「重试」按钮：点击后复用会话 id 发送重试消息（同 record-status-card 的 sendText 通道），触发该工具重跑；防重复点击（busy/已点击置灰）
  - ✅ **Checkpoint B**：build 通过；冒烟（失败卡出现重试按钮，点击触发重试消息）
- [ ] **T3 规划进度联动（依赖 phase10）**
  - [ ] 有进行中计划时（经 planGet/listPlans 或注入的计划状态），对话区显示轻量进度"第 N 步（共 M 步）"+ 当前步骤名；计划完成后收起
  - ✅ **Checkpoint C**：有/无计划两种状态下 UI 正确
- [ ] **T4 验证收尾**：`npm run lint && npx tsc --noEmit && npm test` 全绿；`npm run build` 通过；GUI 实测（真实对话触发工具：运行→完成折叠 / 构造失败→重试按钮）

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3 → T4
- T3 依赖 phase10 合并（plans 文件读取）；若 phase10 未完成则 T3 延后，T1/T2 先行

## 验收标准

1. 工具调用以三态步骤卡片留在消息流（刷新后仍在），完成态折叠一行可展开
2. 失败卡片红色 + 错误摘要 + 重试按钮（防重复点击）
3. 有进行中计划时显示"第 N 步"轻量进度
4. 全量 lint/tsc/test/build 通过 + GUI 实测确认
