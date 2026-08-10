# job-helper Agent 行动路线图 · 讨论纪要

日期：2026-08-10 起
状态：逐项讨论中（每次讨论 1 项）
依据：`docs/designs/2026-08-10-agent-architecture-research.md`（通用 Agent 架构调研报告）
关联：`docs/designs/2026-08-04-agent-architecture-design.md`（现有架构设计）

---

## 已定稿项

### 第 1 项（2026-08-10）：记忆层（调研报告 P0-1）

**结论：写入机制采用「显式工具写入」（Agent 通过专用记忆工具读写，用户声明即写，写前核对）**。

设计要点：
- 新增 `memory_blocks` 表（Letta 式核心记忆）：字段 `label / description / value / limit`，常驻上下文，Agent 用专用工具读写
- 预置三块：`resume`（学历/技能/年限画像）、`preferences`（目标岗位/城市/薪资/远程偏好）、`status_scratchpad`（当前流程进度）
- `messages` 表加 FTS5 全文索引（回忆历史对话零依赖）
- 投递状态加 `status_history` 时序表（valid_from/superseded_by，不覆盖历史）
- 不做：会话后自动抽取、反思复盘（留待后续阶段）

### 第 2 项（2026-08-10）：结构化会话状态（P0-2）

**结论：session_state 与 status_scratchpad 两者并存、职责分离**。
- `session_state` 表（绑定 conversation_id）：机器可读 JSON（当前 resumeId/jobId/流程阶段），程序可校验，每轮注入
- `status_scratchpad`（memory_blocks 一块）：自由文本进度笔记，Agent 自用
- 两者互不替代：结构化状态保证可靠性，自由笔记保灵活性

### 第 3 项（2026-08-10）：上下文策略（P0-3）

**结论：会话历史采用「轮数截断 + 记忆补偿」**（不引入 token 预算制与滚动摘要，后者留 P1）。
- 分层注入结构：稳定段（SYSTEM_PROMPT 分节重组 + 工具定义，放最前）→ 常驻段（memory_blocks + session_state）→ 易变段（最近 N 轮）→ 按需注入（简历/JD 概要首条注入，全文精读放当前轮末尾，用完即清）
- 调小 MAX_HISTORY_ROUNDS，缺失信息由记忆/状态补偿（Agent 需要旧事时查 FTS）

### 第 4 项（2026-08-10）：工具层补强（P0-4）

**结论：三项全部同意，方向无分叉**。
- ① 11 个工具 description 按 3-4 句规范重写（做什么/何时用/不用/参数含义/返回什么），重点补 applyJob/recordApplicationStatus 的前置条件与两段式契约
- ② `createDomainTool` 错误包装从"剥信息 throw"改为结构化执行错误回传（code/message/hint，对齐 MCP isError；现状 apply-job.ts 已有 hint 基础，推广到全部工具并写进规范）
- ③ zod inputSchema strict 化（禁止多余字段、必填明确），非法参数工厂层拦截
- 不做：工具改名/加前缀（本地单应用无多服务命名空间）、outputSchema（P1）

### 第 5 项（2026-08-10）：审批分级（P0-5）

**结论：三档权限模型**（确认强度与动作成本匹配，避免确认疲劳）：
- 只读（listResumes/listJobOpportunities）→ 免确认（现状已是）
- **recordApplicationStatus → 降为轻量确认**（前端单次确认或可撤销，不打断对话两段式；误记录靠追加纠正记录修复，前提是纠正成本可接受）
- applyJob（投递，对外动作）/ tailoredResume（覆盖简历）→ 保持两段式强确认，代码强制，超时 fail-closed

## 待讨论项（队列，P1）

- 第 2 项：结构化会话状态（session_state 表，P0-2）
- 第 3 项：上下文策略（SYSTEM_PROMPT 分节 + 简历/JD 按需注入，P0-3）
- 第 4 项：工具层补强（description 重写 + 结构化错误返回 + zod strict，P0-4）
- 第 5 项：审批分级（P0-5）
