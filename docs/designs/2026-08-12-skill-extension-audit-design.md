# Skill 扩展 + 审计表设计（P2-5 批次 C）

日期：2026-08-12
状态：已定稿（讨论纪要 P2-5），待写实现计划
依据：`docs/designs/2026-08-10-agent-roadmap-discussion.md` P2-5 定稿
关联：批次 D（web 工具）落地后，company-research / salary-benchmark 解锁（本批次明确不做）

---

## 1. 背景与目标

P2-5 定稿中的两项小投入落地：

1. **skill 库扩展**：新增 `negotiation`（谈薪策略）+ `follow-up`（跟进话术）两个方法论 skill——纯内容工作、零外部依赖（与批次 D 的 web 工具解耦；company-research / salary-benchmark 挂起等 web 工具）
2. **轻量 actions 审计表**：记录关键动作（applyJob / recordApplicationStatus / tailoredResume 等）的结构化动作日志——messages + status_history 已是事实审计基础，actions 表补"结构化快速检索"

执行顺序调整（2026-08-12 用户决议）：按工程量从小到大 —— 批次 C（~3-5h）→ 批次 B 语义检索（~4-6h）→ 批次 D web 工具（~9-15h）。

## 2. skill 设计

### 2.1 通用约定（对齐现有 6 个 skill 的结构）

- 目录：`skills/<name>/SKILL.md`（frontmatter name/description + 正文 ≤500 行）
- 元数据常驻 system prompt（readSkill 按需加载正文，机制不变）
- 内容要求：具体可执行的流程 + 话术模板 + 诚实边界（不虚构 offer/不编造信息）

### 2.2 negotiation（谈薪策略）

触发时机：用户获得 offer 后（offer-evaluation 之后、接受 offer 之前）；用户在对话中提出谈薪诉求。

正文框架（5 节）：
1. **前置信息收集**：当前 offer 全参数（base/奖金/股票/补贴/级别/年假/通勤）、用户期望值、可接受底线；市场基准数据——**当前引导用户提供**（批次 D 落地后升级为 webSearch/webFetch 辅助检索）
2. **评估与排序**：按"可谈性"分档（base 最硬、奖金/签字费/级别次之、补贴/年假/远程最软）；总包 vs 月薪口径换算
3. **谈判策略**：先表达兴趣再谈；锚定（给出带依据的期望区间而非单一数字）；一次只谈 1-2 个点；让步条件预设（"如果 base 不动，能否补签字费"）
4. **话术模板**：开场邮件/口头表达、区间报价、面对压价的回应、书面确认话术
5. **诚实边界**：不虚构竞争 offer、不夸大其他offer金额；所有数字基于真实信息；谈崩止损线（用户底线）

### 2.3 follow-up（跟进话术）

触发时机：投递后无回音、面试后、被拒后、offer 等待期。

正文框架（5 节）：
1. **跟进时间线**：投递后 3-7 天首次跟进；面试后 24h 内感谢信；面试后 5-7 天无消息二次跟进；被拒后礼貌追问反馈（可选）
2. **投递后跟进**：邮件/站内信模板（附简历更新/项目补充钩子）
3. **面试后感谢信**：模板（感谢 + 复述 1-2 个亮点 + 表达持续兴趣）
4. **被拒后反馈追问**：礼貌请求具体反馈（技能缺口/经验匹配），用于后续改进
5. **频率与边界**：同渠道最多跟进 2 次、间隔 ≥5 天；不催促无果的流程（HR 流程时间）；诚实边界：不虚构面试表现

## 3. actions 审计表设计

### 3.1 表结构

```sql
actions(
  id            text primary key,        -- randomUUID
  conversation_id text not null,          -- 会话 id（与 messages 关联溯源）
  action        text not null,            -- 动作枚举（见 3.2）
  entity_type   text not null,            -- 对象类型：resume / job_opportunity / tailored_resume / plan
  entity_id     text not null,            -- 对象 id（可为空串表示无对象）
  result        text not null,            -- ok | 结构化错误码（如 JOB_MATCH_REQUIRED）
  created_at    text not null
)
-- 索引：conversation_id + created_at；action + created_at
```

- 与 `status_history` 的关系：status_history 记**状态机流转**（from→to），actions 记**动作执行**（做了什么、成败）；两者互补不重叠
- 不存敏感原文（动作参数/正文不入表；entity_id 足够溯源，详情查 messages）

### 3.2 动作枚举（首批）

| action | 触发点 | entity |
|---|---|---|
| `apply_job` | applyJob 第二段（confirmed=true，落库成功或失败） | job_opportunity |
| `record_status` | recordApplicationStatus 第二段（confirmed=true） | job_opportunity |
| `tailored_resume` | tailoredResume 第二段（confirmedEdits 生成） | tailored_resume |
| `import_resume` / `import_job` | importResume / importJobOpportunity 成功 | resume / job_opportunity |
| `plan_create` / `plan_update` | planCreate / planUpdate 成功 | plan（entity_id=taskId） |

- 只读工具（list*/getMemory/readSkill/webSearch/webFetch）不记录（噪声 > 价值）
- 失败动作也记录（result=错误码）——审计价值在于"尝试了什么、结果如何"

### 3.3 写入时机（横切，不改工具）

- 在 `run-agent.ts` 的 `onToolExecutionEnd` 统一记录（与进度事件/会话状态回写同层）：
  - 动作映射表：toolName → action 枚举（白名单，未知工具不记）
  - result：业务失败（`{ok:false, error.code}`）记错误码；成功记 `ok`
  - entity：从工具输出提取（jobOpportunityId / resumeId / taskId / tailoredResumeId；提取不到记空串）
- 纯函数 `mapToolToAction(toolName, output): ActionRecord | null`（可单测）——对齐"纯函数+单测"规范

### 3.4 检索形态（设计决策）

- **不新增 Agent 工具**：审计表是"事实审计的补充 + 用户可查"；Agent 需要追溯时走 messages/status_history（已有通道）
- 提供 repository 函数：`listActions({ conversationId?, action?, limit })`（供 UI 后续使用，本批次只做 repository + 单测）
- 写入失败不阻塞主流程（try/catch 降级，对齐 persistSessionState 模式）

## 4. 明确不做（本批次范围外）

- company-research / salary-benchmark skill（挂起，等批次 D web 工具）
- 审计 UI / 报表（repository 就绪后按需）
- 审计表写 UI 展示（无前端需求）

## 5. 文档链

- 本设计 → 实现计划（`docs/plans/2026-08-12-skill-extension-audit.md`）→ PROJECT_STATUS 更新
- 定稿记录已在讨论纪要 P2-5
