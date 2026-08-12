# Phase 12：会话级摘要（P1-4）

日期：2026-08-10
状态：完成（2026-08-10 验收通过，分支 phase12-session-summary）
目标：为 job-helper 增加会话级滚动摘要——首次达到轮数上限时对旧轮 LLM 压缩生成摘要，替代直接丢弃，保留偏好/进度/未决事项。
关联规范：`.agents/specs/02-backend/api-data-conventions.md`（需更新）、`docs/research/2026-08-10-agent-roadmap-discussion.md`（P1-4 定稿）
依据：`docs/research/2026-08-10-agent-architecture-research.md` 专题 02/11（compaction）

## 范围

- `conversations` 表新增 `summary` 字段（可空）
- 摘要生成：会话消息数首次达到轮数上限（MAX_HISTORY_ROUNDS=12 的截断点）时，对将被截断的旧轮用 LLM（callStructured 通道）生成一次摘要，写入 conversations.summary；此后不再重复生成
- 注入：buildSystemPrompt 增加摘要段（稳定段之后、最近轮之前）
- 内容侧重（compaction 原则）：用户偏好与画像变化、已投递进度、未决事项/进行中任务、关键决策；丢弃冗余工具输出
- 不做：滚动更新（每 N 轮重写）、token 估算触发、服务端自动 compact

## 任务清单

- [x] **T0 规范先行**：02-backend 补充「会话摘要」约定（summary 字段/内容侧重/生成时机/只生成一次/失败降级/注入位置/记忆层边界/敏感信息）——提交 b8494ef，自查通过
- [x] **T1 数据层**
  - [x] conversations.summary（text 可空）+ 迁移 0004 应用成功；getConversationSummary/setConversationSummary
  - ✅ **Checkpoint A**：提交 eb666f9
- [x] **T2 摘要生成与注入**
  - [x] `src/agent/summary.ts`：extractConversationTranscript（只取文本 parts、8000 字符头尾采样 30/70）+ generateConversationSummary（callStructured，schema {summary, hasPending}，失败降级 null 不落日志）；提示词 prompts/session-summary.ts（四类侧重/严禁编造/400 字上限）；MAX_HISTORY_ROUNDS 收敛为单一来源
  - [x] route.ts maybeGenerateSummary（summary 非空不重复/超限首次截断生成/失败不阻塞）；context.ts buildSystemPrompt 增加 conversationSummary 参数与「历史摘要」段（稳定段后、会话状态前）
  - [x] 新增 20 用例（conversations 4 + summary 13 + context 3）；vitest.config.ts（@/ 别名 + fileParallelism: false 解决 SQLite 并行锁）
  - ✅ **Checkpoint B**：提交 08291c5 + 05aade2；真实 LLM 冒烟生成成功（含偏好/进度/未决事项）
- [x] **T3 验证收尾**：`npm run lint && npx tsc --noEmit && npm test`（152/152）通过；`npm run build` 通过

## 验收记录（2026-08-10）

1. ✅ conversations.summary 迁移可用，写读正常（4 单测）
2. ✅ 首次截断生成一次摘要并落库（真实 LLM 冒烟），summary 非空不重复生成；失败降级不阻塞
3. ✅ buildSystemPrompt 注入摘要段（位置/占位单测锁定）
4. ✅ 全量 lint/tsc/152 测试/build 通过

已知限制（后续处理）：触发存在一轮偏差（historyRecords 判定 vs merged 判定，缺口 ≤1 条旧消息，全量落库可溯源，审查评估可接受）；hasPending 未持久化（仅生成当次返回）；summary 长度仅提示词约束。

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3
- 依赖 phase7 的 callStructured 通道与轮数截断逻辑（route.ts 现状）

## 验收标准

1. conversations.summary 迁移可用，写读正常
2. 首次达到上限生成一次摘要并落库（不重复），生成失败不阻塞
3. buildSystemPrompt 注入摘要段（位置正确）
4. 全量 lint/tsc/test 通过
