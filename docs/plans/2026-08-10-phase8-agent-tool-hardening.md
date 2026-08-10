# 第二期：Agent 工具层补强 + 审批分级（P0 第 4-5 项）

日期：2026-08-10
状态：完成（2026-08-10 验收通过，分支 phase8-agent-tool-hardening）
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

- [x] **T0 规范先行**：更新 `03-agent/agent-tooling-conventions.md`——工具描述 3-4 句规范、结构化错误契约（code/message/hint、废止 TOOL_FAILED 全包、TOOL_FAILED 仅兜底）、审批三档分档（只读免确认/可逆轻量/不可逆强确认 + fail-closed）——提交 30034dd、42d8c88，审查通过
- [x] **T1 description 重写（13 个工具）**
  - [x] 11 个既有工具按 5 要素（做什么/何时用/不用与前置/参数/返回）重写；两段式工具写明 confirmed 契约与前置失败 next step；getMemory/setMemory 检查补齐
  - [x] SYSTEM_PROMPT 能力清单 7 处同步（前置条件补全，与 description 无矛盾）
  - ✅ **Checkpoint B**：提交 2fd42ff + e1ec124（审查发现 applyJob skip 边界描述与状态机不符，修正为"仅 applied 不可跳过"）
- [x] **T2 结构化错误改造**
  - [x] 统一契约：成功 `{ok:true,...}` / 失败 `{ok:false, error:{code,message,hint}}`；13 工具全统一；7 处业务 throw 改结构化返回；新错误码（JOB_NOT_FOUND/RESUME_NOT_FOUND/TEXT_TOO_LONG/MEMORY_LIMIT_EXCEEDED 等）
  - [x] 工厂改造：ToolExecutionError 透传 + TOOL_FAILED 仅未知异常兜底，不再剥信息
  - [x] 新增测试：tool-factory 透传/兜底 5 例 + apply-job 业务失败 4 例
  - ✅ **Checkpoint C**：提交 42909eb + 2a78f32，69 测试全绿
- [x] **T3 zod strict 化**
  - [x] 13 个工具输入 schema 全部 z.strictObject（zod v4；嵌套 confirmedEdits 也 strict）；输出契约 schema（LLM 输出用）未误改
  - [x] 工厂 execute 前 safeParse 拦截：INVALID_INPUT 结构化错误（中文逐字段描述 + hint），业务 execute 不执行；与 AI SDK 内置校验共存（SDK 先拒，工厂兜底直接 execute 路径）
  - [x] 顺手修复 apply-job schema action describe（skip 边界与状态机一致）
  - [x] 新增 INVALID_INPUT 4 例测试
  - ✅ **Checkpoint D**：提交 41c4aad，73 测试全绿
- [x] **T4 审批分级：recordApplicationStatus 降轻量确认**
  - [x] 前端新增 record-status-card.tsx：预览摘要卡 + 「确认记录」按钮（自动发送确认消息触发 confirmed=true 第二段），防重复点击，附"记录有误可告诉助手纠正"提示
  - [x] SYSTEM_PROMPT/工具 description/schema describe 三层同步（确认由界面按钮完成）
  - [x] applyJob/tailoredResume 两段式强确认零改动（回归验证）
  - [x] 顺手优化：业务失败（{ok:false,error}）进度卡片显示失败态（route.ts 判定 + tool-progress-card 红色失败态）
  - ✅ **Checkpoint E**：提交 ea21f5c，build 通过
- [x] **T5 验证收尾**：`npm run lint && npx tsc --noEmit` 通过；73/73 测试全绿；`npm run build` 生产构建通过

## 验收记录（2026-08-10）

1. ✅ 13 个工具 description 全部符合 3-4 句规范（5 要素），SYSTEM_PROMPT 同步无矛盾
2. ✅ 工具错误结构化返回（code/message/hint）到达模型，工厂不再剥信息（TOOL_FAILED 仅兜底）；单测覆盖透传/兜底/业务失败
3. ✅ 非法参数在工厂层被拒（INVALID_INPUT 中文可行动错误），不进业务 execute
4. ✅ recordApplicationStatus 轻量确认（前端确认按钮）生效；applyJob/tailoredResume 强确认不变
5. ✅ 全量 lint/tsc/73 测试/build 通过

已知限制（后续处理）：SDK 生产路径的非法参数先被 AI SDK 英文校验拒绝（中文 INVALID_INPUT 仅直接 execute 路径生效，可自定义 repairToolCall 增强）；历史会话恢复后已确认过的预览卡片仍显示「待确认」（重复点击被状态机 fail-closed 拦截，无损害）；部分 hint 未带"发生了什么"前缀（既有文案迁移）。

## 依赖与恢复

- 每项以 ✅ Checkpoint 为恢复点，中断后从最近未完成 checkpoint 继续
- T0 先行（规范先行原则）；T1-T4 均依赖 T0，彼此独立可并行

## 验收标准

1. 工具描述全部符合 3-4 句规范，SYSTEM_PROMPT 同步
2. 工具错误以结构化 code/message/hint 到达模型，未匹配投递场景模型可自愈
3. 非法参数在工厂层被拒，不进 execute
4. recordApplicationStatus 轻量确认生效；applyJob/tailoredResume 强确认不变
5. 全量 lint/tsc/单测通过
