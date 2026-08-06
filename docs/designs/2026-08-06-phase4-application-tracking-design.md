# 第 4 期设计：投递管理闭环（applyJob + 投递状态机）

日期：2026-08-06
状态：完成
关联规范：AGENTS.md（关键硬约束）、plan-document.md
设计依据：`docs/designs/2026-08-04-data-model-design.md`（status 枚举 saved/analyzed/matched/applying/applied/skipped、工具全景 applyJob 契约、过程态不建模）、`docs/designs/2026-08-04-agent-architecture-design.md`（工具全景、对话化审批）、`docs/designs/2026-08-06-phase3-channel-tailored-resume-design.md`（两段式对话化审批模式参考、channels_json）
前置：第 3 期已交付（discoverChannels/tailoredResume、channels_json 落库、专属简历与岗位抽屉区块）

## 1. 范围与决策（2026-08-06 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 四期范围 | **投递管理闭环**：applyJob 工具 + 投递状态机 + 前端状态可见性；投递后阶段（interview/offer/rejected）、投递日期列、外部平台自动投递**留后续期** |
| 2 | 审批流 | **对话化审批**（工具两段式：出摘要 → 用户文字确认 → 推进落库），对齐 tailoredResume 模式；投递为对外关键动作，必须有人工确认点 |
| 3 | 状态机 | `apply`: matched→applying→applied；`skip`: 非终态→skipped；规则为纯函数（可单测） |
| 4 | 数据 | **不加新列、不加新表、不加迁移**；投递时间"活在对话消息里"（过程态不建模原则） |
| 5 | API | **不加新端点**；投递状态由 Agent 对话驱动推进（对话驱动优先），前端只读 |
| 6 | 前端 | StatusBadge 零改动（已支持全部 5 状态）；岗位筛选/抽屉提示按现状最小补充 |

## 2. 工具契约

### applyJob（LLM 工具，两段式对话化审批）

```
输入：{ jobOpportunityId, action: 'apply'|'skip', confirmed?: boolean }

前置校验：
  岗位存在（否则工厂兜底 TOOL_FAILED）
  action='apply'：fitResultJson 非空（未匹配 → JOB_MATCH_REQUIRED）；status ∈ {matched, applying}（否则 STATUS_TRANSITION_INVALID）
  action='skip'：status ∉ {applied}（已投递不可跳过 → STATUS_TRANSITION_INVALID）

第一段（confirmed 缺省）——出投递摘要，不落库：
  1. 读岗位：channelsJson（推荐渠道，verified 优先）+ fitResultJson（三段式投递建议）
  2. 返回：{ ok:true, phase:'preview', jobOpportunityId, currentStatus, targetStatus,
     channels: [{ id, type, label, url, email, verification, riskSignals }], advice }
  3. hint：引导模型向用户呈现"将把岗位从 X 推进到 Y + 推荐渠道（核验状态）"，请求用户确认

第二段（confirmed=true）——状态推进落库：
  1. 重新执行前置校验（防过期状态）
  2. applyStateTransition(currentStatus, action) → 新状态（纯函数，失败 → 对应错误码）
  3. updateJobApplication(id, status) 落库（更新 updatedAt）
  4. 返回：{ ok:true, phase: 推进后状态('applying'|'applied'|'skipped'), jobOpportunityId, status, hint }
```

**错误码**：`JOB_MATCH_REQUIRED`（未匹配投递）、`STATUS_TRANSITION_INVALID`（非法状态转移）。

## 3. 前端展示

| 元素 | 设计 |
|---|---|
| StatusBadge | **零改动**：已支持 saved/matched/applying/applied/skipped 五状态样式与中文标签 |
| 资源库岗位列表 | 确认现有筛选是否覆盖投递状态；若未覆盖，筛选补充"投递中/已投递/已跳过"分组（对齐现有筛选 Tab 交互） |
| 岗位抽屉-投递状态区块 | 当前状态徽标 + 下一步动作的对话引导文案（如"可对助手说：投递该岗位"）；纯展示，无按钮 |
| 对话内交互 | 无新增卡片：摘要与确认全部以文本形式在对话中完成（对话化审批） |

## 4. 数据与 API

- **数据**：`job_opportunities.status` 已就位（迁移 0000），**无新表、无新迁移、无新列**
- **仓储新增** `src/db/repositories/job-opportunities.ts`：
  - `updateJobApplication(id, status)`：status ∈ {applying, applied, skipped}，更新 updatedAt
- **API**：**零改动**（投递状态只由 Agent 对话驱动，前端列表/详情现有返回已含 status）

## 5. 纯函数与单测

| 文件 | 职责 | 单测覆盖 |
|---|---|---|
| `src/agent/apply-state.ts` | 状态机转移规则：`applyStateTransition(status, action)` → `{ ok:true, next } \| { ok:false, code }` | apply 合法链 matched→applying→applied；skip 合法（saved/analyzed/matched/applying→skipped）；非法转移（applied 再 apply、applied skip、未匹配 apply→JOB_MATCH_REQUIRED） |

## 6. 边界与验收

**边界**：
- ❌ 投递后阶段（interview/offer/rejected）状态与跟进
- ❌ 投递日期/备注列（时间活在对话消息里）
- ❌ 外部平台自动投递、渠道页打开
- ❌ 前端按钮直接改状态（对话驱动）
- ❌ 独立状态机表（过程态不建模）

**验收标准**：
1. 对话"投递这个岗位" → applyJob 第一段出摘要（当前/目标状态 + 推荐渠道与核验状态）→ 用户确认 → matched→applying 落库；再次确认 → applying→applied
2. 对话"跳过这个岗位" → skip → skipped 落库
3. 非法操作：applied 岗位再投递/再跳过 → STATUS_TRANSITION_INVALID + hint；未匹配岗位投递 → JOB_MATCH_REQUIRED + hint
4. 岗位列表/抽屉展示投递状态；筛选（如有补充）可用
5. 回归：chat 多步循环、岗位/简历/专属简历列表不受影响；lint/build/单测全绿

## 7. 与实施计划的接口

- 实施顺序：设计/计划文档 → apply-state 纯函数（TDD）→ 仓储 updateJobApplication → applyJob 工具 → 前端补充（筛选/抽屉提示）→ 端到端验证（真实 LLM）→ 验收归档
