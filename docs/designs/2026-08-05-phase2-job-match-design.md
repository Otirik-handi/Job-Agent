# 第 2 期设计：岗位导入 + 岗位匹配（含自动续问）

日期：2026-08-05
状态：完成
关联规范：AGENTS.md（关键硬约束）、plan-document.md
设计依据：`docs/designs/2026-08-04-agent-architecture-design.md`（第 4 节工具全景、6.4 分期）、`docs/designs/2026-08-04-data-model-design.md`（job_opportunities）、`docs/designs/2026-08-04-find-work-experience-borrowing.md`（经验 #1 三段式、#3 枚举归一化、3.1 契约内嵌 prompt）
前置：第 1 期已交付（Agent 骨架、importResume/analyzeResume、对话流、UI）

## 1. 范围与决策（2026-08-05 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 岗位输入 | **仅文本粘贴**（URL 抓取留后续期，MCP 浏览器不在本期） |
| 2 | 自动续问 | **服务端 Agent 循环**（ToolLoopAgent + createAgentUIStream）；异常时回退前端自动续问 |
| 3 | 导入职责 | importJobOpportunity 纯确定性（只入库原文）；结构化理解归 matchJob 第一段 |
| 4 | 匹配产出 | 三段式（理解→匹配→建议）单契约 JobMatchResultV1，落库 fit_result_json |
| 5 | 跨模型兼容 | 契约完整示例内嵌 prompt（经验 3.1，deepseek 类 provider 无 structuredOutputs 时 schema 不进提示词） |

## 2. 工具契约

### importJobOpportunity（纯确定性工具，无 LLM 调用）

```
输入：{ text }（JD 文本）
前置校验：text 非空、≤80000 字符（复用 resume-text 的上限与归一化逻辑，抽公共常量）
行为：normalize → createJobOpportunity（jd_text；company/title 留空）→ status='saved'
输出：{ jobOpportunityId, charCount, preview, next: "可用 matchJob 匹配" }
```

### matchJob（LLM 工具，三段式）

```
输入：{ jobOpportunityId }
前置：岗位存在；简历存在且有 analysis_json（否则返回 { ok:false, error:{code:'RESUME_ANALYSIS_REQUIRED'}, hint:'请先导入并分析简历' }）
第一段 理解（understanding）：
  - company / title 规范化（回填 job_opportunities）
  - requirements: ≤8 条（每条 id 稳定：r1..r8，同源岗位多次匹配 id 一致）
  - city / level / salaryRange / tags 等要点（可空）
第二段 匹配（fit）：
  - fitResults: 逐条 requirement 匹配矩阵 { requirementId, level, evidence, note }
  - level 枚举：'highly-matched' | 'matched' | 'partial' | 'mismatch'（英文枚举 + 中文说明）
  - overallScore: 0-100 整数
  - risks: ≤8 条 { point, evidence? }
第三段 建议（advice）：
  - mustFix: 必备修改（针对 mismatch/partial 项）
  - resumeAdjustments: 简历调整建议（针对 highly-matched 项如何突出）
  - talkingPoints: 谈话要点
  - truthBoundary: 真实性边界提示（不得虚构经历/技能）
契约：JobMatchResultV1 = { schemaVersion: literal(1), understanding, fitResults[], overallScore, risks[], advice }
落库：job_opportunities.fit_result_json = JSON(契约) + company/title 回填 + status='matched'
返回摘要：{ ok:true, jobOpportunityId, overallScore, requirementsCount, risksCount }
```

**校验与修复**：
- 三段输出为一个契约整体（单次 generateObject），zod 校验失败 → llm-call repair 重试（≤2 次）
- 业务规则校验钩子：requirementId 必须与 understanding.requirements 的 id 对应（跨字段一致性，参照经验 #3）；不符 → 直接失败（不可修复类）
- 枚举非法 → repair（契约内嵌合法值表）

## 3. 自动续问（服务端 Agent 循环）

```
app/api/chat 改造：
  import { ToolLoopAgent, isStepCount, createAgentUIStream, createAgentUIStreamResponse } from 'ai'
  const agent = new ToolLoopAgent({ model, system: SYSTEM_PROMPT, tools: getTools(), stopWhen: isStepCount(5) })
  const stream = createAgentUIStream({
    agent,
    uiMessages: trimmed,               // 复用现有历史组装（convertToModelMessages 不再需要）
    options: { onToolExecutionStart/End → 进度事件 writer.write（沿用 data-tool-progress）},
  })
  return createAgentUIStreamResponse({ stream })
```
- 效果：一条消息内 Agent 自动多步（如 importResume → analyzeResume → importJobOpportunity → matchJob），全部工具进度事件连续推送，前端零改动
- `stopWhen: isStepCount(5)`：防失控上限（正常流程 ≤4 步）
- 消息持久化沿用 tee + readUIMessageStream 机制（createAgentUIStream 的流同样可 tee）
- **风险与回退**：ToolLoopAgent 为 experimental API；实现中若不可用/不稳定，回退前端自动续问（检测 importResume/importJobOpportunity 完成事件 → 自动追加"继续"消息）；工具与契约设计不受影响

## 4. 前端展示

| 元素 | 设计 |
|---|---|
| 资源库"岗位"Tab | 激活：岗位列表（company · title / 状态徽标 / 更新时间），空状态引导 |
| 状态徽标 | saved→已保存（slate）、matched→已匹配（indigo）、applying→投递中（amber）、applied→已投递（emerald）、skipped→已跳过（slate）；全部低饱和柔和色 |
| 对话内匹配结果卡片 | 评分（大号数字 + /100）+ 要求数/建议数/风险数摘要；点击开抽屉 |
| 岗位/匹配详情抽屉 | 三段式渲染：岗位理解（要求列表+要点）→ 匹配矩阵（每条要求 + level 徽标 + 证据）→ 投递建议（MarkdownText） |
| 无简历引导 | matchJob 返回 RESUME_ANALYSIS_REQUIRED 时，模型自然告知"先导入并分析简历" |

## 5. 数据与 API

- **数据**：job_opportunities 表已就位（第 1 期迁移含 status/fitResultJson 等字段），无新表
- **仓储新增**：`src/db/repositories/job-opportunities.ts`——createJobOpportunity / listJobOpportunities(status?) / getJobOpportunity / updateJobMatch(id, {company, title, fitResultJson, status})
- **API 新增**：
  - `GET /api/job-opportunities?status=` 列表（轻量：id/company/title/status/updatedAt）
  - `GET /api/job-opportunities/[id]` 详情（含 fitResult 按 schemaVersion 宽容解析：当前版本正常读、旧版本能读多少读多少、不可用返回 null）
- **前端 hooks**：`src/lib/use-job-opportunities.ts`（列表 + refresh）、`src/lib/use-job-detail.ts`（详情）

## 6. 边界与验收

**边界**：
- ❌ URL 抓取（MCP 浏览器，后续期）
- ❌ 自动投递（第 4 期）
- ❌ 渠道发现 / 专属简历（第 3 期）
- ❌ 多模型 / 多 Agent

**验收标准**：
1. 对话一条消息："帮我匹配这个岗位：{JD 文本}" → 同一流内自动完成（岗位导入 → 匹配），进度卡片连续出现
2. matchJob 失败路径：无简历 → 返回 RESUME_ANALYSIS_REQUIRED 且模型引导；岗位不存在 → 明确错误
3. fit_result_json 落库（schemaVersion:1 + 三段结构），status='matched'，company/title 回填
4. 资源库岗位列表 + 详情抽屉展示三段式结果（要求/匹配矩阵/建议）
5. 回归：简历分析闭环正常、6 单测全绿、build 通过
6. UI 风格不回归（Soft UI 令牌下新组件符合风格）

## 7. 与实施计划的接口

- 实施顺序建议：仓储 + API（数据层）→ importJobOpportunity 工具 → matchJob 契约/prompt/工具 → /api/chat Agent 循环改造（含进度事件适配与持久化验证）→ 前端岗位列表/详情抽屉 → 端到端验证（真实 LLM）→ 验收归档
- 自动续问改造涉及 /api/chat 核心路径，需重点验证：多步进度事件、消息持久化（Agent 多轮消息落库完整性）、会话恢复
