# 第 5 期设计：投递后阶段（recordApplicationStatus + 投递后状态机）

日期：2026-08-09
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）、plan-document.md、`.agents/specs/02-backend/api-data-conventions.md`、`.agents/specs/03-agent/agent-tooling-conventions.md`
设计依据：`docs/designs/2026-08-06-phase4-application-tracking-design.md`（决策 #1"投递后阶段留后续期"、状态机、两段式审批）、`docs/designs/2026-08-04-data-model-design.md`（status 枚举、过程态不建模）、`.agents/specs/03-agent/agent-tooling-conventions.md`（确定性工具、两段式对话化审批）、`.agents/specs/02-backend/api-data-conventions.md`（status 枚举）
前置：第 4 期已交付（applyJob 两段式 + 投递状态机 + 前端状态可见性）

## 1. 范围与决策（2026-08-09 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 本期范围 | **投递后阶段**：新增 `interview` / `offer` / `hired` / `rejected` 状态记录；外部平台自动投递**不在本期**（同第 4 期边界） |
| 2 | 状态范围 | 在 phase4 遗留三状态（interview/offer/rejected）基础上补 **hired**（接受 offer/入职），覆盖投递后完整链路 |
| 3 | 转移规则 | **严格单向 + 终态**：`applied→interview→offer→hired`；`applied`/`interview`/`offer` 任一→`rejected`；`rejected`/`hired` 为终态 |
| 4 | 日期建模 | **不加列不加迁移**：投递时间用 `updatedAt` 近似（推进到 `applied` 时刷新），守住"过程态不建模" |
| 5 | 审批流 | **混合（按发起方划分）**：applyJob 保持两段式（Agent 发起的对外动作）；投递后状态记录单段直接落库（用户报告的外部事实） |
| 6 | 工具形态 | 新增确定性工具 **recordApplicationStatus**（单文件 + 输入契约，不建 prompts）；applyJob 保持纯粹（只到 applied/skipped） |
| 7 | 规范同步 | 02-backend status 枚举补四状态；03-agent 审批流补"按发起方划分"边界 |

## 2. 状态机（纯函数）

### 2.1 新增转移函数

`src/agent/apply-state.ts` 新增 `applicationOutcomeTransition(status, target)`，与现有 `applyStateTransition` 并存：

| 当前状态 | target | 结果 |
|---|---|---|
| applied | interview | interview |
| interview | offer | offer |
| offer | hired | hired |
| applied / interview / offer | rejected | rejected |
| rejected / hired | 任意 | `STATUS_TRANSITION_INVALID`（终态） |
| saved / analyzed / matched / applying / skipped | 任意 | `NOT_APPLIED`（尚未投递） |

错误码：`NOT_APPLIED`（新增）、`STATUS_TRANSITION_INVALID`（复用现有）。

### 2.2 与现有 applyStateTransition 的关系

两者并存不合并：
- `applyStateTransition` 管**投递动作**（apply/skip），Agent 发起、两段式
- `applicationOutcomeTransition` 管**投递后结果记录**，用户报告、单段式

语义分界与审批流边界（决策 #5）一致，规则为纯函数（可单测）。

## 3. 工具契约

### recordApplicationStatus（确定性工具，单段式）

```
输入：{ jobOpportunityId, target: 'interview' | 'offer' | 'hired' | 'rejected' }

前置校验：
  岗位存在（否则工厂兜底 TOOL_FAILED）
  当前状态 ∈ {rejected, hired} → STATUS_TRANSITION_INVALID（终态不可再记录）
  当前状态未 applied → NOT_APPLIED（"该岗位尚未投递，无法记录投递后状态"，附 next 指引先投递）

转移校验：
  applicationOutcomeTransition(current, target) 非法 → STATUS_TRANSITION_INVALID
  （如 applied 直接 hired、interview 直接 hired）

落库：
  updateJobApplication(id, target)（仓储 status 类型扩展后）

返回：
  { ok: true, jobOpportunityId, currentStatus, targetStatus, hint }
  hint：引导模型向用户回执"已记录：applied → interview"，并提示下一步可推进的状态
```

- **无 confirmed 字段**（单段式）：用户报告外部事实，Agent 忠实记录，不请求确认
- **执行前重读岗位状态**：防多会话/并发下过期状态误覆盖（与 applyJob 第二段同模式）

## 4. 前端可见性

| 元素 | 设计 |
|---|---|
| `StatusBadge` | 新增四状态样式 + 中文标签：`interview` 天蓝（sky）、`offer` 紫（violet）、`hired` teal 深绿、`rejected` 红（red）；现有五状态零改动 |
| 岗位筛选 Tab | 现有五枚（全部/已匹配/投递中/已投递/已跳过）后补四枚（面试中/offer/已入职/已拒绝），共九枚；已有 `flex-wrap` 自动换行，零样式改动 |
| 岗位抽屉投递状态区块 | 各状态补对话引导文案：`interview`→"可对助手说：记录面试结果（offer/拒绝）"；`offer`→"可对助手说：接受 offer 入职"；`rejected`→"已拒绝，可删除该岗位或匹配其他机会"；`hired`→"已入职，此岗位已完结" |
| 岗位列表项 | 零改动（StatusBadge 自动覆盖） |

## 5. 数据与 API

- **数据**：`job_opportunities.status` 列已就位；**不加列、不加表、不加迁移**
- **仓储**：`updateJobApplication(id, status)` 的 status 类型扩展为 `'applying' | 'applied' | 'skipped' | 'interview' | 'offer' | 'hired' | 'rejected'`（仅 TS 类型，无 SQL 变更）
- **API**：**零改动**（前端列表/详情现有返回已含 status）

## 6. 规范同步（先改规范再改代码）

| 规范 | 修订 |
|---|---|
| 02-backend `status` 枚举 | 补 `interview` / `offer` / `hired` / `rejected` |
| 03-agent 审批流 | 补"按发起方划分"边界：Agent 发起的对外动作（applyJob/tailoredResume）两段式；用户报告的外部事实（投递后状态记录）单段直接落库 |

## 7. 纯函数与单测

| 文件 | 职责 | 单测覆盖 |
|---|---|---|
| `src/agent/apply-state.ts` 新增 `applicationOutcomeTransition` | 投递后状态转移 | applied→interview→offer→hired 合法链；三态→rejected；rejected/hired 终态非法转移；未 applied → NOT_APPLIED |

## 8. 边界与验收

- ❌ 外部平台自动投递（同第 4 期边界）
- ❌ 投递日期独立列（用 updatedAt 近似）
- ❌ 面试/offer 事件明细建模（过程态不建模，对话消息追溯）
- 验收：对话中"进入面试了"→ 记录 interview 落库 + 前端徽标/筛选/抽屉联动；"被拒了"/"收到 offer"/"入职了"同理；终态后再记录返回明确错误
