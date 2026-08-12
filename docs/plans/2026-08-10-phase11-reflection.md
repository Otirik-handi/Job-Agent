# Phase 11：反思环（P1-3）

日期：2026-08-10
状态：完成（2026-08-10 验收通过，分支 phase11-reflection）
目标：为 job-helper 建立经验沉淀能力——独立 lessons 表 + 失败后自动复盘（Reflexion 式），新任务/失败时检索复用教训。
关联规范：`.agents/specs/02-backend/api-data-conventions.md`（需更新）、`.agents/specs/03-agent/agent-tooling-conventions.md`（需更新）、`docs/research/2026-08-10-agent-roadmap-discussion.md`（P1-3 定稿）
依据：`docs/research/2026-08-10-agent-architecture-research.md` 专题 02/06

## 范围

- 新增 `lessons` 表（content/category/sourceTaskId/createdAt）+ FTS5 检索（复用 phase7 的 messages_fts 模式）
- 新增 `recordLesson` 工具（失败/受阻/被用户纠正后 Agent 主动写入教训）+ `searchLessons` 工具（FTS 检索，供新任务/失败时复用）
- SYSTEM_PROMPT 增加反思原则：失败或受阻后主动复盘写入教训；开始新任务或再次失败时先 searchLessons 查经验
- 不做：自动触发复盘的后端逻辑（由 Agent 工具驱动）、教训注入常驻上下文（按需检索）

## 任务清单

- [x] **T0 规范先行**：02-backend 补 lessons 表约定（字段/category 枚举/FTS 同步/只追加/memory_blocks 边界）；03-agent 补反思环约定（recordLesson/searchLessons 契约/反思原则/与规划 blocked 联动）——提交 5d78175，审查通过
- [x] **T1 数据层**
  - [x] lessons 表（id/content/category/sourceTaskId 可空/createdAt + category 索引）+ lessons_fts（trigram，id/category UNINDEXED）迁移 0003 应用成功
  - [x] `src/db/repositories/lessons.ts`：insertLesson（事务内写 lessons+FTS、category 枚举校验）/ listLessons（时间倒序）/ searchLessons（FTS MATCH + 短查询降级 + **非法语法降级** e1167fe）/ deleteLessonsBySourceTask（清理联动）
  - ✅ **Checkpoint A**：提交 e447b58 + f7fa1b2；审查发现 FTS 非法语法抛错问题，修复 e1167fe
- [x] **T2 反思工具**
  - [x] recordLesson（content 非空 LESSON_INVALID、category zod enum、返回 lesson 含 id；description 含与 setMemory 边界；本地可逆非强确认）/ searchLessons（query?/category?/limit 默认 5 上限 20；无 query 走列表；无结果 count:0 非错误；只读免确认）
  - [x] SYSTEM_PROMPT「反思（经验教训）」段（失败/受阻后 recordLesson、教训三要素、新任务先 searchLessons、不常驻、与规划 blocked 联动）+ getTools 注册
  - ✅ **Checkpoint B**：提交 fd0e440，审查通过
- [x] **T3 验证收尾**：`npm run lint && npx tsc --noEmit && npm test`（132/132）通过；`npm run build` 通过

## 验收记录（2026-08-10）

1. ✅ lessons 表 + FTS 迁移可用（PRAGMA 验证），repository 冒烟 + 14 单测通过
2. ✅ recordLesson/searchLessons 工具生效（写入/检索/过滤/降级，结构化错误契约）
3. ✅ FTS 非法语法查询不抛错（降级为列表检索，2 个新用例）
4. ✅ SYSTEM_PROMPT 反思原则生效（失败后复盘、新任务查教训）
5. ✅ 全量 lint/tsc/132 测试/build 通过

已知限制（后续处理）：lessons.test.ts 直连 dev 库（test-lesson- 前缀 + afterEach 清理，测试前需已应用 0003 迁移）；lessons_fts 不在 drizzle snapshot 管理内（与 messages_fts 同取舍）。

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点；T0 → T1 → T2 → T3
- 与 phase7 数据层模式同构（FTS 事务/清理模式复用）

## 验收标准

1. lessons 表 + FTS 迁移可用，repository 冒烟通过
2. recordLesson/searchLessons 工具生效（写入/检索/过滤，结构化错误契约）
3. SYSTEM_PROMPT 反思原则生效（Agent 失败后主动复盘、新任务查教训）
4. 全量 lint/tsc/test 通过
