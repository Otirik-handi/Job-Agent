# Skill 扩展 + 审计表实现计划（P2-5 批次 C）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增 negotiation / follow-up 两个方法论 skill + actions 审计表（关键动作结构化记录），批次 C 全部落地。

**Architecture:** actions 表（schema + migration + repository）→ run-agent `onToolExecutionEnd` 横切记录（纯函数 `mapToolToAction` 映射动作/提取 entity，可单测）→ 两个 SKILL.md 内容（对齐现有 6 个 skill 的 frontmatter + 分节正文风格）。

**Tech Stack:** drizzle（迁移）、vitest（纯函数+repository 单测）、Markdown（skill 内容）。

**设计文档：** `docs/designs/2026-08-12-skill-extension-audit-design.md`

**关键事实（已核实）**：
- 现有 skill 格式：frontmatter（name/description 含"何时用/前置条件"）+ 中文分节正文（适用场景与边界/维度/流程/模板/诚实边界），约 80-95 行
- run-agent.ts 的 `onToolExecutionEnd` 回调签名：`({ toolCall, toolOutput }) => void`，`toolOutput.output` 为工具结果对象（含 jobOpportunityId/resumeId/taskId 等）
- 审计写入失败不阻塞主流程（对齐 persistSessionState 的 try/catch 降级模式）

---

### Task 1: actions 表（schema + migration + repository）

**Files:**
- Modify: `src/db/schema.ts`
- Generate: `src/db/migrations/0006_*.sql`
- Create: `src/db/repositories/actions.ts`
- Test: `src/db/repositories/actions.test.ts`

- [ ] **Step 1: schema.ts 追加 actions 表**

```ts
export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),          // apply_job / record_status / tailored_resume / import_resume / import_job / plan_create / plan_update
  entityType: text('entity_type').notNull(), // resume / job_opportunity / tailored_resume / plan
  entityId: text('entity_id').notNull(),     // 对象 id（无对象记空串）
  result: text('result').notNull(),          // ok | 结构化错误码（如 JOB_MATCH_REQUIRED）
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('actions_conversation_idx').on(t.conversationId, t.createdAt),
  index('actions_action_idx').on(t.action, t.createdAt),
]);
```

- [ ] **Step 2: 生成并应用迁移**

Run: `npx drizzle-kit generate && npx drizzle-kit migrate`
Expected: 生成 `0006_*.sql`（CREATE TABLE `actions`...）并应用到 dev 库

- [ ] **Step 3: 写失败测试 `src/db/repositories/actions.test.ts`**

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, initDb } from '../index';
import { insertAction, listActions } from './actions';

beforeEach(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterEach(() => {
  initDb(); // 恢复默认连接
});

describe('insertAction / listActions（审计动作存取）', () => {
  it('写入后按会话/动作过滤取回', () => {
    insertAction({ conversationId: 'conv-1', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok' });
    insertAction({ conversationId: 'conv-1', action: 'record_status', entityType: 'job_opportunity', entityId: 'job-1', result: 'NOT_APPLIED' });
    insertAction({ conversationId: 'conv-2', action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-2', result: 'ok' });

    const conv1 = listActions({ conversationId: 'conv-1' });
    expect(conv1).toHaveLength(2);

    const applyOnly = listActions({ action: 'apply_job' });
    expect(applyOnly).toHaveLength(2);

    const both = listActions({ conversationId: 'conv-1', action: 'apply_job' });
    expect(both).toHaveLength(1);
    expect(both[0]).toMatchObject({ entityId: 'job-1', result: 'ok' });
  });

  it('limit 生效且按时间倒序', () => {
    for (let i = 0; i < 5; i++) {
      insertAction({ conversationId: 'conv-3', action: 'import_resume', entityType: 'resume', entityId: `r-${i}`, result: 'ok' });
    }
    const rows = listActions({ conversationId: 'conv-3', limit: 3 });
    expect(rows).toHaveLength(3);
    // 倒序：最新的在前（entityId r-4 最新）
    expect(rows[0].entityId).toBe('r-4');
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `npx vitest run src/db/repositories/actions.test.ts`
Expected: FAIL（actions 模块不存在）

- [ ] **Step 5: 实现 `src/db/repositories/actions.ts`**

```ts
/** actions 审计表存取：关键动作的结构化记录（设计见批次 C 设计文档 §3）。
 * 与 status_history（状态机流转）互补：本表记"动作执行与成败"，详情溯源走 messages。 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { actions } from '../schema';
import { nowIso } from './shared';

export type ActionRecord = {
  id: string; conversationId: string; action: string; entityType: string; entityId: string; result: string; createdAt: string;
};

export function insertAction(args: {
  conversationId: string; action: string; entityType: string; entityId: string; result: string;
}): ActionRecord {
  const record: ActionRecord = { id: randomUUID(), ...args, createdAt: nowIso() };
  db.insert(actions).values(record).run();
  return record;
}

/** 按会话/动作过滤 + limit，createdAt 倒序（最新在前）；条件缺省即不过滤 */
export function listActions(args: { conversationId?: string; action?: string; limit?: number } = {}): ActionRecord[] {
  const conds = [];
  if (args.conversationId) conds.push(eq(actions.conversationId, args.conversationId));
  if (args.action) conds.push(eq(actions.action, args.action));
  const query = db.select().from(actions);
  const rows = conds.length > 0
    ? query.where(ands(conds)).orderBy(desc(actions.createdAt)).limit(args.limit ?? 50).all()
    : query.orderBy(desc(actions.createdAt)).limit(args.limit ?? 50).all();
  return rows;
}

function ands(conds: ReturnType<typeof eq>[]): ReturnType<typeof and> {
  return conds.length === 1 ? conds[0] : and(...conds);
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npx vitest run src/db/repositories/actions.test.ts`
Expected: PASS（2 个用例）

- [ ] **Step 7: 提交**

```bash
git add src/db/schema.ts src/db/migrations/ src/db/repositories/actions.ts src/db/repositories/actions.test.ts
git commit -m "feat: actions 审计表（schema + repository + 过滤查询）"
```

---

### Task 2: mapToolToAction 纯函数 + run-agent 审计钩子

**Files:**
- Create: `src/agent/audit-log.ts`
- Test: `src/agent/audit-log.test.ts`
- Modify: `src/agent/run-agent.ts`

- [ ] **Step 1: 写失败测试 `src/agent/audit-log.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { mapToolToAction } from './audit-log';

describe('mapToolToAction（工具输出 → 审计记录，纯函数）', () => {
  it('applyJob 成功第二段 → apply_job + entityId', () => {
    const rec = mapToolToAction('applyJob', { ok: true, phase: 'applying', jobOpportunityId: 'job-1' });
    expect(rec).toEqual({ action: 'apply_job', entityType: 'job_opportunity', entityId: 'job-1', result: 'ok' });
  });
  it('applyJob 业务失败 → result 记错误码', () => {
    const rec = mapToolToAction('applyJob', { ok: false, error: { code: 'JOB_MATCH_REQUIRED', message: 'x', hint: 'y' } });
    expect(rec).toMatchObject({ action: 'apply_job', result: 'JOB_MATCH_REQUIRED' });
  });
  it('第一段（未确认）不记录', () => {
    expect(mapToolToAction('applyJob', { ok: true, phase: 'preview', jobOpportunityId: 'job-1' })).toBeNull();
  });
  it('recordApplicationStatus 第二段 → record_status', () => {
    const rec = mapToolToAction('recordApplicationStatus', { ok: true, phase: 'interview', jobOpportunityId: 'job-1' });
    expect(rec).toMatchObject({ action: 'record_status', entityId: 'job-1', result: 'ok' });
  });
  it('tailoredResume 第二段 → tailored_resume（entity=tailoredResumeId）', () => {
    const rec = mapToolToAction('tailoredResume', { ok: true, phase: 'generated', tailoredResumeId: 'tr-1', jobOpportunityId: 'job-1' });
    expect(rec).toMatchObject({ action: 'tailored_resume', entityType: 'tailored_resume', entityId: 'tr-1' });
  });
  it('planCreate/planUpdate → plan（entityId=taskId）', () => {
    expect(mapToolToAction('planCreate', { ok: true, taskId: 'weekly' }))
      .toMatchObject({ action: 'plan_create', entityType: 'plan', entityId: 'weekly' });
    expect(mapToolToAction('planUpdate', { ok: true, taskId: 'weekly' }))
      .toMatchObject({ action: 'plan_update', entityType: 'plan', entityId: 'weekly' });
  });
  it('只读工具（listResumes/getMemory/readSkill/webSearch/webFetch）不记录', () => {
    expect(mapToolToAction('listResumes', { ok: true, count: 0 })).toBeNull();
    expect(mapToolToAction('getMemory', { ok: true })).toBeNull();
    expect(mapToolToAction('readSkill', { ok: true })).toBeNull();
    expect(mapToolToAction('webSearch', { ok: true })).toBeNull();
    expect(mapToolToAction('webFetch', { ok: true })).toBeNull();
  });
  it('未知工具不记录', () => {
    expect(mapToolToAction('unknownTool', { ok: true })).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/audit-log.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/agent/audit-log.ts`**

```ts
/** 工具执行 → 审计记录映射（纯函数，可单测）：白名单动作映射 + entity 提取 + 成败判定。
 * 设计：actions 表记"动作执行与成败"，只读工具/第一段预览不记录（噪声 > 价值）。 */
type AuditAction = { action: string; entityType: string; entityId: string; result: string };

const ACTION_MAP: Record<string, { action: string; entityType: string; entityIdFrom: (o: Record<string, unknown>) => string }> = {
  applyJob: {
    action: 'apply_job', entityType: 'job_opportunity',
    entityIdFrom: (o) => (typeof o.jobOpportunityId === 'string' ? o.jobOpportunityId : ''),
  },
  recordApplicationStatus: {
    action: 'record_status', entityType: 'job_opportunity',
    entityIdFrom: (o) => (typeof o.jobOpportunityId === 'string' ? o.jobOpportunityId : ''),
  },
  tailoredResume: {
    action: 'tailored_resume', entityType: 'tailored_resume',
    entityIdFrom: (o) => (typeof o.tailoredResumeId === 'string' ? o.tailoredResumeId : ''),
  },
  importResume: {
    action: 'import_resume', entityType: 'resume',
    entityIdFrom: (o) => (typeof o.resumeId === 'string' ? o.resumeId : ''),
  },
  importJobOpportunity: {
    action: 'import_job', entityType: 'job_opportunity',
    entityIdFrom: (o) => (typeof o.jobOpportunityId === 'string' ? o.jobOpportunityId : ''),
  },
  planCreate: {
    action: 'plan_create', entityType: 'plan',
    entityIdFrom: (o) => (typeof o.taskId === 'string' ? o.taskId : ''),
  },
  planUpdate: {
    action: 'plan_update', entityType: 'plan',
    entityIdFrom: (o) => (typeof o.taskId === 'string' ? o.taskId : ''),
  },
};

/** 两段式工具第一段（preview/suggestions，未落库）不记录 */
function isPreviewPhase(output: Record<string, unknown>): boolean {
  return output.phase === 'preview' || output.phase === 'suggestions';
}

/** 工具输出 → 审计记录；白名单外 / 只读 / 第一段 → null（不记录） */
export function mapToolToAction(toolName: string, rawOutput: unknown): AuditAction | null {
  if (typeof rawOutput !== 'object' || rawOutput === null) return null;
  const output = rawOutput as Record<string, unknown>;
  const def = ACTION_MAP[toolName];
  if (!def) return null;
  if (isPreviewPhase(output)) return null;
  const failed = output.ok === false;
  const errorCode = failed && typeof output.error === 'object' && output.error !== null
    ? (output.error as { code?: unknown }).code
    : undefined;
  return {
    action: def.action,
    entityType: def.entityType,
    entityId: def.entityIdFrom(output),
    result: typeof errorCode === 'string' ? errorCode : 'ok',
  };
}
```

- [ ] **Step 4: `run-agent.ts` 挂审计钩子**

`onToolExecutionEnd` 回调内、会话状态回写之后追加（import `insertAction` 与 `mapToolToAction`）：

```ts
import { insertAction } from '../db/repositories/actions';
import { mapToolToAction } from './audit-log';
// ...
    onToolExecutionEnd: ({ toolCall, toolOutput }) => {
      const toolName = toolCall.toolName;
      // ...原有进度事件与状态回写逻辑不变...
      // 审计记录（横切）：白名单动作写入 actions 表；失败不阻塞主流程（降级模式对齐 persistSessionState）
      try {
        if (toolOutput.type === 'tool-result') {
          const audit = mapToolToAction(toolName, toolOutput.output);
          if (audit) {
            insertAction({ conversationId, ...audit });
          }
        }
      } catch (err) {
        console.error(`[audit] 写入失败 conversationId=${conversationId} tool=${toolName}:`, err);
      }
    },
```

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/agent/audit-log.test.ts`
Expected: PASS（8 个用例）
Run: `npm test`
Expected: 全绿（214 + 8 + 2）

- [ ] **Step 6: 提交**

```bash
git add src/agent/audit-log.ts src/agent/audit-log.test.ts src/agent/run-agent.ts
git commit -m "feat: 审计钩子（mapToolToAction 纯函数 + runAgentTurn 横切记录）"
```

---

### Task 3: negotiation skill

**Files:**
- Create: `skills/negotiation/SKILL.md`

- [ ] **Step 1: 创建 `skills/negotiation/SKILL.md`**（对齐现有 skill 的 frontmatter + 分节风格）

````markdown
---
name: negotiation
description: 谈薪策略技能：收到 offer 后按"前置信息收集 → 评估排序 → 谈判策略 → 话术模板 → 书面确认"五步谈薪，提供可谈性分档、锚定报价与让步预设。何时用：用户提出谈薪诉求（"薪资怎么谈/帮我谈薪/这个 offer 能再要点吗"）或 offer-evaluation 之后；前置条件：至少一个 offer 的关键参数（薪资/级别等）；信息不全先列出待补充项。市场基准数据当前由用户提供（web 工具落地后可辅助检索）。
---

# 谈薪策略

## 1. 适用场景与边界

- 适用：拿到 offer 后谈薪资、多 offer 之间压价博弈、接受 offer 前的书面确认
- 边界：**所有数字基于用户提供的真实信息**，不虚构竞争 offer、不夸大金额；市场基准数据缺失时明确标注"待补充"，不编造行业数字
- 产出：可谈性分档表 + 报价策略 + 话术模板 + 让步预设 + 止损线

## 2. 前置信息收集

- 当前 offer 全参数：base 月薪 × 月份数、年终奖（保底 vs 浮动）、期权/股票（估值/归属期/行权价）、签字费、补贴（房补/餐补/交通）、级别、年假、远程政策、通勤
- 用户期望与底线：期望薪资、可接受最低值、非薪资诉求（级别/远程/年假）
- 市场基准：**向用户索取**（同岗朋友/招聘平台数据/猎头反馈），并请用户标注来源与可信度；批次 D 落地后可引导 webSearch/webFetch 辅助检索
- 输出：一份"offer 参数清单 + 期望/底线 + 基准区间"的整理文本

## 3. 评估与排序（可谈性分档）

- 硬项（难谈）：base 月薪（各公司薪酬体系最刚性）
- 中项（可谈）：奖金比例、签字费、级别（职级影响后续涨幅）、股票数量
- 软项（易谈）：补贴、年假天数、远程政策、报销额度、入职时间
- 关键动作：**统一口径**——把期权/浮动奖金折算成"年化预期"再比；浮动部分标注"不确定"，谈判中不与保底混谈

## 4. 谈判策略

- 先表达兴趣再谈："很感兴趣，想确认几个细节"——不要一上来就压价
- 锚定报价：给**区间**而非单一数字（区间下限 = 期望值，上限 = 略高于期望），并附一句依据（"基于我的经验和市场行情"）
- 一次只谈 1-2 个点：谈完 base 再谈签字费，不要同时抛 5 个诉求
- 让步预设：提前想好"如果 X 不动，能否补 Y"（如 base 不动 → 签字费/年假/级别）；把让步做成交换而非白送
- 谈崩止损线：用户底线明确后，低于底线不勉强；不因怕失去 offer 而接受低于底线的条件（用户决定）

## 5. 话术模板

- 开场（口头/邮件）："感谢 offer。我对这个岗位和团队很感兴趣，想就薪资构成确认几点：…"
- 区间报价："基于我的经验和市场行情，我期望的区间是 X–Y（年包口径），其中 base 部分希望是 Z。"
- 面对压价（"这是我们能给的上限"）："我理解预算约束。能否在非薪资项上补偿，比如签字费或年假？"
- 书面确认（接受前）："请以书面形式确认以下条款：base、奖金、股票、级别、入职时间——确认后我这边推进流程。"

## 6. 诚实边界

- 不虚构竞争 offer；不夸大其他 offer 金额；不编造市场数据
- 谈判中的不确定项（期权价值/奖金浮动）如实标注，不承诺无法验证的收益
- 用户底线由用户设定，本 skill 只提供策略不替用户做最终决定
````

- [ ] **Step 2: 验证 skill 可被系统识别**

Run: `npx vitest run src/agent/skills.test.ts`
Expected: PASS（listSkillMetadata 自动发现新 skill；若该测试断言了 skill 数量需同步更新——以实际测试输出为准）

- [ ] **Step 3: 提交**

```bash
git add skills/negotiation/SKILL.md
git commit -m "feat: negotiation 谈薪策略 skill"
```

---

### Task 4: follow-up skill

**Files:**
- Create: `skills/follow-up/SKILL.md`

- [ ] **Step 1: 创建 `skills/follow-up/SKILL.md`**

````markdown
---
name: follow-up
description: 求职跟进话术技能：投递后/面试后/被拒后/offer 等待期的跟进时机与话术模板，含时间线、频率控制与诚实边界。何时用：用户询问"投递后怎么跟进/面试完要不要发感谢信/被拒了怎么问反馈/offer 等多久"等场景；前置条件：了解当前求职阶段（已投递/已面试/已收 offer）。
---

# 求职跟进话术

## 1. 适用场景与边界

- 适用：投递后无回音的跟进、面试后的感谢与追问、被拒后的反馈请求、offer 等待期的节奏管理
- 边界：不代发消息（提供话术由用户自选发送）；不催促无果的流程；不虚构面试表现或联系理由
- 产出：按阶段给出跟进时机、模板话术与频率建议

## 2. 跟进时间线

- 投递后：3-7 天无回音 → 首次跟进（附简历/项目更新钩子）
- 面试后：24h 内感谢信；5-7 天无消息 → 二次跟进（询问流程进度）
- 被拒后：收到通知 1-2 天内礼貌请求反馈（可选，看用户意愿）
- offer 等待期：超过 HR 承诺时间 1 周 → 温和询问；不反复催促（同渠道最多 2 次，间隔 ≥5 天）

## 3. 投递后跟进

- 时机：3-7 天无回音
- 内容：表达持续兴趣 + 1 个新增信息点（简历更新/项目完成/技能补充）+ 开放询问
- 模板："您好，我是 X 月 X 日投递「岗位名」的 [姓名]。想跟进一下进展，同时分享一个近况：[新信息]。如有需要补充材料请随时告知，谢谢！"

## 4. 面试后感谢信

- 时机：面试结束 24h 内（尽量当天）
- 内容：感谢 + 复述 1-2 个面试中的亮点（具体到细节）+ 表达持续兴趣
- 模板："感谢今天的面谈，和您聊「XX 话题」很有收获。尤其「复述亮点」让我对这个岗位的理解更深了。期待后续进展，如有需要我可以补充 [材料]。"

## 5. 被拒后反馈追问

- 时机：收到拒绝通知 1-2 天内，用户愿意时
- 内容：接受结果 + 请求具体反馈（技能缺口/经验匹配/沟通表现），用于改进
- 模板："感谢通知。想冒昧请教：本次不匹配的主要原因是技能/经验还是岗位方向？您的反馈对我后续提升很有帮助。祝一切顺利。"

## 6. 频率与边界

- 同渠道最多跟进 2 次；间隔 ≥5 天；HR 已明确"流程中"后不再催促
- 不虚构面试表现、不编造联系理由、不威胁性表达（"我收到别家 offer 了"只在真实存在时可用）
- 话术由用户选择与发送，agent 不代发（无代发渠道）
````

- [ ] **Step 2: 验证 + 提交**

Run: `npx vitest run src/agent/skills.test.ts`
Expected: PASS

```bash
git add skills/follow-up/SKILL.md
git commit -m "feat: follow-up 求职跟进话术 skill"
```

---

### Task 5: 全量验证 + 文档收尾

**Files:**
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/designs/2026-08-10-agent-roadmap-discussion.md`

- [ ] **Step 1: 全量验证**

Run: `npm test && npm run lint && npx tsc --noEmit && npm run build`
Expected: 全绿（214 + 批次 C 新增）+ build 通过

- [ ] **Step 2: PROJECT_STATUS 更新**

P2 队列第 5 项改为：

```markdown
5. **其他增强** 🟡 部分落地（2026-08-12）：token 监控已随批次 A 落地（评测 CLI usage 统计）；批次 C 完成——negotiation/follow-up skill + actions 审计表；company-research/salary-benchmark 挂起等批次 D web 工具
```

批次说明行更新执行顺序：`实现批次：A ✅ → C ✅ → B（语义检索）→ D（web 工具，计划就绪）`。测试数更新（214 + 批次 C 新增，以实际为准）。

- [ ] **Step 3: 讨论纪要追加实现状态**

`docs/designs/2026-08-10-agent-roadmap-discussion.md` 的 P2-5 节末尾追加：

```markdown
- 实现：2026-08-12 批次 C 落地（negotiation/follow-up skill + actions 审计表 + runAgentTurn 横切记录钩子）
```

- [ ] **Step 4: 提交**

```bash
git add PROJECT_STATUS.md docs/designs/2026-08-10-agent-roadmap-discussion.md
git commit -m "docs: 批次 C 验收（skill 扩展 + 审计表落地）并更新状态文件"
```

---

## 计划自审记录

- **规格覆盖**：设计文档 §2（skill 框架/内容）→ Task 3/4 完整 SKILL.md；§3（表结构/动作枚举/写入时机/检索形态）→ Task 1/2；§4 不做项 → 无越界；§5 文档链 → Task 5。
- **类型一致性**：`insertAction`/`listActions`/`mapToolToAction` 签名在 Task 1/2 定义与引用一致；`mapToolToAction` 返回 `{ action, entityType, entityId, result }` 与 `insertAction` 参数（+conversationId）兼容。
- **占位符扫描**：无 TODO/待定；两个 SKILL.md 为完整正文。
- **自审修正**：listActions 用 `and(...conds)` 组合条件（drizzle 0.45 的 and 接受多个条件），单条件时直接用；`actions` 表名与既有 `actions` 语义无冲突（无同名表）。
