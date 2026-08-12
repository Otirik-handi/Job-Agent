# Web 工具设计（P2 批次 D）

日期：2026-08-12
状态：已定稿（2026-08-12 用户决议：web-browse 工具与子 Agent 明确不做），待写实现计划
依据：
- `docs/research/2026-08-12-web-tools-research.md`（通用 Agent Web 工具调研）
- `docs/research/2026-08-12-job-sites-fetchability-assessment.md`（求职站点可抓取性实测）
- `docs/research/2026-08-12-opencli-collection-assessment.md`（OpenCLI 采集实测）
关联：`docs/research/2026-08-10-agent-roadmap-discussion.md`（P2 批次 D 定稿：web 工具 → company-research / salary-benchmark）

---

## 1. 背景与目标

P2 批次 D 定稿：开发 web 工具，解锁 company-research / salary-benchmark 两个 skill。三份调研/评估的结论链：

1. **要做什么**：主流 Agent（OpenAI/Anthropic/Gemini）已收敛为"search 只返回元数据 + fetch 有损提取 + 引用溯源 + 配额/域名护栏"的统一模式；本项目接任意 OpenAI 兼容模型，**必须自研工具**（provider 原生工具绑定厂商模型不可用）。
2. **怎么抓**：求职站点实测——智联 SSR 可 curl 直抓、猎聘详情页可直抓（GBK 转码）、51job 被阿里云 WAF 拦截（需渲染）、Boss 未登录被 IP 风控 + 图形验证码拦截。
3. **第三条路**：OpenCLI（真实 Chrome + 站点适配器）实测——51job 未登录三层采集全通（结构化 JSON）、Boss 登录态下列表+详情完整可采，是 curl/渲染之外的可行后端。

**目标：落地 `webSearch` + `webFetch` 两个工具，fetch 走三级降级链（自建直抓 → Jina 渲染 → OpenCLI）**。web-browse 与子 Agent **明确不做**（用户决议 2026-08-12）：实测证明猎聘/51job 仅需"渲染取 DOM"不需交互、Boss 上浏览器也过不了图形验证码，browse 无第一批需求；工具规模维持在 15 个内，子 Agent 触发信号关闭。

## 2. 关键设计决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 首批工具 | `webSearch` + `webFetch` 两个；**web-browse 明确不做**（用户决议 2026-08-12） | 调研 §7.1 + 实测支撑；无交互型需求 |
| 搜索后端 | Brave Search API 首选（env `BRAVE_API_KEY`）；预留 Tavily 作为可配置备选 | $5/月免费额度够单用户；独立索引无 Google ToS 风险；官方 TS 实现可参考 |
| fetch 后端 | **三级降级链**：direct（自建 HTTP+解析）→ jina（Jina Reader 渲染）→ opencli（站点适配器） | 三份实测报告逐站验证的覆盖矩阵 |
| 缓存 | 新表 `fetch_cache`（url → markdown，TTL 24h），缓存优先、显式 refresh 绕过 | 对齐 Codex `cached` 默认 / Gemini 两步检索；职位页重复抓取收益明显 |
| URL 来源约束 | 会话内维护"可信 URL 集合"（webSearch 结果 + 用户消息显式 URL），webFetch 校验 url ∈ 集合，否则 `FETCH_SOURCE_RESTRICTED` | 对齐 Anthropic"禁止动态构造 URL"；防 SSRF 与数据外泄 |
| 审批 | 两工具均**免确认**（只读、无副作用），结果附来源 URL 供用户核验 | 对齐审批分档第一档；URL 来源受限后风险可控，避免确认疲劳 |
| 输出契约 | 三段式：调用记录（query/url/source/cached）+ 内容（截断）+ 引用列表 | 对齐主流实现（url_citation 语义）；引用供 UI 可点击核验 |
| 配额护栏 | 会话级 maxUses：webSearch ≤5 次/任务、webFetch ≤8 次/任务；内容截断（默认 12000 字符） | 防模型失控循环烧 API/污染上下文 |
| 敏感信息 | OpenCLI 输出管线剥离 `security_id`；日志只记 URL/状态码/长度，不落正文 | 对齐 AGENTS.md 红线（实测发现 Boss 输出含加密 token） |
| 工具数量 | 13 → 15，**子 Agent 决议关闭：明确不做**（用户决议 2026-08-12，触发信号不再评估） | 工具规模可控，无并行调研需求 |
| 集成 | 两工具经 `createDomainTool` 注册；SYSTEM_PROMPT 能力清单补两行 | 对齐 agent-tooling-conventions 工具形态 |

## 3. 工具契约

### 3.1 webSearch

```
inputSchema（z.strictObject）：
  query: string（搜索词，1-200 字符）
  maxResults: number（1-10，默认 5，可选）
  freshness: enum['day','week','month'] | undefined（时间过滤，可选）

输出（ok: true）：
{
  ok: true,
  query,
  results: [{ title, url, snippet, source }],   // source=域名
  count,
  cached: boolean,
}
```

- description（3-4 句，对齐规范）：首句"实时网络搜索，返回职位/公司/行业信息的结果列表（标题+URL+摘要）"；次句参数（query 搜索词、maxResults 条数、freshness 时效）；第三句边界（只返回元数据不取正文，需要正文调用 webFetch；结果 URL 可信、可用于 webFetch 参数）；末句返回内容与引用。
- 错误码：`SEARCH_NOT_CONFIGURED`（缺 BRAVE_API_KEY，hint：提示配置环境变量）、`SEARCH_RATE_LIMITED`、`SEARCH_FAILED`。

### 3.2 webFetch

```
inputSchema（z.strictObject）：
  url: string（http/https，且必须 ∈ 可信 URL 集合）
  extractPrompt: string | undefined（提取要点提示，默认全文转 Markdown 截断）
  refresh: boolean | undefined（绕过缓存，默认 false）

输出（ok: true）：
{
  ok: true,
  url, title,
  content: string,             // Markdown，截断至 maxChars（默认 12000）
  source: 'direct' | 'jina' | 'opencli',   // 实际命中的后端层
  cached: boolean,
  truncated: boolean,
  citations: [url],            // 引用（OpenCLI 结构化字段映射后的来源 URL）
}
```

- description：首句"抓取指定网页正文并转为 Markdown，供分析岗位 JD/公司官网/行业文章"；次句参数（url 来自搜索结果或用户提供、extractPrompt 提取要点）；第三句边界（仅可信 URL、不抓取需登录/验证码页面会返回明确错误、命中缓存不重抓）；末句返回内容与来源。
- 错误码：`FETCH_SOURCE_RESTRICTED`（url 不在可信集合）、`FETCH_SSRF_BLOCKED`（内网/环回）、`FETCH_BLOCKED`（WAF/验证码/反爬，hint 引导降级或人工查看）、`FETCH_NEEDS_LOGIN`（Boss 未登录，hint 提示走 OpenCLI 登录态或人工导入）、`FETCH_FAILED`（网络/解析/超时）。

## 4. 三级降级链设计

### 4.1 路由决策（按域名，来自实测覆盖矩阵）

| 域名 | 第一优先 | 回退 | 依据 |
|---|---|---|---|
| `zhaopin.com`（含 sou 子域） | direct | jina | SSR 直出，详情页 robots 未禁 |
| `liepin.com` | direct（详情页）；jina（列表页） | opencli（无适配器→不可用） | 详情页 200 可抓（GBK）；列表 JS 壳需渲染 |
| `51job.com`（含 we/jobs 子域） | opencli（结构化） | jina | 阿里云 WAF 拦 direct；OpenCLI 未登录全通 |
| `zhipin.com` | opencli | — | 未登录被 IP 风控；登录态可采 |
| 其他 | direct | jina | 通用路径 |

### 4.2 降级触发条件

- direct 层：非 2xx / 超时 5s / WAF 特征（`aliyun_waf`、`_waf`、混淆脚本 `var _0x`）/ 空内容 → 转下一层
- jina 层：超时 15s / 非 2xx / 内容为空 → 转 opencli（若该域有适配器）
- opencli 层：`opencli <site> detail|search -f json` 子进程调用（`child_process.spawn`），超时 30s；失败返回 `FETCH_BLOCKED` 或 `FETCH_NEEDS_LOGIN`（Boss 的 AUTH_REQUIRED）
- 全层失败：返回结构化错误，hint 提供"浏览器手动查看后粘贴导入"路径（importJobOpportunity 承接）

### 4.3 编码与解析

- 字符集检测：HTTP header `charset` 优先，meta 声明兜底，GBK/GB2312 → UTF-8 转码（猎聘实测必须）
- HTML→Markdown：自研轻量转换（复用 trafilatura/readability 思路），表格/列表保留，script/style 剥离

### 4.4 robots 合规

- direct 层遵守 robots.txt（只抓未被 Disallow 的路径；实测智联 `/jobdetail/*.htm`、猎聘 `/job/*.shtml` 均允许）
- jina/opencli 层不在本项目控制范围（第三方服务/真实浏览器），记录为已知边界

## 5. 安全护栏

| 护栏 | 实现 | 对齐 |
|---|---|---|
| SSRF 防护 | url 仅 http/https；DNS 解析后拒绝内网/环回/链路本地地址（`FETCH_SSRF_BLOCKED`） | 官方 MCP fetch 的已知教训 |
| URL 来源约束 | 会话内存维护可信集合：webSearch 结果 URL + 用户消息正则提取的显式 URL；webFetch 校验 | Anthropic 禁止动态构造 URL |
| 配额 | 会话级计数（webSearch ≤5、webFetch ≤8 次/任务），超限返回 `RATE_LIMITED` 类错误 | Anthropic max_uses / Claude Code 200 次上限 |
| 敏感字段 | opencli 输出解析时剥离 `security_id` 等 token 字段，不进入工具结果与日志 | AGENTS.md 红线（实测发现） |
| 日志边界 | 日志仅 URL、状态码、内容长度、source 层；网页正文/搜索词不进日志 | AGENTS.md 红线 |
| 内容截断 | maxChars 截断（默认 12000），`truncated: true` 标记 | OpenAI return_token_budget 语义 |
| 不可信内容 | 网页内容按不可信输入处理（不进 system prompt，仅作为工具结果进入对话上下文） | 全行业共识 |

## 6. 缓存设计（新表 `fetch_cache`）

```sql
fetch_cache(
  url       text primary key,     -- 规范化后的 URL
  markdown  text not null,
  source    text not null,        -- direct | jina | opencli
  fetched_at text not null,
  ttl_sec   integer not null default 86400   -- 24h
)
```

- 命中：同 URL（规范化：去 fragment、排序 query 参数）且未过期 → 返回 `cached: true`，不重新抓取
- `refresh: true` 显式绕过；过期即重抓并更新
- 新增迁移（drizzle migrate），与既有表同一 schema 文件管理

## 7. 数据流与集成

### 7.1 与既有能力的衔接

- **采集与落库分离**：webFetch 只返回内容（不落 job_opportunities）；模型总结采集结果 → 用户确认 → `importJobOpportunity` 落库（复用现有导入模式与 80000 字符上限，不新增写路径）
- **与 skill 的关系**：company-research / salary-benchmark 是流程层（skill 正文描述流程），webSearch/webFetch 是执行层（工具）；skill 扩展放批次 D3，等工具稳定
- **注册**：`src/agent/tools/web-search.ts`、`web-fetch.ts`（确定性工具单文件模式，含 `schemas/` 内联）；`agent.ts` 的 `getTools()` 注册 + SYSTEM_PROMPT 能力清单补两行
- **纯函数模块**（对齐纯函数+单测规范）：`web-url-guard.ts`（SSRF/来源校验）、`web-waf-detect.ts`（WAF 特征）、`web-fetch-router.ts`（降级路由决策）、`web-charset.ts`（编码转码）、`web-cache.ts`（TTL/规范化）

### 7.2 OpenCLI 集成要点

- 子进程调用 `opencli <site> <cmd> -f json`（spawn，超时 30s，`--window background` 减少打扰）
- 前置检查：`opencli doctor` 可用性（daemon + 扩展 + profile），失败返回 `FETCH_FAILED`（hint 提示启动扩展）
- Boss 未登录（AUTH_REQUIRED 错误码）→ `FETCH_NEEDS_LOGIN`，hint 引导 `opencli boss login` 一次人工登录
- 51job 字段错位瑕疵（title/companyName 抓到"APP下载"）→ 适配层以 companyIntro/category 交叉校验修复

## 8. 测试策略

| 层 | 内容 |
|---|---|
| 纯函数单测（vitest，随 npm test） | url 校验/SSRF 阻断、WAF 特征识别、降级路由决策（按域名矩阵）、GBK 转码、缓存 TTL 与规范化、security_id 剥离、OpenCLI JSON 字段修复 |
| 集成（不依赖外网） | fetch 注入 mock 响应（构造 direct/jina/opencli 各层假数据）验证降级链与错误契约 |
| 真实网络 | 手动冒烟（Brave 搜索、智联/猎聘直抓、51job/Boss OpenCLI），不入 CI |
| 评测 | mock 层补 1-2 个场景（如"调研某公司"触发 webSearch→webFetch→总结链） |

## 9. 分期

| 批次 | 内容 |
|---|---|
| **D1** | webSearch（Brave）+ webFetch（direct + jina 层）+ fetch_cache 迁移 + 安全护栏 + 纯函数单测；SYSTEM_PROMPT/审批注册 |
| **D2** | OpenCLI 后端接入（51job/Boss 路由 + security_id 过滤 + 字段修复 + doctor 前置检查） |
| **D3** | company-research / salary-benchmark skill 扩展（流程层） |

## 10. 开放问题（实现计划前确认）

1. **Jina Reader 实测**：评估报告标注"待接入时验证"（服务端 IP 风控状态与本地不同）——D1 实现时以真实 URL 冒烟确认，若 Jina 对 51job/猎聘不可用则 D1 调整路由（51job 直接跳 D2 的 OpenCLI）。
2. **Brave key 获取**：用户注册获取 `BRAVE_API_KEY`（免费 $5/月）；D1 前完成，否则 SEARCH_NOT_CONFIGURED 空转。
3. **可信 URL 集合的会话生命周期**：会话内内存 Map 即可（本地单用户），还是需要跨会话持久化（如用户粘贴 URL 到新会话）——倾向内存 + 用户消息实时提取，跨会话不追溯。
4. **OpenCLI 登录态持久性**：Boss cookie 有效期未知，D2 时记录实际表现，必要时给 webFetch 加"重新登录"引导。
5. ~~web-browse 再评估~~ **已关闭**（用户决议 2026-08-12 明确不做）：无交互型需求，现有三级降级链覆盖全部已验证场景。
