# job-helper 通用 Agent 架构调研报告

日期：2026-08-10
状态：调研完成，供设计讨论引用（不包含架构决策，架构决策见后续设计文档）
调研方式：12 个并行调研子 Agent，覆盖 6 大开源/官方框架、14 篇经典论文、5 篇权威综述、开放标准（Agent Skills/MCP）与同类产品；原始分篇见 `tmp/research/01~12-*.md`
关联文档：`docs/designs/2026-08-04-agent-architecture-design.md`（现有架构设计）、`docs/designs/2026-08-10-skill-system-research.md`（Skill 系统调研）

---

## 1. 调研结论速览

**一个 Agent 由什么构成（业界共识）**：控制循环（agent loop）+ 工作记忆（上下文窗口）+ 长时记忆（外部存储）+ 行动层（工具调用）。反思、显式规划、记忆写回、多 Agent 是增强项，不是最小项。

**三个最值得借鉴的机制**：
1. **渐进式披露（progressive disclosure）**——记忆与技能"描述常驻、正文按需加载"，是控制 token 成本的第一原则（Claude Code Skills / CLAUDE.md 机制）；
2. **分层记忆**——核心记忆常驻上下文 + 对话历史全量落库 + 事后反思沉淀，解决长对话"记不住"（MemGPT/Letta、Generative Agents）；
3. **审批分级 + 代码强制**——权限按动作成本分档（只读免确认/可逆轻确认/不可逆强确认），护栏由代码执行而非依赖模型自觉（Claude Code 权限谱系、τ-bench 规则遵守）。

**对 job-helper 的三个核心判断**：
- **单 Agent 路线正确，不引入多 Agent**（任务量小、无并行需求、7-11 个工具未到选择劣化阈值；子 Agent 只作为"主 Agent 的工具"形态预留）；
- **不需要引入 MCP 做运行架构**（工具集固定、本地单用户，动态发现零收益；直接用好 AI SDK 的 tool() + 按 MCP 语义补强工具层设计）；
- **Skill 系统直接遵循开放标准**（agentskills.io 的 SKILL.md 规范，已被 Claude/ChatGPT/Codex 采纳），不自造格式。

## 2. 通用 Agent 架构蓝图（7 层）

| 层 | 内容 | 主流实现 | job-helper 现状 |
|---|---|---|---|
| 控制循环/编排 | 模型决定下一步→调工具→结果回填→判完成 | OpenAI/Claude 内置 loop、LangGraph 显式状态图 | ✅ 已有 ToolLoopAgent |
| 状态管理 | 短（循环内）/中（会话可恢复）/长（跨会话记忆） | checkpointer、会话 JSONL、Sessions | ⚠️ 会话消息存 SQLite，但关键实体未抽离为 session_state |
| 工具层 | 函数即工具 + schema 校验 + 结果回流 | 各 SDK 原生 + MCP 标准化 | ✅ 最强环节（tool-factory + 11 工具） |
| 记忆层 | 工作/核心/情景/语义四层 | Letta blocks、Generative Agents memory stream、mem0 | ❌ 只有领域实体表，无 Agent 可检索的记忆层 |
| 规划 | 隐式（loop 内自组织）或显式（plan-then-execute） | Claude Plan mode、LangGraph 图、Devin checklist | ❌ 无规划层（隐含在 system prompt） |
| 审批与护栏 | 权限分档 + 两段式确认 + guardrails | Claude Code 五档、Codex 双轴、OpenAI Guardrails | ✅ 已有两段式审批雏形（可升级分级） |
| 多 Agent | handoff/subagent/supervisor/group chat 四模式 | Claude subagents、OpenAI handoffs | ⛔ 明确不做（设计边界） |

## 3. 十二个专题要点

### 3.1 记忆系统（专题 02）
- **四层共识**：工作记忆（上下文内）→ 核心记忆（常驻块，Agent 用工具自编辑，Letta 风格：label+description+value+limit）→ 情景记忆（一次性事件，会话后抽取）→ 长期语义记忆（事实/反思，事后批处理）。
- **写入三路**：自动抽取（mem0，ADD-only 只累积不覆盖）、显式声明（Letta 工具自编辑）、事后反思（Generative Agents：重要性分超阈值时取最近 100 条生成 insight 回流）。
- **检索标准公式**（Generative Agents）：`score = α_recency·recency(指数衰减 0.995) + α_importance·importance(LLM 1-10) + α_relevance·relevance(embedding)`。
- **压缩**：Letta sliding_window——保留最近 ~70%，旧轮压成滚动摘要；原始消息永远落库可溯源。
- **落地建议**：SQLite `memory_blocks` 表预置 resume/preferences/status_scratchpad 三块常驻；`messages` 全量落库 + FTS5 全文检索（零依赖）；`applications` + `status_history`（valid_from/superseded_by 模拟时序作废，借鉴 Graphiti 不删旧状态）。

### 3.2 Skill 系统（专题 03）
- **开放标准**：Agent Skills（2025-12 Anthropic 发布，agentskills.io），ChatGPT/Codex/Windsurf 均采纳，**应直接遵循，勿自造格式**。
- **SKILL.md 规范**：YAML frontmatter（name ≤64 字符小写连字符 = 目录名；description ≤1024 字符写"做什么+何时用+触发词"）+ Markdown 正文（≤500 行）；目录结构 SKILL.md + scripts/ + references/ + assets/。
- **双层触发**：隐式（启动时所有 skill 的 name+description 预载入 system prompt，description 语义匹配自动选）+ 显式（/命令、@、$）。上下文预算限制初始列表 ≤2%/8000 字符——**skill 库须控量（12-15 个内）**。
- **渐进式披露三层**：元数据 ~100 tokens 常驻 → 触发后读 SKILL.md → references/scripts 按需读；未触发文件零 token 成本；文件引用保持一层深。
- **边界**：skill=内容/能力单元；plugin=分发打包单元；subagent=独立上下文执行单元；MCP=工具连接器，skill 教编排。
- **求职领域 skill 划分（P0）**：resume-analysis、jd-analysis、job-matching、cover-letter-generation、interview-prep、offer-evaluation。

### 3.3 MCP 与工具层（专题 04）
- **MCP 本质**：AI 应用与外部系统的标准化连接层（"AI 的 USB-C"），host/client/server 架构，JSON-RPC 2.0，三原语 tools/resources/prompts；与 function calling 是互不替代的关系。
- **结论：job-helper 不需要 MCP 做运行架构**（工具集固定、无第三方 server、动态发现零收益；引入只增加进程/序列化开销，违背"成熟库优先"）。唯一时机：未来接第三方 server 时用 `@ai-sdk/mcp` 封装。
- **工具 schema 最佳实践**：描述 ≥3-4 句（做什么/何时用/不用/参数含义/返回什么）；strict 模式（additionalProperties:false + 全 required）；工具 <20 个、少而大、前缀命名空间；响应只回高信号字段。
- **错误自愈回路**：两级错误——协议错误走 JSON-RPC error；**执行错误返回结构化错误喂回模型**（`isError:true` + "发生了什么+下一步试什么"），模型自动带修正重试 2-3 次。
- **落地建议**：按 3-4 句规范重写 11 个工具 description；`createDomainTool` 的 throw 包装改为结构化执行错误返回（`{ok:false,code,message,hint}`）；zod strict 语义在工厂层拦截非法参数。

### 3.4 多 Agent 编排（专题 05）
- **七种模式**：prompt chaining、routing、parallelization、orchestrator-worker/supervisor、handoff、evaluator-optimizer/reflection、debate。
- **上下文传递共识**：只传任务卡片 + 回传精简摘要（Claude Code subagents、open_deep_research compress_research）；压缩回传是防上下文爆炸的关键。
- **拆的触发条件**：高噪音副任务、需专用工具/权限/模型、可并行、工具过多致决策劣化；**不该拆**：需频繁迭代、共享大量上下文、延迟敏感。
- **判断：job-helper 现阶段不引入多 Agent**。P1 触发信号：①单任务内需多次并行调研；②工具表膨胀 >10-15 个。起步形态 = 最小 supervisor（主 Agent 以工具调子 Agent、收摘要回传），不引入 handoff/debate。
- 注意：Claude Code 默认 20 并发上限、嵌套 3 层——多 Agent 是有成本与上限约束的。

### 3.5 规划能力（专题 06）
- **主流形态是"分层混合"**：宏观计划一次性生成（plan-then-execute）+ 微观执行 ReAct 式"观察→调整"循环。
- **深研产品共性流程**：粗计划（章节/问题集粒度）→ 并行调研 → 汇总自评 → 决定补搜 → 迭代至上限 → 成文；计划只到"节/问题"粒度，轮次上限是硬终止条件。
- **持久化三种模式**：事件日志重放（OpenHands）、计划文件+勾选状态（Devin checklist）、会话对象（LangGraph checkpointer）。
- **失败模式**：过度规划、规划与执行脱节、计划僵化/发散、幻觉引用（对策：计划到节粒度、每步反馈更新、迭代上限、来源追踪）。
- **落地建议**：`plans/<task_id>.md` 持久化（步骤+状态 todo/in_progress/done/blocked+依赖+产出物路径），中断读文件续跑；不引入独立 planner Agent（prompt 承担即可）。

### 3.6 评测与护栏（专题 07）
- **τ-bench 核心启发**：用"数据库终态 vs 标注目标态"校验工具调用正确性；pass^k 测多次一致性（单次通过率 <50%，pass^8 <25%）——**单次成功高估可靠性**。
- **权限分档**：Claude Code 五档（default/acceptEdits/plan/auto/bypassPermissions），规则优先级 deny>ask>allow；**权限规则由代码执行，不由模型遵守**；ZCode 用 local_setting 表按项目存 mode（job-helper 当前 yolo）。
- **必须确认**：不可逆（覆盖/删除/终态转换）、对外部世界有影响（投递/发邮件）、个人数据外发；**可自动**：只读、可回滚、内部中间步骤。超时一律 fail-closed。
- **提示注入防护**：工具返回内容视为数据而非指令；外发控制靠确定性约束（白名单/正则/可验证来源）而非模型自觉；封死"跟随抓取页面内嵌链接拼接 URL"路径（Anthropic web_fetch 真实绕过案例）。
- **落地建议**：不可逆动作锁定两段式确认（代码强制）；确认 UX 展示摘要+风险等级；审计日志不写敏感原文；建 20-30 个真实求职场景 τ-bench 式终态评测集。

### 3.7 垂直领域形态（专题 08）
- **求职产品两条路线**：定制+追踪型（Teal：Agent 当教练，投递留给用户，JD 关键词高亮真实经历）vs 自动投递型（LazyApply/AIHawk：浏览器批量自动投递——**已被平台封锁 + ATS 降权反噬，LazyApply 约 2 星、流量跌 85%**）。**job-helper 明确不做浏览器自动投递**。
- **领域数据模型**：Resume（多版本）、JobPosting（原始 JD+结构化字段）、Application 状态机（saved→applied→interview→offer/rejected）、UserProfile 偏好——**对话状态必须持久化为领域实体**。
- **记忆 schema 借鉴**（ChatGPT 三层）：saved memories（自动沉淀原子事实）+ custom instructions（用户显式常驻约束）+ Projects（绑定某段长期努力，对应"一次求职战役"）。
- **对话编排**：引导式 + slot-filling（一次一个问题）；确认点只对不可逆/高影响动作。
- **真实性边界**：同类产品均"用 JD 关键词高亮真实经历"，从不生成假经历；"真实+定制"是唯一可持续路线——与 AGENTS.md 边界一致。

### 3.8 经典论文（专题 09）
**Top 5 启发**：
1. **ReAct**（Thought/Action/Observation 循环）——求职 Agent 每次"检索+推理+回答"的默认范式，照抄起步；
2. **MemGPT/Letta**（OS 式分层记忆）——解决求职跨周长对话"记不住用户"的刚需；
3. **Generative Agents**（记忆流+反思+检索）——求职者数字分身，个性化分水岭；
4. **Reflexion**（语言自省存情景记忆）——模拟面试/简历修改可回放场景，零成本持续变强；
5. **SWE-agent**（ACI：接口为 LLM 设计）——工具接口按模型偏好设计，而非照搬人类 UI。

**论文→工程映射**：ReAct→各类 Agent SDK 默认循环；MemGPT→Letta；Generative Agents→mem0/Zep 等记忆库；Reflexion→编排框架反思节点；Plan-and-Solve/ToT→Planner-Executor 框架。

### 3.9 综述共识（专题 10）
- **组件共识**：规划/记忆/行动（工具）三大件普适；感知与反思或单列或并入；Lilian Weng 三件套 ↔ 学术框架（Planning / Memory=短时上下文+长时向量库 / Tool use=外部行动 grounding）。
- **最小骨架控制循环**：①观察 → ②工作记忆更新 → ③决策-规划（读长时记忆+推理→选动作）→ ④行动（工具调用）→ ⑤结果回填 → 失败可触发反思重试。
- **开放问题**：评测无统一基准、长时记忆写回/压缩/边界、多 Agent 协调、安全对齐、人机协作无统一方案。
- **job-helper 模块对照**：已有=工具层（最强）、工作记忆（20 轮滑动窗口，无压缩）、感知（文件导入）、人工确认环；缺失=**长时记忆层（P0）、反思环（P0，仅 schema repair）、显式规划（P1）、skill 系统落地（P1）**。

### 3.10 上下文工程（专题 11）
- **核心原则**：上下文是有限资源，存在 context rot（token 越多召回越弱）；关键信息放首尾（Lost in the Middle：中间最差）；system prompt 用 XML 分节（角色/规则/流程/数据契约）；分层注入=常驻核心+按需加载+用完即清。
- **Compaction**：临近上限时 LLM 把旧会话压成滚动摘要，优先保决策/未决事项；原始数据全量落库对冲摘要失真。
- **Prompt caching**：Anthropic 读 0.1x/写 1.25x(5m)/2x(1h)；OpenAI 自动缓存 ≥1024 token 前缀；机制=精确前缀匹配，静态内容放前、动态放后；**只省成本不改善质量**。
- **1M 大上下文**：塞得下≠用得好，"最小高信号 token 集"+按需注入为主；全量注入仅用于单份文档精读且放轮次末尾。
- **落地建议（P0）**：简历/JD 不全量常驻——首条注入结构化概要+匹配矩阵（放开头），全文放记忆库、精读时注入当前轮末尾；会话历史全量落库，上下文只留最近 N 轮+状态；稳定段前置以命中缓存。

### 3.11 对话 UX（专题 12）
- **过程可见性**：两种模式结合最佳——执行期流式 tool call 卡片（三态：运行/完成/失败，可折叠），长任务另配摘要式步骤清单（Deep Research 侧栏思路）；任务结束折叠成一行。
- **确认点分级**：动作成本匹配确认强度，避免"第十次确认后机械点击"；可逆操作给撤销而非弹窗；必须配 stopping conditions 兜底。
- **渐进式披露**：摘要优先、折叠/accordion、按需加载、抽屉；NN/g 警告不超过 2 级。
- **结构化数据**：对话只放汇总卡片（3-5 行岗位卡+状态徽章），完整数据进抽屉/侧栏；预填按钮优于手打长文本（NN/g 研究）。
- **落地建议（P0）**：tool-progress-card 升级为三态步骤卡片并持久化进消息流（现仅瞬时 running 单行）；确认点分级——保留 applyJob/tailoredResume 强确认，recordApplicationStatus 等可逆操作降为轻量确认+撤销；失败可恢复（错误摘要+重试入口）。

### 3.12 参考架构（专题 01）
- **共性分层**：控制循环/状态管理/工具层/记忆层/规划/审批护栏/多 Agent 七层（见第 2 节表格）。
- **状态管理三档**：短（循环内）/中（run/thread 可恢复：LangGraph checkpointer、Claude Code 会话 JSONL、OpenAI Sessions）/长（跨会话记忆）。
- **关键设计**：Claude Code 上下文管理最完整——自动压缩（先清旧工具输出再摘要）、Skills/MCP 工具定义按需延迟加载、subagent 独立 context 隔离膨胀。
- **启示**：强化现有单 Agent 骨架（结构化会话状态、持久记忆、护栏框架化、审批分级），P1 再上规划层/Skill 系统/轻量多 Agent。

## 4. job-helper 现状对照与差距

**已具备（架构骨架成立）**：
- ✅ 控制循环（ToolLoopAgent）+ 工具层（tool-factory + 11 领域工具 + zod schema）
- ✅ 两段式对话化审批（applyJob/tailoredResume/recordApplicationStatus）
- ✅ 确定性护栏（channel-guard、apply-state 纯函数 + 单测）
- ✅ 感知（docx/txt/md 文件导入）、会话消息 SQLite 持久化

**核心差距（按优先级）**：
| 差距 | 优先级 | 说明 |
|---|---|---|
| 长时记忆层 | P0 | 无 Agent 可检索的经验/语义记忆；只有领域实体表 |
| 结构化会话状态 | P0 | 关键实体/状态机位置未抽离，20 轮截断丢上下文 |
| 上下文管理 | P0 | 无压缩/无分层注入/无缓存意识，简历与 JD 全量塞上下文 |
| 反思环 | P0 | 仅 schema repair，无 LLM 自我反思/复盘 |
| 显式规划 | P1 | 无 plan 表示与步骤跟踪 |
| Skill 系统落地 | P1 | 调研已完成（skill-system-research），未实现 |
| 审批分级 | P1 | 全量强确认→分级（只读免确认/可逆轻确认） |
| 评测基线 | P2 | 仅核心纯逻辑单测，无 Agent 级行为评测 |
| 多 Agent | 不做 | 单用户场景合理，预留 supervisor 形态 |

## 5. 行动路线图（P0 → P1 → P2）

**P0（近期，强化单 Agent 骨架）**
1. **记忆层落地**：`memory_blocks` 表（resume/preferences/status_scratchpad 常驻块）+ `messages` 全量落库 + FTS5 全文检索 + `status_history` 时序作废；
2. **结构化会话状态**：session_state 表抽离关键实体，每次注入 system prompt（解决截断丢上下文）；
3. **上下文策略**：system prompt XML 分节；简历/JD 结构化概要常驻、全文按需注入当前轮末尾；稳定段前置；
4. **工具层补强**：11 个工具 description 按 3-4 句规范重写；结构化执行错误返回（`{ok:false,code,message,hint}`）；zod strict；
5. **审批分级**：只读工具免确认、可逆操作轻确认+撤销、不可逆（投递/发邮件）强确认（代码强制，fail-closed）。

**P1（中期）**
6. **Skill 系统落地**：按 agentskills.io 标准实现，P0 skill 6 个（resume-analysis/jd-analysis/job-matching/cover-letter-generation/interview-prep/offer-evaluation），渐进式披露；
7. **显式规划**：`plans/<task_id>.md` 计划文件（步骤+状态+依赖+产出物路径），中断恢复；复杂任务 plan-then-execute；
8. **反思环**：任务失败/里程碑后 LLM 复盘写入 lessons 表；
9. **会话级摘要**：长会话 compaction（保留偏好/进度/未决事项）；
10. **UX 三态步骤卡片 + 确认点分级**落地。

**P2（远期/按需）**
11. **评测基线**：20-30 个真实求职场景 τ-bench 式终态评测集 + pass^k；
12. embedding 语义检索（sqlite-vec）、prompt caching 优化、审计日志、token 预算自监控；
13. 子 Agent（最小 supervisor）仅在出现"并行调研需求/工具表膨胀"两信号时引入。

**明确不做**：浏览器自动投递、伪造/夸大经历生成、MCP 运行时架构、多 Agent 编排（现阶段）、知识图谱（规范化表足够）。

## 6. 来源与分篇索引

- 原始分篇（12 篇，每篇含完整来源清单）：`tmp/research/01-参考架构.md` ~ `tmp/research/12-对话UX.md`
- 核心一手来源：OpenAI Agents SDK / Claude Code & Agent SDK 官方文档、Anthropic《Building Effective Agents》《Effective Context Engineering》与 Agent Skills 博客、agentskills.io 开放规范、modelcontextprotocol.io、arxiv（ReAct/MemGPT/Generative Agents/τ-bench/CoALA/综述等 14 篇）
- 产品对照：Teal、LazyApply/AIHawk、ChatGPT Deep Research、Devin、OpenHands、mem0、Letta、open_deep_research、obra/superpowers、本机 ZCode（配置与子 Agent 运行产物）
