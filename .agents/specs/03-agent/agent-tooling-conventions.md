# Agent 工具层工程规范（agent-tooling-conventions.md）

> Agent 领域工具的组织与写法约定（现状沉淀：固化 `src/agent/` 跨 13 个工具已稳定一致的实践）。
> 为什么：13 个工具重复一致的工厂形态、审批分档、确定性护栏与纯函数单测，需要权威清单约束新增工具。

## 工具形态

- 领域工具一律经 `createDomainTool`（`src/agent/tool-factory.ts`）创建，注册进 `agent.ts` 的 `getTools()` 返回的 `ToolSet`
- 工具内结构化 LLM 调用走 `ctx.callStructured`（zod 契约 + repair ≤2 次 + 降级），不直接调模型
- 业务错误抛结构化错误 `{ code, message, hint }`（详见「结构化错误契约」），工厂只透传 + 注入横切信息，**禁止剥掉原始错误**
- 为什么：工厂统一注入模型/日志/错误包装，工具文件不碰横切逻辑

## 文件组织

- **LLM 工具**（需调模型产出结构化结果：analyze-resume / match-job / discover-channels / tailored-resume / prepare-interview）三文件：`tools/<name>.ts`（薄壳：校验 + 业务规则 + 落库）、`prompts/<name>.ts`（提示词）、`schemas/<name>.ts`（zod 契约，输入 + 输出同文件）
- **确定性工具**（纯本地逻辑，无 LLM 调用：import-resume / import-job-opportunity / list-resumes / list-job-opportunities / get-memory / set-memory / apply-job / record-application-status）单文件 `tools/<name>.ts`（输入 schema 内联或独立 `schemas/` 文件如 apply-job、record-application-status，**不建 prompts**）
- 新增工具在 `agent.ts` 的 `SYSTEM_PROMPT` 能力清单中补一行说明
- 为什么：契约与提示词独立可维护，工具文件保持编排职责；确定性工具无模型调用，prompts 纯属空壳（YAGNI）

## 工具描述（description）规范

- 每个工具的 description 写 3-4 句，按序覆盖：做什么 / 何时用（触发场景）/ 何时不用（边界与前置条件）/ 参数含义与格式 / 返回什么（或不含什么）；边界信息不得省略
- 推荐句式：首句功能定位 + 触发场景，次句参数含义与格式，第三句边界与前置条件（何时不该调用），末句返回内容
- 两段式工具（tailoredResume / applyJob / recordApplicationStatus）的 description 必须写清调用契约：
  - 不带 `confirmed`：仅生成预览/校验，**不落库**，返回摘要供用户确认
  - 带 `confirmed: true`：前置条件通过后落库并返回结果
  - 前置条件失败时给出 next step（如岗位未匹配 → 先调 `matchJob` 完成匹配再投递）
- description 面向模型的 tool-use 决策，不写实现细节；行为改动须同步修订 description，描述与实现不符视为缺陷
- 为什么：模型依据 description 决定何时调用、传什么参数，3-4 句结构化描述减少误用；两段式契约写进 description，模型才明白"先预览、后确认"是两次有意的调用而非重复

## 结构化错误契约

- 工具执行错误统一为结构化错误，三个字段齐备：
  - `code`：稳定机器码，大写蛇形（如 `JOB_MATCH_REQUIRED`、`NOT_APPLIED`），供上层分支与测试断言，不承载人读文案
  - `message`：人读文案，展示给用户
  - `hint`：给模型的下一步建议，格式"发生了什么 + 下一步试什么"（如"岗位尚未投递，先调用 applyJob 完成投递，再记录投递状态"）
- **工厂层（tool-factory）禁止剥掉原始错误**：现有"一切错误包成 `{ code: 'TOOL_FAILED' }`"的实现已废止，修订为透传工具抛出的结构化错误；`TOOL_FAILED` 仅作未知异常兜底
- 只读工具（list* / get* / analyze 等）不抛错：失败时把结构化错误作为工具结果返回，而非抛出异常
- 结构化错误必须作为结果回到模型（进入对话上下文），不能只记日志——模型依赖 `hint` 引导用户完成下一步
- 为什么：错误是模型决策的输入，剥掉细节等于让模型"失明"；`hint` 承载修复路径，对话才能自愈（对齐 MCP isError 语义，错误即结构化结果）

## 审批分档

- 确认强度与动作成本匹配，三档分级，避免确认疲劳：
  1. **免确认**：只读工具（list* / get* / analyze 等），无副作用，直接执行
  2. **轻量确认**：可逆操作（如 recordApplicationStatus、setMemory），确认为轻量（前端轻量确认或支持撤销），不打断对话节奏
  3. **强确认**：不可逆 / 对外动作（applyJob 投递、tailoredResume 覆盖简历），两段式 `confirmed` 由**代码强制**校验，确认超时一律 fail-closed（不执行）
- 两段式工具（tailoredResume / applyJob / recordApplicationStatus）调用契约：
  1. **第一段**（不带 `confirmed`）：只读取/生成摘要，**不落库**，返回给用户确认
  2. **第二段**（带 `confirmed: true`）：校验前置条件后落库
- 执行前校验前置条件并返回明确错误（如岗位未匹配 → `JOB_MATCH_REQUIRED`、岗位未投递 → `NOT_APPLIED`，并附 next 指引）
- "对外发送"类动作（applyJob 等）永不提供"本次不再问"豁免；任何确认超时/失败一律 fail-closed
- 为什么：对外关键动作必须有人工确认点（find-work 经验 #4），两段式复刻对话审批流；状态机严格单向 + 终态不可回退，**所有状态变更落库前确认即反悔机会**；确认强度与成本匹配避免疲劳，超时 fail-closed 防止静默执行

## 确定性护栏

- 事实类数据（渠道 URL/邮箱）**仅本地正则提取**（`channel-guard.ts` 黑名单 + 核验），LLM 只做分类整理，严禁自创 URL/邮箱
- 简历分析结论必须基于简历原文证据引用，不编造
- 为什么：严禁 LLM 臆造事实（find-work 经验 #6），事实边界由代码而非模型保证

## 纯函数 + 单测

- 状态机/规则/文本处理抽为纯函数模块，独立于工具文件：`apply-state.ts`（投递状态机）、`channel-guard.ts`、`resume-text.ts`、`resume-edits.ts`
- 每个纯函数模块配同名 `.test.ts`（vitest），用 TDD 先写失败测试再实现
- 为什么：规则逻辑可独立验证，测试服务功能推进（AGENTS.md 工程原则，不设覆盖率门槛）

## 资源发现

- 系统已有资源（简历/岗位）经 `listResumes` / `listJobOpportunities` 获取 id 复用，避免重复导入
- 用户未提供 resumeId/jobOpportunityId 时，先调用对应 list 工具再操作
- 为什么：对话中已导入的资源可直接复用（修复"上传简历无法被分析"的历史教训）

## Skill 系统

> 知识/流程承载层：`skills/<skill-name>/SKILL.md` 技能正文按需加载，元数据常驻 system prompt（CLI 机制同构移植，遵循 agentskills.io 开放标准）。

### 目录与文件结构

- 每个 skill 一个目录，正文固定于 `skills/<skill-name>/SKILL.md`；目录名 = skill 名，小写连字符（如 `resume-analysis`）
- frontmatter 必填两字段：
  - `name`：与目录名一致，≤64 字符，小写连字符
  - `description`：≤1024 字符，写"做什么 + 何时用"，包含触发词
- 正文 Markdown，中文，≤500 行；长内容拆入 `references/` 子目录按需引用，引用保持一层深（references 内不再嵌套）
- 为什么：目录名即 skill 唯一标识，frontmatter 提供注入与确认所需的元数据；正文限长约束常驻成本，references 拆分控制单次加载量

### 元数据常驻注入

- 会话组装时遍历 `skills/` 目录，把每个 skill 的 name + description 注入 system prompt 的 Skill 元数据段（约 100 token/个）；正文不常驻
- 为什么：模型需知道"有哪些 skill、何时用"以触发 readSkill；正文低频且体积大，按需加载省 token

### readSkill 工具契约

- 工具名 `readSkill`：inputSchema 含 `skillName`（zod enum 或存在性校验）；该工具同样遵循「工具形态」「工具描述（description）规范」的既有约定
- 读取 `skills/<skillName>/SKILL.md` 正文返回，返回内容含 frontmatter 解析出的 name/description，供模型确认命中正确的 skill
- 限定 `skills/` 目录内的已知 skill，防路径穿越；不得读取目录外任何文件
- 不存在/非法 skill 返回结构化错误，复用既有 `{ ok: false, error: { code, message, hint } }` 契约（对齐「结构化错误契约」），错误码如 `SKILL_NOT_FOUND`
- 只读工具，免确认（对齐「审批分档」第一档）
- 为什么：技能正文按需加载，模型凭元数据判断后读取；路径穿越是安全边界，由代码强制而非模型自律

### 与既有体系边界

- skill 承载知识/流程（提示词、评分卡、题库、模板），**不新增工具能力**；现有 13 个工具与两段式审批不变
- skill 数量受控：元数据常驻有 token 成本，建议 ≤15 个
- 为什么：知识层与工具层解耦——skill 回答"怎么做"，工具负责执行；数量上限控制常驻 token 成本

## 显式规划

> 复杂任务的计划承载层：`data/plans/<taskId>.md` 计划文件持久化，由 planCreate/planUpdate 工具自主管理（与 readSkill 同构），对用户「创建时确认 + 执行中进度」（对齐设计 P1-2 定稿）。

### 计划文件结构

- 存储位置 `data/plans/<taskId>.md`：数据目录下的计划文件，**不入库**；与 `docs/plans/`（设计/计划文档目录）、`.zcode/plans`（客户端计划目录）区分，三者用途不同不得混放
- 文件内容（Markdown）：任务标题、步骤列表、创建时间（createdAt）
  - 步骤列表每步含：标题 / 成功标准 successCriteria（可判定完成与否）/ 状态 status（todo · in_progress · done · blocked）/ 依赖 depends_on（可空）/ 产出物路径（可选）/ 失败备注（blocked 时必填原因）
- 为什么：计划文件是当前任务执行状态的单一事实来源，中断后读文件即续跑（设计 P1-2「分层混合规划」）；独立数据目录避免与文档、客户端目录混淆

### planCreate / planUpdate 工具契约

- `planCreate`：
  - inputSchema：`taskId`、`steps: [{ title, successCriteria }]`、`dependsOn?`（可选，声明步骤间依赖，简单字段不做 DAG 引擎）
  - 创建计划文件并返回计划全文（Markdown），供 Agent 在对话中展示给用户确认；用户确认前不得开始执行步骤
  - `taskId` 格式：小写连字符或会话关联 id；防路径穿越：限定 `data/plans/` 目录内，拒绝路径分隔符/上级目录引用
- `planUpdate`：
  - inputSchema：`taskId`、`stepIndex`、`status`（枚举 todo / in_progress / done / blocked）、`note?`（可选，blocked 时记录原因）
  - 更新步骤状态；状态流转校验：done / blocked 为终态**不可回退**，非法流转（如 blocked → in_progress）返回结构化错误
  - 返回更新后的计划摘要
- 错误契约复用 `{ ok: false, error: { code, message, hint } }`（对齐「结构化错误契约」），错误码如 `PLAN_NOT_FOUND` / `PLAN_STEP_INVALID` / `PLAN_STATUS_INVALID`
- planCreate / planUpdate 均为可逆本地文件操作，不属「审批分档」强确认档；「创建时用户确认」由「规划原则」的对话流程保证
- 为什么：与 readSkill 同构——工具自主读写，路径穿越与状态机由代码强制而非模型自律；状态单向推进保证计划文件进度可信

### 规划原则（SYSTEM_PROMPT 层面）

- 复杂任务（多步骤/长链条，如求职周报/投递计划）先 `planCreate` 出 3-6 步计划 → 对话展示请求用户确认 → 确认后逐步执行；步骤粒度任务级（宏观），微观 ReAct 循环不预先穷举
- 每步执行后 `planUpdate` 更新状态；blocked 步骤记录原因（note）
- 每步后判定「照计划继续 / 调整计划 / 提前终止」；终止条件 = 全部 done 或用户确认的边界
- 简单任务（单步/快速问答）不生成计划
- 为什么：复杂任务先确认计划再执行，避免大方向偏离；每步进度可见，长任务不失控（对齐 P1-5 UX 卡片的"第 N 步"进度联动）

### 中断恢复

- 会话组装时若存在进行中计划（含未 done 步骤），把计划状态段注入上下文（进行中的步骤 / blocked 备注），支持续跑
- 计划文件与记忆层边界：**计划 = 当前任务执行状态**；`memory_blocks` 的 `status_scratchpad` = 跨任务进度笔记；二者不混用（步骤状态不进 scratchpad，scratchpad 不承载步骤状态）
- 为什么：计划文件回答"这个任务进行到哪"，中断恢复直接读文件注入；跨任务进度/画像归记忆层，职责分离避免双写漂移

## 反思环（经验沉淀）

> 失败经验的沉淀与复用承载层：`lessons` 表由 recordLesson / searchLessons 两个确定性工具读写（对齐设计 P1-3 定稿）。

### recordLesson 工具契约

- 工具名 `recordLesson`：inputSchema 含 `content`（教训内容文本，非空校验，为空返回结构化错误）、`category`（zod enum：`matching` / `marketing` / `interview` / `application` / `tooling` / `general` 等，非法分类返回错误）、`sourceTaskId?`（可选，来源任务/场景标识，如计划 `taskId`）
- 写入 `lessons` 表（含 `lessons_fts` 同步，对齐后端规范「lessons 表」）；返回写入结果（含教训 `id`）
- 写入类工具（非只读），但为本地可逆操作（认识纠偏可新增纠正性教训，无对外副作用），不属「审批分档」强确认档
- 错误契约复用 `{ ok: false, error: { code, message, hint } }`（对齐「结构化错误契约」），错误码如 `LESSON_INVALID`（content 为空）/ `LESSON_CATEGORY_INVALID`（category 非法）
- 为什么：失败复盘写入是高频低风险动作，确认点应放在教训内容本身而非工具调用；枚举由代码校验，防分类语义漂移

### searchLessons 工具契约

- 工具名 `searchLessons`：inputSchema 含 `query?`（检索词）、`category?`（按分类过滤）、`limit?`（默认 5，上限 20）
- 有 `query` 走 `lessons_fts` 检索；无 `query` 按时间返回最近 N 条；返回教训列表（含 `category` / `created_at` 时间）
- 无匹配结果返回空列表（非错误，不抛结构化错误）
- 只读工具，免确认（对齐「审批分档」第一档）
- 为什么：检索契约与读取频率匹配，教训按需取回、不常驻上下文（对齐设计 P1-3「多条目、按需检索」）

### 反思原则（SYSTEM_PROMPT 层面）

- 任务失败/受阻（blocked 步骤、工具报错、被用户纠正）后主动调用 `recordLesson` 复盘；用户认可的关键反馈也可沉淀
- 教训要具体可复用：写清「发生了什么 / 为什么 / 下次怎么做」，避免空泛描述
- 新任务开始或再次失败时先调用 `searchLessons` 查经验，复用后再行动
- 教训不常驻上下文：按需检索取回，用后即弃
- 与规划联动：计划 blocked 步骤的失败原因可沉淀为教训（`sourceTaskId` 关联计划 `taskId`）
- 为什么：失败不沉淀则反复踩坑（对齐设计 P1-3 反思环），具体化要求保证教训可迁移复用，按需检索控制上下文 token 成本
