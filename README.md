# Job Helper — 个人求职 Agent 应用

本地优先的个人求职助手。用户在对话中指挥 Agent 完成求职全流程任务：**简历分析、岗位匹配、投递建议、渠道发现、专属简历生成**。

- 🏠 **本地优先**：本地 Web UI + SQLite 存储，0 运维、免鉴权、单用户
- 💬 **对话驱动**：关键动作插入人工确认点，Agent 不自作主张
- 🔌 **模型无关**：接入任意 OpenAI 兼容大模型（环境变量配置）

## 功能

- **简历分析**：上传简历（PDF / Word），Agent 自动解析并给出结构化分析
- **岗位匹配**：导入或录入岗位机会，Agent 评估匹配度并给出建议
- **渠道发现**：根据求职方向发现可投递的招聘渠道
- **专属简历生成**：针对具体岗位生成/调整简历
- **会话管理**：多会话历史，随时继续

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | Next.js 16（App Router）+ React 19 |
| AI | Vercel AI SDK + OpenAI 兼容接口 |
| UI | Tailwind CSS v4 + shadcn/ui（Base UI） |
| 数据 | Drizzle ORM + better-sqlite3 |
| 校验 | Zod |
| 测试 | Vitest（核心纯逻辑轻量单测） |

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
app/                    # Next.js 路由与 API 路由（/api/chat、/api/resumes 等）
src/agent/              # Agent 编排：工具、提示词、LLM 调用
src/db/                 # Drizzle schema、迁移、仓储
src/components/         # UI 组件
docs/designs/           # 设计文档
docs/plans/             # 计划文档
data/                   # SQLite 数据库（本地生成，不入库）
```

## 隐私与数据

- 所有数据（简历、岗位、会话）仅存储在本机 SQLite，不发送至任何第三方服务（模型调用除外）
- 简历文本与岗位描述仅用于本地模型调用，不写入日志
- 项目为单用户本地应用，不做鉴权与云部署

## 相关文档

- 设计文档见 [`docs/designs/`](docs/designs/)
- 计划文档见 [`docs/plans/`](docs/plans/)
