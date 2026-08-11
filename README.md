# Job Helper — 个人求职 Agent 应用

本地优先的个人求职助手。用户在对话中指挥 Agent 完成求职全流程任务：**简历分析、岗位匹配、投递建议、渠道发现、专属简历生成、面试准备、求职信与 offer 评估**。

- 🏠 **本地优先**：本地 Web UI + SQLite 存储，0 运维、免鉴权、单用户
- 💬 **对话驱动**：关键动作插入人工确认点，Agent 不自作主张
- 🔌 **模型无关**：接入任意 OpenAI 兼容大模型（环境变量配置）

## 功能

### 求职全流程（对话驱动）

- **简历分析**：上传简历（PDF / Word / txt / md），Agent 自动解析并给出结构化分析（评分卡）
- **岗位匹配**：导入或录入岗位机会，Agent 评估匹配度并给出建议（含风险标注）
- **渠道发现**：根据 JD 发现可投递渠道（本地规则核验）
- **专属简历生成**：针对具体岗位生成专属版本（两段式确认，真实经历锚定，不伪造）
- **投递管理**：投递状态机（matched→applying→applied→interview→offer→hired），状态时序可追溯
- **面试准备**：生成完整面试准备包（背景要点/自我介绍话术/预测问题含应答与证据）
- **会话管理**：多会话历史，随时继续

### Agent 能力（P0+P1 已落地）

- 🧠 **记忆**：偏好/画像/进度常驻记忆块（显式写入、写前核对）+ 历史全文检索
- 📚 **技能库**：6 个求职领域技能（评分卡/JD 解析/匹配框架/求职信/面试/offer 评估），按需加载
- 🗺️ **显式规划**：复杂任务先出计划请求确认，计划文件持久化，中断可续跑
- 🔁 **反思**：失败/纠正后自动沉淀教训，新任务检索复用
- 📄 **会话摘要**：长会话首次截断时自动压缩旧轮，上下文不丢关键信息
- 🎴 **过程可见**：工具调用以三态步骤卡片留在消息流，失败可一键重试，规划进度横幅
- 🛡️ **护栏**：审批三档（只读免确认/可逆轻量/不可逆强确认）、结构化错误自愈、输入严格校验

> 项目当前状态与路线图见 [`PROJECT_STATUS.md`](PROJECT_STATUS.md)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ React 19 |
| AI | Vercel AI SDK + OpenAI 兼容接口 |
| UI | Tailwind CSS v4 + shadcn/ui（Base UI） |
| 数据 | Drizzle ORM + better-sqlite3（含 FTS5 全文检索） |
| 校验 | Zod |
| 测试 | Vitest（核心纯逻辑轻量单测，184 个） |

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
src/agent/              # Agent 编排：工具（13+ 个）、技能读写、计划、提示词、LLM 调用
src/db/                 # Drizzle schema、迁移、仓储
src/components/         # UI 组件（聊天、侧栏、步骤卡片、抽屉）
skills/                 # 求职领域技能库（SKILL.md，agentskills.io 标准）
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
