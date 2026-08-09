# Agent 架构设计（对话驱动 Agent 应用）

日期：2026-08-04
状态：完成
关联规范：AGENTS.md（关键硬约束）、plan-document.md
设计依据：`docs/designs/2026-08-04-job-helper-initialization-design.md`、`docs/designs/2026-08-04-find-work-experience-borrowing.md`
经验引用：本文档中"经验 #N"均指经验借鉴文档条目

## 1. 设计背景与关键决策

job-helper 为本地优先、对话驱动的个人求职 Agent 应用（Next.js 全栈 + Vercel AI SDK + React + SQLite/Drizzle）。本设计覆盖 Agent 架构**全部能力**（非 MVP——前身项目已验证产品价值），实现按能力分 4 期落地。

关键决策（2026-08-04 确认）：

| # | 决策 | 结论 |
|---|---|---|
| 1 | 设计范围 | 架构全覆盖（7 领域工具 + 通用工具），实现分 4 期 |
| 2 | 首个能力闭环 | 简历分析（地基能力） |
| 3 | 工具封装形态 | 工具内嵌完整分析链路（确定性外壳 + prompt + 契约校验 + repair + 落库） |
| 4 | 会话形态 | 多会话，每会话独立上下文 |
| 5 | 分析呈现 | 非流式 + 进度卡片（结构化输出与契约校验兼容） |
| 6 | 整体方案 | 方案 A+：薄编排 + 工具基础设施层（组件复用，非运行时类） |

## 2. 总体架构与分层

```
┌─ UI 层         聊天界面（流式对话 + 工具进度卡片 + 确认点 + 产物展示）
├─ API 边界      app/api/chat/route.ts —— 对话端点（AI SDK streamText → SSE）
│                app/api/tools/[id]/confirm —— 确认点端点（API 主题细化）
├─ Agent 层      src/agent/
│                ├── agent.ts        主对话 Agent：系统提示 + 工具注册表 + 会话上下文组装
│                ├── llm-call.ts     结构化调用封装（generateObject + zod + repair + 降级）
│                ├── tool-factory.ts 工具工厂（统一创建领域工具：注入模型/事件/日志/存储）
│                ├── prompts/        每能力一个 prompt 文件
│                └── schemas/        每能力一个 zod 契约文件
├─ 工具层        src/agent/tools/
│                importResume / analyzeResume / importJobOpportunity /
│                matchJob / discoverChannels / tailoredResume / applyJob
├─ 领域层        src/domain/ —— 纯 TS 服务（简历文本提取、规则函数、落库封装）
└─ 数据层        src/db/ —— Drizzle + SQLite（数据结构主题细化）
```

### 2.1 核心职责边界

| 组件 | 职责 | 不负责 |
|---|---|---|
| `agent.ts` | 系统提示组装、工具注册、历史与工具结果喂给模型 | 不写任何领域逻辑 |
| `llm-call.ts` | 结构化输出调用：zod 校验 → repair 重试（≤2 次）→ 降级 | 不感知业务语义 |
| `tool-factory.ts` | 工具统一创建：注入模型、进度事件、日志、存储 | 不定义工具内容 |
| 每个工具文件 | 自己的 prompt + 契约 + 业务逻辑 + 落库 | 不复用彼此的代码 |
| 领域服务 | 可测试的纯逻辑（提取文本、规则、序列化） | 不直接调 LLM |

### 2.2 多会话上下文组装

- 历史消息：每会话最近约 20 轮（token 预算控制，调优留待实现）
- 系统提示：静态（产品定位 + 工具使用说明 + 真实性边界），**不注入实体数据**
- 领域上下文策略：实体经工具参数引用（`resumeId`），由工具内部读取——保持上下文精简，避免膨胀与过期污染（find-work 教训）

## 3. 工具基础设施

### 3.1 llm-call.ts（结构化 LLM 调用封装，全工具统一复用）

```ts
callStructured({ model, messages, outputSchema, task })
→ { ok: true, data } | { ok: false, error: { code, message } }
```

流程（经验 #2"校验失败重试修复，绝不静默接受坏数据"）：
1. `generateObject`（AI SDK 原生结构化输出，zod output）
2. 解析结果（含 JSON 解析失败捕获）
3. zod 契约校验 + 业务规则校验钩子（跨字段一致性）
4. 失败 → repair：重新调用，prompt 注入"上次输出无效原因"（≤2 次）
5. 仍失败 → 降级：结构化失败 `LLM_OUTPUT_INVALID`，由工具决定行为（可记失败记录，不写坏数据）

与 find-work 差异：旧项目独立 `-repair` 任务名 + 手写 schema 校验器；新项目 repair 内嵌 llm-call（任务名收敛为工具名），校验器换 zod。

### 3.2 tool-factory.ts（工具工厂）

```ts
createDomainTool({ name, description, inputSchema, progress, execute })
→ Tool 对象（注册进 agent.ts）
```

工厂统一负责：进度事件上报、日志记录（敏感信息过滤）、错误包装、模型实例注入。工具文件不碰横切逻辑。

### 3.3 校验与修复策略（统一规则）

| 失败类型 | 可修复 | 处理 |
|---|---|---|
| JSON 解析失败 / 缺字段 / 类型错误 | ✅ | repair 重试（≤2 次，注入错误详情） |
| 枚举值非法 | ✅ | repair（契约附合法值表） |
| 业务规则冲突（证据不匹配、引用不存在） | ❌ | 直接失败，结构化错误 |
| 模型调用失败（网络/限流/密钥） | ❌ | 直接失败，可理解文案 |

### 3.4 事件机制（工具状态 → 进度卡片）

- 事件类型：`tool_started / tool_progress / tool_completed / tool_failed`
- 传输：AI SDK 流式协议自定义事件通道（API 主题细化）
- 载荷约束：只含 `{ toolName, status, message }`，不含 LLM 请求体、完整简历文本等敏感内容（AGENTS.md 硬约束）
- 前端进度卡片状态机：排队 → 进行中（阶段文案）→ 完成（产物摘要）→ 失败（错误 + 重试入口）

### 3.5 日志约定

- 每工具执行一条结构化日志：工具名、任务、耗时、结果状态、产物摘要（非全文）
- 写入 `logs/`；禁止记录：密码、token、Provider key、完整简历文本、完整岗位描述、LLM 请求体

## 4. 领域工具集全景

### 4.1 工具清单（7 领域工具 + 通用工具）

| 工具 | 输入 | 输出要点 | 依赖 | 经验参照 |
|---|---|---|---|---|
| `importResume` | 粘贴文本 / 本地文件路径（docx/txt/md，mammoth 解析） | `{ resumeId }`；拒绝 PDF/图片/OCR/旧 .doc | — | 文件边界 |
| `analyzeResume` | `{ resumeId }` | 结构化画像 + 评分 + 优势/风险/改进建议 + 证据引用 + 待确认项 | 简历存在 | 分析契约 + 证据/真实性边界 |
| `importJobOpportunity` | JD 文本 / 岗位 URL（URL 经 MCP 浏览器抓取） | `{ jobOpportunityId }` | — | — |
| `matchJob` | `{ jobOpportunityId }` | 三段式：岗位理解（≤8 条要求）→ 逐条匹配矩阵（证据引用）→ 投递建议（必备修改/谈话要点/真实性边界） | 简历画像 + 岗位 | 经验 #1 三段式 + #3 枚举归一化 + 跨字段一致性 |
| `discoverChannels` | `{ jobOpportunityId }` | 候选渠道列表（来源分类）+ 核验动作 + 风险信号；本地规则护栏覆写 LLM | 岗位 | 经验 #6 本地规则护栏、严禁臆造事实 |
| `tailoredResume` | `{ jobOpportunityId }` | 定点替换建议列表（sourceText 唯一性校验）→ 用户逐条审批 → 生成专属简历版本 | 匹配结果 + 简历 | 经验 #4 定点替换 + 逐条审批 + 事实确认 |
| `applyJob` | `{ jobOpportunityId, channelId? }` | 投递包（专属简历 docx + 求职信 + 投递要点）→ 真实性确认 → 打开渠道页供手动投递 | 专属简历/匹配结果 | 真实性门禁 |

**通用工具（MCP 生态）**：浏览器（岗位 URL 抓取、投递页打开）、文件系统（读本地简历）。经 `@ai-sdk/mcp` 注册进同一工具表。

### 4.2 设计决策

1. **投递建议不设独立工具**：建议是 matchJob 三段式输出的第三段；"重新给建议"由模型基于已有结果对话回答或重跑 matchJob（YAGNI）
2. **导入与分析分离**：importResume 只创建简历实体（确定性工具，无 LLM 调用）；analyzeResume 只做分析。对话中模型自然串联
3. **applyJob 不做自动投递**：生成投递包 + 打开渠道页面，投递动作由用户完成（反爬/登录态风险）

### 4.3 依赖图

```
importResume ──► analyzeResume ──────────┐
                                         │
importJobOpportunity ──► matchJob ───────┤（三段式，含投递建议）
        （URL 经 MCP 浏览器抓取）          ▼
                              discoverChannels（可选）
                              tailoredResume（可选，审批流）
                              applyJob（投递包 + 确认）
```

### 4.4 契约组织约定

- 契约文件：`src/agent/schemas/<tool-name>.ts`（输入 + 输出契约同文件）
- prompt 文件：`src/agent/prompts/<tool-name>.ts`（输出契约规则 + 边界指令内嵌）
- 工具实现：`src/agent/tools/<tool-name>.ts`（薄壳：llm-call + 业务规则 + 落库）
- **详细字段在实现计划阶段定义**（本设计定职责与结构，契约以代码为准）

## 5. 对话协议与消息模型

### 5.1 对话流协议

- 通道：`useChat` ↔ `/api/chat`（streamText），SSE 流式，AI SDK 标准协议
- 消息模型：AI SDK 标准消息（user/assistant + 工具调用/结果 parts），直接持久化，无自定义格式
- 工具进度：流式协议自定义事件推送（`tool_started/progress/completed/failed`），**不持久化**（一次性 UI 状态）

### 5.2 确认点机制（human-in-the-loop）

适用场景：高风险动作（applyJob 投递前）、数据变更（覆盖/删除简历岗位）、审批流（tailoredResume 逐条建议）。

```
工具执行到确认点 → 返回结构化"待确认"结果 → 对话流暂停
  → UI 渲染确认卡片（动作描述 + 涉及数据 + 风险提示 + 确认/拒绝）
  → 用户确认 → 端点触发续跑（执行实际动作）→ 结果回对话
  → 用户拒绝 → 模型告知动作已取消，对话恢复
```

确认点工具与普通工具同构（同一工厂），execute 分两段：确认前（预览）→ 确认后（执行）。端点形态在 API 主题细化。

### 5.3 上下文管理策略

| 项 | 策略 |
|---|---|
| 历史消息 | 每会话最近约 20 轮（token 预算控制） |
| 工具结果回填 | 返回给模型的 result 为**精简摘要**；完整产物落库由前端展示（避免长 JSON 撑爆上下文） |
| 系统提示 | 静态，不注入实体数据 |
| 会话标题 | 首条用户消息规则截断（前 N 字），不做 LLM 生成 |

### 5.4 多会话

会话列表查询、切换、新建；每会话独立上下文；数据落在 conversations/messages 表（数据结构主题细化）。

## 6. 模型配置、错误处理与边界

### 6.1 模型注册与配置

| 变量 | 说明 |
|---|---|
| `LLM_BASE_URL` | OpenAI 兼容端点（任意供应商） |
| `LLM_API_KEY` | 密钥（`.env.local`，gitignore 已忽略） |
| `LLM_MODEL` | 默认模型名 |
| `LLM_TEMPERATURE` | 可选，默认 0.3 |

- 运行时：`createOpenAICompatible({ baseURL, apiKey })` → `model(LLM_MODEL)`，agent.ts 创建并经 tool-factory 注入
- 多供应商切换 = 改环境变量；缺 key 不崩应用，首条对话返回明确提示

### 6.2 统一错误契约

```
{ code, message }   （find-work {code,message,details} 的本地化简化）
```

| 错误层 | 处理 |
|---|---|
| LLM 调用错误（网络/限流/密钥/超时） | 工具失败 → 可理解文案；不自动重试（避免重复计费），用户重发 |
| 输出校验失败（repair 耗尽） | `LLM_OUTPUT_INVALID`，不落库坏数据 |
| 业务规则错误 | 明确业务错误码（`RESUME_NOT_FOUND`、`FILE_TYPE_UNSUPPORTED` 等） |
| 意外错误 | 兜底码，不泄漏堆栈 |

- 超时集中在 llm-call（分析类任务 120s）
- 错误信息遵循敏感信息边界

### 6.3 边界（不在本期）

- ❌ 多 Agent / 子 Agent（演进路径：组件之上加运行时类）
- ❌ 多模型并存 / 按任务路由
- ❌ 自动投递
- ❌ 语音 / 多模态

### 6.4 实现分步（4 期，每期一个计划）

| 期 | 内容 | 验收标志 |
|---|---|---|
| 第 1 期 | Agent 骨架（agent/llm-call/tool-factory/对话端点/会话持久化雏形）+ importResume + analyzeResume | 对话中"导入并分析简历"闭环，产物落库展示 |
| 第 2 期 | importJobOpportunity + matchJob | 岗位匹配闭环，输出匹配矩阵与投递建议 |
| 第 3 期 | discoverChannels + tailoredResume | 渠道发现 + 专属简历审批闭环 |
| 第 4 期 | applyJob | 投递包生成 + 确认流程闭环 |

## 7. 与后续主题的接口（供数据结构/API/前端设计引用）

- **数据结构**：conversations、messages（AI SDK 消息结构 parts 持久化）、resumes（含 analysis JSON）、job_opportunities（含 fit_result/advice/channels JSON）、tailored_resumes（含建议与版本）——详见数据结构主题
- **API 接口**：`/api/chat`（SSE）、工具确认端点、会话 CRUD、产物查询端点、进度事件协议——详见 API 主题
- **前端**：聊天界面（useChat + 进度卡片 + 确认卡片）、产物展示、会话列表——详见前端主题
