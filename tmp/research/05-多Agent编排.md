# 05 多 Agent 编排与子 Agent 模式

日期：2026-08-10。为 job-helper 判断"是否需要多 Agent/子 Agent 分工"及如何起步提供参考。关联：`docs/designs/2026-08-04-agent-architecture-design.md`（现状边界：❌ 多 Agent，演进路径"组件之上加运行时类"）、`docs/designs/2026-08-10-skill-system-research.md`（skill 系统调研，同样不做子代理/fork）。

## 调研对象（链接 + 一句话）

- **Claude Code subagents**（code.claude.com/docs/en/sub-agents）：Agent/Task 工具派发子 Agent，本机 `~/.zcode/cli/agents/sess_*/agent_*/` 有真实产物（metadata.json + task.output + transcript.jsonl，prompt 即任务卡片，parentToolUseId 关联父会话）。
- **Anthropic Building Effective Agents**（anthropic.com/research/building-effective-agents）：官方权威的工作流模式分类（chaining/routing/parallelization/orchestrator-workers/evaluator-optimizer）。
- **OpenAI Agents SDK**（openai.github.io/openai-agents-python）：agents-as-tools（as_tool）与 handoffs 两条编排主线，input_filter 控制上下文裁剪。
- **LangChain Multi-agent**（docs.langchain.com/oss/.../multi-agent）：subagents/supervisor、handoffs、skills、router、custom workflow 五模式，含 LLM 调用次数/token 的量化对比。
- **Microsoft AutoGen**（microsoft.github.io/autogen/stable）：事件驱动 pub-sub 的 GroupChat、handoff、sequential、debate、reflection 等模式。
- **CrewAI**（docs.crewai.com/concepts/processes）：角色制 crew，sequential 与 hierarchical（manager 分派）两种流程。
- **open_deep_research**（github.com/langchain-ai/open_deep_research）：开源 deep research 代表，supervisor 规划 + asyncio.gather 并行研究者 + 压缩回传。

## 编排模式清单（每种：机制/适用场景/代表实现）

1. **Prompt chaining（链式）**：固定顺序 LLM 调用，前一步输出喂后一步，步骤间可加校验门。适用：可稳定分解为固定子任务、重准确率轻延迟。代表：Anthropic 工作流分类、AutoGen Sequential Workflow。
2. **Routing（路由）**：一次分类决定走哪条专用路径（专用 prompt/工具/小模型）。适用：输入类别清晰且分类准确。代表：LangChain Router、AutoGen topic 路由。
3. **Parallelization（并行，sectioning/voting）**：并发跑多个 LLM 再聚合；分片式（各做一块）或投票式（同任务多视角）。适用：可并行独立子任务提速、需要多视角提升置信度。代表：AutoGen Concurrent Agents、open_deep_research 的并行搜索。
4. **Orchestrator-worker / Supervisor（主管-工人）**：一个主 Agent 动态拆任务、以工具形式调多个 worker（worker 无状态、上下文隔离），汇总后再应答。适用：子任务无法预先枚举、worker 不直接面向用户、需要集中编排。代表：Claude Code 内置 Explore/Plan/general-purpose + Task 工具、LangChain subagents、AutoGen GroupChat（GroupChatManager 选下一个发言者）。
5. **Handoff（交接）**：每个 agent 以"转给某 agent"为工具，被转者接管本轮对话，控制权动态转移（可跨多跳）。适用：路由本身是工作流一部分、想让专业 agent 直接面向用户。代表：OpenAI Agents SDK handoffs、AutoGen handoff（源自 OpenAI Swarm）、LangChain handoffs。
6. **Evaluator-optimizer / Reflection（生成-评估-迭代）**：一个 LLM 生成、另一个评估、反馈循环改进。适用：有清晰评估标准且迭代能明显提质。代表：AutoGen Reflection（coder+reviewer 两 agent 循环到 approve）、Claude Code 的 code-reviewer 类子 Agent。
7. **Debate（多智能体辩论）**：多个 solver 多轮交换回答互相修正，aggregator 聚合投票。适用：数学/推理类高难度任务。代表：AutoGen Multi-Agent Debate（GSM8K）。

## 上下文传递与上下文爆炸问题

- **三种传递形态**（LangChain 官方"context engineering"框架）：子 Agent 入参（task card：只传任务描述/查询）vs 全量历史 vs 结构化 state 字段；出参（子 Agent 结果 vs 全对话历史）。
- **主流共识：只传任务卡片 + 回传精简摘要**。Claude Code：子 Agent 全新上下文窗口，"不看你会话历史"，由父 Agent 写一段委派摘要，子 Agent 只回摘要（"results return as a summary"）。本机 ZCode 产物同构：metadata.prompt 是任务卡片，task.output 是回传摘要（如"Review complete. Diff is exactly 2 new files…"）。
- **压缩回传是防爆炸的关键**：open_deep_research 每个 researcher 先把发现 `compress_research` 压成结构化摘要，supervisor 只见压缩结果，不见原始搜索结果（langchain 明确点出：raw_notes vs notes 两个状态槽）。
- **裁剪机制**：OpenAI input_filter（可删工具调用等历史）+ `nest_handoff_history`（把历史压成 `<CONVERSATION HISTORY>` 摘要段）；Claude Code Explore/Plan 干脆跳过 CLAUDE.md 与 git status；上下文预算（skill 描述 1% 窗口）同类思路。
- **状态保持的成本差异（LangChain 量化）**：同一请求重复 4 次时，subagents 无状态每次全跑（8 次调用）vs handoffs/skills 状态保持省 40–50%；跨领域并行任务则 subagents/router 更省 token（9K vs 14K+）。

## 拆与不拆的决策标准

**该拆**（Claude Code 官方 + LangChain 共识）：
- 副任务会产生大量主会话用不上的输出（跑测试/抓文档/日志处理），隔离后只回摘要；
- 需要专用工具集/专用提示词/更便宜模型（Haiku）与独立权限（read-only、禁写）；
- 任务可并行（多路独立调研、多域查询）；
- 不同团队/职责边界清晰需独立演进（registry + dispatch tool）；
- 主 Agent 已装太多工具、决策质量下降。

**不该拆**：
- 需频繁来回/迭代、多阶段共享大量上下文（规划→实现→测试）；
- 快速小改动、延迟敏感（子 Agent 冷启动重拾上下文更慢）；
- 子任务间强耦合、输出会反复被引用；
- LangChain 明确："单 Agent + 合适工具/提示词常能达成同样结果，不必要别拆"；Anthropic 同样"找最简单方案，复杂度只在实证改善结果时加"。

## 开销与失败模式

- **重复劳动**：无状态 worker 每次从零开始（subagents 每次 4 次调用 vs stateful 2 次）；多 Agent 系统"以延迟与成本换任务表现"（Anthropic 原话）。
- **上下文放大/丢失**：逐层传全量历史 → token 膨胀；反之摘要过度 → 关键细节丢失（supervisor 只见摘要，需提示子 Agent"最终消息要含结论"，LangChain 点名的常见失败模式）。
- **协调成本**：subagents 多一跳（结果经主 Agent 回传）；handoffs 顺序执行无法并行；GroupChat 需 manager 选择发言者，回合顺序影响质量。
- **错误复合与归因难**：错误层层放大、定位到哪个 agent 难，需 tracing（LangSmith/AutoGen 均有）；Claude Code 给子 Agent 配 hooks（SubagentStart/Stop）与 API 错误回传（截断部分结果）做兜底。
- **并发限制与死循环**：Claude Code 默认 20 并发上限、嵌套 3 层、迭代上限（open_deep_research 的 max_researcher_iterations）；"探索太多子 Agent 使上下文超限"是官方点名的反模式。

## 对 job-helper 的判断与建议（P0/P1/P2）

现状：单用户、本地、对话驱动（聊天 + 工具调用 + 进度卡片），任务为一条条求职闭环（导入→分析→匹配→定制→投递），单 Agent ToolLoopAgent + 7 个领域工具，上下文已用"实体经工具参数引用 + 工具结果精简回填"控流。任务量小、无并发、无外部系统对接。

- **P0（不引入多 Agent，维持单 Agent 单工具循环）**：当前没有"高噪音副任务、需专用权限、需并行、工具过多决策劣化"任一触发条件；7 个工具各自封装完整分析链路，本质是"prompt chaining + 路由"固化进工具，已覆盖大部分编排价值。继续把"质量规则沉淀为 skill/提示词"路线走完（05-skill 调研结论一致），比上多 Agent 更对症。
- **P1（若未来出现两个信号再引入，且从"最小 supervisor"起步）**：信号 A=单条任务内需多次并行调研（如"同时查 5 个渠道 JD 差异"）；信号 B=主 Agent 工具表膨胀到选择劣化（>10–15 个）。起步形态照抄 LangChain subagents 模式：主 Agent 以工具形式调子 Agent（`as_tool`/Tool per agent），子 Agent 只收任务卡片、回精简摘要，无状态、顺序或 `asyncio.gather` 并行；不引入 handoff（无多轮对话移交需求）与 debate/reflection（求职输出有确定性契约校验，迭代收益低）。实现上是现有 tool-factory 之上加一层"子 Agent 工具"，与既定演进路径（组件之上加运行时类）吻合。
- **P2（演进配套，不急着做）**：子 Agent 专用工具/模型路由（重任务用强模型）、子 Agent 会话隔离与 resume（每用户多会话自然可复用现有 conversations 表语义）、执行追踪（OpenTelemetry/进度卡片已有雏形）。

## 来源清单

- Claude Code 官方：Create custom subagents（Subagents help / built-in Explore-Plan-general-purpose / 上下文"what loads at startup" / Common patterns / 选型：main vs subagent / 并发与嵌套限制）
- Anthropic 官方：Building Effective Agents（workflows 五模式 + agents + "只加必要复杂度"）
- OpenAI Agents SDK 官方：Agent orchestration（LLM 编排 vs 代码编排）、Handoffs（input_type / input_filter / nest_handoff_history / recommended prompts）
- LangChain 官方：Multi-agent（Why multi-agent / 五模式对照表 / 性能量化对比）、Subagents（tool per agent vs single dispatch tool / context engineering / subagent inputs/outputs）
- AutoGen 官方：Multi-Agent Design Patterns（Intro / Group Chat / Sequential Workflow / Handoffs / Multi-Agent Debate / Reflection / Concurrent Agents）
- CrewAI 官方：Crews（process 属性）、Processes（sequential / hierarchical + manager_llm/manager_agent）
- open_deep_research（GitHub langchain-ai/open_deep_research）：deep_researcher.py（supervisor + ConductResearch + asyncio.gather + compress_research）、state.py（raw_notes vs notes）
- 本机 ZCode 产物：`~/.zcode/cli/agents/sess_193a2947-…/agent_21a88fa7-…/metadata.json + task.output + transcript.jsonl`（任务卡片 prompt / parentToolUseId / 摘要回传）
