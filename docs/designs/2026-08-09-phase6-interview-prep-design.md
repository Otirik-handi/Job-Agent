# 第 6 期设计：面试准备（prepareInterview）

日期：2026-08-09
状态：草稿
关联规范：AGENTS.md（关键硬约束）、plan-document.md、`.agents/specs/02-backend/api-data-conventions.md`（JSON 列）、`.agents/specs/03-agent/agent-tooling-conventions.md`（LLM 生成类工具）
设计依据：`docs/designs/2026-08-09-phase5-application-followup-design.md`（interview 状态已建模、过程态不建模）、`docs/designs/2026-08-06-phase3-channel-tailored-resume-design.md`（LLM 生成类工具模式、两段式审批）、`docs/designs/2026-08-04-find-work-experience-borrowing.md`（经验 #1 三段式匹配、#2 LLM 容错、#3 结构化输出示例进提示词）
前置：第 5 期已交付（投递后状态机 interview/offer/hired/rejected + 前端可见性）

## 1. 范围与决策（2026-08-09 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 本期范围 | **面试准备**：用户在对话中指挥 Agent 为已匹配岗位生成完整面试准备包，落库挂靠岗位，抽屉查看，可导出 Markdown |
| 2 | 内容范围 | **完整准备包**：公司/岗位背景要点 + 自我介绍话术（约 1 分钟）+ 预测面试问题（每道附考察意图/STAR 应答要点/简历证据引用/风险提示）+ 向面试官提问清单 |
| 3 | 工具形态 | 新增 **prepareInterview**（LLM 生成类，对齐 analyzeResume 模式：llm-call + prompt + 输出契约 + 落库）；无两段式审批（无对外副作用） |
| 4 | 存储 | `job_opportunities` 新增 `interview_prep_json` TEXT 列（**一次轻迁移**）；一岗一份，重新生成直接覆盖 |
| 5 | 展示 | 岗位抽屉新增「面试准备」区块（未生成 → 引导文案；已生成 → 完整内容 + 导出按钮） |
| 6 | 导出 | **Markdown 文件**：拼装抽纯函数 `toInterviewPrepMarkdown()`（`src/lib/`，可单测）+ 浏览器原生 Blob 下载；**零新依赖、零后端改动**（选型理由见 4.1） |
| 7 | 真实性边界 | 预测问题应答要点必须绑定简历原文证据（evidence），简历无支撑的内容标注 risk 提示，绝不虚构经历（对齐 AGENTS.md 硬约束） |

## 2. 工具契约

### prepareInterview（LLM 生成类，单次生成落库）

```
输入：{ jobOpportunityId }

前置校验：
  岗位存在（否则 throw，工厂兜底 TOOL_FAILED）
  fitResultJson 非空（未匹配 → JOB_MATCH_REQUIRED，附 next 指引先 matchJob）
    理由：匹配结果（岗位理解/逐条匹配/投递建议）是预测问题与证据绑定的基础

生成链路（对齐 analyzeResume / matchJob 的 llm-call 模式）：
  buildInterviewPrepSystemPrompt() + buildInterviewPrepUserPrompt(job) 组装
  → callStructured（generateObject + zod 契约校验 + repair ≤2 次 + 降级 LLM_OUTPUT_INVALID）
  → 输出通过契约校验后 setInterviewPrep(id, json) 落库
  → 返回准备包摘要（不返回全文，前端从抽屉读，避免长 JSON 撑爆上下文）

重复生成：直接覆盖（对齐 analyzeResume 对已分析简历重新分析的模式）；返回时可提示"已生成过，本次重新生成覆盖旧版本"
```

**输出契约**（落库 JSON，字段对齐 matchJob 的 fit_result 证据引用风格）：

```ts
{
  companyBrief: string,       // 公司/岗位背景要点（面试前必读，基于 JD 与简历原文）
  selfIntro: string,          // 自我介绍话术（约 1 分钟，基于简历原文，不虚构）
  questions: [{               // 预测面试问题
    id: string,               // 编号（如 q1，跨字段引用用）
    question: string,         // 问题
    intent: string,           // 考察意图（该问题在考察什么）
    answerPoints: string[],   // 应答思路要点（STAR 结构）
    evidence: string | null,  // 简历证据引用（绑定简历原文；无支撑时 null）
    risk: string | null,      // 证据薄弱时的风险提示 + 建议（无风险时 null）
  }],
  askThem: string[],          // 向面试官提问清单（面试尾段用，基于岗位/公司）
}
```

## 3. 数据模型（一次轻迁移）

- `job_opportunities` 新增 `interview_prep_json` TEXT 列（nullable，默认空），对齐现有 `fit_result_json` / `channels_json` 模式
- 仓储 `src/db/repositories/job-opportunities.ts` 新增：
  - `getInterviewPrep(id): InterviewPrep | null`（宽容 JSON 解析，解析失败返回 null，对齐 parseChannels 模式）
  - `setInterviewPrep(id, json): void`（写 JSON 字符串 + 刷新 updatedAt）
- 前端 `use-job-detail.ts` 的岗位详情投影增加 `interviewPrep` 字段（宽容解析，对齐 fitResult 模式）

## 4. 前端展示

| 元素 | 设计 |
|---|---|
| 岗位抽屉「面试准备」区块 | 未生成 → 轻提示"可在对话中让 Agent 准备面试"（对齐投递状态区块引导文案风格）；已生成 → 展示 背景要点 / 自我介绍话术 / 预测问题列表（问题＋考察意图＋应答要点＋证据引用＋风险标注）/ 向面试官提问清单 |
| 导出按钮 | 区块内「导出 Markdown」按钮 → 调用 `toInterviewPrepMarkdown()` 拼装 → `URL.createObjectURL` + `a[download]` 下载 `<公司>-<职位>-面试准备.md` |

### 4.1 导出技术选型（2026-08-09 深入讨论确认）

- **Markdown 生成方向无合适主流库**：`marked`/`markdown-it` 是渲染方向（MD→HTML，且前端展示已用 react-markdown），`mdast` 生态（AST→MD）对本场景（标题+列表+引用块）属过度设计；「结构化 JSON→MD」社区普遍做法即模板字符串拼装，属本项目"业务编排自研"范畴
- **文件下载用浏览器原生 API**：`URL.createObjectURL()` + `<a download>` 已是现代浏览器标准；`file-saver` 本质是封装该 API，本地单用户场景无 IE 兼容需求，引依赖属冗余
- **结论**：`toInterviewPrepMarkdown()` 纯函数（`src/lib/`，对齐 `format-time.ts` 可单测模式）+ 原生 Blob 下载；零新依赖、零后端改动。将来若需 docx/PDF（服务端库才合理的场景）或后端导出，纯函数可直接复用
| 投递状态引导文案 | interview 状态现有"可对助手说：记录面试结果（offer/拒绝）"旁追加"可对助手说：准备这家公司的面试"（两行并存） |

## 5. 工具注册与对话联动

- `src/agent/agent.ts`：SYSTEM_PROMPT 能力清单新增 `prepareInterview` 行；原则区新增"用户提出准备面试/面试这家公司时，若岗位已匹配直接调用 prepareInterview，未匹配先 matchJob"；`getTools()` 注册 `prepareInterview`
- `app/api/chat/route.ts` `onToolExecutionStart` 追加 `prepareInterview` 进度文案分支

## 6. 规范同步（先改规范再改代码）

| 规范 | 修订 |
|---|---|
| 03-agent LLM 生成类工具清单 | 补 `prepareInterview`（对齐 analyzeResume/matchJob 模式，若清单中已覆盖该模式则仅补工具名） |
| 02-backend JSON 列 | `interview_prep_json` 与现有 `fit_result_json`/`channels_json` 同类；若 JSON 列约定已覆盖则无需新增规范条目 |

> 注：以上修订幅度以规范原文为准，若属"同主题已有约定"则不新增条目（规范自治原则，避免膨胀）。

## 7. 边界（YAGNI）

- ❌ 多轮面试多版本（一岗一份，重新生成覆盖）
- ❌ docx / PDF 导出（仅 Markdown 下载）
- ❌ 面试时间预约 / 面试日历
- ❌ 面试后复盘工具（留后续期）
- ❌ 独立资源标签页（岗位附属，侧栏不新增标签）

## 8. 验收标准

1. 对话"帮我准备 XX 岗位的面试" → 生成准备包落库，抽屉「面试准备」区块展示完整内容（背景要点/自介话术/预测问题含应答与证据/提问清单）
2. 未匹配岗位 → 明确错误 `JOB_MATCH_REQUIRED` + 引导先 matchJob
3. `toInterviewPrepMarkdown()` 纯函数单测通过（JSON→MD 各节完整）；「导出 Markdown」按钮 → 下载 `.md` 文件内容完整可读
4. 再次生成覆盖旧版本；对话中工具返回摘要不撑爆上下文
5. 回归：第 1-5 期既有功能不受影响；lint / test / build 全绿
