# 第 3 期设计：渠道发现 + 专属简历生成

日期：2026-08-06
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）、plan-document.md
设计依据：`docs/designs/2026-08-04-agent-architecture-design.md`（第 4 节工具全景 4.1/4.2、5.3 上下文策略）、`docs/designs/2026-08-04-data-model-design.md`（tailored_resumes、channels_json）、`docs/designs/2026-08-04-api-design.md`（tailored-resumes 端点）、`docs/designs/2026-08-04-find-work-experience-borrowing.md`（经验 #4 定点替换 + 逐条审批、#6 本地规则护栏）、`docs/designs/2026-08-04-frontend-design.md`（TailoredResumeDrawer）
前置：第 2 期已交付（importJobOpportunity/matchJob、ToolLoopAgent 循环、岗位列表与匹配抽屉）

## 1. 范围与决策（2026-08-06 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 三期范围 | **渠道发现 + 专属简历生成**；投递状态机、applyJob 留后续期 |
| 2 | 审批流 | **对话化审批**（工具两段式：出建议 → 用户文字确认/修改 → 生成版本落库），不建确认点端点/确认卡片——符合数据模型设计"审批流过程在对话消息中追溯，不建子表"，复用现有 ToolLoopAgent 多步循环 |
| 3 | 渠道事实边界 | URL/邮箱**一律来自 JD 文本本地正则提取**，LLM 只做分类整理，严禁自创 URL/邮箱（经验 #6） |
| 4 | 本地规则护栏 | 域名黑名单（招聘平台/ATS）+ 格式校验后置覆写 LLM 结果，违反者标记 `needs_check` 而非信任 |
| 5 | 专属简历版本化 | 同 resume+job 组合可多行，version 递增（max+1），取最新；替换基于**定点替换**（sourceText 唯一性校验，经验 #4） |
| 6 | 生成前提 | 岗位已匹配（fit_result_json 非空）且简历存在，否则业务错误码引导 |

## 2. 工具契约

### discoverChannels（LLM 工具 + 本地护栏）

```
输入：{ jobOpportunityId }
前置：岗位存在（否则抛错，工厂兜底 TOOL_FAILED）
流程：
  1. 本地提取（纯函数 channel-guard）：从 jdText 正则提取 URL 集合与邮箱集合（去重）
  2. LLM（callStructured）：给定 JD 原文 + 提取集合，整理候选渠道
     - 每条渠道：{ id: 'c1'.., type: 'official'|'job_board'|'email'|'unknown', label,
       url: string|null, email: string|null, riskSignals: string[], verification: 'verified'|'needs_check', note }
     - LLM 只能引用提取集合内的 url/email（或 null），不得自创
  3. 本地护栏（后置纯函数，覆写 LLM 结果）：
     - 域名黑名单（招聘平台/ATS 域名表）→ type 强制 'job_board'
     - url/email 不在本地提取集合 → 强制 verification='needs_check'（或剔除）
     - 格式非法 → 剔除
  4. 落库 job_opportunities.channels_json = JSON(契约 ChannelDiscoveryResultV1)
  5. 返回摘要：{ ok:true, jobOpportunityId, channelsCount, byType: {official, jobBoard, email, unknown} }
契约：ChannelDiscoveryResultV1 = { schemaVersion: literal(1), channels: [...] }
```

### tailoredResume（LLM 工具，两段式对话化审批）

```
输入：{ jobOpportunityId, resumeId?, confirmedEdits? }
前置：岗位存在且 status='matched'（否则 { ok:false, error:{code:'JOB_MATCH_REQUIRED'}, hint }）；
      简历存在（resumeId 缺失时模型先用 listResumes 定位；不存在 → RESUME_NOT_FOUND）

第一段（confirmedEdits 缺省）——出替换建议，不落库：
  1. callStructured：基于简历原文 + 匹配结果生成定点替换建议清单（≤8 条）
     每条建议：{ id: 'e1'.., section: 'experience'|'skills'|'education'|'other',
       sourceText: 简历原文片段, suggestedText: 替换文本, reason: 依据（引用匹配要求 r1..rn 或简历证据）, factRisk: 'confirmed'|'inferred' }
     - factRisk：confirmed = 简历已有事实的重新表述；inferred = 推断性补充（需用户特别确认）
  2. 本地校验（纯函数 resume-edits）：sourceText 必须在简历原文**唯一匹配**；不唯一 → 剔除该条并记录
  3. 不落库，返回清单 + hint：引导模型在对话中逐条呈现（含依据与风险标注），请求用户确认或修改
第二段（confirmedEdits 提供）——生成版本：
  1. 前置校验同上；校验每条 sourceText 唯一匹配（不通过 → 业务错误码 + 提示重新确认）
  2. applyEdits：按 sourceText 定点替换，生成新简历 markdown（保留原文结构与未改动内容）
  3. 落库：version = 同 resume+job 组合 max(version)+1；content_markdown 存全文
  4. 返回摘要：{ ok:true, version, appliedCount, resumeId, jobOpportunityId, hint }
```

**错误码新增**：`JOB_MATCH_REQUIRED`、`RESUME_NOT_FOUND`、`EDIT_SOURCE_NOT_FOUND`（sourceText 不唯一/找不到）。

## 3. 前端展示

| 元素 | 设计 |
|---|---|
| 资源库"专属简历"Tab | 激活：专属简历列表（岗位 company · title + 简历名 + v版本号 + 更新时间），空状态"暂无专属简历，可在对话中让助手生成"；删除走 ConfirmDialog |
| 专属简历抽屉 | Markdown 预览（MarkdownText）+ 版本切换（版本列表选择）+ 删除；40vw Sheet，参照 ResumeDrawer 模式 |
| 岗位抽屉-渠道区块 | 渠道列表：类型徽标（official→官方/job_board→招聘平台/email→邮箱/unknown→未知）+ URL/邮箱 + 核验状态（verified→已核验/needs_check→需核验）+ 风险信号；无渠道时显示"尚未发现渠道" |
| 岗位抽屉-专属简历区块 | 该岗位已有版本列表（v版本 + 时间）点击开预览抽屉；空态提示"可在对话中让助手生成专属简历" |
| 对话内交互 | 无新增卡片：建议清单与确认全部以文本形式在对话中完成（对话化审批） |

## 4. 数据与 API

- **数据**：`tailored_resumes` 表与 `job_opportunities.channels_json` 列已就位（迁移 0000），**无新表、无新迁移**
- **仓储新增** `src/db/repositories/tailored-resumes.ts`：
  - `createTailoredResume({resumeId, jobOpportunityId, contentMarkdown})`：version 自动 = 同组合 max+1
  - `listTailoredResumes({resumeId?, jobOpportunityId?})`：按 version 倒序
  - `getTailoredResume(id)` / `deleteTailoredResume(id)`
- **仓储修改** `src/db/repositories/job-opportunities.ts`：补 `updateJobChannels(id, channelsJson)`
- **API 新增**：
  - `GET /api/tailored-resumes?jobOpportunityId=&resumeId=` 列表（轻量：id/version/createdAt/updatedAt + 关联岗位 company/title + 简历名，服务端二次查询组装）
  - `GET /api/tailored-resumes/[id]` 详情（含 contentMarkdown）
  - `DELETE /api/tailored-resumes/[id]`（404 → `TAILORED_RESUME_NOT_FOUND`）
- **API 修改**：`GET /api/job-opportunities/[id]` 详情补返回 `channels`（channels_json 宽容解析，同 fitResult 模式）
- **前端 hooks**：`src/lib/use-tailored-resumes.ts`（列表 + refresh + remove，照抄 use-resumes 模式）；`use-job-detail` 类型加 `channels`

## 5. 纯函数与单测

| 文件 | 职责 | 单测覆盖 |
|---|---|---|
| `src/agent/channel-guard.ts` | URL/邮箱正则提取、域名黑名单判定、护栏覆写 | 提取正确性（常见 URL/邮箱格式）、黑名单命中、LLM 产物越界标记 |
| `src/agent/resume-edits.ts` | sourceText 唯一性校验、定点替换生成新 markdown | 唯一匹配替换、多段替换、不唯一拒绝、找不到拒绝、无编辑时原文不变 |

## 6. 边界与验收

**边界**：
- ❌ 投递状态机（applying/applied/skipped 流转）
- ❌ applyJob 投递工具（docx 生成、渠道页打开）
- ❌ 确认卡片/审批端点（对话化审批取代）
- ❌ 渠道 URL 抓取验证（只做格式/来源核验，不做可达性探测）

**验收标准**：
1. 对话"为这个岗位发现投递渠道" → discoverChannels 执行 → channels_json 落库 → 岗位抽屉渠道区块展示（类型徽标/链接/核验状态）
2. 护栏生效：JD 含招聘平台域名 → 该渠道被标为 job_board；LLM 若输出提取集合外的 URL → needs_check
3. 对话"为这个岗位生成专属简历" → 第一段出建议清单（对话呈现）→ 用户确认/修改 → 第二段生成 v1 落库；再次生成 → v2
4. sourceText 不唯一/找不到 → 该条剔除或返回 EDIT_SOURCE_NOT_FOUND 并引导
5. 资源 Tab"专属简历"列表 + 抽屉 Markdown 预览 + 版本切换；删除简历/岗位 → 专属简历级联删除
6. 回归：chat 多步循环、岗位/简历列表不受影响；lint/build/单测全绿

## 7. 与实施计划的接口

- 实施顺序：设计/计划文档 → 仓储 + API（数据层）→ channel-guard + resume-edits 纯函数（TDD）→ discoverChannels 工具 → tailoredResume 工具 → 前端（Tab 转正 + 抽屉 + 岗位抽屉区块）→ 端到端验证（真实 LLM）→ 验收归档
- 重点验证：渠道护栏真实 LLM 行为（LLM 是否越界编造 URL）、两段式审批的对话完整性（确认后第二段正确接收 confirmedEdits）、版本递增
