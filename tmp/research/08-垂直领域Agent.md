# 08 垂直领域 / 任务型个人 Agent 产品形态

调研日期：2026-08-10。范围：求职类产品 + 个人助理类 Agent + 垂直 Agent 架构文章 + 对话编排 UX + 开源案例。正文中文。

## 调研对象（产品/文章链接 + 一句话）

- Teal（tealhq.com）："求职者操作系统"，简历+追踪+匹配+面试的一体化 CRM 式产品。
- LazyApply（lazyapply.com）：批量自动投递 Chrome 扩展，"Job GPT" 自动填表，号称不被平台封锁。
- AI Hired（aihired.com）：自动投递工具，官网已是域名出售页——产品已消亡，赛道泡沫证据。
- ApplyAll / Just Apply：反方产品，主打"真人代投/定向投递"，以反衬自动投递的低质量。
- AIHawk（github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk）：开源自动投递 Web Agent，被 TechCrunch 等广泛报道。
- Anthropic《Building Effective Agents》（anthropic.com/engineering/building-effective-agents）：workflow vs agent、工具设计（ACI）与护栏的权威文章。
- Anthropic《How we built our multi-agent research system》：orchestrator-worker 模式与 token 成本实证。
- arXiv 2511.17198《Designing Domain-Specific Agents via Hierarchical Task Abstraction》：领域 Agent 应贴合任务依赖图而非角色扮演。
- Onething Design《10 Best Practices for Conversational UI Design》：对话 UI 的意图映射、单问题提问、确认点与状态保持。
- OpenAI《Memory and new controls for ChatGPT》：saved memories / custom instructions / Projects 三层个人上下文。
- LinkedIn AI 求职功能（公开信息较少）：2024 年起为 Premium 用户推出 AI 简历检查、职位匹配度评分、AI 起草求职信/消息、AI 面试准备；招聘侧另有 Hiring Assistant，第三方自动化被 ToS 明令禁止。

## 求职类产品能力矩阵（能力 vs 实现方式）

| 能力 | Teal（定制+追踪型） | LazyApply/AIHawk（自动投递型） |
|---|---|---|
| 简历解析/入库 | 上传后结构化，多版本简历 | 单/多份"Profile"，自动填表用 |
| 简历定制 | 按 JD 关键词高亮真实经历、ATS 评分 | 无/弱（全站用同一份模板） |
| 岗位发现 | Chrome 扩展从 40+ 站点收藏，Bookmark+评分 | 抓取 Easy Apply 类岗位批量投 |
| 匹配 | JD Match 评分、Job Insights | 仅按关键词/地区过滤器 |
| 投递 | 引导用户跳转官网投递 | 浏览器自动提交（高账号风险） |
| 面试准备 | AI Interview Practice（角色扮演） | 无 |
| 追踪 | 全生命周期看板（投递→面试→Offer） | 简单 Analytics（数量） |

关键差异：定制型产品把 Agent 当"教练/工具"，投递动作留给用户完成；自动投递型把 Agent 当"执行者"。Teal 官方工作流为 Sign Up→Set Goals→Search（收藏）→Apply（定制简历）→Grow（洞察），本质是把求职拆成可追踪的阶段漏斗。

## 垂直 Agent 的领域建模（数据模型/工具集/记忆 schema）

- 数据模型：核心实体为 Resume（多版本）、JobPosting（原始 JD+结构化字段）、Application/ApplicationStage（状态机：saved→applied→interview→offer→rejected）、CoverLetter、CompanyProfile。阶段状态机是追踪型产品的支柱。
- 工具集：ATS 评分、JD 关键词抽取、简历重排、书签采集（Chrome 扩展/抓取）、消息/求职信生成。Anthropic 强调工具定义要像 ACI（agent-computer interface）一样打磨：绝对路径、poka-yoke 防错参数、格式贴近模型见惯的自然文本。
- 记忆 schema：ChatGPT 的三层结构可直接借鉴——saved memories（自动沉淀的原子事实，如"用户是前端工程师 5 年"）、custom instructions（用户显式常驻约束，如"求职信用中文"）、Projects（绑定某段长期努力的独立上下文空间：文件+指令+历史，天然对应"一次求职战役"）。领域化后即"用户画像 + 求职偏好 + 简历资产"。
- 架构倾向：Anthropic 主张简单可组合（prompt chaining / routing / orchestrator-workers），反对一上来就上复杂框架；arXiv HTAM 进一步指出通用 ReAct/角色扮演在强结构化多步流程（恰如求职）上会失败，应按领域任务依赖图分层编排。

## 对话编排与任务流程管理

- 表单驱动 vs 对话驱动：对话强在意图识别与开放式输入，表单强在精确采集。成熟做法是"对话为壳、表单为骨"——slot-filling 模式（逐个收集字段，后台填表）与 guided conversation（一次只问一个相关问题，用完即用）。
- 状态保持与打断恢复：任务状态不应只存在于对话上下文，要持久化为领域实体（如 Application 状态机）+ 每轮落库；Anthropic 的多智能体实验也佐证"token 使用量解释 80% 性能差异"，即长任务要靠结构化上下文而不是无限重放。确认点原则：只对不可逆/高影响动作确认（投递、发送消息、覆盖简历），低风险动作不打断；确认文案要说明"将要发生什么+如何更正"。
- 渐进披露：默认给出简明答案，来源/步骤/高级控件按需展开，防止用户淹没在参数里——对应 job-helper"对话为主、卡片式摘要、可展开详情"的形态。

## 失败点与伦理边界（自动投递争议、真实性原则）

- 自动投递的核心失败：(1) 平台封锁——LinkedIn 等 ToS 禁止第三方自动化，用户账号被标记是结构性问题，LazyApply 的 Trustpilot 仅约 2 星、月流量从 66 万骤降至 10 万以下；(2) 质量反噬——招聘方能识别自动投递（通用求职信、匹配度 40%、凌晨批量提交），ATS 会按投递速度降权，0.5% 转化率不如 10 份定制申请；(3) AIHawk 的 2843 份批量投递被媒体定性为"求职者像垃圾邮件发送者一样思考"。
- 真实性教训：Teal 的定制是"用 JD 关键词高亮真实经历"，从不生成假经历；AI 生成内容被 ATS 和招聘人识别是普遍现象，"真实+定制"是唯一可持续路线。job-helper 已承诺不伪造/夸大经历，应坚持：AI 只做真实经历的改写、重排、措辞优化，并让用户逐项核对。

## 对 job-helper 形态的建议（P0/P1/P2）

- P0（核心，先做）：领域数据模型落地——Resume(多版本)、JobPosting、Application 状态机（saved→applied→interview→offer/rejected）、UserProfile 偏好；对话编排按"引导式+slot-filling"，一次一个问题；简历定制与 JD 匹配（关键词高亮+真实经历改写）作为杀手级能力；投递等不可逆动作插入确认点。
- P1（增强）：岗位收藏/解析（粘贴 JD 文本即可，不做浏览器抓取）；面试准备（角色扮演式对话，真实经历锚定）；Application 追踪看板与阶段推进；saved memories 式用户画像沉淀（自动记住偏好、可控可删）。
- P2（远期）：求职信/消息生成；进度统计与复盘（对比投递→回复率）；多模型切换的 Prompt 兼容层。
- 明确不做：浏览器自动投递（平台封锁+质量反噬，且违反 AGENTS.md 边界）、伪造经历生成、追踪营销式分析。

## 来源清单

- Teal 官网：https://www.tealhq.com/
- LazyApply 官网：https://www.lazyapply.com/
- AI Hired（域名出售页）：https://aihired.com/
- ApplyAll LazyApply 评测：https://applyall.com/guides/lazyapply-review
- Just Apply LazyApply 评测：https://justapply.io/blog/lazyapply-review-2026
- AIHawk GitHub：https://github.com/feder-cr/Jobs_Applier_AI_Agent_AIHawk
- The Verge《AI is enabling job seekers to think like spammers》：https://www.theverge.com/2024/10/10/24266898/
- Anthropic《Building Effective Agents》：https://www.anthropic.com/engineering/building-effective-agents
- Anthropic《How we built our multi-agent research system》：https://www.anthropic.com/engineering/multi-agent-research-system
- arXiv 2511.17198（HTAM）：https://arxiv.org/abs/2511.17198
- Onething《10 Best Practices for Conversational UI Design》：https://www.onething.design/post/best-practices-for-conversational-ui-design
- OpenAI《Memory and new controls for ChatGPT》：https://openai.com/index/memory-and-new-controls-for-chatgpt/
- AI UX Playground（渐进披露）：https://www.aiuxplayground.com/pattern/progressive-disclosure/
