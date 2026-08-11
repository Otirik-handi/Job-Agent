# Phase 12：会话级摘要（P1-4）

日期：2026-08-10
状态：草稿
目标：为 job-helper 增加会话级滚动摘要——首次达到轮数上限时对旧轮 LLM 压缩生成摘要，替代直接丢弃，保留偏好/进度/未决事项。
关联规范：`.agents/specs/02-backend/api-data-conventions.md`（需更新）、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（P1-4 定稿）
依据：`docs/designs/2026-08-10-agent-architecture-research.md` 专题 02/11（compaction）

## 范围

- `conversations` 表新增 `summary` 字段（可空）
- 摘要生成：会话消息数首次达到轮数上限（MAX_HISTORY_ROUNDS=12 的截断点）时，对将被截断的旧轮用 LLM（callStructured 通道）生成一次摘要，写入 conversations.summary；此后不再重复生成
- 注入：buildSystemPrompt 增加摘要段（稳定段之后、最近轮之前）
- 内容侧重（compaction 原则）：用户偏好与画像变化、已投递进度、未决事项/进行中任务、关键决策；丢弃冗余工具输出
- 不做：滚动更新（每 N 轮重写）、token 估算触发、服务端自动 compact

## 任务清单

- [ ] **T0 规范先行**：02-backend 补充 conversations.summary 字段约定（可空/内容侧重/生成时机/与 memory_blocks 边界：摘要=对话上下文压缩，记忆块=结构化事实）
- [ ] **T1 数据层**
  - [ ] `src/db/schema.ts` conversations 新增 summary（text 可空）；drizzle-kit generate 迁移并应用
  - [ ] `src/db/repositories/conversations.ts` 增加 getSummary/setSummary（或 updateConversationSummary）
  - ✅ **Checkpoint A**：迁移成功；repository 冒烟（写读/空值兼容）
- [ ] **T2 摘要生成与注入**
  - [ ] 新增摘要生成逻辑（建议 `src/agent/summary.ts` 或并入 context.ts）：入参 = 被截断的旧轮消息（JSON 解析后的文本摘要列表）；用 callStructured 调用 LLM 生成摘要（输出 schema：summary 文本 + 是否含未决事项标记）；失败降级（生成失败不阻塞请求，跳过摘要）
  - [ ] route.ts 组装时：消息数超过上限且 conversations.summary 为空 → 触发一次生成（对截断部分），写入；此后注入 summary
  - [ ] `src/agent/context.ts` buildSystemPrompt 增加摘要段（summary 非空时输出"历史摘要：<summary>"）
  - [ ] 注意：敏感信息——摘要生成入参为消息文本（用户数据），LLM 调用不落日志（遵循 AGENTS.md）
  - ✅ **Checkpoint B**：单测/冒烟——首次截断生成摘要并落库；再次请求不再重复生成；注入段正确；生成失败不影响主流程
- [ ] **T3 验证收尾**：`npm run lint && npx tsc --noEmit && npm test` 全绿（既有 73 + 新增）

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3
- 依赖 phase7 的 callStructured 通道与轮数截断逻辑（route.ts 现状）

## 验收标准

1. conversations.summary 迁移可用，写读正常
2. 首次达到上限生成一次摘要并落库（不重复），生成失败不阻塞
3. buildSystemPrompt 注入摘要段（位置正确）
4. 全量 lint/tsc/test 通过
