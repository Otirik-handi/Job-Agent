# 04 MCP 与工具调用协议

> 调研时间：2026-08-10。调研对象为官方规范/一手博客，聚焦 MCP 与 function calling 双轨，为 job-helper 工具层补全设计提供依据。
> 现状参照：`src/agent/tool-factory.ts`（createDomainTool 统一包装）、`.agents/specs/03-agent/agent-tooling-conventions.md`（两段式审批、确定性护栏、纯函数单测）、`src/agent/llm-call.ts`（zod 契约 + repair≤2 + 降级）。

## 调研对象（链接 + 一句话）
- MCP 官方站点 https://modelcontextprotocol.io/ —— 协议总览、架构与工具规范的权威来源（现按版本归档，如 /docs/2026-07-28/）。
- MCP Tools 规范 https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md —— tools/list、tools/call、schema 要求、错误分级、安全要求。
- MCP 安全最佳实践 https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices.md —— 本地服务器风险、SSRF、混淆代理、prompt injection 缓解。
- OpenAI Function Calling https://platform.openai.com/docs/guides/function-calling —— 工具 schema、并行调用、strict mode、tool_choice、最佳实践。
- Anthropic Tool Use（Define/Handle）https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools（.md 后缀可取纯文本）—— 描述写法、is_error 错误信号、重试行为。
- Anthropic《Writing tools for agents》 https://www.anthropic.com/engineering/writing-tools-for-agents —— 面向 Agent 的工具设计心智（命名空间、少而大、响应精简、评估驱动）。

## MCP 协议架构（host/client/server、三原语、传输、授权）
- **要解决的问题**：AI 应用（host）与外部系统（数据源/工具/工作流）之间的**标准化连接层**，类比「AI 的 USB-C」；把「每个应用写一套对接逻辑」变成「一次实现、处处接入」，并让工具列表可被动态发现。MCP 只定义上下文交换协议，不规定 AI 应用怎么用 LLM。
- **架构**：Host（AI 应用，如 Claude/VS Code）为每个 Server 实例化一个 Client；Client 与 Server 保持专用连接。数据层基于 JSON-RPC 2.0，双层结构：**data layer**（发现/原语/通知）+ **transport layer**（stdio 本地进程内 / Streamable HTTP 远程，SSE 流式）。协议无状态，每个请求自带 `_meta`（协议版本/客户端能力/身份），经 `server/discover` 协商版本与能力。
- **三类服务端原语**：`tools`（可执行动作，tools/list → tools/call）、`resources`（上下文数据，resources/list → resources/read，如文件/DB 记录）、`prompts`（复用模板，prompts/list → prompts/get）。客户端原语 sampling 已废弃（2026-07-28 版本），新增 elicitation（请求用户输入/确认，即协议级的审批点）。工具列表可动态变化（listChanged 通知）。
- **工具对象字段**：`name`（1-128 字符、仅 A-Za-z0-9_-、大小写敏感、server 内唯一，跨 server 冲突由客户端前缀消歧）、`title`、`description`、`inputSchema`（JSON Schema，默认 2020-12）、`outputSchema`（可选）、`annotations`（描述工具行为如只读/破坏性，**客户端必须视为不可信**）。
- **授权**：远程场景推荐 OAuth（token、OAuth 客户端凭据）；scope 最小化 + 增量升级。本地 stdio server 天然只对一个 client 可见。job-helper 是本地单用户，授权非主矛盾。

## 工具 schema 与描述的最佳实践
- **描述是选对工具的第一杠杆**：OpenAI 与 Anthropic 一致强调「清晰详细的 name/description/参数说明」。Anthropic 建议每条描述 ≥3-4 句，讲清：做什么、何时用/何时不用、每个参数含义与格式、返回什么、不含什么；`get_stock_price` 好/坏描述对比即示范。参数名要无歧义（`user_id` 而非 `user`）。
- **schema 严谨性**：OpenAI strict mode 要求 `additionalProperties: false` + 全部 required（可选字段用 `["string","null"]`），推荐恒开 strict，把「无效调用」从类型层面消灭。枚举 + 对象结构让非法状态不可表达（`toggle_light(on, off)` 反例）。
- **少而大 + 命名空间**：合并总是连调的工具/动作（`action` 参数聚合 create/review/merge_pr）；工具数 <20 精度更高；多服务用前缀命名空间（`github_list_prs`），注意 MCP 规范命名规则与 Anthropic 正则 `^[a-zA-Z0-9_-]{1,64}$` 兼容。
- **响应只回高信号**：返回语义化标识（slug/UUID）而非内部引用，截断/分页，让 Agent 能直接推理下一步；错误信息要「具体 + 可行动」，而非裸 code。
- **描述即新员工培训**：把隐式上下文显式化；用 eval 度量描述改动的收益。

## 工具执行安全与沙箱
- **MCP 安全基线**：Server 必须校验一切输入、限流、净化输出；Client 应在敏感操作前弹确认、调用前向用户展示工具输入（防数据外泄）、给工具调用设超时、审计日志。协议明确要求 human-in-the-loop（能拒绝调用）。
- **本地 Server 风险**：以用户同等权限运行，恶意 server 可任意代码执行/数据外泄；缓解 = 最小权限沙箱（容器/chroot/应用沙箱）、安装前确认对话框（展示完整命令）、stdio 限本进程、HTTP 加 token。SSRF：禁私有网段/元数据地址、HTTPS 强制、防重定向逃逸。
- **企业级落地模式**（作为参照，非本应用所需）：OAuth 授权、scope 最小化、逐级提升（step-up authorization）、状态句柄防劫持（handle 是名字不是凭证，每次调用都校验归属）。
- **代码解释器/沙箱**：Anthropic 的 code execution tool 在沙箱容器中跑 Python/bash；模型要执行的任意代码归入沙箱，而业务工具仍是应用侧受控代码。job-helper 无「模型写任意代码」场景，沙箱需求低。

## 错误处理与自愈回路
- **两级错误模型（MCP 明确划分）**：① 协议错误（未知工具/畸形请求）返回 JSON-RPC error，模型难自愈；② **工具执行错误**返回 `isError: true` + 内容，客户端**应当**把执行错误喂回给模型使其自纠。
- **Anthropic is_error 模式**：执行失败用 `tool_result` + `is_error: true` + 有指导性的错误文本（如「限流，60 秒后重试」而非 "failed"）；参数缺失时 Claude 会带修正重试 2-3 次再致歉。格式要求：tool_result 必须紧跟 tool_use 且置于 user 消息 content 首位。
- **反馈回路设计**：工具输出不可信（可能含间接 prompt injection），保持在 tool_result 块内而非注入 system；失败信息应包含「发生了什么 + 下一步该试什么」（job-helper 已有 `{code,message,hint}` 结构与此对齐）。
- **job-helper 现状评估**：`createDomainTool` 抛错统一包成 `{code:'TOOL_FAILED',message}` 并 throw，由 AI SDK 转成 error 返回模型——单层、信息被剥；`callStructured` 已有 repair≤2 重试 + 降级，是自愈回路的正确雏形。

## 对 job-helper 的判断与建议（需要 MCP 吗？工具层怎么补全）
**结论：单用户本地应用不需要引入 MCP 做运行架构；当前「Vercel AI SDK 原生 tool() + 业务层自研编排」是对的。** 判断依据：① MCP 的价值在「跨应用复用一个工具生态 + 动态发现」，job-helper 的工具集固定（11 个、本地 DB、无第三方 server），动态发现零收益；② MCP 是 JSON-RPC 线协议，绕开 AI SDK 的 tool() 等于把工具层重新造一遍，违背 AGENTS.md「成熟库优先」；③ 本地 stdio server 与 AI SDK 内联 execute 相比，只增加进程/序列化开销。**唯一的 MCP 引入时机**：未来要接入第三方 server（如招聘平台、邮件）或希望自己的工具被其他 host 复用时，再用 `@ai-sdk/mcp` 客户端封装，不动业务层。

**工具层补全清单（P0/P1/P2）**：

- **P0（立刻做，成本低收益大）**
  1. 工具描述升级：按 Anthropic 3-4 句规范重写 11 个工具的 `description`（做什么/何时用/何时不用/参数含义/返回什么），重点补 `applyJob`、`recordApplicationStatus` 的边界与前置条件——这是「让模型选对工具」最便宜的一刀。
  2. 错误自愈回路：把 `createDomainTool` 的 throw 包装改成**结构化执行错误返回**（对齐 MCP isError 语义：`{ok:false, code, message, hint}` 作为返回值而非 throw，AI SDK 支持返回 error 给模型），`hint` 字段已有基础（apply-job.ts），推广到全部工具并写进规范。
  3. zod 输入 schema 升级为 strict 语义（`additionalProperties:false` + 明确 required），输入校验前置于 execute 前，让「非法参数」在工厂层就被拦截并生成可行动错误。
- **P1（近期）**
  4. `outputSchema` 化：每个工具输出加 zod 契约并在工厂层校验，杜绝模型/DB 脏数据外流；`listResumes`/`listJobOpportunities` 输出限高信号字段。
  5. 幂等化改造：`importResume`/`importJobOpportunity` 提供 upsert 语义（MCP 用状态句柄 + 幂等 hint 的做法可借鉴），`recordApplicationStatus` 状态机已是单向终态，补「重复调用返回当前态而非报错」。
  6. 确认点协议化：两段式审批已有雏形，建议在 SYSTEM_PROMPT 与 schema 注释中固化「不带 confirmed=预览不落库 / 带 confirmed=落库」的调用契约，并给模型说明失败前置条件的 next step（现有 hint 已是此方向）。
- **P2（远期/按需）**
  7. 工具审计日志（MCP 建议）：工具调用参数脱敏落 logs/，为回归调优提供数据。
  8. 若接入第三方数据源，评估用 `@ai-sdk/mcp` 作为 MCP client 引入（保持业务工具不走 MCP、只包外部 server）。
  9. 并行工具调用策略：目前 AI SDK 默认允许并行，`listResumes`+`listJobOpportunities` 等只读工具可并行；`applyJob` 等审批/写工具建议 `tool_choice` 约束串行，防两段式被并行调用破坏。

## 来源清单
- MCP 官方站点（总览）：https://modelcontextprotocol.io/
- MCP 架构文档：https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture
- MCP Tools 规范：https://modelcontextprotocol.io/specification/2026-07-28/server/tools.md
- MCP 安全最佳实践：https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices.md
- OpenAI Function Calling 指南：https://platform.openai.com/docs/guides/function-calling
- Anthropic Tool Use 总览：https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Anthropic Define tools：https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools
- Anthropic Handle tool calls：https://platform.claude.com/docs/en/agents-and-tools/tool-use/handle-tool-calls
- Anthropic《Writing tools for agents》：https://www.anthropic.com/engineering/writing-tools-for-agents
- Anthropic Code execution tool（沙箱参照）：https://platform.claude.com/docs/en/agents-and-tools/tool-use/code-execution-tool
