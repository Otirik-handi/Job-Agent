# Job Helper — 个人求职 Agent 应用

本地优先的个人求职助手。用户在对话中指挥 Agent 完成求职全流程任务：**简历分析、岗位匹配、投递建议、渠道发现、专属简历生成、面试准备、求职信与 offer 评估**。

- 🏠 **本地优先**：本地 Web UI + SQLite 存储，0 运维、免鉴权、单用户
- 💬 **对话驱动**：关键动作插入人工确认点，Agent 不自作主张
- 🔌 **模型无关**：接入任意 OpenAI 兼容大模型（环境变量配置）

## 功能

### 求职全流程（对话驱动）

- **简历分析**：上传简历（PDF / Word / txt / md），Agent 自动解析并给出结构化分析（评分卡）+ ATS 兼容性检查（区块头/日期/联系方式/关键词密度等确定性检查）
- **岗位匹配**：导入或录入岗位机会，Agent 评估匹配度并给出建议——需求分类（必须项/加分项）、匹配分档位、JD 危险信号检测、关键词匹配分（机器视角命中率）
- **渠道发现**：根据 JD 发现可投递渠道（本地规则核验）
- **专属简历生成**：针对具体岗位生成专属版本（两段式确认，真实经历锚定，不伪造；改写质量校验：量化指标/强动词/数字红线）
- **投递管理**：投递状态机（matched→applying→applied→interview→offer→hired），状态时序可追溯，审计留痕所用专属简历版本（可答"我投 X 用的哪个版本"）
- **面试准备**：生成完整面试准备包（背景要点/自我介绍话术/预测问题含应答与证据、概率分级、红线答案提示）
- **会话管理**：多会话历史，随时继续

### Agent 能力（P0+P1 已落地）

- 🧠 **记忆**：偏好/画像/进度常驻记忆块（显式写入、写前核对）+ 历史全文检索 + 语义检索
- 📚 **技能库**：12 个求职领域技能（评分卡/JD 解析/匹配框架/求职信/面试/offer 评估/谈薪/跟进/公司调研/薪资基准/表单填写/主动触达），按需加载
- 🗺️ **显式规划**：复杂任务先出计划请求确认，计划文件持久化，中断可续跑
- 🔁 **反思**：失败/纠正后自动沉淀教训，新任务检索复用
- 📄 **会话摘要**：长会话首次截断时自动压缩旧轮，上下文不丢关键信息
- 💬 **意图澄清**：指令缺关键要素（岗位/简历/目标/约束）时先一次一问澄清再行动，拒绝"你看着办"式空洞确认
- 🎴 **过程可见**：工具调用以三态步骤卡片留在消息流，失败可一键重试，规划进度横幅
- 🛡️ **护栏**：审批三档（只读免确认/可逆轻量/不可逆强确认）、结构化错误自愈、输入严格校验、确定性规则（危险信号/ATS 检查/关键词匹配/改写质量）不依赖 LLM 自由发挥

## 内置工具（22 个）

Agent 通过以下工具完成实际工作（按职责分组，均经过输入严格校验与结构化错误契约）：

| 分组 | 工具 | 说明 |
| --- | --- | --- |
| 简历 | `importResume` / `listResumes` / `analyzeResume` | 导入（粘贴/本地文件）、列出、分析（评分卡 + ATS 兼容检查） |
| 岗位 | `importJobOpportunity` / `listJobOpportunities` / `matchJob` | 导入 JD、列出（含投递所用专属简历版本）、三段式匹配（需求分类/匹配档位/危险信号/关键词匹配分） |
| 生成 | `discoverChannels` / `tailoredResume` / `prepareInterview` | 渠道发现（本地规则核验）、专属简历（两段式确认 + 改写质量校验）、面试准备包（概率分级/红线提示） |
| 投递 | `applyJob` / `recordApplicationStatus` | 投递状态机推进（两段式强确认/轻量确认；审计留痕含所用专属简历版本） |
| 记忆 | `getMemory` / `setMemory` | 持久记忆块读写（显式写入、写前核对，resume/preferences/status_scratchpad 三块） |
| 规划 | `planCreate` / `planUpdate` / `planRead` | 显式计划（3-6 步、依赖/成功标准、中断恢复续跑） |
| 反思 | `recordLesson` / `searchLessons` | 教训沉淀（发生了什么/为什么/下次怎么做）与检索复用 |
| 检索 | `searchMessages` / `webSearch` / `webFetch` | 历史对话语义检索（embedding 向量）；实时网络搜索与正文抓取（三级降级链） |
| 技能 | `readSkill` | 按需加载技能库正文（元数据常驻，正文不占上下文） |

## 内置技能（12 个）

技能库遵循 agentskills.io 开放标准（`skills/<name>/SKILL.md`，元数据常驻 + 正文按需加载），覆盖求职全流程的方法论与话术：

| 技能 | 用途 |
| --- | --- |
| `resume-analysis` | 简历评分卡：四部分解构 + 0-100 总分 + 改进建议（含 ATS 视角与量化改写方向） |
| `jd-analysis` | JD 解析：职责/硬性要求/软性要求/关键词/红线门槛，逐项标注证据出处 |
| `job-matching` | 岗位匹配框架：五维 gap 分析 + 硬性/软性差距区分 + 诚实匹配结论 |
| `cover-letter-generation` | 求职信生成（被动应投递）：四段式骨架 + 真实经历锚定 + 长度语气建议 |
| `interview-prep` | 面试准备：STAR 三版本（2min/60s/15s）+ 5 类能力素材清单 + 敏感题公式（缺点/失败/期望薪资 deflection）+ 按面试对象分组提问 |
| `offer-evaluation` | offer 评估：五维权重打分 + Year1/Ongoing 双口径总包 + perks 货币化 + 红旗检查清单 + 决策心理测试 |
| `negotiation` | 谈薪策略：五步流程 + 可谈性分档 + 常见场景话术库（期望薪资 deflection/竞对 offer/当前薪资应对）+ 9 项替代清单 + 止损线 |
| `follow-up` | 投递跟进：时机/频率控制 + 话术模板 + 诚实边界 |
| `company-research` | 公司调研：web 工具链收集公开信息，业务→团队→融资→文化→风险框架输出，标注不可验证项 |
| `salary-benchmark` | 薪资基准：web 检索市场数据 + 城市/年限/规模修正 + 参考区间与来源时效标注 |
| `application-form-filler` | 申请表填写：7 类题型（经验/动机/作品集/技能/自我介绍/行为/观点）× 格式规则 + 长度校准 + 错误自检 |
| `outreach-messaging` | 主动触达：BOSS 打招呼/私信/邮件三形态话术，hook 先行（公司特定事实）+ 长度分档 + 低压收尾 |

> 项目当前状态与路线图见 [`PROJECT_STATUS.md`](PROJECT_STATUS.md)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ React 19 |
| AI | Vercel AI SDK + OpenAI 兼容接口 |
| UI | Tailwind CSS v4 + shadcn/ui（Base UI） |
| 数据 | Drizzle ORM + better-sqlite3（含 FTS5 全文检索） |
| 校验 | Zod |
| 测试 | Vitest（核心纯逻辑轻量单测，379 个） |

## 快速开始

### 环境要求

- Node.js 20+
- npm

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local` 并填入你的模型配置：

```bash
cp .env.example .env.local
```

```env
LLM_BASE_URL=https://api.deepseek.com/v1   # 任意 OpenAI 兼容端点
LLM_API_KEY=your-api-key
LLM_MODEL=deepseek-chat
LLM_PROVIDER=deepseek   # 展示用供应商名（输入框指示灯显示 <供应商>/<模型>）
LLM_TEMPERATURE=0.3
```

> 🔒 API key 只存于本地环境变量，不会进入代码、配置或 git。

### 3. 初始化数据库

```bash
npx drizzle-kit migrate
```

SQLite 数据库文件生成在 `data/` 目录（已被 git 忽略）。

### 4. 启动

```bash
npm run dev
```

浏览器打开 [http://localhost:3000](http://localhost:3000)。

## 常用命令

```bash
npm run dev      # 开发服务器
npm run lint     # ESLint 检查
npm run test     # Vitest 单测
npm run build    # 生产构建
npm start        # 生产运行
```

## 项目结构

```
app/                    # Next.js 路由与 API 路由（/api/chat、/api/plans/active 等）
src/agent/              # Agent 编排：22 个工具、技能读写、计划、提示词、LLM 调用、确定性规则（危险信号/ATS/关键词匹配/改写质量/offer 红旗）
src/db/                 # Drizzle schema、迁移、仓储
src/components/         # UI 组件（聊天、侧栏、步骤卡片、抽屉）
src/plugins/            # 插件系统（OpenCLI：51job/Boss 岗位采集）
skills/                 # 求职领域技能库（12 个 SKILL.md，agentskills.io 标准）
docs/designs/           # 设计文档（调研报告、讨论纪要）
docs/plans/             # 计划文档（phase7-13）
data/                   # SQLite 数据库与运行期计划文件（本地生成，不入库）
```

## 隐私与数据

- 所有数据（简历、岗位、会话、记忆、教训）仅存储在本机 SQLite，不发送至任何第三方服务（模型调用除外）
- 简历文本与岗位描述仅用于本地模型调用，不写入日志
- 项目为单用户本地应用，不做鉴权与云部署

## 相关文档

- 项目状态与路线图：[`PROJECT_STATUS.md`](PROJECT_STATUS.md)
- 设计文档见 [`docs/designs/`](docs/designs/)（调研报告、P0/P1 讨论纪要）
- 计划文档见 [`docs/plans/`](docs/plans/)（每期含验收记录与已知限制）
