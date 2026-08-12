# job-helper Web 工具 · 通用 Agent 调研报告

日期：2026-08-12
状态：调研完成，供后续设计引用（不含架构决策；P2 批次 D 计划待进一步调研后启动）
调研方式：并行子 Agent 三线调研，全部基于官方文档与可靠资料，经本地代理（127.0.0.1:10808）访问核验，来源见第 9 节
关联文档：`2026-08-10-agent-roadmap-discussion.md`（P2 讨论纪要，批次 D"web 工具 → company-research/salary-benchmark"挂起等本调研）

## 1. 调研背景与目标

P2 队列批次 D 已定稿：开发 web 工具，解锁 company-research / salary-benchmark 两个 skill。PROJECT_STATUS 明确"批次 D 等用户调查后启动"。本调研回答三个问题：

1. job-helper 当前需要开发哪些 Web 工具（如 web-search）？
2. 如果要开发，能借鉴哪些经验？
3. 开发的可行性？

调研对象分三线：

- **OpenAI 系**：OpenAI Codex CLI、ChatGPT、OpenAI Agents SDK / Responses API 内置工具
- **Anthropic / Google / 其他厂商**：Claude Code、Claude Agent SDK、Messages API 服务端工具；Gemini grounding；Manus、Devin、Perplexity、Cursor、DeepSeek
- **底层实现技术栈**：搜索 API、抓取/提取、浏览器自动化、工具协议、Vercel AI SDK 生态

## 2. 重要背景事实（直接影响选型）

1. **Google Custom Search JSON API 已对新客户关闭**，现有客户 2027-01-01 起停用；**Bing Web Search API v7 文档已退役归档**（替代转向 Azure AI 系）。即：主流可选搜索 API 实际只剩 Brave / Tavily / Serper / SerpAPI / Exa 五家 + 自建元搜索。
2. **DeepSeek 官方无任何内置 web 工具**，只提供 function calling；"联网搜索"需应用层自组装。OpenAI `web_search` / Gemini `google_search` 等"开箱工具"均绑定官方模型。
3. **本项目核心约束"接入任意 OpenAI 兼容模型"决定：必须自研 web 工具（AI SDK 原生 tool + execute）**，provider 原生工具（`@ai-sdk/openai` 的 webSearch、`@ai-sdk/google` 的 googleSearch）仅作"未来固定官方模型时"的增强位。

## 3. 厂商 Web 工具清单（逐家）

### 3.1 OpenAI 系

| 工具 | 用途 | 输入 / 输出形态 | 限制 |
|---|---|---|---|
| `web_search`（Responses API 托管工具，新）<br>`web_search_preview`（旧，已废弃，2026-07-23 关停） | 模型在生成前获取实时网络信息并带引用回答 | 输入：`search_context_size`（low/medium/high）、`filters`（allowed/blocked_domains 各 ≤100）、`user_location`、`search_content_types`（text/image）、`external_web_access`（false=仅走缓存索引的离线模式）、`return_token_budget`、`tool_choice`。<br>输出：`web_search_call` 项（id、`action`：search/open_page/find_in_page、queries、可选 results/sources）+ `message` 正文 + `url_citation` 注解（url/title/location，锚定正文字符区间） | 搜索上下文窗口固定 128k；Chat Completions 只能走专用搜索模型（gpt-5-search-api 200k）；每次搜索另收工具调用费 + 搜索内容 token 费；速率限制 = 底层模型 tiered 速率 |
| `file_search` | 对用户上传文件做语义 + 关键词检索（服务端托管 RAG） | 输入：vector_store_ids、max_num_results、filters；输出：file_search_call + message + file_citation 注解 | 独立 RPM 分级（Tier1 100 ~ Tier5 1000）；仅文本类格式 |
| `computer`（旧名 computer_use_preview） | 模型看截图 → 返回结构化 UI 动作，客户端 harness 执行 | 输入：display_width/height、environment；输出：computer_call 含 actions[]（click/type/scroll/screenshot/drag…），执行后回传截图循环 | **决策在服务端、执行必须在客户端**（Playwright/Selenium/VM/DOM harness）；官方强制隔离环境 + human-in-the-loop |

**Codex CLI 的 Web 能力（本地客户端）**：

- 唯一第一方 web 工具是 `web_search`（托管工具，参数与 Responses API 一致），有 4 种模式：`cached`（默认）/ `indexed` / `live` / `disabled`；`--search` 标志 = live；`--yolo` 或全权限沙箱下默认 live。官方理由：cached 默认"减少任意实时内容的 prompt injection 暴露面"。
- **没有独立的 web_fetch / download 工具**：抓取走 `shell` 工具 + curl，受 `network_proxy` 域名白名单管控；页面正文也可借 web search 的 `open_page`（服务端）。
- Browser / Computer Use：CLI 与 IDE 扩展均不可用（只在 ChatGPT web 和桌面端）。

**ChatGPT 产品端**：云浏览器（只支持公开未登录站点、逐站点权限请求 Always ask/Auto approve/Always allow）；桌面内置浏览器 + Computer Use（独立 profile、CDP 开发者模式需显式授权）；Web search 自动可用、引用记录在 transcript。

### 3.2 Anthropic / Claude

| 工具 | 用途 | 输入 / 输出形态 | 限制 |
|---|---|---|---|
| **WebSearch**（Claude Code 内置） | 执行网络搜索 | 输入：查询词；输出：**结果标题 + URL 列表**（不抓取正文，需要内容再调 WebFetch） | 会话级上限 **200 次**（主对话+所有子 agent 共享计数）；权限规则无 specifier；**Amazon Bedrock 不提供** |
| **WebFetch**（Claude Code 内置） | 抓取指定 URL 并按提示提取内容 | 输入：URL + 提取 prompt；输出：小模型按 prompt 提取后的回答（HTML 自动转 Markdown 再喂给小型快模型） | **有损 by design**（提取提示决定能看到什么）；跨 host 重定向不自动跟随；**新域名首次需人工确认**（内置预批准文档域名）；UA 以 `Claude-User` 开头 |
| **Web search tool**（Messages API 服务端工具） | 同上，但由 API 服务端执行 | 输入：query、max_uses、allowed/blocked_domains（二选一）、response_inclusion；输出：搜索结果块 + **始终开启的引文**（cited_text/title/url 不计入 token） | 版本演进：20250305 基础版（结果全量进上下文）→ 20260209 动态过滤（模型写代码先过滤再进上下文）→ 20260318 response_inclusion（excluded 可省输出 token）；max_uses 超限返回错误码；组织级开关在 Console 配置 |
| **Web fetch tool**（Messages API 服务端工具） | 抓取指定 URL/PDF 全文本 | 输出：全文文本；PDF 以 base64 按附件处理 | **不支持 JS 动态渲染的网站**；max_content_tokens 截断；**自动缓存**（可 use_cache: false 绕过）；**禁止动态构造 URL**（只能抓用户明确提供或来自搜索结果/先前 fetch 结果的 URL，防数据外泄）；**Bedrock 与 Google Cloud 不可用** |

Agent SDK 的 WebSearchTool / WebFetchTool 与 Claude Code 同一套服务端实现，权限受 allowed/disallowed_tools、permission_mode 控制。

### 3.3 Google / Gemini

| 工具 | 用途 | 形态 | 限制 |
|---|---|---|---|
| **Grounding with Google Search**（`google_search` 工具） | 把模型答案 grounding 到实时网页 | 仅加 tools 声明；**模型自主决定是否搜、自动生成并执行 1+ 个查询**；输出：google_search_call（执行的查询列表）+ 带 url_citation 内联注解的文本 | **按每次实际执行的搜索查询计费**（Gemini 3 起；Gemini 2.5 及更老按 prompt 计费）；无"结果列表"形态——应用拿到的是已合成的带引文答案 |
| **URL context 工具**（`url_context`） | 用指定 URL 内容增强上下文（相当于 web fetch） | 输入：URL 列表；输出：内容注入上下文 + 内联引文 | **两步检索：先查 Google 内部索引缓存，缓存未命中才实时抓取**；单请求最多 20 个 URL；单 URL 上限 34MB；**拒绝 localhost/内网/ngrok 类隧道**；不支持付费墙、YouTube、Workspace 文件 |

### 3.4 其他热门 Agent

| 产品 | Web 工具形态 | 要点 |
|---|---|---|
| **Manus** | 云端 VM 完整浏览器 + VS Code | 用户可在任务中**随时接管**浏览器（验证码、复杂登录）；网站可对其设反爬拦截 |
| **Devin** | 沙箱内 Chrome + Computer Use + CDP | 会话内 cookie 持久（可保持登录态）；Chrome 暴露 **CDP 端口 29229**，Devin 可写 Playwright 脚本 attach（登录流、批量录入）；Computer Use 桌面模式 = 1024×768 截图-动作循环，成本高 |
| **Perplexity** | web_search + fetch_url（Agent API，OpenAI Responses 兼容） | web_search：$2.50/1k 调用、search_domain_filter（最多 20 域名）、recency/location 过滤；fetch_url：max_urls 1–10、**尽力而为**（付费墙/登录墙/反爬自动省略）、$0.25/1k 调用 |
| **Cursor** | Web（服务端搜索）+ Browser（浏览器工具） | Browser = 安全 web view + 以扩展运行的 MCP server；工具集：navigate/click/type/scroll/screenshot/console/网络流量监控；状态（cookie/localStorage）按 workspace 会话间持久；agent **以截图为主感知页面**；操作**默认需审批**（manual/allow-list/auto-run）；仅 Sonnet 4.5/GPT-5/Auto 模型 |
| **DeepSeek** | **无内置 web 工具** | 只有 function calling；联网搜索需应用层自组装（App 端有需手动开启的"联网搜索"按钮） |

## 4. 实现原理：三类路线

1. **服务端搜索 API 型**：Claude WebSearch（Anthropic 自建搜索后端）、Gemini google_search、Perplexity web_search、Cursor Web。返回结构化结果（标题/URL/片段），不碰浏览器；成本按调用/查询计费。
2. **服务端抓取 + 提取型**：Claude WebFetch（HTML→Markdown→小模型按提取提示压缩，有损设计）、Gemini URL context（缓存索引优先 + live 回退）、Perplexity fetch_url。**无 JS 渲染能力**；都在服务端完成，客户端零依赖。
3. **（无头/真实）浏览器自动化型**：Manus（云端 VM）、Devin（桌面 Computer Use + CDP/Playwright attach）、Cursor Browser（webview + MCP）。能处理 JS 渲染、登录态、表单交互；返回形态是截图 + 可操作 DOM + console/网络日志；成本最高、需要审批护栏。

**返回内容形态光谱**：搜索元数据（标题/URL）→ Markdown 文本 → 提取后的摘要/snippet → 截图 → 可操作页面元素。越往后能力越强、token 成本越高、风险越大。

**统一设计共识（所有厂商）**：网页内容一律按**不可信输入**处理（防 prompt injection）；引用/来源 URL 作为一等公民返回并在 UI 可点击核验；工具执行尽量服务端化（免客户端反爬）。

## 5. 底层技术选型对比

### 5.1 搜索类（web-search）

| 途径 | 优点 | 缺点 | 成本/门槛 | 推荐场景 |
|---|---|---|---|---|
| **Brave Search API** | 独立索引（不依赖 Google/Bing）；每月自动送 $5 免费 credits（≈1000 次查询）；50 QPS；结构化结果 + LLM 优化字段；官方 MCP server；社区 agent 事实标准 | 免费额度有限，重度使用需付费 | 需 API key（免费注册，无信用卡）；$5/1000 requests | **单用户低频 agent 搜索首选** |
| **Tavily** | 专为 LLM 设计：返回 LLM 生成的 answer 摘要、include_domains 域名白名单、search_depth | 免费层 1000 credits/月；$8/1k 五家里偏贵 | 需 key；免费 1000 credits/月 | 需要"搜索即带答案+可控域名"的 RAG 场景 |
| **Serper.dev** | 直出 Google SERP（organic/knowledgeGraph/peopleAlsoAsk）；2500 次免费查询（最多） | 结果受 Google ToS 约束 | 需 key；$1/1k | 需要 Google 特有字段或量大场景 |
| **SerpAPI** | 多引擎（Google/Bing/Amazon/新闻/地图） | 免费仅 250 次/月；$25/月起步 | 需 key | 需要多引擎/电商查询 |
| **Exa** | 语义/神经搜索；Contents API 顺带抓取（$1/1k 页）；新号送 $20 | Search $7/1k 偏贵；对 JD 精确关键词类查询语义匹配未必最佳 | 需 key | 语义检索、深度研究类查询 |
| **自建 SearXNG 元搜索** | 免费开源、Docker 自托管、聚合 274 个上游引擎、JSON API | 上游引擎会阻断请求或弹 CAPTCHA；稳定性依赖上游 | 零订阅费；需 Docker + 维护 | 完全不想付费、能接受结果质量波动 |
| **直接抓 SERP 页** | 零 API 成本 | 反爬（Cloudflare/CAPTCHA/IP 封禁）+ 违反 ToS；不稳定 | 零成本高维护 | **不推荐** |

### 5.2 抓取/提取类（web-fetch）

| 途径 | 优点 | 缺点 | 成本/门槛 | 推荐场景 |
|---|---|---|---|---|
| **自建：HTTP fetch + HTML→Markdown**（Next.js route handler + trafilatura / readability.js / cheerio） | 零成本、完全可控（UA/robots/缓存/超时）；无第三方依赖 | 静态页 OK，**SPA/JS 渲染页拿不到内容**；反爬站点会拒绝 | 零订阅费；一次开发成本 | **大多数招聘官网/JD 页（多为服务端渲染或半静态）** |
| **Jina Reader（r.jina.ai）** | 免费（无 key 也能用，IP 限速）；URL 前加前缀即用；**内置浏览器引擎可渲染 JS**；参数丰富（CSS 提取/等待选择器/自定义 UA/cookie 转发） | 免费层有限速；token 计费；内容经第三方服务 | 免费起步 | "零开发"直接接入；SPA 页降级通道 |
| **Firecrawl（云 API）** | 搜索+抓取一体（search 直接返回全文 markdown）；处理反 bot/JS 渲染/代理；MCP server 开箱；**开源可自托管（Docker）** | 免费 1000 credits/月；订阅制无纯 PAYG | 需 key | 一次性项目省开发时间；或自托管开源版 |
| **crawl4ai（开源）** | GitHub 50k+ stars 最火开源爬虫；Python + Playwright（JS 渲染内建）；输出 LLM 友好 Markdown | Python 运行时（项目是 TS 全栈，需旁挂进程）；Docker API server 需自己加固 | 免费开源 | 本地深度爬站（整站 crawl） |
| **官方 MCP fetch server**（参考实现） | 官方实现：httpx + readability 转换 Markdown；**默认遵守 robots.txt**；start_index 分块读取长文 | 定位教学参考非生产级；**文档明确警告可访问内网 IP（SSRF 风险）** | 免费；pip/uvx 即用 | 参考其实现思路（robots/分块/截断） |

反爬与合规要点：robots.txt 遵守是默认礼节；UA 用合理浏览器 UA；**缓存策略是控制成本的关键**——SQLite 缓存 URL→Markdown + TTL（如 24h），避免重复抓取与重复计费。

### 5.3 浏览器类（web-browse）

| 途径 | 优点 | 缺点 | 成本/门槛 | 推荐场景 |
|---|---|---|---|---|
| **本地 Playwright**（无头 Chromium + 自写交互循环） | 零成本；全功能（点击/滚动/截图/表单/等待）；**可访问性树（a11y tree）可作 LLM 输入**——结构化、无需视觉模型、token 效率高 | 需安装浏览器二进制（约 100-200MB）；需自己封装"模型↔页面操作"循环 | 免费；开发复杂度中高 | 需要真实交互（登录态、无限滚动、动态表单）的页面 |
| **@playwright/mcp**（微软官方 MCP） | 把上述封装成现成 MCP server：browser_navigate/browser_snapshot/browser_click 等；**基于可访问性树而非像素**，"无需视觉模型、确定性高"（官方原话）；npx 一行启动 | 走 MCP 协议（stdio），与 AI SDK 集成需 MCP 客户端；每步快照有 token 成本 | 免费 | 最快获得完整 web-browse 能力；实现思路可直接借鉴 |
| **云浏览器（Browserless 等）** | 托管无头浏览器；兼容 Puppeteer/Playwright/Selenium WebSocket 直连；企业版可自托管 | 单用户按量付费不划算 | 免费账户 + 付费计划 | 无本地浏览器环境/被反爬卡死时 |
| **Firecrawl Interact / Browser Sandbox** | 自然语言让 API 替你点击/填表；无需自建浏览器 | 2 credits/浏览器分钟，交互类成本高 | 订阅制 | 不想碰 Playwright 的低频交互需求 |

关键架构事实：当前 agent 浏览器方案的主流范式是"**可访问性树快照**"（Playwright MCP 官方采用），替代旧式"截图+视觉模型"——更省 token、行为确定。微软 README 还指出：对编码类 agent，CLI+Skills 比 MCP 更 token 高效（MCP 工具 schema + a11y 树都占上下文）——自研时快照要控制体积。

### 5.4 工具协议（function calling / MCP 承载方式）

- **AI SDK 原生工具**：`tool()` + zod schema + `execute()` 在本地进程执行——官方文档明确推荐"生产用 AI SDK 原生工具，MCP 适合快速迭代/用户自供工具"。
- **AI SDK 原生 `toolApproval`**：支持工具级审批门控（user-approval），与项目审批三档天然契合。
- **MCP 官方参考 servers**（github.com/modelcontextprotocol/servers）：与 Web 相关的是 **fetch**（活跃维护，Python 实现）；**brave-search 与 puppeteer 均已归档**（brave-search 被 Brave 官方新仓库替代，puppeteer 事实被 Playwright MCP 替代）。
- 一线 Web MCP servers 现状：Brave 官方 MCP（github.com/brave/brave-search-mcp-server，TS 实现，可作实现参考）、Playwright MCP（微软官方）、Firecrawl 自带 MCP、Jina 自带 MCP。
- 项目侧对接：`@ai-sdk/mcp`（当前 2.0.31）可把任何 MCP server 工具拉进 generateText/streamText。

### 5.5 Vercel AI SDK 生态

- **AI SDK 无内置通用 web-search/fetch 工具**——工具全部开发者自定义（tool() + execute），这正是本项目现状。
- provider 层有开箱即用的搜索（**依赖特定模型厂商**，不适用于"任意 OpenAI 兼容模型"）：`@ai-sdk/google` 的 `google.tools.googleSearch()`（Gemini 原生 grounding，返回 sources + groundingMetadata）；`@ai-sdk/openai` 的 `openai.tools.webSearch()`（Responses API 原生 web search，可配 externalWebAccess / 域名白名单）。
- 对"接入任意 OpenAI 兼容模型"（deepseek 等）的项目：**原生工具不可用，必须自建工具 + execute——这是唯一通用路径**。

## 6. 跨系统共识小结

| 共识 | 出处 |
|---|---|
| search 与 fetch 分层：搜索只返回元数据，正文按需再抓 | Claude Code、Anthropic/OpenAI 服务端工具 |
| 有损提取而非全量喂原文（HTML→Markdown→小模型压缩） | Claude WebFetch、OpenAI web_search 默认不含原始结果 |
| 缓存优先 + live 显式回退 | Gemini URL context 两步检索、Codex cached→live |
| 引用/来源 URL 作为一等公民，UI 可点击核验 | OpenAI url_citation、Anthropic 引文、Perplexity citations |
| 配额护栏（max_uses/会话次数上限）防失控循环 | Anthropic max_uses、Claude Code 200 次会话上限 |
| URL 来源约束：只能来自用户输入或搜索结果，禁止动态构造 | Anthropic web fetch、官方 MCP fetch（SSRF 警告） |
| 新域名首次访问人工确认；敏感操作逐站点审批 | Claude Code、ChatGPT 云浏览器、Cursor Browser |
| 网页内容一律按不可信输入处理 | Codex 官方文档、ChatGPT Browser 文档 |
| 限制显式化：单任务次数上限、token 预算、离线模式 | OpenAI return_token_budget、Codex external_web_access |

## 7. 对 job-helper 的启示（供后续设计引用）

### 7.1 首批范围（初步判断，待继续调研确认）

- **首批：`web-search` + `web-fetch` 两个工具**（对齐 P2 批次 D：company-research / salary-benchmark 的前置能力）。
- **`web-browse` 首批不做**：求职站点（Boss直聘/猎聘/智联）多数需登录 + 强反爬，浏览器自动化收益低、复杂度最高；先服务端抓取，仅必须在登录态/交互时再引入。
- 技术组合建议（成本 ≈ 0）：`web-search` → **Brave Search API**（每月 $5 免费额度对单用户绰绰有余，独立索引无 Google ToS 风险，官方 MCP server 的 TS 实现可直接参考；备选 Tavily）；`web-fetch` → **自建轻量实现为主**（Next.js route handler + HTML→Markdown + SQLite 缓存 TTL 24h + 遵守 robots.txt + 合理 UA）+ **Jina Reader 免费 API 降级**（SPA/反爬页）。
- 协议层：均以 AI SDK 原生工具注册进 `createDomainTool` 工厂，**不引 MCP**（本地单进程 Next.js 下 MCP 的跨进程价值体现不出来，schema 已由工厂统一管理）。

### 7.2 值得直接借鉴（按与项目约束契合度排序）

1. **search/fetch 分层控 token**：web-search 只返回标题/URL/摘要，需要正文才 web-fetch。
2. **有损提取**：web-fetch 按提取提示压缩正文——省上下文、缩小敏感信息暴露面（对齐 AGENTS.md"完整岗位描述不进日志"红线）。
3. **硬性护栏照抄成熟设计**：max_uses 会话配额、域名允许/拒绝列表（可预批准求职域名）、URL 只能来自搜索结果或用户输入（防 SSRF）、跨 host 重定向不自动跟随、新域名首次人工确认——全部与"关键动作插入人工确认点"及 channel-guard 事实护栏同构。
4. **缓存优先 + live 回退**：本地 SQLite 缓存层（职位页重复抓取收益明显），默认只读缓存，实时抓取显式开启——控成本 + 降 prompt injection 面（Codex 官方给 cached 默认的理由）。
5. **三段式返回契约 + 引用溯源**：统一输出"调用记录（查询词/动作/来源列表）+ 正文 + 引用注解"，UI 渲染可点击引用——正对"公司调研结果供用户核验"。
6. **web-browse 范式储备**（若未来做）：a11y 树快照而非截图+视觉模型（token 高效、确定性好）；操作默认审批。
7. **成本护栏**：单任务搜索/抓取次数上限、返回 token 预算、离线模式开关。
8. **模型无关性**：不依赖 provider 原生工具；保留"未来固定官方模型时加原生工具增强"的扩展位（Codex supports_standalone_web_search 思路：能力探测 + 降级）。

### 7.3 因定位取舍（不做/后置）

- 云浏览器（Browserless 等）：单用户按量付费不划算，仅被反爬卡死时再评估。
- 自托管 SearXNG：零订阅费但需 Docker + 维护 + 结果质量波动，先不引入。
- crawl4ai：Python 运行时与 TS 全栈不符（需旁挂进程），后置。
- Computer Use 类桌面控制：超出求职助手定位，不做。
- 服务端托管搜索（OpenAI/Anthropic/Gemini 官方工具）：绑定厂商模型，与"任意 OpenAI 兼容模型"约束冲突，仅作未来增强位。

### 7.4 需要回答的问题（留给后续调研/设计）

1. 求职站点（Boss直聘/猎聘/智联/前程无忧）的可抓取性现实评估：哪些能 fetch、哪些必须登录、反爬强度——决定 web-fetch 的真实覆盖面和预批准域名列表内容。
2. Brave 免费额度（$5/月 ≈ 1000 次查询）对真实使用量的充足性；是否需要 Tavily 的 answer 摘要/域名白名单能力。
3. 工具数影响：现有 13 个工具 + web-search + web-fetch + searchMessages（批次 B）后达 16 个，**触发 P2-4 子 Agent 决议"接近 15 时重新评估"阈值**——本批实现时顺带完成重评估。
4. SSRF 护栏细节：拒绝内网/环回地址（对齐"本地优先"特性，防模型被诱导抓取本地服务端口）。
5. 网页正文进 LLM 上下文的合规红线：日志只记 URL 与内容长度，不落全文（对齐 AGENTS.md 敏感信息规则）。
6. 是否需要"站内搜索"（如直接搜某个招聘网站站内）作为独立能力，还是由 web-search 域名过滤承担。

## 8. 一句话总结

主流 Agent 的 Web 工具已收敛为"search 元数据 + fetch 有损提取 + 引用溯源 + 配额与域名护栏"的统一模式，服务端抓取为主、浏览器自动化按需后置；对本项目（任意 OpenAI 兼容模型、本地优先、单用户、成本 ≈ 0），**Brave + 自建 fetch（Jina 降级）+ SQLite 缓存 + AI SDK 原生工具**是明确可行的首批组合，web-browse 留作后续按需引入。

## 9. 来源清单（调研日期 2026-08-12，经本地代理访问）

### OpenAI 系
- https://developers.openai.com/api/docs/guides/tools-web-search （web search 全参数/输出/限制）
- https://developers.openai.com/api/docs/guides/tools-file-search （hosted RAG 工具、RPM 限制）
- https://developers.openai.com/api/docs/guides/tools-computer-use （computer 工具、harness 架构）
- https://learn.chatgpt.com/docs/web-search （Codex cached/live/indexed 模式与 --search）
- https://learn.chatgpt.com/docs/browser （ChatGPT 云浏览器/内置浏览器 + Computer Use、限制）
- https://developers.openai.com/api/docs/guides/tools （内置工具总览、Agents SDK 语义）
- https://github.com/openai/codex （源码：codex-rs/core/src/tools/hosted_spec.rs、docs/）

### Anthropic / Google / 其他厂商
- https://code.claude.com/docs/en/tools （Claude Code WebFetch/WebSearch 行为、200 次会话上限、可用性）
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool （服务端 web search：版本演进、max_uses、域名过滤、计费）
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-fetch-tool （服务端 web fetch：JS 渲染不支持、缓存、max_content_tokens、URL 构造限制）
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/server-tools （Server tools 总览）
- https://code.claude.com/docs/en/agent-sdk/agent-loop.md （Agent SDK 内置工具与权限模型）
- https://ai.google.dev/gemini-api/docs/grounding （Gemini grounding：机制、按查询计费）
- https://ai.google.dev/gemini-api/docs/url-context （URL context：20 URL/34MB/两步检索/禁止内网）
- https://docs.perplexity.ai/docs/agent-api/tools/web-search.md （web_search：$2.50/1k、域名/时间过滤）
- https://docs.perplexity.ai/docs/agent-api/tools/fetch-url-content.md （fetch_url：max_urls 1-10、尽力而为、$0.25/1k）
- https://docs.devin.ai/work-with-devin/devin-session-tools.md 与 https://docs.devin.ai/work-with-devin/computer-use.md （Devin 会话工具：Browser/桌面/CDP 29229）
- https://cursor.com/docs/agent/tools 与 https://cursor.com/docs/agent/browser （Cursor Web / Browser 工具）
- https://help.manus.im/en/articles/11711218-how-can-i-take-over-manus-browser-or-vs-code （Manus 云浏览器接管）
- https://api-docs.deepseek.com/ （DeepSeek 仅 Tool Calls，无搜索工具）

### 底层技术栈
- https://brave.com/search/api/ （Brave Search API）
- https://docs.tavily.com/documentation/api-reference/endpoint/search 、https://tavily.com/pricing （Tavily）
- https://serper.dev/ （Serper）
- https://serpapi.com/pricing （SerpAPI）
- https://developers.google.com/custom-search/v1/overview （Google PSE 新客户关闭公告）
- https://learn.microsoft.com/en-us/previous-versions/bing/search-apis/bing-web-search/overview （Bing Web Search API 退役归档）
- https://exa.ai/docs/reference/getting-started 、https://exa.ai/pricing （Exa）
- https://docs.searxng.org/ （SearXNG 自建元搜索）
- https://jina.ai/reader/ （Jina Reader）
- https://docs.firecrawl.dev/introduction 、https://www.firecrawl.dev/pricing （Firecrawl）
- https://github.com/unclecode/crawl4ai （crawl4ai）
- https://github.com/modelcontextprotocol/servers （官方 MCP servers：fetch 活跃；brave-search/puppeteer 已归档）
- https://github.com/microsoft/playwright-mcp （Playwright MCP：a11y 树快照范式）
- https://github.com/brave/brave-search-mcp-server （Brave 官方 MCP，TS 实现）
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling （AI SDK 原生工具 vs MCP）
- https://ai-sdk.dev/providers/ai-sdk-providers/google （googleSearch grounding）
- https://ai-sdk.dev/providers/ai-sdk-providers/openai （webSearch 原生工具）
- https://www.browserless.io/ （云浏览器）
