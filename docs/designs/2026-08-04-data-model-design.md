# 数据结构设计（SQLite + Drizzle）

日期：2026-08-04
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）
设计依据：`docs/designs/2026-08-04-job-helper-initialization-design.md`、`docs/designs/2026-08-04-agent-architecture-design.md`（第 7 节接口）
经验引用：经验借鉴文档 #8（LLM 产物运行时校验适配）

## 1. 设计原则

1. **核心实体建表 + LLM 产物 JSON 列**：结构化关系只建模"用户操作的核心实体"（简历、岗位、专属简历、会话、消息）；LLM 生成的结构化产物以 JSON 列存储（find-work 的 JSON payload 经验，简化多表规范化）
2. **过程态不建模**：运行状态、审批流等"过程"活在对话消息里；只有"结果态"落实体表（对话驱动形态的必然——Agent 架构第 5 节确认）
3. **版本宽容**：产物 JSON 内嵌 schemaVersion，读取按版本宽容解析，不做数据迁移（本地单用户，重建成本低）
4. **消息原样存储**：AI SDK 标准消息整体 JSON 持久化，会话恢复零转换（2026-08-04 决策）

## 2. 表集总览（5 表）

| 表 | 职责 | 与 find-work 对比 |
|---|---|---|
| `conversations` | 对话会话 | 对应（去掉多用户） |
| `messages` | 对话消息（AI SDK 整体 JSON + 冗余列） | 无对应（旧项目无对话） |
| `resumes` | 简历实体 + 分析产物 JSON | 合并 ResumeAnalysis/Profile/Target → 单表 + JSON |
| `job_opportunities` | 岗位实体 + 匹配/建议/渠道产物 JSON | 合并 JobProfile/FitResult/ApplicationAdvice/ChannelDiscovery → 单表 + JSON |
| `tailored_resumes` | 专属简历版本 | 去掉 runs/suggestions/revisions 子表（审批流对话化） |

**砍掉**：`settings`（LLM key 走环境变量，暂无其他设置需求——YAGNI，有真实需求再加表）；`users`/令牌/供应商配置（免鉴权）；运行状态机表（运行生命周期活在消息里）；审批子表（审批流在对话中完成）。

## 3. 字段设计

### conversations
```
id TEXT PK (uuid) · title TEXT · created_at TEXT (ISO) · updated_at TEXT (ISO)
```

### messages
```
id TEXT PK (uuid) · conversation_id TEXT FK →conversations (索引)
role TEXT ('user'|'assistant') · message_json TEXT (AI SDK 标准消息整体 JSON)
created_at TEXT (ISO)
```
- 历史查询：`WHERE conversation_id = ? ORDER BY created_at`
- 会话恢复：message_json 数组原样回填 `useChat`
- 冗余列：role、created_at 仅用于查询排序/过滤，内容以 message_json 为准

### resumes
```
id TEXT PK · name TEXT · source_type TEXT ('paste'|'docx'|'txt'|'md')
source_text TEXT · analysis_json TEXT (含 schemaVersion) · created_at · updated_at
```
- analysis_json 结构：`{ schemaVersion: 1, payload: <ResumeAnalysis> }`

### job_opportunities
```
id TEXT PK · company TEXT · title TEXT · jd_text TEXT · url TEXT
status TEXT ('saved'|'analyzed'|'matched'|'applying'|'applied'|'skipped')
fit_result_json TEXT (三段式输出，含投递建议) · channels_json TEXT
created_at · updated_at
```
- fit_result_json 含三段式完整输出（岗位理解 + 匹配矩阵 + 投递建议），不单独设 advice 列
- 投递状态仍为核心业务状态，由工具动作推进（对话驱动，非独立状态机表）

### tailored_resumes
```
id TEXT PK · resume_id FK →resumes · job_opportunity_id FK →job_opportunities
content_markdown TEXT · version INTEGER · created_at · updated_at
```
- **一行 = 一个专属简历版本**（同一 resume+job 组合可多行，查询取最新 version）
- 审批流过程（建议/接受/拒绝/事实补充）在对话消息中追溯，不建子表

## 4. 关键策略

| 策略 | 内容 |
|---|---|
| 产物版本化 | 所有产物 JSON 内嵌 `schemaVersion`；读取按版本宽容解析（当前版本正常读、旧版本能读多少读多少、不可用则提示重新生成）；不做迁移 |
| 索引 | messages.conversation_id、tailored_resumes.resume_id、tailored_resumes.job_opportunity_id |
| 时间戳 | TEXT ISO-8601（可读性优先） |
| ID | `crypto.randomUUID()` 文本 |
| 迁移 | drizzle-kit generate + migrate；首次 db push，之后正式迁移文件 |
| 删除级联 | 删 conversation → 删 messages；删 resume/job_opportunity → 删关联 tailored_resumes（删除动作前有确认点，见 Agent 架构 5.2） |

## 5. 工具 ↔ 表映射（覆盖完整性）

| 工具 | 读 | 写 |
|---|---|---|
| importResume | — | resumes（source_text） |
| analyzeResume | resumes | resumes（analysis_json） |
| importJobOpportunity | — | job_opportunities |
| matchJob | resumes、job_opportunities | job_opportunities（fit_result_json、status） |
| discoverChannels | job_opportunities | job_opportunities（channels_json） |
| tailoredResume | resumes、job_opportunities | tailored_resumes（新版本行） |
| applyJob | 全部 | job_opportunities（status → applying/applied） |
| 对话流 | conversations、messages | conversations、messages（每轮读写） |

## 6. 边界

- ❌ 不做数据迁移机制（版本宽容读取替代）
- ❌ 不做冗余/缓存表（聚合靠查询计算，不建快照）
- ❌ 不建多表规范化（产物 JSON 列是唯一形态）
- ⏸ 字段级详细约束（check 约束、默认值）在实现计划阶段由 drizzle schema 定义

## 7. 与后续主题的接口

- **API 接口**：会话 CRUD（读 conversations/messages）、产物查询（resumes/job_opportunities/tailored_resumes）、确认点续跑（写回 status）——详见 API 主题
- **前端**：会话列表/消息渲染（message_json 回填）、产物展示（按 schemaVersion 宽容解析后渲染）——详见前端主题
