# 第一期：Agent 记忆层 + 会话状态 + 上下文策略（P0 第 1-3 项）

日期：2026-08-10
状态：完成（2026-08-10 验收通过，分支 phase7-agent-memory-context）
目标：为 job-helper 补齐通用 Agent 的最小记忆骨架——显式写入的记忆块、可校验的会话状态、分层注入的上下文组装；解决"20 轮截断丢上下文、跨会话失忆、简历/JD 全量塞窗口"三个问题。
关联规范：`.agents/specs/00-governance/plan-document.md`、`.agents/specs/02-backend/api-data-conventions.md`（需更新）
依据：`docs/designs/2026-08-10-agent-architecture-research.md`、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（第 1-3 项定稿）

## 范围

- 新增 `memory_blocks`（三块常驻：resume/preferences/status_scratchpad）+ `session_state`（结构化 JSON）+ `status_history`（状态时序）+ messages FTS5 索引
- 新增记忆读写工具（getMemory/setMemory），显式写入（用户声明即写，写前核对）
- `app/api/chat/route.ts` 上下文组装改造：分层 system prompt（稳定段→常驻记忆段→会话状态段→最近 N 轮），MAX_HISTORY_ROUNDS 20→12
- 不做：自动抽取、滚动摘要、embedding 检索、跨会话自动记忆（P1）

## 任务清单

- [x] **T0 规范先行**：更新 `02-backend/api-data-conventions.md`，补充 memory_blocks/session_state/status_history 三表的字段与约束约定（label 校验、limit 字符上限、stateJson 结构、superseded_by 时序语义）——提交 6460e4b，审查通过
- [x] **T1 数据层：schema 与迁移**
  - [x] `src/db/schema.ts` 新增 memory_blocks（label PK/description/value/limit/updatedAt）、session_state（conversation_id PK 外键/stateJson/updatedAt）、status_history（id/jobOpportunityId 外键/fromStatus/toStatus/createdAt/supersededBy）
  - [x] messages 建 FTS5 虚拟表（messages_fts，trigram tokenizer；drizzle 无虚拟表支持故手写迁移 SQL 追加）
  - [x] `drizzle-kit generate` 生成迁移，应用成功
  - ✅ **Checkpoint A**：迁移成功，三张新表 + FTS 表可用（PRAGMA table_list 验证）
- [x] **T2 数据层：repository**
  - [x] 新增 `src/db/repositories/memory-blocks.ts`（getBlock/setBlock/listBlocks，MEMORY_BLOCK_DEFS 常量 + 校验）、`session-state.ts`（getState/setState/clearState）、`status-history.ts`（recordTransition 事务化/listHistory）
  - [x] `messages.ts` 插入/删除同步写 FTS（事务保证原子）；deleteConversation 级联清理 FTS（审查修复 1a300b1）
  - ✅ **Checkpoint B**：repository 冒烟通过（读写/limit 校验/链完整性，14/14）
- [x] **T3 记忆工具**
  - [x] 新增 `src/agent/tools/get-memory.ts`、`set-memory.ts`（zod 枚举与 repository 常量同源；写前核对语义进 description）
  - [x] 注册进 `getTools()`；SYSTEM_PROMPT 增加记忆区说明（三块作用/何时读写/写前核对/字符上限）
  - ✅ **Checkpoint C**：setMemory 落库 → getMemory 可见；超限/非法 label 拦截（提交 932c09b）
- [x] **T4 状态写入联动**
  - [x] applyJob/recordApplicationStatus 确认落库路径调用 recordStatusTransition（预览分支不产生记录）
  - ✅ **Checkpoint D**：状态流转后 status_history 完整时序（提交 b527685）
- [x] **T5 上下文组装改造（route.ts）**
  - [x] 新增 `src/agent/context.ts` 的 `buildSystemPrompt()`：基础 SYSTEM_PROMPT + 记忆段（逐块 [label] 描述：value）+ 会话状态段
  - [x] 会话状态读写：每轮读 memory_blocks + session_state 注入；onToolExecutionEnd 按工具结果回写 currentResumeId/currentJobId（ok===true 才写，异常不阻断）
  - [x] MAX_HISTORY_ROUNDS 20→12
  - ✅ **Checkpoint E**：冒烟 21 项断言（注入/回写/边界）全通过（提交 675c468）
- [x] **T6 验证收尾**：`npm run lint && npx tsc --noEmit` 通过；既有单测 60/60 全绿（apply-state/channel-guard/llm-call/resume-*）

## 验收记录（2026-08-10）

1. ✅ 新表与 FTS 迁移可用（PRAGMA 验证 + 冒烟），repository 冒烟 14/14
2. ✅ 记忆工具显式写入生效，getMemory/setMemory 往返一致（同会话与跨会话）
3. ✅ 状态历史完整可追溯（链式 supersededBy，预览不产生记录）
4. ✅ 上下文分层组装生效（记忆+状态注入），MAX_HISTORY_ROUNDS=12
5. ✅ 全量 lint/tsc/单测通过（60/60）

已知限制（后续处理）：FTS trigram 对 2 字以内中文查询不命中（后续检索工具注意）；drizzle-kit push 不识别 FTS 虚拟表（应用走 migrate 流程）；analyzeResume/matchJob 的失败路径不回写状态（fail-safe）。

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点，中断后从最近未完成 checkpoint 继续
- T0 依赖：无；T1-T2 依赖 T0；T3/T4 依赖 T2；T5 依赖 T2（状态读写）与 T3（记忆段）

## 验收标准

1. 新表与 FTS 迁移可用，repository 有单测或冒烟验证
2. 记忆工具显式写入生效，跨会话（同 conversationId）可见
3. 状态历史完整可追溯（不覆盖）
4. 上下文分层组装生效，轮数截断后靠记忆/状态补偿不丢关键信息
5. 全量 lint/tsc/单测通过
