# job-helper 架构设计（个人求职 Agent 应用）

日期：2026-08-04
状态：草稿 → 待审阅
关联规范：待建立（spec-autonomy.md、plan-document.md）

## 1. 背景与目标

job-helper 是一个从零重写的个人求职助手 Agent 应用。前身项目 find-work 是一个功能完整的个人求职 SaaS（NestJS + Vue3 + PostgreSQL），其产品经验、规范沉淀与领域设计可供借鉴，但**业务代码不迁移**——避免引入旧债，让新项目在全新架构上按新工程文化生长。

产品定位：**本地优先的个人工具，对话驱动的 Agent 应用**。用户在对话中指挥 Agent 完成求职全流程：简历分析、岗位匹配、投递建议、渠道发现、专属简历生成与投递。

## 2. 关键决策记录

| # | 决策主题 | 结论 | 说明 |
|---|---|---|---|
| 1 | 部署形态 | **本地优先**：本地 Web UI、SQLite 存储、API key 走本地环境变量 | 0 运维、免鉴权、单用户 |
| 2 | 交互形态 | **对话驱动为主**，产物以卡片/抽屉呈现 | 非工作台 SaaS 形态 |
| 3 | 工程文化 | **成熟库优先，不重复造轮子** | 与前身"手写一切"相反；标准件全用库，业务逻辑自研 |
| 4 | 运行时 | **Next.js 全栈**（App Router，单应用） | 本地 `next dev` / `next build && next start` |
| 5 | Agent 编排 | **Vercel AI SDK** | 模型无关、流式、工具协议、结构化输出；不引入 LangChain/LangGraph（本期控制流简单，YAGNI） |
| 6 | UI | **React 生态**：React + Tailwind CSS v4 + shadcn/ui | find-work 的 Vue 前端资产不迁移 |
| 7 | 存储 | **SQLite + Drizzle ORM**（better-sqlite3） | 单文件、零运维；Prisma 模型不迁移，仅参考其数据结构设计 |
| 8 | 测试策略 | **功能优先，轻量测试** | 仅核心纯逻辑单测；不设覆盖率门槛/变异测试/测试治理体系 |
| 9 | 规范体系 | **轻量化**：仅两个根基规范，工程规范按需沉淀 | 不迁移 find-work 的 91 份 spec |
| 10 | 迁移范围 | **业务代码零迁移**；仅规范形式与经验借鉴 | 杜绝旧债，见第 7、8 节 |

## 3. 产品形态

- 主界面：聊天窗口（流式对话 + 工具调用卡片 + 人工确认点）
- 产物视图：简历分析、匹配结果、渠道发现、专属简历等以抽屉/子页呈现
- 单用户、无登录；LLM 供应商与密钥在环境变量中配置
- 可同时存在多个对话会话（求职目标不同场景）

## 4. 技术架构

```
┌─ UI 层（React 组件）
│   聊天主界面（流式对话 + 工具调用卡片 + 人工确认点）
│   产物视图（简历/匹配结果/专属简历等，Drawer/子页）
├─ API 边界（Next.js Route Handlers，SSE 流式）
│   对话端点、工具确认端点、产物查询端点
├─ Agent 编排层（自研，AI SDK 提供原语）
│   循环策略：何时调工具、何时收尾、repair 重试、降级、结束条件
├─ 工具层
│   领域工具（自研）：analyzeResume / matchJob / discoverChannels /
│                    tailorResume / applyJob …
│   通用工具（MCP 生态）：浏览器、文件系统、搜索等
├─ 模型层（Vercel AI SDK + Provider 包）
│   统一调用任意 OpenAI 兼容模型（deepseek 等），key 走环境变量
└─ 数据层（Drizzle + SQLite 单文件）
```

分层原则：**协议与通用能力用成熟库（AI SDK、MCP、Drizzle）；业务编排与领域能力自研——它们就是产品本身**。

### 4.1 模型层：任意模型接入

- 官方 Provider 包（约 20 个）：OpenAI、Anthropic、Gemini、DeepSeek、xAI、Qwen、GLM 等
- `@ai-sdk/openai-compatible`：覆盖所有 OpenAI 兼容端点（国产主流模型、本地 Ollama/vLLM）
- 切换模型仅改一行配置；不绑定任何单一供应商

### 4.2 Agent 编排层（自研的边界）

- 形态：单一主 Agent + 工具集（本期不做多 Agent 编排）
- 自研内容：循环决策逻辑（何时调工具、失败如何 repair、何时降级、何时收尾）
- 协议层由 AI SDK 提供（`streamText` / `tool()` / 结构化输出），**不自造协议轮子**
- 人工确认机制：关键动作（投递、覆盖文件、导出文档等）执行前插入确认点，用户批准后才执行

### 4.3 工具层

**工具本质**：`描述（description） + 参数契约（zod inputSchema） + 执行函数（execute）`。LLM 只生成调用参数，执行永远由代码完成。自研工具与 MCP 工具结构一致（MCP 工具经 `@ai-sdk/mcp` 拉入应用后与本地工具无差别）。

- **领域工具（自研，产品核心）**：每个工具 = 确定性外壳（读取/调用/校验/重试/落库）+ 内在 prompt（相当于内嵌的领域知识指令）。核心工具：
  - `analyzeResume`：简历文本 → 结构化画像 + 改进建议
  - `matchJob`：岗位描述 + 简历 → 匹配度矩阵 + 风险 + 投递建议
  - `discoverChannels`：岗位 → 候选投递渠道 + 核验动作
  - `tailorResume`：生成定点替换建议 + 用户逐条审批
  - `applyJob`：真实性确认 + 文档生成 + 投递
- **通用工具（MCP 生态，成熟方案直接接）**：浏览器（Playwright MCP）、文件系统、搜索等

**结构化输出契约**：工具出参 = zod schema；沿用 find-work 的"校验失败 → repair 重试 → 降级"经验模式，实现用 AI SDK 原生能力 + zod。**绝不静默接受坏数据**。

## 5. 数据层设计（Drizzle + SQLite）

轻量化建模：**只建核心实体表，LLM 产物以 JSON 列存储**（借鉴 find-work 的 JSON payload 经验），避免过度建模。

| 表 | 字段要点 | 说明 |
|---|---|---|
| `conversations` | id, title, created_at, updated_at | 对话会话 |
| `messages` | id, conversation_id, role, content, tool_calls(JSON), tool_results(JSON), created_at | 消息 + 工具调用痕迹 |
| `resumes` | id, name, source_text, source_type, analysis(JSON), created_at | 简历原文 + 分析产物 |
| `job_opportunities` | id, company, title, jd_text, url, status, fit_result(JSON), advice(JSON), channels(JSON), created_at, updated_at | 岗位实体 + 产物 |
| `tailored_resumes` | id, resume_id, job_opportunity_id, content_markdown, version, created_at | 专属简历（审批流并入对话，不建子表） |
| `settings` | key, value | 会话级偏好（LLM key 仍走环境变量） |

对比 find-work：18 表 → 6 表。删除用户/令牌/供应商配置/运行状态机/审批子表（免鉴权 + 环境变量 + 审批流对话化）。

## 6. 项目初始化结构

```
job-helper/
├── AGENTS.md                  ← 薄：定位、权威顺序、目录索引
├── .agents/specs/
│   └── 00-governance/
│       ├── spec-autonomy.md   ← 根基①：规范文档自治规范
│       └── plan-document.md   ← 根基②：计划文档规范
├── docs/plans/                ← 计划文档（生命周期/恢复点/任务打勾）
├── app/                       ← Next.js App Router
│   ├── page.tsx               ← 聊天主界面
│   └── api/chat/route.ts      ← AI SDK 流式对话端点
├── src/
│   ├── agent/                 ← Agent 层：模型注册、工具注册表、确认机制
│   │   └── tools/             ← 领域工具
│   ├── domain/                ← 领域服务（纯 TS + zod 契约）
│   ├── db/                    ← Drizzle：schema、migrations、client
│   ├── components/            ← ui/（shadcn）、chat/、artifacts/
│   └── lib/                   ← env 读取、markdown、docx
├── drizzle.config.ts
├── package.json
```

## 7. 迁移决策：什么迁 / 什么不迁

**总原则：业务代码零迁移；只迁移规范形式与经验，且按新项目重写。**

| 类别 | 处理 | 说明 |
|---|---|---|
| find-work 业务代码（后端 72 文件 / 前端 160+ 文件） | **全部不迁移** | 杜绝旧债；仅领域设计作为新工具/契约设计的经验输入 |
| 测试代码与测试治理资产 | **不迁移** | 旧项目测试臃肿拖慢推进的教训；新项目测试轻量化 |
| 工程规范（前端/后端/API 集成/质量门禁等 23 份） | **不迁移** | 栈全变（Vue→React、NestJS→Next.js）；按需重新沉淀 |
| 产品业务规范（11 份） | **不迁移** | 产品形态从工作台变为对话驱动 Agent |
| openspec 工作流 / 历史归档 / audits / plans | **不迁移** | 由计划文档规范取代 openspec 的推进机制 |
| 规范体系**形式**（00-governance 的结构与治理思想） | **迁移并轻量化重写** | 只保留两个根基规范 |
| AGENTS.md 框架（定位/能做/不能做/权威顺序/目录索引） | **迁移框架，内容全重写** | 见第 8 节 |
| 领域经验（三段式匹配、修复重试哲学、事实护栏、审批流、隐私边界） | **借鉴，不搬代码** | 见第 9 节 |

## 8. 规范体系设计（轻量化）

新项目规范体系起步仅两份根基规范，随项目实际需要按"规范自治"原则沉淀，防止再次膨胀。

### 8.1 根基①：规范文档自治规范（spec-autonomy.md）

规范"规范本身"的规则：
- **新增条件**：同一主题跨 3 处以上重复约定/纠错时才立规范；单一场景规则写进相关文件即可
- **内容边界**：每条规范必须可执行（命令/清单/模板），禁止空泛原则；每条附一行"为什么"
- **修订流程**：先改文档再改代码，与计划文档联动
- **淘汰机制**：失效规范必须归档或删除，不允许占位
- **唯一权威**：一个主题只允许一份规范，冲突以最新修订为准

### 8.2 根基②：计划文档规范（plan-document.md）

规划与执行的推进机制：
- **形态**：轻量 Markdown，单文件 = 单个计划（不用 openspec 四件套）
- **生命周期**：草稿 → 生效 → 完成/放弃；头部统一元信息块
- **恢复点**：每个计划必须有可验证的检查点（checkpoint），中断后可从此继续
- **任务状态跟进**：任务清单 `[ ]`/`[x]` 实时打勾，进度不靠脑记
- **与规范联动**：涉及规范变更的计划，先改规范文档再实施代码

### 8.3 AGENTS.md（薄）

保留 find-work 的框架（产品定位 / 能做什么 / 不能做什么 / 权威顺序 / 目录索引），内容按新项目重写。产品原则明确写入：**测试服务于功能推进，不为测试而测试**。

## 9. 借鉴 find-work 的经验清单（只借鉴，不搬代码）

1. 岗位匹配三段式流水线：理解岗位要求 → 逐条要求 × 简历证据匹配矩阵 → 投递建议
2. LLM 输出容错哲学：**校验失败重试修复，绝不静默接受坏数据**（repair 模式）
3. 中英枚举别名归一化思路（如"高"→highly-matched），保证跨模型输出稳定
4. 专属简历"定点替换建议 + 用户逐条审批 + 事实确认"交互模式（对话形态下更自然）
5. 渠道发现的"本地规则护栏 + 不信任 LLM 事实"原则（域名黑名单、邮箱/URL 正则）
6. 隐私边界：简历原文可按需剥离后再进 LLM 上下文
7. LLM 输出的运行时校验适配 → 轮询终态 → 版本化展示的成熟模式（适配对话流）

## 10. 测试策略

- 底线：核心纯逻辑单测（状态机、规则函数、zod 契约）用 Vitest
- 不引入：覆盖率门槛、变异测试、测试资产矩阵、测试治理脚本、大规模 E2E
- UI 与集成测试仅在功能完成后按需补关键路径

## 11. 技术栈清单

| 类别 | 选择 |
|---|---|
| 框架 | Next.js（App Router）+ React + TypeScript |
| Agent | Vercel AI SDK（`@ai-sdk/openai-compatible` + 官方 Provider 包） |
| 数据 | drizzle-orm + better-sqlite3 + zod |
| UI | Tailwind CSS v4 + shadcn/ui + react-markdown + DOMPurify |
| 状态 | AI SDK `useChat` + TanStack Query |
| 工具生态 | MCP（`@ai-sdk/mcp`，浏览器/文件系统/搜索） |
| 文件 | mammoth（docx 解析）+ docx（生成导出） |
| 测试 | Vitest（仅核心逻辑） |

## 12. 明确不在本期范围（YAGNI）

- 多 Agent 编排 / 图式工作流（未来需求出现时可在 AI SDK 之上平滑引入 LangGraph/Mastra）
- 多用户、鉴权、云部署
- 复杂工作台 UI（本期以对话 + 抽屉呈现产物）
- 数据库服务化（PostgreSQL）、消息队列
- OpenAPI 契约体系（前后端同仓同进程，用 zod 贯穿边界）
