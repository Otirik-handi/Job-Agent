# 03 Agent Skill / 插件系统

> 调研日期：2026-08-10。对象：Anthropic Agent Skills 开放标准、Claude Code、obra/superpowers、ZCode/Codex、OpenAI ChatGPT/Codex。核心结论：Agent Skills 已是**跨平台开放标准**（2025-12-18 Anthropic 发布），ChatGPT/Codex/Windsurf/Cascade 均采纳，job-helper 应直接遵循该标准而非自造格式。

## 调研对象（标准/仓库/链接 + 一句话）

- **Agent Skills 开放规范（agentskills.io）**：SKILL.md 文件格式的权威标准，Anthropic 于 2025-12-18 发布，跨平台可移植。
- **Anthropic 官方博客《Introducing Agent Skills》（claude.com/blog/skills, 2025-10-16）**：宣布 Skills 上线，描述"可组合/可移植/高效/强大"四大特性。
- **Anthropic 工程博客《Equipping agents for the real world with Agent Skills》**：渐进式披露架构的权威解释（元数据→SKILL.md→附带文件三层）。
- **Claude Code Docs（skills / slash commands / subagents / plugins）**：skill=command 超集、subagent 独立执行、plugin 打包分发。
- **obra/superpowers（GitHub）**：13 个超能力 skill 的集合仓库，单仓库通过 `.claude-plugin/.codex-plugin/.cursor-plugin` 等清单多平台分发；本机 `~/.zcode/skills/`、`~/.agents/skills/` 即其安装实例。
- **OpenAI/ChatGPT/Codex《Build skills》文档**：明确声明"build on the open agent skills standard"，含上下文预算与目录扫描优先级。
- **Windsurf Cascade Skills**：同一规范，@mention 显式调用，指向 agentskills.io。

## SKILL.md 规范（格式、frontmatter 字段、正文组织）

**目录结构**（最低要求仅 SKILL.md，目录名=skill 名）：
```
skill-name/
├── SKILL.md          # 必填：frontmatter + 指令
├── scripts/          # 可选：可执行代码
├── references/       # 可选：按需读取的文档（REFERENCE.md / FORMS.md / 领域文件）
├── assets/           # 可选：模板、图片、数据
└── ...               # 其他任意文件
```

**frontmatter 字段**（YAML，`---` 包裹）：
- `name`（必填）：≤64 字符，小写字母/数字/连字符，不得含连续 `--`，**必须与目录名一致**，不得含 "anthropic"/"claude" 保留词。
- `description`（必填）：≤1024 字符，第三人称，**同时写"做什么"和"何时用"**，含触发关键词。
- `license` / `compatibility` / `metadata`（可选）：许可证、环境要求、任意 k-v 元数据。
- `allowed-tools`（可选，实验性）：空格分隔的预授权工具白名单（如 `Bash(git:*) Read`）。
- Claude Code 扩展字段：`when_to_use`、`argument-hint`、`arguments`、`disable-model-invocation`、`user-invocable`、`context: fork`（在 subagent 中运行）。

**正文组织**：Markdown 自由格式，推荐逐步指令、输入/输出示例、边界情况；**正文 ≤500 行**（<5000 tokens 为宜），超长拆到 references/ 并按需引用；**文件引用保持一层深**（避免 SKILL.md→a.md→b.md 的嵌套链，agent 会用 head 预览导致信息不全）；长 reference 文件顶部加目录（>100 行）。命名建议动名词/名词短语（`processing-pdfs`），禁泛化名（helper/utils）。

## 发现与触发机制（description 驱动 / 显式命令 / 目录扫描优先级）

**双层触发**：
- **隐式（description 驱动，默认）**：启动时所有 skill 的 name+description 预载入 system prompt，agent 依据 description 语义匹配自动选择。description 是唯一发现入口，须"前置关键用途+触发词"。
- **显式（/命令 或 @/ $ 引用）**：Claude Code 用 `/skill-name`，ChatGPT 用 `@`，Codex 用 `$`；显式调用绕过描述匹配。可用 `disable-model-invocation: true` / `allow_implicit_invocation: false` 关闭隐式触发（适合部署类高风险流程）。

**目录扫描与优先级**：
- Claude Code：enterprise > personal（`~/.claude/skills/`）> project（`.claude/skills/`，含父目录与嵌套目录）> plugin（`<plugin>/skills/`，用 `plugin:skill` 命名空间避免冲突）；同名时上层覆盖下层；`.claude/commands/*.md` 与 skills 兼容（command 已并入 skill 概念）。
- Codex：repo 级（`$CWD/.agents/skills` 至 `$REPO_ROOT/.agents/skills`）> user 级（`~/.agents/skills`）> admin 级（`/etc/codex/skills`）> system 级（内置）；同名 skill 不合并，可同时出现。
- **上下文预算**：Codex 限制初始 skill 列表 ≤模型上下文 2% 或 8000 字符，超出先截断 description，再多则省略并告警——提示 skill 库规模需控制。

## 渐进式披露机制

核心设计原则：**"像手册先目录后章节再附录"，信息按需分层加载，未触发的文件零 token 成本**。
1. **第一层（元数据，~100 tokens）**：所有 skill 的 name+description 启动时预载入系统提示，仅够判断相关性。
2. **第二层（指令）**：判定相关后 agent 用 Bash/Read 读完整 SKILL.md（正文 <5000 tokens）。
3. **第三层（资源）**：SKILL.md 引用到的 references/scripts/assets 仅在实际需要时读取；脚本可**直接执行而不载入其源码**（只消耗输出 token）。

优点：可打包无上限规模的背景资料；避免污染上下文。配套要求：文件引用一层深、reference 命名语义化（finance.md 而非 doc2.md）、SKILL.md 像"目录+快速上手"。副作用注意：skill 一旦加载，正文会跨 turn 驻留上下文，故每次改写都要做 token 审计。

## Skill 与插件/子智能体/命令的边界

- **Skill vs Command**：Claude Code 中自定义 command 已**合并进 skill**（`.claude/commands/deploy.md` 与 `.claude/skills/deploy/SKILL.md` 都生成 `/deploy`）；skill 是超集——支持附带文件、frontmatter 控制自动触发、subagent 执行。
- **Skill vs Plugin**：skill 是**内容/能力单元**，plugin 是**分发/打包单元**（可含多个 skill + MCP 连接 + hooks + agents + UI 资源）。Claude Code 的 plugin marketplace、OpenAI 的 plugin 目录、superpowers 的 `.claude-plugin/.codex-plugin` 清单皆是此关系。建议：写 skill，打包成 plugin 分发。
- **Skill vs Subagent**：subagent 是**独立上下文、可指定模型/工具/系统提示**的独立 agent 执行单元；skill 是注入当前上下文的**知识/流程包**。可组合：Claude Code 用 `context: fork` 让 skill 在 subagent 沙箱中运行；subagent 也可被 skill 编排。
- **Skill vs MCP**：MCP 是外部工具/数据连接器，skill 是教 agent **如何编排这些工具**完成流程；skill 可声明依赖某 MCP server 并引用其 `Server:tool` 全限定名。

## 对 job-helper Skill 系统的建议（求职领域 skill 怎么划分，标注 P0/P1/P2）

**落地原则**：遵循开放标准（SKILL.md + frontmatter name/description），单一 skill 库仓库平铺 `skills/` 目录（superpowers 模式，便于与 Claude Code / Codex / 自有系统三处复用）；每个 skill 用渐进式披露拆分（SKILL.md 极简 + references/ 承载 JD 解析规则、面试题库、薪资数据）；description 用中文写清触发场景。

- **P0（核心高频，先做）**：
  - `resume-analysis` 简历解析与优化建议（reference: 简历评分卡）
  - `jd-analysis` JD 解析→结构化要求清单（与简历做 gap 匹配）
  - `job-matching` 职位匹配评分与推荐（可复用 02-记忆系统 的用户画像）
  - `cover-letter-generation` 求职信/自我介绍生成（模板 assets/）
  - `interview-prep` 面试准备（题库、STAR 框架、模拟问答 scripts/）
  - `offer-evaluation` offer 比较与谈判话术
- **P1（重要，紧随其后）**：
  - `company-research` 公司背调（references: 尽调清单）
  - `salary-benchmark` 薪资基准（references: 分城市/职级数据）
  - `application-tracking` 投递跟进（结构化状态机 + 跟进邮件模板）
  - `linkedin-optimization` 个人品牌/简历关键词优化
- **P2（增强，按需）**：
  - `networking-referral` 内推与人脉触达话术
  - `career-narrative` 职业叙事/面试故事打磨
  - `negotiation-playbook` 谈判全流程
  - `job-board-scraping` 招聘平台采集脚本（脚本类，明确标注 allowed-tools 与合规边界）

命名规范：全部小写连字符名词短语（与标准一致）；description 采用"做什么 + 何时用 + 触发词"三段式；长内容走 references/ 保证 SKILL.md ≤500 行；高风险/耗时长流程（如 negotiation）设 `disable-model-invocation` 防误触。skill 库总量建议控制在 12-15 个内，避免超过 Codex 的上下文预算阈值。

## 来源清单

- Agent Skills 规范：https://agentskills.io（github.com/anthropics/agent-skills-spec）
- Anthropic 博客（发布）：https://claude.com/blog/skills
- Anthropic 工程博客（架构）：https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Claude Docs：https://docs.claude.com/en/docs/agents-and-tools/agent-skills/overview 、skill-authoring best practices、Claude Code skills/slash commands/sub-agents/plugins
- obra/superpowers：https://github.com/obra/superpowers
- OpenAI Build skills：https://developers.openai.com/agents/skills/ （Build skills for ChatGPT & Codex）
- Windsurf Cascade Skills 文档
- 本机实例：`C:\Users\Otirik\.zcode\skills\`（28 个）、`C:\Users\Otirik\.agents\skills\`（15 个）下的 SKILL.md
