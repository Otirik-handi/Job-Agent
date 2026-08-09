# Agent 工具层工程规范（agent-tooling-conventions.md）

> Agent 领域工具的组织与写法约定（现状沉淀：固化 `src/agent/` 跨 9 个工具已稳定一致的实践）。
> 为什么：9 个工具重复一致的工厂形态、两段式审批、确定性护栏与纯函数单测，需要权威清单约束新增工具。

## 工具形态

- 领域工具一律经 `createDomainTool`（`src/agent/tool-factory.ts`）创建，注册进 `agent.ts` 的 `getTools()` 返回的 `ToolSet`
- 工具内结构化 LLM 调用走 `ctx.callStructured`（zod 契约 + repair ≤2 次 + 降级），不直接调模型
- 业务错误抛 `{ code, message }`（`code` 大写蛇形，如 `JOB_MATCH_REQUIRED`），由工厂统一包装
- 为什么：工厂统一注入模型/日志/错误包装，工具文件不碰横切逻辑

## 文件组织

- **LLM 工具**（需调模型产出结构化结果：analyze-resume / match-job / discover-channels / tailored-resume）三文件：`tools/<name>.ts`（薄壳：校验 + 业务规则 + 落库）、`prompts/<name>.ts`（提示词）、`schemas/<name>.ts`（zod 契约，输入 + 输出同文件）
- **确定性工具**（纯本地逻辑，无 LLM 调用：import-resume / import-job-opportunity / list-resumes / list-job-opportunities / apply-job / record-application-status）单文件 `tools/<name>.ts`（输入 schema 内联或独立 `schemas/` 文件如 apply-job、record-application-status，**不建 prompts**）
- 新增工具在 `agent.ts` 的 `SYSTEM_PROMPT` 能力清单中补一行说明
- 为什么：契约与提示词独立可维护，工具文件保持编排职责；确定性工具无模型调用，prompts 纯属空壳（YAGNI）

## 两段式对话化审批

- 高风险 / 数据变更动作（tailoredResume、applyJob、recordApplicationStatus）采用两段式：
  1. **第一段**（不带 `confirmed`）：只读取/生成摘要，**不落库**，返回给用户确认
  2. **第二段**（带 `confirmed: true`）：校验前置条件后落库
- 执行前校验前置条件并返回明确错误（如岗位未匹配 → `JOB_MATCH_REQUIRED`、岗位未投递 → `NOT_APPLIED`，并附 next 指引）
- 为什么：对外关键动作必须有人工确认点（find-work 经验 #4），两段式复刻对话审批流；状态机严格单向 + 终态不可回退，**所有状态变更落库前确认即反悔机会**

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
