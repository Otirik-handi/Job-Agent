# 第一期：Agent 记忆层 + 会话状态 + 上下文策略（P0 第 1-3 项）

日期：2026-08-10
状态：草稿
目标：为 job-helper 补齐通用 Agent 的最小记忆骨架——显式写入的记忆块、可校验的会话状态、分层注入的上下文组装；解决"20 轮截断丢上下文、跨会话失忆、简历/JD 全量塞窗口"三个问题。
关联规范：`.agents/specs/00-governance/plan-document.md`、`.agents/specs/02-backend/api-data-conventions.md`（需更新）
依据：`docs/designs/2026-08-10-agent-architecture-research.md`、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（第 1-3 项定稿）

## 范围

- 新增 `memory_blocks`（三块常驻：resume/preferences/status_scratchpad）+ `session_state`（结构化 JSON）+ `status_history`（状态时序）+ messages FTS5 索引
- 新增记忆读写工具（getMemory/setMemory），显式写入（用户声明即写，写前核对）
- `app/api/chat/route.ts` 上下文组装改造：分层 system prompt（稳定段→常驻记忆段→会话状态段→最近 N 轮），MAX_HISTORY_ROUNDS 20→12
- 不做：自动抽取、滚动摘要、embedding 检索、跨会话自动记忆（P1）

## 任务清单

- [ ] **T0 规范先行**：更新 `02-backend/api-data-conventions.md`，补充 memory_blocks/session_state/status_history 三表的字段与约束约定（label 校验、limit 字符上限、stateJson 结构、superseded_by 时序语义）
- [ ] **T1 数据层：schema 与迁移**
  - [ ] `src/db/schema.ts` 新增 memory_blocks（label PK/description/value/limit/updatedAt）、session_state（conversation_id PK 外键/stateJson/updatedAt）、status_history（id/jobOpportunityId 外键/fromStatus/toStatus/createdAt/supersededBy）
  - [ ] messages 建 FTS5 虚拟表（messages_fts，drizzle fts5 或手写迁移 SQL；插入消息时同步写 FTS）
  - [ ] `drizzle-kit generate` 生成迁移，应用成功
  - ✅ **Checkpoint A**：迁移成功，三张新表 + FTS 表可用（sqlite 验证建表）
- [ ] **T2 数据层：repository**
  - [ ] 新增 `src/db/repositories/memory-blocks.ts`（getBlock/setBlock/listBlocks）、`session-state.ts`（getState/setState）、`status-history.ts`（recordTransition/listHistory）
  - [ ] `messages.ts` 插入时同步写 FTS
  - ✅ **Checkpoint B**：repository 单测或 sqlite 冒烟通过（读写/校验 limit）
- [ ] **T3 记忆工具**
  - [ ] 新增 `src/agent/tools/get-memory.ts`（读块，返回 label/value/description）、`set-memory.ts`（写块，校验 label 存在与 limit）
  - [ ] 注册进 `getTools()`；SYSTEM_PROMPT 增加记忆区说明（块用途、何时读写、写前核对原则）
  - ✅ **Checkpoint C**：对话中"记住我的目标城市是深圳"→ setMemory 落库；新会话 getMemory 可见
- [ ] **T4 状态写入联动**
  - [ ] applyJob/recordApplicationStatus 落库时同步写 status_history（在既有 repository 调用处插入）
  - ✅ **Checkpoint D**：状态流转后 status_history 有完整时序（verified via sqlite）
- [ ] **T5 上下文组装改造（route.ts）**
  - [ ] 新增 `buildSystemPrompt()`：基础 SYSTEM_PROMPT + 记忆段（三块 value）+ 会话状态段（stateJson），稳定内容前置
  - [ ] 会话状态读写：每轮请求读取 session_state 注入；工具执行后更新（currentResumeId/currentJobId 由关键工具结果回写，T3/T4 一并接上）
  - [ ] MAX_HISTORY_ROUNDS 20→12
  - ✅ **Checkpoint E**：对话开头 system prompt 含记忆块与会话状态；截断后 Agent 仍能答出"目标城市/当前处理岗位"（记忆补偿生效）
- [ ] **T6 验证收尾**：`npm run lint && npx tsc --noEmit` 通过；既有单测全绿；手动回归主流程（导入→分析→匹配→投递→状态记录）

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点，中断后从最近未完成 checkpoint 继续
- T0 依赖：无；T1-T2 依赖 T0；T3/T4 依赖 T2；T5 依赖 T2（状态读写）与 T3（记忆段）

## 验收标准

1. 新表与 FTS 迁移可用，repository 有单测或冒烟验证
2. 记忆工具显式写入生效，跨会话（同 conversationId）可见
3. 状态历史完整可追溯（不覆盖）
4. 上下文分层组装生效，轮数截断后靠记忆/状态补偿不丢关键信息
5. 全量 lint/tsc/单测通过
