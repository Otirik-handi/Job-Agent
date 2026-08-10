# 第二期：Agent 工具层补强 + 审批分级（P0 第 4-5 项）

日期：2026-08-10
状态：草稿
目标：让工具层"选得准、错得明、认得分"——工具描述按规范重写（模型选对工具）、结构化错误回传（模型自愈）、输入严格校验（非法调用在工厂层拦截）、审批三档分级（确认强度匹配动作成本）。
关联规范：`.agents/specs/03-agent/agent-tooling-conventions.md`（需更新）、`.agents/specs/00-governance/plan-document.md`
依据：`docs/designs/2026-08-10-agent-architecture-research.md`、`docs/designs/2026-08-10-agent-roadmap-discussion.md`（第 4-5 项定稿）

## 范围

- 11 个工具 description 按 3-4 句规范重写（做什么/何时用/何时不用/参数含义/返回什么）
- 结构化执行错误统一（code/message/hint 透传，不再剥成 TOOL_FAILED；对齐 MCP isError 语义）
- zod inputSchema strict 化（禁止多余字段）
- 审批三档：只读免确认（现状已是）/ recordApplicationStatus 轻量确认 / applyJob、tailoredResume 保持两段式强确认
- 不做：工具改名/前缀、outputSchema 校验、权限白名单记忆（P1）

## 任务清单

- [ ] **T0 规范先行**：更新 `03-agent/agent-tooling-conventions.md`
  - [ ] 工具描述规范：3-4 句结构（做什么/何时用/不用/参数/返回）写入规范
  - [ ] 错误契约：统一结构化错误（code/message/hint），禁止在工厂层剥信息
  - [ ] 审批分档约定：只读免确认 / 可逆轻量确认 / 不可逆强确认（fail-closed）
  - ✅ **Checkpoint A**：规范文档更新完成并提交
- [ ] **T1 description 重写（11 个工具）**
  - [ ] importResume / listResumes / analyzeResume / importJobOpportunity / listJobOpportunities
  - [ ] matchJob / discoverChannels / prepareInterview
  - [ ] tailoredResume / applyJob / recordApplicationStatus（重点补前置条件与两段式契约）
  - ✅ **Checkpoint B**：SYSTEM_PROMPT 工具清单与工具文件 description 同步一致，lint/tsc 通过
- [ ] **T2 结构化错误改造**
  - [ ] `tool-factory.ts`：catch 不再包 `{code:'TOOL_FAILED'}`，透传工具抛出的结构化错误（code/message/hint 保持原样给模型）
  - [ ] 各工具错误路径统一为结构化抛出（含 hint 的"发生了什么+下一步试什么"）；复用 apply-job/record-application-status 已有 hint 基础
  - [ ] 新增 tool-factory 错误透传单测（错误信息不被剥）
  - ✅ **Checkpoint C**：单测 + 手动场景（未匹配岗位 applyJob → 模型读到 JOB_MATCH_REQUIRED + hint 后自愈走 matchJob）
- [ ] **T3 zod strict 化**
  - [ ] 11 个 inputSchema 加 strict 语义（确认项目 zod 版本，v3 用 `.strict()` / v4 用 `z.strictObject` 等价）
  - [ ] 工厂层（createDomainTool）对非法参数输入生成可行动错误（工厂拦截，不进 execute）
  - ✅ **Checkpoint D**：多余字段/缺失必填在工厂层被拒（单测验证），lint/tsc 通过
- [ ] **T4 审批分级：recordApplicationStatus 降轻量确认**
  - [ ] 后端：保持工具两段式逻辑（无 confirmed 出摘要 / 带 confirmed 落库），SYSTEM_PROMPT 改为"摘要后由用户点确认按钮，不再要求模型在对话中请求第二次 confirmed 调用"
  - [ ] 前端：recordApplicationStatus 摘要卡片加内置"确认记录"按钮（自动携带 confirmed=true 二次调用），替换对话式确认；提供"记录有误可告诉助手纠正"提示
  - [ ] applyJob/tailoredResume 两段式强确认保持不变（回归验证）
  - ✅ **Checkpoint E**：手动验证——记录状态仅一次轻量确认完成；applyJob 仍是对话两段式
- [ ] **T5 验证收尾**：`npm run lint && npx tsc --noEmit` 通过；既有单测（apply-state/channel-guard/llm-call/resume-*）全绿；主流程回归（导入→匹配→专属简历→投递→状态记录）

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点，中断后从最近未完成 checkpoint 继续
- T0 先行（规范先行原则）；T1-T4 均依赖 T0，彼此独立可并行

## 验收标准

1. 工具描述全部符合 3-4 句规范，SYSTEM_PROMPT 同步
2. 工具错误以结构化 code/message/hint 到达模型，未匹配投递场景模型可自愈
3. 非法参数在工厂层被拒，不进 execute
4. recordApplicationStatus 轻量确认生效；applyJob/tailoredResume 强确认不变
5. 全量 lint/tsc/单测通过
