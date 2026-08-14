# PROJECT STATUS — job-helper 项目状态

> 本文档记录项目当前状态、已完成工作与下一步计划。随里程碑更新（最后一次更新：2026-08-13，外部 Skill 炼化第三梯队 #8 salary-negotiation-prep 结论文档落地）。

## 当前状态

- **基线稳定**：308 个测试全绿（`npm test`，含 13 个评测场景 + mock-model + usage-collector 等），`lint` / `tsc --noEmit` / `build` 全部通过
- **里程碑**：P0（Agent 基础骨架）+ P1（Agent 进阶能力）全部落地并合并至 main，已推送 GitHub
- 分支：`main`（与 origin/main 同步）；历史 feature 分支均已合并清理

## 已完成：P0（Agent 基础骨架）

### 第一期（phase7：记忆层 + 会话状态 + 上下文策略）

| 能力 | 实现 |
|---|---|
| 记忆层 | `memory_blocks` 表（resume / preferences / status_scratchpad 三块常驻 + limit 校验）+ `getMemory` / `setMemory` 工具（显式写入、写前核对）；`messages` 全量落库 + FTS5（trigram，中文子串检索） |
| 状态时序 | `status_history` 表（from→to + superseded_by 链式作废，只追加不覆盖），applyJob / recordApplicationStatus 落库自动记录 |
| 会话状态 | `session_state` 表（机器可读 JSON：currentResumeId / currentJobId），工具结果自动回写 |
| 上下文策略 | 分层组装（SYSTEM_PROMPT → 记忆 → Skill → 会话状态 → 最近 12 轮），轮数截断 + 记忆补偿（20→12 轮） |

### 第二期（phase8：工具层补强 + 审批分级）

| 能力 | 实现 |
|---|---|
| 工具描述规范化 | 13 个工具按 3-4 句规范重写（做什么/何时用/前置条件/参数/返回），SYSTEM_PROMPT 同步 |
| 结构化错误 | 统一 `{ok:true/false, error:{code,message,hint}}` 契约（对齐 MCP isError）；工厂层透传，TOOL_FAILED 仅兜底未知异常；7 处业务 throw 收敛 |
| 输入严格校验 | 13 个工具 schema 全部 `z.strictObject`；工厂层 INVALID_INPUT 拦截（中文逐字段可行动错误） |
| 审批三档 | 只读免确认 / recordApplicationStatus 轻量确认（前端「确认记录」按钮）/ applyJob、tailoredResume 两段式强确认（fail-closed） |

## 已完成：P1（Agent 进阶能力）

| 期 | 能力 | 实现 |
|---|---|---|
| phase9 | Skill 系统 | 遵循 agentskills.io 开放标准；6 个求职 skill（简历评分卡/JD 解析/匹配框架/求职信/面试准备/offer 评估）；元数据常驻 system prompt + `readSkill` 工具按需加载（CLI 机制同构，三道闸防路径穿越） |
| phase10 | 显式规划 | `data/plans/<taskId>.md` 计划文件（步骤/状态/依赖/成功标准）；`planCreate` / `planUpdate` / `planRead` 三工具；复杂任务先出 3-6 步计划请求用户确认；会话组装注入进行中计划（中断恢复） |
| phase11 | 反思环 | `lessons` 表 + FTS5；`recordLesson`（失败/被纠正后按"发生了什么/为什么/下次怎么做"沉淀教训）、`searchLessons`（FTS 检索，非法语法自动降级） |
| phase12 | 会话摘要 | `conversations.summary`；会话首次达到轮数上限时对旧轮 LLM 生成一次滚动摘要（失败降级不阻塞），注入上下文 |
| phase13 | UX 步骤卡片 | 工具调用渲染为三态步骤卡片留在消息流（运行/完成折叠一行可展开/失败红色 + 重试按钮）；`GET /api/plans/active` + 规划进度横幅（"第 N 步（共 M 步）"） |

## 工程基线

- **测试**：308 个（含 13 个评测场景 + mock-model + usage-collector 等；纯函数单测为主：apply-state / channel-guard / llm-call / resume-* / tool-factory / skills / plans / lessons / summary / tool-step-card / audit-log（mapToolToAction 审计钩子）等）
- **批次 B 新增（2026-08-12）**：语义检索链路——embedding 模块（硅基流动调用 + override 注入 + 降级）、vector-search（自算余弦）、searchMessages 工具（只读免确认）+ 评测场景（embedding override 注入）
- **批次 C 新增（2026-08-12）**：negotiation / follow-up 两个方法论 skill（共 8 个求职 skill）+ actions 审计表（schema + repository + 过滤查询）；runAgentTurn 经 `onToolExecutionEnd` 横切记录关键动作（applyJob / recordApplicationStatus / tailoredResume 导出等），写入失败降级不阻塞（对齐 persistSessionState 模式）
- **规范体系**：`.agents/specs/`（00 治理 / 01 前端 / 02 后端 / 03 Agent / 04 注释）随实现补充了记忆、Skill、规划、反思、摘要、步骤卡片等约定
- **文档链**：调研报告 → 讨论纪要 → 计划文档（phase7-13）→ 本状态文件

## 已完成：外部 Skill 炼化（2026-08-13 启动，已完成 8/12，第三梯队进行中）

> 背景：通过 find-skills 检索求职领域 agent skill 生态，筛选后安装至 `external-skills/`（4 仓库，嵌套 git 独立更新，`.gitignore` 排除不入库，提交 `5dfdf16`），逐个精读并产出「炼化结论文档」供后续落地参考。

### 炼化执行要求（已写入清单文档 §4，每次炼化必须遵守）

1. 全量阅读（SKILL.md 全文 + 附属文件，禁止只读 frontmatter/跳读）
2. 结构化拆解（章节/流程/红线/可落地点/项目映射，拆解不完整视为未精读）
3. 逐项吸收（追溯到原文具体章节/段落，禁止凭印象转述）
4. 每次生效（对每个 skill 的每次炼化都生效）
5. **产出为文档，不直接改代码**（用户原话：「炼化后不要直接修改当前项目内置的 SKILL，先将炼化结论记录到文档中，后续可能还会做修改或者重新炼化」）

### 结论文档标准（#1 v2.2 定型，后续沿用）

- 知识沉淀定位（方法论完整记录）+ 项目现状对照 + 吸收方式建议 + 不吸收部分完整记录（含不采用原因与重新评估触发条件）
- 每节 💡 大白话解释 + 📜 原文证据块（SKILL.md 行号 + 原文引句 + 中文翻译）
- 迭代记录只追加不覆盖（支持后续修改/重新炼化）

### 第一梯队结论一览（docs/research/2026-08-13-refine-0X-*.md）

| # | Skill | 核心结论 | 关键决策 |
|---|---|---|---|
| 1 | job-description-analyzer | 匹配分加权模型（required 70% + preferred 30% + 区间解释）、red flag 三类短语清单（确定性检测）、需求分类信号、dealbreaker 规则 | 匹配分/red flag 可确定性化；方案二（schema v2）为推荐落地 |
| 2 | resume-tailor | 图书馆选书哲学、分节定制指南、Truth vs Tailoring 红线 5+5（factRisk 判定操作化） | 结构级重排（editType move/reorder）记演进线索（§6），YAGNI 暂缓 |
| 3 | resume-ats-optimizer | ATS 兼容检查（文本可检测子集）、关键词匹配分公式（命中/总数 × 100）、行业词表 | 双落点：格式检查→analyze-resume、关键词分→matchJob；纯文本存储边界（格式依赖部分不适用） |
| 4 | resume-bullet-writer | X-Y-Z 框架、80 动词词库、量化策略、7 项检查清单 | 双落点 + 混合形态：框架注入 prompt + `validateBulletQuality` 确定性后校验 |
| 5 | resume-quantifier | 6 类指标、5 种估算技术（含 2 种确定性计算）、8 岗位指标库、Numbers to Avoid | 与 #4 合并落地（同一流程两面）；数字 ≤2-3 / 百分比无基线并入校验 |
| 6 | resume-version-manager | master 素材库概念、投递追踪（Version Used）、更新工作流 | **投递-版本关联缺口**（applyJob 不记录所用专属简历版本）记演进线索（§6 设计线索级）；master 素材库记不吸收（触发条件） |

### 第二梯队结论一览（docs/research/2026-08-13-refine-07-interview-me.md）

| # | Skill | 核心结论 | 关键决策 |
|---|---|---|---|
| 7 | interview-me | 意图澄清协议：一次一问+猜测+置信度（<70% 附缺失原因）、restate 六要素（Out of scope 不可谈判）、显式 yes 门禁（"你看着办"非确认）、95% 停止条件+轮数地板 | **意图层澄清机制空白**为关键缺口；方案一 prompt 层协议落地为推荐；六要素可升级两段式审批确认卡（随 UI 排期）；不吸收 docs/intent 持久化（memory preferences 等价物）、非交互约束（项目无此形态） |

### 第三梯队结论一览（docs/research/2026-08-13-refine-08-*.md）

| # | Skill | 核心结论 | 关键决策 |
|---|---|---|---|
| 8 | salary-negotiation-prep | 谈判五场景题库（首轮低/期望薪资 deflection/底薪不动 9 替代项/竞对 offer 三原则/当前薪资重定向）+ 四分位区间 + 总包计算与权益术语 + 6 步时间线 + Counter-Offer 五步框架 | 项目 negotiation 覆盖率已高；**期望薪资 deflection 与当前薪资应对为关键缺口**；方案一场景库补齐（prompt 增补）为推荐；不吸收美国市场数据/来源/法律断言（含触发条件）；base vs 总包权衡视角与 #12 联动评估 |

### 关键缺口清单（跨 skill 汇聚，供后续排期）

- **意图层澄清机制空白**（#7）：用户模糊指令（缺岗位/简历/目标）时无"先澄清再行动"机制，靠 LLM 自由发挥；落地见 refine-07 §6 演进线索（prompt 层协议 + 澄清轮数护栏 + 六要素进 planCreate）
- **投递-版本关联**（#6 §6）：痛点"我投 X 用的哪个版本"当前答不了——actions 审计携带 tailoredResumeId（方案 α 零迁移）或表加字段
- **无岗位独立打磨场景**（#4/#5）：analyze-resume 只给建议、tailoredResume 须有岗位——无岗位时无法产出改写文本
- **结构级重排能力**（#2 §6）：edits 仅文本替换，经历区块重排/技能换序需 editType 扩展
- **简历数据模型升级联动**：master 素材库（#6 §5.1）、结构级重排（#2 §6）、投递-版本关联同属简历模型议题，任一项立项时一起评估
- **中文词表本地化**（#3/#5）：red flag 短语、行业词表、强动词库原文为英文，落地需中文本地化

### 后续炼化队列

- 第二梯队：#7 interview-me（需求澄清方法论，对话层意图澄清模式）✅ 已炼化（2026-08-13）
- 第三梯队：#8 salary-negotiation-prep ✅ 已炼化（2026-08-13）；#9-#12（interview-prep-generator / application-form-filler / cold-email-writer / offer-comparison-analyzer）进行中
- 第四梯队：只读不搬（场景参考）

## 接下来要做什么

### P2 队列（调研报告路线图，2026-08-12 全部定稿；实现分批推进中）

1. **评测基线** ✅ 已落地（2026-08-11）：双层评测（mock 层入 vitest 13 场景防编排回归 + `npm run eval` 真实模型层 pass^2 能力验证），设计见 docs/designs/2026-08-11-eval-baseline-design.md，实现见 docs/plans/2026-08-11-eval-baseline.md。真实层首跑（deepseek-v4-flash）：适配后 12/13 通过（jd-match 见已知限制）
2. **语义检索** ✅ 已落地（2026-08-12）：硅基流动 bge-m3 embedding + 自算余弦（向量存 JSON 列）+ searchMessages 工具 + 落库同步嵌入（失败降级）+ 存量回填脚本（npm run embed-backfill）
3. **Prompt caching 优化** ✅ 已落地（2026-08-12）：**验证结论——opencode.ai 自动前缀缓存已生效**（评测 CLI usage 统计实测：全量 13 场景 cacheRead 命中率 89-100%，输入 token 约 95% 命中缓存，无需显式标记代码）
4. **子 Agent（最小 supervisor）** ✅ 决议关闭：明确不做（2026-08-12 用户决议，触发信号不再评估）；工具表落地 web 工具后 15 个，规模可控
5. **其他增强** 🟡 部分落地（2026-08-12）：token 监控已随批次 A 落地（评测 CLI usage 统计）；批次 C 完成——negotiation/follow-up skill + actions 审计表（runAgentTurn 横切记录）；company-research/salary-benchmark 挂起等批次 D web 工具

实现批次：A ✅ → C ✅ → B ✅ → D1 ✅ + D2 ✅ + D3 ✅（web 工具全链路完成：D1 十二任务 + 冒烟；D2 OpenCLI 插件接入 51job/Boss 采集；D3 company-research/salary-benchmark skill；web-browse 明确不做）。定稿详情见讨论纪要 P2-2~P2-5。

### UI 改进候选（2026-08-13 巡检，未排期）

候选清单（记忆可视化 / 计划视图 / 侧边栏搜索 / 消息复制 / 设置入口 + 存疑项）见 `docs/research/2026-08-13-ui-improvement-candidates.md`。选定后按标准流程推进（brainstorming → 设计 → 计划 → 实现）。

### 已知限制（各期验收记录，后续处理）

- FTS trigram 对 2 字以内中文查询不命中（检索工具注意）
- `drizzle-kit push` 不识别 FTS 虚拟表（应用走 migrate 流程）
- 会话摘要触发存在一轮偏差（缺口 ≤1 条旧消息，全量落库可溯源）
- blocked-only 活跃计划在进度横幅不显示
- 重试按钮点击后置灰至重跑结束（与确认卡一致）
- SDK 生产路径非法参数先被 AI SDK 英文校验拒绝（中文 INVALID_INPUT 仅直接 execute 路径）
- 测试基建：lessons 等 repository 测试直连 dev 库（前缀清理 + 串行化）
- 评测真实层：jd-match 对 jobMatchResultSchemaV1（复杂嵌套 + id 一致性校验）的结构化输出不稳定，deepseek-v4-flash 多次 repair 仍不合格 → fit_result_json 不落库，场景失败（模型能力问题，评测正确捕获；后续可优化 schema 复杂度或换模型验证）
- 评测真实层：全量 13 场景耗时约 15-16 分钟（单次 LLM 调用 20-100s），慢模型下多步场景可能触及 180s 超时（jd-match 已放宽 300s）
- 评测真实层：mock 脚本预设的模型行为（自选 taskId/先追问）在真实层不成立，场景用 assertFinalStateReal 分层断言放宽（缺省复用 mock 断言）
- 语义检索依赖 EMBEDDING_* 环境变量（硅基流动 key）——未配置时消息不嵌入、searchMessages 返回 EMBEDDING_FAILED
- OpenCLI：Boss 登录态 2026-08-12 实测仍有效（Chrome 扩展 v1.0.22 会话，cookie 长期有效）；失效后 boss detail 返回 AUTH_REQUIRED，webFetch 降级链映射 FETCH_NEEDS_LOGIN（hint 引导 `opencli boss login` 一次人工登录）
- OpenCLI（Windows）：opencli 为 npm .cmd shim，命令经 cmd.exe 引用拼接执行；参数含 `%`/`!` 时引号内仍会展开（已知边角，本地单用户可接受）

## 文档索引

- 调研报告：`docs/research/2026-08-10-agent-architecture-research.md`（12 专题，分篇在 `tmp/research/`）
- 讨论纪要：`docs/research/2026-08-10-agent-roadmap-discussion.md`（P0 五项 + P1 五项定稿）
- 评测基线设计：`docs/designs/2026-08-11-eval-baseline-design.md`（双层评测）
- 评测基线计划：`docs/plans/2026-08-11-eval-baseline.md`
- 批次 B 设计：`docs/designs/2026-08-12-semantic-search-design.md`（语义检索）
- 批次 B 计划：`docs/plans/2026-08-12-semantic-search.md`
- 批次 C 设计：`docs/designs/2026-08-12-skill-extension-audit-design.md`（skill 扩展 + 审计表）
- 批次 C 计划：`docs/plans/2026-08-12-skill-extension-audit.md`
- 批次 D 设计：`docs/designs/2026-08-12-web-tools-design.md`（webSearch + webFetch 三级降级链）
- 批次 D 计划：`docs/plans/2026-08-12-web-tools.md`
- 批次 D2 设计：`docs/designs/2026-08-12-opencli-plugin-design.md`（OpenCLI 插件：site-mapper/parser/runner/doctor）
- 批次 D2 计划：`docs/plans/2026-08-12-opencli-plugin.md`（含 Task 7 冒烟实测记录）
- 计划文档：`docs/plans/2026-08-10-phase7~13-*.md`（每期含验收记录与已知限制）
- 外部 Skill 炼化清单：`docs/research/2026-08-13-external-skills-refinery-list.md`（四梯队清单 + 执行要求 §4）
- 炼化结论文档：`docs/research/2026-08-13-refine-01-job-description-analyzer.md`（v2.2）~ `refine-06-resume-version-manager.md`（每篇含精读拆解/项目对照/可吸收点/吸收方案/不吸收部分/演进线索/迭代记录）；第二梯队 `refine-07-interview-me.md`（意图澄清协议）；第三梯队 `refine-08-salary-negotiation-prep.md`（谈判场景库，进行中）
- 本文件：`PROJECT_STATUS.md`
