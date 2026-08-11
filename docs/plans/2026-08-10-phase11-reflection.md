# Phase 11：反思环（P1-3）

日期：2026-08-10
状态：草稿
目标：为 job-helper 建立经验沉淀能力——独立 lessons 表 + 失败后自动复盘（Reflexion 式），新任务/失败时检索复用教训。
关联规范：`.agents/specs/02-backend/api-data-conventions.md`（需更新）、`.agents/specs/03-agent/agent-tooling-conventions.md`（需更新）、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（P1-3 定稿）
依据：`docs/designs/2026-08-10-agent-architecture-research.md` 专题 02/06

## 范围

- 新增 `lessons` 表（content/category/sourceTaskId/createdAt）+ FTS5 检索（复用 phase7 的 messages_fts 模式）
- 新增 `recordLesson` 工具（失败/受阻/被用户纠正后 Agent 主动写入教训）+ `searchLessons` 工具（FTS 检索，供新任务/失败时复用）
- SYSTEM_PROMPT 增加反思原则：失败或受阻后主动复盘写入教训；开始新任务或再次失败时先 searchLessons 查经验
- 不做：自动触发复盘的后端逻辑（由 Agent 工具驱动）、教训注入常驻上下文（按需检索）

## 任务清单

- [ ] **T0 规范先行**：02-backend 补充 lessons 表约定（字段/category 枚举/FTS 检索/与 memory_blocks 边界：经验性教训 vs 偏好事实）；03-agent 补充 recordLesson/searchLessons 工具契约与反思原则
- [ ] **T1 数据层**
  - [ ] `src/db/schema.ts` 新增 lessons（id PK/content/category/sourceTaskId 可空/createdAt）+ lessons_fts 虚拟表（FTS5，trigram，参照 messages_fts 模式）
  - [ ] drizzle-kit generate 迁移并应用；新增 `src/db/repositories/lessons.ts`（insertLesson/listLessons/searchLessons：FTS 检索 + 按 category 过滤/按时间排序）；复用事务与清理模式（参照 status-history/messages 实现）
  - ✅ **Checkpoint A**：迁移成功；repository 冒烟（写入/检索/分类过滤）
- [ ] **T2 反思工具**
  - [ ] 新增 `src/agent/tools/record-lesson.ts`：inputSchema（content、category enum、sourceTaskId?）；写入 lessons；返回写入结果（含 id）
  - [ ] 新增 `src/agent/tools/search-lessons.ts`：inputSchema（query?、category?、limit?）；FTS 检索返回教训列表；无 query 时按时间返回最近 N 条
  - [ ] SYSTEM_PROMPT 增加「反思」原则段（失败/受阻/被纠正后 recordLesson 复盘——教训要具体可复用；新任务开始或再次失败先 searchLessons；教训不常驻上下文，按需检索）
  - [ ] 注册两工具进 getTools()（description 按 3-4 句规范）
  - ✅ **Checkpoint B**：工具单测（写入/检索/非法 category）；lint/tsc 通过
- [ ] **T3 验证收尾**：`npm run lint && npx tsc --noEmit && npm test` 全绿（既有 73 + 新增）

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3
- 与 phase7 数据层模式同构（FTS 事务/清理模式复用）

## 验收标准

1. lessons 表 + FTS 迁移可用，repository 冒烟通过
2. recordLesson/searchLessons 工具生效（写入/检索/过滤，结构化错误契约）
3. SYSTEM_PROMPT 反思原则生效（Agent 失败后主动复盘、新任务查教训）
4. 全量 lint/tsc/test 通过
