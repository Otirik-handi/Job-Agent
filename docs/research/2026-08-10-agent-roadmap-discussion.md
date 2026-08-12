# job-helper Agent 行动路线图 · 讨论纪要

日期：2026-08-10 起
状态：逐项讨论中（每次讨论 1 项）
依据：`docs/research/2026-08-10-agent-architecture-research.md`（通用 Agent 架构调研报告）
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

### 已定稿

### P1-1（2026-08-10）：Skill 系统落地

**结论：遵循 agentskills.io 开放标准，加载机制 = CLI 机制同构移植「元数据常驻 + readSkill 工具」**。
- 机制原理：CLI（Claude Code/Codex/ZCode）的渐进式披露靠"元数据层（name+description 常驻 system prompt，~100 token/个）+ Agent 用 Read/Bash 工具自读正文"自然实现；job-helper 无读文件工具，需新增 `readSkill` 工具（限定 skills/ 目录）作为等价物
- 目录：`skills/<skill-name>/SKILL.md`（frontmatter name/description + 正文 ≤500 行，长内容拆 references/）
- 首批 6 个：resume-analysis（简历评分卡）、jd-analysis（JD 解析规则）、job-matching（匹配框架）、cover-letter-generation（求职信模板）、interview-prep（面试题库+STAR）、offer-evaluation（offer 比较）
- 现有 13 个工具与两段式审批不动；skill 承载知识/流程，不新增工具能力

### P1-2（2026-08-10）：显式规划（plans 计划文件）

**结论：分层混合规划 + 计划文件持久化；计划由 Agent 工具自主管理；对用户「创建时确认 + 执行中进度」**。
- 分层混合：宏观 plan-then-execute（3-6 个任务级步骤 + 成功标准），微观 ReAct 循环不预先穷举
- 载体：`plans/<taskId>.md`（步骤/状态 todo/in_progress/done/blocked/依赖/产出物路径/失败备注），中断读文件续跑；不引入独立 planner Agent（prompt 承担），依赖用 depends_on 简单字段
- 管理：新增 planCreate/planUpdate Agent 工具自主管理（与 readSkill 同构）
- 显示：复杂任务创建时先出计划给用户确认/调整再执行，执行中轻量显示"第 N 步"进度；简单任务不生成计划；不做深研式实时来源侧栏
- 每步执行后更新计划，Agent 判定"照计划/调整/提前终止"

### P1-3（2026-08-10）：反思环（经验沉淀）

**结论：独立 lessons 表 + 失败后自动复盘**。
- 载体：`lessons` 表（content/category/sourceTaskId/createdAt + FTS 检索），教训多条目、按需检索，不常驻上下文
- 写入：Agent 在任务失败/受阻（blocked 步骤、被用户纠正）后主动复盘生成教训（Reflexion 式语言自省）；用户认可的关键反馈也可沉淀
- 读取：新任务开始或失败时查 lessons 复用经验

### P1-4（2026-08-10）：会话级摘要（compaction）

**结论：首次截断时 LLM 生成一次滚动摘要**。
- 触发：会话首次达到轮数上限时，对将被截断的旧轮用 LLM 生成一次摘要（复用 callStructured 通道），此后"摘要+最近 12 轮"常驻，不再重复压缩
- 内容侧重：用户偏好与画像变化、已投递进度、未决事项/进行中任务、关键决策；丢弃冗余工具输出
- 存储：`conversations.summary` 字段，作为上下文段注入（稳定段之后、最近轮之前）
- 安全：原始消息全量落库可溯源，摘要失真可回查

### P1-5（2026-08-10）：UX 三态步骤卡片

**结论：工具调用作为正式步骤卡片落进消息流；失败卡附重试按钮**。
- 完成态：折叠成一行（工具名 + ✓ 一句摘要）留在消息流，可展开详情（不再完成即消失）
- 失败态：红色 + 错误摘要 + 「重试」按钮（复用会话 id 发重试消息，一键重试临时失败）
- 运行态：流式卡片（现状保留）；长任务配轻量"第 N 步"进度（与 P1-2 规划显示联动）

## P1 讨论完成（2026-08-10）

五项全部定稿（P1-1 Skill 系统 / P1-2 显式规划 / P1-3 反思环 / P1-4 会话摘要 / P1-5 UX 卡片），待写实现计划。

## P2 讨论（2026-08-11 起，逐项讨论）

### P2-1（2026-08-11）：评测基线（双层评测）

**结论：双层评测基线，先建 mock 层**（详见 `docs/designs/2026-08-11-eval-baseline-design.md`）。
- 两层共用同一批场景定义（用户消息序列 + 终态断言），仅 LLM 后端不同
- mock 层：scripted LanguageModel（按调用序号返回预设响应，未覆盖调用即抛错，完全确定性），入 vitest 随 `npm test` 跑，防编排回归
- 真实模型层：`npm run eval` 独立 CLI，里程碑/发布前手动跑，pass^2 起步（k 为 CLI 参数）
- 场景集：混合原则（高频实用打底 + 编排压力压边界），起步 13 个（高频 5 + 编排 4 + 边界 4），跑顺再扩
- 前置小重构：抽 `runAgentTurn` 核心函数（route.ts 与评测共用，业务逻辑零变化）+ DB 路径注入 `initDb(path?)`（评测用 `:memory:` 临时库，互不污染）
- 验收含评测有效性验证（故意破坏工具行为 → 对应场景必须失败）
- 不做：评测可视化 UI、CI 集成、跨模型基准对比报告

- 实现：2026-08-11 落地（mock 层 13 场景入 vitest，`npm run eval` CLI 就绪；有效性验证通过——故意破坏审批放行被 apply-job 场景捕获）。真实层首跑（deepseek-v4-flash）：适配后 12/13 通过（结构性断言/分层断言 assertFinalStateReal/逐场景超时 realTimeoutMs/--scenario 过滤）；jd-match 因模型对 jobMatchResultSchemaV1 结构化输出不稳定失败（已知限制）

### P2-2（2026-08-12）：语义检索（已定稿，待实现）

**结论：直接上 embedding，自算余弦，范围仅 messages**。
- 模型：硅基流动免费 embedding（BAAI/bge-m3 等，OpenAI 兼容 `/embeddings` 端点）
- 存储：向量存 JSON 列，检索时内存算余弦相似度（个人应用几千条消息 × 1024 维 ≈ 几 MB，毫秒级；不引入 sqlite-vec——Windows 原生扩展依赖不值得）
- 范围：仅 messages（lessons 保持 FTS，已有 searchLessons）
- 嵌入时机：消息落库同步嵌入，失败降级不阻塞（嵌入失败的存量消息检索时只靠 FTS/上下文）
- 新增 `searchMessages` 语义检索工具（只读免确认，同构 searchLessons）
- 时间衰减不做：最近消息已被轮数截断/会话摘要覆盖，边际价值存疑
- 注意：消息内容会发送到硅基流动（与 LLM 同模式，本地优先的边界以 provider 调用为限）

### P2-3（2026-08-12）：Prompt caching（已定稿，验证后记录）

**结论：先验证、后记录，不预设写代码**。
- 背景：稳定段前置已就位（缓存命中前提）；OpenAI 兼容端点（opencode.ai）缓存多自动生效
- 验证手段：评测 CLI 加 usage 收集（cacheRead/cacheWrite 统计，与 token 监控合流），真实层跑一次确认缓存命中
- 生效则文档记录"provider 自动缓存，无需代码"；不生效再议显式标记
- 前缀稳定性已最优（SYSTEM_PROMPT 常量最前，易变段在后，逐 token 前缀缓存仍命中开头）

### P2-4（2026-08-12）：子 Agent（决议关闭：明确不做）

**结论：明确不做（用户决议 2026-08-12）**。
- 原触发信号（调研报告）：①单任务内多次并行调研 ②工具表 >10-15 个——经用户确认，两者均不作为实施依据，决议关闭，不再重新评估
- 工具表落地 webSearch/webFetch 后为 15 个，规模可控（15 个以内），不引入 supervisor 复杂度
- 前置条件（评测基线）保留作为工程基线的既有能力，与本决议无关

### P2-5（2026-08-12）：其他增强（已定稿）

**skill 库扩展**：
- ✅ 可做：negotiation（谈薪策略）、follow-up（跟进话术）——纯方法论，零外部依赖
- ⏸ 挂起：company-research（公司调研）、salary-benchmark（薪资基准）——依赖 web 工具（占位符，用户调查后拍板形态：URL 抓取 vs 搜索 API）

**审计日志**：新增轻量 actions 审计表（动作/对象/时间/结果），只记关键动作（applyJob/recordApplicationStatus/tailoredResume 导出等），提供快速检索；messages + status_history 是事实审计基础，actions 表补结构化检索

**token 预算自监控**：仅评测层——评测 CLI 加 usage 收集（每场景 token + cacheRead 统计，与 P2-3 验证合流）；产品层不做预算预警（个人应用价值低）

## P2 讨论状态（2026-08-12）

五项全部定稿：P2-1 已实现落地；P2-2 语义检索 / P2-3 caching / P2-5 其他增强已定稿待实现；P2-4 子 Agent 决议关闭（明确不做，2026-08-12 用户决议）。实现批次：A（评测 CLI usage 统计 + 缓存验证）→ B（语义检索）→ C（skill 扩展 + 审计表）；批次 D（web 工具 → company-research/salary-benchmark）设计已定稿（见 `docs/designs/2026-08-12-web-tools-design.md`，web-browse 明确不做），待写实现计划。

- 第 2 项：结构化会话状态（session_state 表，P0-2）
- 第 3 项：上下文策略（SYSTEM_PROMPT 分节 + 简历/JD 按需注入，P0-3）
- 第 4 项：工具层补强（description 重写 + 结构化错误返回 + zod strict，P0-4）
- 第 5 项：审批分级（P0-5）
