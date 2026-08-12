# 评测基线设计（P2-1）

日期：2026-08-11
状态：已定稿，待写实现计划
依据：`docs/research/2026-08-10-agent-architecture-research.md`（路线图第 11 项）
关联：`docs/research/2026-08-10-agent-roadmap-discussion.md`（P2 讨论纪要）

---

## 1. 背景与目标

当前 184 个测试全部为纯函数单测，Agent 编排层（skills/plans/lessons/summary/审批链）无行为级验证手段。改动工具行为或 prompt 后只能靠手测，回归风险随 P1 落地持续上升。

**目标：双层评测基线，为后续所有 Agent 层改动提供行为级安全网。**

| 层 | 用途 | 执行方式 | 特性 |
|---|---|---|---|
| mock 层 | 防编排回归（工具链/审批/状态机/终态落库） | 入 vitest，随 `npm test` 每轮跑 | 确定性、免费、秒级 |
| 真实模型层 | 能力验证（模型对求职场景的端到端完成度） | `npm run eval` 独立 CLI，里程碑/发布前手动跑 | 有随机性，pass^2 应对 |

两层共用同一批场景定义（用户消息序列 + 终态断言），仅 LLM 后端不同：mock 层注入 scripted 假模型，真实层注入 `getModel()`。

## 2. 关键设计决策

| 决策点 | 结论 | 理由 |
|---|---|---|
| 评测目标 | 双层（mock 防回归 + 真实能力验证），先建 mock 层 | mock 便宜且立刻见效；真实层补 mock 测不到的 prompt/模型行为变化 |
| 场景集原则 | 混合：高频实用打底 + 编排压力压边界 | 核心流程不退化 + 编排问题可测 |
| 场景数量 | 起步 13 个，跑顺再扩 | 调研报告 20-30 个为远期数字，精选起步 |
| Runner 形态 | mock 入 vitest（`eval.test.ts`）+ 真实层独立 CLI（`run-eval.cli.ts`） | 防回归随 npm test 自动生效；真实层不污染测试时耗 |
| pass^k | pass^2 起步，k 为 CLI 参数 | 成本可控且对随机性有基本韧性 |
| DB 隔离 | 每场景独立 `:memory:` 临时库，跑完即弃 | 互不污染，优于现有"直连 dev 库"的测试基建 |
| Mock 注入 | 实现 `LanguageModel` 接口，`runAgentTurn` 注入 model 参数 | 业务代码零改动 |

## 3. 架构与目录

```
tests/eval/
  scenarios/          ← 13 个场景定义（mock/真实两层复用）
  mock-model.ts       ← scripted LanguageModel（按调用序号返回预设响应）
  runner.ts           ← 共享执行器（临时库 → setup → 逐条发消息 → 断言）
  eval.test.ts        ← mock 层入口（vitest 自动发现）
  run-eval.cli.ts     ← 真实层 CLI 入口（npm run eval）
```

数据流（单场景）：

```
建 :memory: 临时库 + migrations
  → setup(ctx) 注入初始数据（简历/JD/匹配状态等）
  → 逐条 userMessages：runAgentTurn({ conversationId, messages, model })
  → assertFinalState(ctx) 断言 DB 终态 + 消息流
  → 返回 { ok, error, messageCount, toolCallCount }
```

## 4. 前置小重构（为可测性，仅两处）

### 4.1 抽取核心函数 `runAgentTurn`（新增 `src/agent/run-agent.ts`）

从 `app/api/chat/route.ts` 的 POST 中抽取 Agent 循环核心：

```ts
export async function runAgentTurn(options: {
  conversationId: string;
  messages: UIMessage[];          // 本轮入站消息
  model?: LanguageModel;          // 默认 getModel()；评测注入 mock
}): Promise<{ conversationId: string; messages: UIMessage[] }>
```

职责：查历史 → 合并去重 → 截断 → 组装分层 prompt（记忆/会话状态/摘要）→ `ToolLoopAgent` 循环（`stopWhen: isStepCount(5)` 保持现状）→ 收集输出 → 持久化 → 返回新消息。

POST 改为调用 `runAgentTurn` 后再包 UI 流、进度事件、会话状态回写（`onToolExecutionStart/End` 相关逻辑留在路由层，经回调或由路由在返回后处理）。**业务逻辑零变化**，重构后 `npm test` + 手测主流程确认等价。

### 4.2 DB 路径注入（`src/db/index.ts`）

```ts
export function initDb(path: string = 'data/job-helper.db'): void
```

模块级默认连接改为可初始化；评测传入 `:memory:` 并在临时库上执行 migrations。

顺带收益（非本项目标，仅记录）：现有"直连 dev 库"的 lessons 等 repository 测试后续可迁移到临时库，消除前缀清理与串行化约束。

## 5. 场景定义格式

```ts
export interface Scenario {
  id: string;                       // kebab-case 唯一 id
  family: 'high-frequency' | 'orchestration' | 'recovery';
  description: string;
  setup(ctx: ScenarioContext): void;      // 在临时库注入初始数据
  userMessages: string[];                 // 依次作为用户消息走完整循环
  mockScript: MockResponse[];             // mock 层专用：按调用序号排列
  assertFinalState(ctx: ScenarioContext): void;  // DB + 消息断言（vitest expect）
}
```

- 两段式审批的"用户确认"通过 userMessages 中的确认消息模拟（如 `['帮我把这个岗位投出去', '确认']`），与真实交互一致
- `ScenarioContext` 由 runner 提供：`{ db, runTurn, conversationId, ... }`

## 6. Mock model（`tests/eval/mock-model.ts`）

- 实现 ai SDK `LanguageModel` 接口，注入 `runAgentTurn` 的 `model` 参数，业务代码零改动
- 脚本 = **按调用序号排列的响应列表**：`[ { toolCall: 'readSkill', args: {...} }, { toolCall: 'analyzeResume', ... }, { text: '分析完成…' } ]`
- **脚本未覆盖的调用直接抛错**（`unexpected LLM call`）→ 测试失败并提示补脚本；保证 mock 层完全确定性，场景编写时调用序列即已知
- 摘要/其他 `callStructured` 通道走同一 model，同样被脚本覆盖

## 7. 两个入口

### 7.1 mock 层（`eval.test.ts`）

`describe.each(scenarios)` 遍历，model = `createScriptedModel(scenario.mockScript)`，执行后断言 `assertFinalState`。临时库隔离，无串行化需求。

### 7.2 真实层（`run-eval.cli.ts`）

```
npm run eval [-- --k 2 --model <modelId>]
```

- 逐场景真实模型跑 k 次（默认 pass^2），全部通过才判 pass
- 输出报告：每场景 pass/fail + 失败原因 + 耗时 + token 用量
- 有失败则 exit code 非 0
- `--model` 缺省用 `getModel()`（环境变量配置的 provider）

## 8. 错误处理与稳定性

| 场景 | 处理 |
|---|---|
| mock 脚本未覆盖调用 | 显式抛错，测试失败，提示补脚本 |
| 断言失败 | 输出场景 id + 实际消息流，便于定位 |
| 真实层 LLM 调用失败（LLM_CALL_FAILED） | 计 fail 并记录错误信息 |
| 真实层单场景超时 | 设超时上限，防止单场景跑飞阻塞全量 |

敏感信息约束：评测报告不输出完整简历/JD 文本与 LLM 请求体（遵循 AGENTS.md 敏感信息规范）。

## 9. 场景清单（起步 13 个）

### 高频实用族（5）
1. `resume-analysis`：上传简历 → "帮我分析简历" → 产出评分卡（readSkill + analyzeResume）
2. `jd-match`：给 JD 问"适不适合我" → 匹配框架结论
3. `offer-compare`："两个 offer 怎么选" → offer-evaluation 建议
4. `interview-prep`："帮我准备 X 公司面试" → 生成题库/STAR 材料
5. `cover-letter`："帮我对这个岗位写求职信" → cover-letter 产出

### 编排压力族（4）
6. `tailored-resume`：针对 JD 生成专属简历 → 两段式强确认完整走通 + 落库
7. `apply-job`：applyJob → 两段式审批 + application 落库 + status_history 记录
8. `plan-task`：复杂多步任务 → planCreate 出 3-6 步计划 → 用户确认 → 执行推进
9. `record-status`：recordApplicationStatus → 轻确认 + 状态时序正确

### 边界恢复族（4）
10. `mid-course-correction`：中途改目标岗位 → 更新记忆/会话状态，后续对话用新目标
11. `tool-failure-retry`：模拟工具失败 → agent 感知失败并换路/重试（不卡死）
12. `memory-verify-write`：声明新偏好 → setMemory 写前核对 → memory_blocks 更新
13. `history-recall`："我之前提过 XX 吗" → FTS 检索命中

## 10. 验收标准

1. mock 层 13 场景进 vitest，`npm test` 全绿（原 184 + 13 场景 + mock-model 单测）
2. `npm run eval` 能对 1-2 个场景跑通真实模型并输出报告
3. **评测有效性验证**：故意破坏一处工具行为（如审批放行逻辑）→ 对应场景必须失败（证明评测集真能抓回归），验证后还原
4. 前置重构不改变业务行为：重构后现有测试全绿 + 主流程手测通过

## 11. 明确不做（范围外）

- 评测可视化 UI、CI 集成（本地项目无 CI）、跨模型基准对比报告
- 场景逐步截图/录屏等重资产
- lessons 等现有测试迁移临时库（顺带收益，另行安排）

## 12. 文档链

- 本设计 → 实现计划（`docs/plans/2026-08-11-eval-baseline-*.md`）→ PROJECT_STATUS.md 更新
- 讨论结论同步追加至 `docs/research/2026-08-10-agent-roadmap-discussion.md`（P2-1 定稿记录）
