# job-helper Skill 系统 · 通用 Agent 调研报告

日期：2026-08-10
状态：调研完成，供设计讨论引用（不包含架构决策，架构决策见后续设计文档）
关联文档：`docs/research/2026-08-10-skill-system-brainstorm-memo.md`（讨论纪要，本调研是"重新起线"前的素材收集）

## 1. 调研背景与目标

纪要已定位 job-helper 与通用 agent 的根本差距是**「能力可运行时加载」**（能力硬编码 vs 能力可插拔），并确认 skill 系统是补上这一环的方向。本调研回答三个问题：

1. 主流通用 Agent 的 skill 系统**怎么做**（格式、发现、加载、触发、优先级）；
2. 行业是否已形成**事实标准**；
3. 有哪些可借鉴、哪些要按"专精求职领域 agent"定位取舍。

调研对象分三类，全部基于官方文档与可靠资料（经本地代理访问，来源见第 9 节）：

- **CLI/IDE 编程 Agent**：Claude Code、Cursor、Windsurf、Gemini CLI、Aider、Zed
- **厂商官方体系**：Anthropic（Claude Code / Claude API / claude.ai）、OpenAI（ChatGPT Skills / Codex / OpenAI API）
- **开源框架与生态**：OpenHands、OpenAI Agents SDK、LangChain、CrewAI、LlamaIndex、Google ADK、MCP、第三方技能市场

---

## 2. 最重要的事实：行业已收敛到同一开放标准

所有现代实现（Claude Code、Cursor、Windsurf、Gemini CLI、Zed、OpenHands、CrewAI、Google ADK、OpenAI 官方）都采用**同一种 skill 载体**——`Agent Skills 开放标准`（agentskills.io，Anthropic 2025-10 发布、2025-12 开源，40+ 客户端采用）：

```
<skill-name>/            # 目录名 = skill 名
  SKILL.md               # YAML frontmatter + Markdown 正文（入口，必需）
  scripts/               # 可执行代码（确定性步骤）
  references/            # 详细参考文档（按需加载）
  assets/                # 模板/资源
```

**frontmatter 只有两个必填字段**：

| 字段 | 要求 |
|---|---|
| `name` | 1–64 字符，小写字母/数字/连字符，**须与父目录名一致** |
| `description` | 1–1024 字符，同时写"做什么 + 何时用"，含触发关键词 |

可选字段（跨平台通用）：`license`、`compatibility`、`metadata`、`allowed-tools`（实验性）。各家另有私有扩展字段（见 §3）。

**含义**：job-helper 若直接采用该格式，天然兼容用户已有的 `.claude/skills/`、`.agents/skills/`，能复用生态里的 skill（比如 Anthropic 官方仓库、skills.sh），不用自造格式。

---

## 3. CLI/IDE 编程 Agent 逐家要点

### 3.1 Claude Code（Anthropic）

- **目录层级**：Enterprise（组织 managed settings）> Personal（`~/.claude/skills/`）> Project（`.claude/skills/`）> Plugin（`<plugin>/skills/`）。同名覆盖顺序即上到下。支持嵌套 `.claude/skills/`（monorepo 子包，读写该目录文件时按需加载）。
- **渐进式加载**：启动时只把每个 skill 的 name+description 注入上下文，**正文仅在调用时加载**。官方原话："skill descriptions are loaded into context so Claude knows what's available, but full skill content only loads when invoked."
- **列表预算**：技能描述清单预算为**上下文窗口的 1%**；单条 description+when_to_use 上限 **1536 字符**；超预算先截断最不常调用的描述。
- **触发**：模型按 description 自主加载（默认）+ 用户 `/skill-name` 手动调用（可带参数）。
- **扩展字段（私有，跨平台会被硬报错）**：`when_to_use`（追加触发词）、`argument-hint`/`arguments`（参数）、`paths`（glob 限定自动激活范围）、`disable-model-invocation`（禁止模型自动调用，官方建议 `/deploy`、`/commit` 这类副作用操作加上）、`context: fork`（在独立 subagent 运行）、`allowed-tools`/`disallowed-tools`、`model`、`hooks` 等。
- **正文替换**：支持 `$ARGUMENTS`、`${CLAUDE_SKILL_DIR}` 等字符串替换，及 `` !`command` `` 动态上下文注入（先执行命令、输出替换进正文）。
- **与 CLAUDE.md 边界**：官方建议把"CLAUDE.md 里已经从事实长成流程的部分"移入 skill；skill 正文按需加载，"long reference material costs almost nothing until you need it"。
- **编写建议**：SKILL.md < 500 行；description 含用户自然措辞的关键词、关键用例前置。

### 3.2 Cursor

- **Rules 与 Skills 双轨**：Rules 用 `.cursor/rules/*.mdc`（必须是 .mdc），frontmatter 三字段 `description`/`globs`/`alwaysApply`；Skills 用标准 `SKILL.md`（`.agents/skills/` 或 `.cursor/skills/`，用户级同理）。
- **Rules 四种触发模式**（frontmatter 组合决定）：
  | 模式 | 条件 | 行为 |
  |---|---|---|
  | Always Apply | `alwaysApply: true` | 每会话进上下文 |
  | Apply to Specific Files | `globs` | 匹配文件在上下文时自动附加 |
  | Apply Intelligently | 仅 `description` | 模型读描述判断相关性后拉取 |
  | Apply Manually | 两者皆缺 | 仅 `@rule-name` 手动 |
- **Skills**：启动扫描，仅 name+description 呈现给模型，正文按需；`disable-model-invocation: true` 时仅手动 `/skill-name`。
- **优先级**：Team Rules > Project Rules > User Rules，冲突时前者优先。
- **与 AGENTS.md 边界**：AGENTS.md 是"简单常驻指令"的替代；结构化/需控制触发用 .mdc rules；提供 `/migrate-to-skills` 把适用 rules 迁成 skills。

### 3.3 Windsurf / Devin Cascade

- **四类机制 + 官方选择矩阵**（最清晰）：Rules（行为约束）vs **Skills**（多步流程 + 支持文件）vs **Workflows**（手动 runbook，`/[name]` 调用、模型永不自动触发）vs **Memories**（自动生成，机器本地不进 git）。
- **Rules 触发**：frontmatter `trigger: always_on | model_decision | glob | manual`。
- **AGENTS.md 归入 Rules 引擎**：根目录 AGENTS.md = always-on，子目录 = 自动生成 `<目录>/**` glob。
- **Skills** 渐进式加载同主流；激活是模型自动 + 用户 `@name`。

### 3.4 Gemini CLI

- **Skills**（`~/.gemini/skills/` 或 `.agents/skills/` 用户级；`.gemini/skills/` 项目级）与 **Custom commands**（`.toml`，仅手动 `/` 调用）并行。
- **激活带用户确认**（独有亮点）：模型按 description 判定相关 → 调 `activate_skill` 工具 → **UI 弹出确认**（说明 skill 名称、用途、将获得的文件路径权限）→ 同意后才注入正文。对单用户本地应用的可信执行有参考价值。
- **优先级**：Built-in < Extension < User < Workspace；同层内 `.agents/skills/` 优先（跨工具互操作标准路径）。
- **编写建议**：官方强调 description 是激活前唯一信息（~100 词）必须写好；三级加载管理上下文（metadata ~100 词常驻 → SKILL.md <5k 词 → 资源按需）。

### 3.5 Aider（最简实现）

- 无目录扫描、无 frontmatter、无自动触发。约定就是一个 markdown 文件（`CONVENTIONS.md`），`/read` 或配置自动加载。官方实验证明其效果（加约定文件后模型行为显著改善）。
- **启示**：这是"最小可行 skill 系统"的下界——一个文件 + 固定加载即可见效；复杂度是渐进加的。

### 3.6 Zed

- 扁平结构（**不支持嵌套目录**）；catalog（所有 skill 的 name+description）总预算 **50KB**，超出丢弃。
- 优先级：project-local 覆盖 global。
- **安全细节**：项目级 skill 只从**受信任 worktree** 加载，未信任项目不注入（防恶意项目污染系统提示）。
- 官方明确演进方向："**Rules 已被 Skills 和 Instructions 取代**"——可复用、按需的 rules 变 skills；默认常驻的 rules 变 AGENTS.md。

---

## 4. 厂商官方 Skill 体系（Anthropic / OpenAI）

### 4.1 双方均采用同一开放标准

OpenAI 官方文档明确 "Skills build on the open agent skills standard"；Anthropic 是标准发起方。规范层（frontmatter 必填、目录结构、渐进式披露）高度一致，差异在扩展与产品面。

### 4.2 渐进式披露（两家同构，业界共识）

1. **Discovery**：启动只预载每个 skill 的 name+description。
   - Anthropic 官方："At startup, the agent pre-loads the name and description of every installed skill into its system prompt."
   - OpenAI 官方："ChatGPT and Codex start with each skill's name and description, then load the full SKILL.md instructions when they decide to use that skill."
2. **Activation**：description 命中 → 读完整 SKILL.md 进上下文（已加载正文作为单条消息持续保留）。
3. **Execution**：按需读 references/ 或执行 scripts/。

### 4.3 加载细节与预算（设计参考值）

| 项 | Anthropic（Claude Code / API） | OpenAI（Codex / API） |
|---|---|---|
| 目录路径 | `.claude/skills/`、`~/.claude/skills/` | `.agents/skills/`、`~/.agents/skills/` |
| 元数据注入 | API 走 **system prompt**；Claude Code 列表预算 **1% 上下文**、单条 ≤1536 字符 | API 走 **user prompt context**；Codex 列表预算 **2% 上下文或 8000 字符** |
| description 上限 | 标准/API 1024；claude.ai 消费者版 200 | 标准 1024 |
| 显式调用 | `/skill-name` | ChatGPT `@` / Codex `$` |
| 版本化 | API 时间戳版本 + `latest` | API 整数 version + `default_version` |
| 上传限制 | ≤30MB | zip ≤50MB、≤500 文件、单文件 ≤25MB |
| SKILL.md 大小建议 | <500 行；正文每个 token 都与会话历史竞争 | 聚焦单一任务；instructions 优先于 scripts |

### 4.4 官方最佳实践（双方共识）

1. **description 决定触发成败**：第三人称；同时写"做什么 + 何时用"；含用户自然措辞的触发关键词；关键用例前置。
2. **什么适合做 skill**："当你反复把同一段指令/清单/多步流程粘进对话"、或"CLAUDE.md 中某段已从事实长成流程"时。
3. **粒度**：一个 skill 只做一件事；多个专注 skill 组合优于一个大 skill。
4. **开发流程**：先评估（在代表性任务上观察无 skill 时的失败）→ 增量补 skill → 迭代回写（Anthropic "Start with evaluation"）；OpenAI "Test prompts against the skill description to confirm the right trigger behavior"。
5. **安全（两家一致）**：skill 含指令与可执行代码，恶意 skill 有 prompt injection / 数据外泄风险；只从可信来源安装、上传前审查捆绑文件。

---

## 5. 开源框架与生态

### 5.1 OpenHands：microagents → skills 的演进

- 历史概念 **microagents**（`microagents/` 目录）已迁移为统一 **skills** 系统（`.agents/skills/`），microagents 目录保留为 legacy 兼容。
- 官方定位："Skills guide the agent's behavior; they do not grant permissions or install dependencies." **skill 是指令包不是权限包**。
- **OpenHands 的触发扩展字段**（值得借鉴的确定性机制）：
  - `triggers`：2–5 个关键词，用户消息命中即注入（半确定性）；
  - `paths`：glob 匹配（如 `src/api/**/*.ts`），"agent first reads, edits, or creates a matching file" 时注入——**确定性**，官方明确"guaranteed to load for the files they scope, with no reliance on the model choosing them"（与 Claude Code 的 rules 一致）。`paths` 优先于 `triggers`。这类触发技能**不广播 name/description**。
- 常驻上下文文件（AGENTS.md 等）**每次启动全量加载**，官方要求保持简短。

### 5.2 框架中 tool / skill / microagent 的区别（概念澄清）

| 概念 | 本质 | 运行时行为 |
|---|---|---|
| **Tool** | 可调用函数（name + description + 输入 schema） | 模型显式调用，每次调用消耗 token |
| **Skill / Microagent** | 可注入的指令与知识包（SKILL.md） | 渐进式披露，教模型"怎么做" |
| **MCP Server** | 外部系统接入标准（tools/resources/prompts 三原语） | 提供"能调什么" |

- OpenAI Agents SDK / LangChain / LlamaIndex / CrewAI 的"技能"本质都是 **Tool 模型**（`@tool` 装饰器 + docstring 生成描述）；真正引入 SKILL.md 指令包概念的是 CrewAI、Google ADK。
- CrewAI 官方明确："**Skills are NOT tools**——Skills inject instructions and context into the agent's prompt, Tools give the agent callable functions to take action。" skill 和 tool 是两个正交维度，通常配合使用。

### 5.3 MCP vs Skill（互补关系）

- **MCP**（modelcontextprotocol.io）："like a USB-C port for AI applications"，解决"连接与调用"——外部数据源、工具、工作流入口的标准化接入。
- **Skill**："portable instruction sets that give AI coding assistants domain knowledge"，解决"程序性知识与流程指导"——教 agent 如何用已有工具完成复杂多步任务。
- MCP 协议目前**不定义 skills**；"Skills Over MCP" 工作组（SEP-2640）正把 skill 标准化为 MCP 一等原语（进展中，2026 年已转正式工作组，含 Google/Databricks/GitHub/AWS）。**现阶段：两者互补使用即可，不必等协议落地。**
- Anthropic 官方原话：Skills "can complement MCP servers"，教 agent 更复杂的涉及外部工具的工作流。

### 5.4 分发生态（事实标准与渠道）

- **Agent Skills 开放标准**（agentskills.io）已为事实标准，40+ 客户端采用。
- 主要渠道：`anthropics/skills`（官方样例仓库，含 docx/pdf/pptx/xlsx 文档技能）、`skills.sh`（Vercel 维护的聚合目录，`npx skills add <owner/repo>` 安装）、`awesome-claude-skills`（1000+ 技能清单）、`obra/superpowers`（方法论技能框架）、OpenHands extensions registry。
- **分发机制**：项目级技能进 git（Claude Code 提交 `.claude/skills/`）；可复用技能打包成 plugin marketplace（Claude Code `/plugin install`；OpenAI 共享通用插件目录）；OpenAI 支持"从产品导出、另一产品导入"（跨产品互通，基于开放标准）。

---

## 6. 跨系统对比小结

| 维度 | Claude Code | Cursor | Windsurf | Gemini CLI | Zed | Aider | 框架/生态（OpenHands 等） |
|---|---|---|---|---|---|---|---|
| 载体 | 目录+SKILL.md | SKILL.md + .mdc rules | SKILL.md + rules + workflows | SKILL.md + toml 命令 | SKILL.md | 纯 .md | SKILL.md 统一标准 |
| 发现 | 启动扫 4 层目录 | 启动扫描 | 自动发现多根 | 启动扫分级层 | 自动（扁平） | 无（显式 /read） | 目录扫描 |
| 加载 | 1% 上下文预算 | 仅 name+desc 呈现 | 仅 name+desc | name+desc 全注入 | catalog 50KB | 全量常驻 | 渐进式披露 |
| 触发 | 模型自主+`/`手动 | 4 种 rules + skill 自动 | 4 种 trigger + `@` | 模型+**用户确认** | 模型+`/`/`@` | 仅用户 | 模型自主+triggers/paths 确定性 |
| 优先级 | E>P>Project>Plugin | Team>Proj>User | System>WS>Global | Built-in<U<WS | Project>Global | 无 | 层级覆盖 |
| 与指令文件边界 | CLAUDE.md 常驻 vs skill 按需 | AGENTS.md vs rules vs skill | 根=always-on | GEMINI.md vs skill | Instructions vs skill | 文件即规则 | AGENTS.md 全量 vs skill 按需 |

**六条共性结论**（跨全部调研对象的共识）：

1. **格式已收敛**：`目录 + SKILL.md + frontmatter(name/description)` 是事实标准，scripts/references/assets 子目录通用。
2. **渐进式加载是共识**：只把 name+description 常驻，正文与资源按需；所有实现都为描述清单设了预算上限（1% 上下文 / 2% 或 8000 字符 / 50KB）。
3. **触发以模型自主为主**、`/命令`/`@提及`为辅；`disable-model-invocation` 把副作用流程限定为手动（Claude、Cursor、Zed 均有）。
4. **层级优先级统一**：System/Enterprise > User/Global > Project/Workspace，越具体越优先，项目级可覆盖全局。
5. **与常驻指令文件边界一致**：常驻文件放"每会话都要知道的事实与约束"，skill 放"触发时才需要的流程与资源"；多家在把旧命令/rules 向 skill 迁移。
6. **description 写法决定成败**："When to use" + 具体触发症状，而非"这个技能做什么"（superpowers 实测：description 里总结流程会适得其反——模型照着描述做而不读全文）。

---

## 7. 对 job-helper 的启示（按"专精求职领域 agent"定位筛选）

### 7.1 值得直接借鉴

| # | 借鉴点 | 理由 |
|---|---|---|
| 1 | **采用 SKILL.md 开放标准格式**（name/description 必填 + scripts/references/assets） | 生态兼容，复用已有技能，不用自造格式；skill 即"数据"而非代码，实现"能力可插拔" |
| 2 | **渐进式披露 + 描述清单预算** | 本地优先 + 上下文预算敏感；几十个求职技能时清单预算（参考 1%–2% 上下文或固定字符上限）+ 超限截断低频描述 |
| 3 | **触发梯度**：模型自主（默认）+ 用户显式 `/命令` + 确定性机制（paths/triggers 按需采用） | 求职场景部分任务应确定性触发（如"打开简历分析"时注入简历规范） |
| 4 | **`disable-model-invocation` 类开关** | 投递、生成材料等有副作用/高成本动作仅允许用户显式触发，与现有"两段式审批"呼应 |
| 5 | **两级存储**：项目级 skills（进 git、随项目共享）+ 用户级 skills（个人通用） | 与现有 `.agents/` 目录体系一致；层级覆盖规则简单 |
| 6 | **skill 与常驻指令文件分治** | AGENTS.md/.agents/specs 管"每会话都要知道"；skill 管"触发时才需要的流程"——正好承接纪要里"把质量规则从代码里搬出来" |
| 7 | **description 写作规范沉淀进系统** | 技能作者（人）需要被约束：第三人称、含触发词、关键用例前置、<500 行正文 |
| 8 | **激活确认**（参考 Gemini CLI） | 本地应用触发 skill 前展示"将加载什么"可提升可信度，但需权衡是否打断对话流畅度 |

### 7.2 因定位取舍（不做）

- ❌ **不做文件系统/命令执行/浏览器等环境交互 skill**（纪要已定：专精求职，不做通用 agent 能力）。
- ❌ **不实现 MCP server 集成**（求职场景无外部系统对接需求；skill 与 MCP 互补但现阶段用不上 MCP）。若未来接招聘平台数据源再考虑。
- ❌ **不做插件市场/远程仓库安装**（单用户本地优先；skills 进 git 或用户目录即可，可预留"导入导出目录"作为最低限度的分享手段）。
- ❌ **不做子代理/上下文 fork**（单线程对话场景，`context: fork` 的隔离运行价值有限）。

### 7.3 需要回答的问题（留给第二步架构设计）

1. skill 运行时如何接入现有 ToolLoopAgent（`agent.ts` 的工具循环）？skill 清单注入系统提示的位置、格式？
2. skill 触发命中后，正文以什么形态进入上下文（作为消息、作为附加 system 内容）？
3. 求职领域第一批 skill 的候选与粒度（如：简历分析规范、JD 匹配方法论、面试追问策略、渠道发现规范……与现有 `prompts/<name>.ts` 的关系——是迁移还是共存）。
4. "自动发现"与"确定性注入"的边界：哪些质量规则要常驻（进 AGENTS.md/提示词），哪些按需（进 skill）？
5. skill 的校验（frontmatter 合法、目录名与 name 一致）与失效处理。
6. 用户显式触发的 UI 形态（聊天斜杠命令？技能列表面板？）——承接纪要"外层透传"的讨论。

---

## 8. 一句话总结

行业已收敛到 `SKILL.md 开放标准 + 渐进式披露 + description 驱动触发`，job-helper 直接采用该格式实现一个轻量 skill 运行时即可获得"能力可插拔"；重点是把求职领域的质量规则/方法论沉淀为 skill（数据），并做好描述清单的预算与触发控制——这正好服务"单点强化 LLM 输出质量"的最初动机。

---

## 9. 来源清单（调研日期 2026-08-10，经本地代理访问）

**开放标准**
- https://agentskills.io/specification（Agent Skills 开放标准）

**Anthropic**
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/best-practices
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://docs.claude.com/en/api/skills-guide
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://support.claude.com/en/articles/12512198-creating-custom-skills
- https://github.com/anthropics/skills

**OpenAI**
- https://learn.chatgpt.com/docs/build-skills
- https://learn.chatgpt.com/docs/skills-and-plugins
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/customization/overview
- https://developers.openai.com/api/docs/guides/tools-skills
- https://developers.openai.com/plugins/build/skills
- https://help.openai.com/en/articles/20001066-skills-in-chatgpt
- https://github.com/openai/plugins

**CLI/IDE 类**
- https://cursor.com/docs/rules 、https://cursor.com/docs/skills
- https://docs.windsurf.com/windsurf/cascade/skills.md 、.../memories.md 、.../workflows.md 、.../agents-md.md
- https://geminicli.com/docs/cli/skills 、.../creating-skills 、.../skills-best-practices 、.../custom-commands
- https://aider.chat/docs/usage/conventions.html
- https://zed.dev/docs/ai/skills 、https://zed.dev/docs/ai/instructions

**开源框架与生态**
- https://docs.openhands.dev/overview/skills 、https://docs.openhands.dev/overview/skills/creating 、.../keyword 、.../path
- https://docs.crewai.com/concepts/skills 、https://docs.crewai.com/concepts/tools
- https://openai.github.io/openai-agents-python/tools/
- https://modelcontextprotocol.io/ 、https://modelcontextprotocol.io/community/working-groups/skills-over-mcp
- https://skills.sh/ 、https://github.com/obra/superpowers
