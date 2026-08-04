# 项目：job-helper（个人求职 Agent 应用）

## 产品定位

本地优先的个人求职助手 Agent 应用（非 SaaS），前身项目 find-work 的经验仅作借鉴，业务代码零迁移。

- 对话驱动：用户在对话中指挥 Agent 完成求职任务（简历分析、岗位匹配、投递建议、渠道发现、专属简历生成）
- 本地优先：本地 Web UI、SQLite 存储、API key 走本地环境变量、0 运维、免鉴权、单用户
- 技术栈：Next.js 全栈 + Vercel AI SDK + React + Tailwind CSS v4 + shadcn/ui + Drizzle + SQLite

## 能做什么 / 不能做什么

能：
- 对话式完成求职全流程任务，关键动作插入人工确认点
- 接入任意 OpenAI 兼容大模型（环境变量配置）

不能：
- 不做多用户、鉴权、云部署
- 不承诺自动伪造、补造或夸大用户经历、技能、雇主、证书或成果
- 不从前身项目迁移业务代码（杜绝旧债）
- 不把历史设计、历史计划当作当前实现依据

## 工程原则

- 成熟库优先，不重复造轮子：标准件（模型调用/工具协议/ORM/UI）用成熟库，业务编排与领域能力自研
- 测试服务于功能推进，不为测试而测试：仅核心纯逻辑做轻量单测，不设覆盖率门槛
- 规范体系轻量化：按 spec-autonomy.md 的规则沉淀规范，失效规范必归档

## 关键硬约束

- 与用户沟通默认使用中文。
- 读取和编辑文本文件时优先使用 UTF-8。
- 禁止全量读取规范与文档；必须按需定位并读取与当前任务直接相关的最小范围内容。
- 敏感信息不得写入日志：包括密码、token、Provider key、完整简历文本、完整岗位描述和 LLM 请求体。
- API key 只存于本地环境变量，不写入代码、配置文件、日志或 git。
- AGENTS.md 只保留入口级硬约束；长期工程细则按 spec-autonomy.md 的规则进入 `.agents/specs`。
- 规范标题和正文使用中文；目录名和文件名使用英文 kebab-case；技术专有名词、代码符号、命令和路径可以保留英文。
- 完成阶段性改动并通过验证后必须及时 git 提交；提交信息使用 Conventional Commits，只暂存本批相关文件。
- 大规模移动或删除前后必须用 git 做阶段存档，避免误操作。
- 日志文件放到 `logs/`，临时文件放到 `tmp/`。

## 权威顺序

1. AGENTS.md
2. `.agents/specs/`（00-governance 根基规范）
3. `docs/designs/`（设计文档）
4. `docs/plans/`（计划文档）
5. 其他 `docs/` 当前文档

## 目录索引

- `.agents/specs/00-governance/spec-autonomy.md`：规范文档自治规范（规范"规范本身"）
- `.agents/specs/00-governance/plan-document.md`：计划文档规范（生命周期/恢复点/任务打勾）
- `docs/designs/`：设计文档（约定：不使用 docs/superpowers/specs/，ZCode 客户端显示 bug）
- `docs/plans/`：计划文档
