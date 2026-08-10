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
