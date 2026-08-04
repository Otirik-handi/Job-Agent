# job-helper 脚手架搭建实施计划

> **元信息**：日期 2026-08-04 · 状态：完成 · 目标：脚手架搭建 · 关联规范：spec-autonomy.md、plan-document.md

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 job-helper 可运行工程骨架（Next.js 全栈 + TS + Tailwind v4），落地三份规范文件（AGENTS.md、spec-autonomy.md、plan-document.md），git 整洁提交。

**Architecture:** 单个 Next.js 应用（App Router，根级 `app/` 目录），仅工程基础依赖（next/react/typescript/tailwind/eslint），不装任何业务依赖（AI SDK/Drizzle/shadcn 等留待后续设计阶段，届时按需安装）。规范体系：`AGENTS.md`（薄）+ `.agents/specs/00-governance/` 两份根基规范。本计划不产生任何业务功能代码。

**Tech Stack:** Next.js（App Router）、TypeScript、Tailwind CSS v4、ESLint、npm。

**设计依据：** `docs/designs/2026-08-04-job-helper-initialization-design.md`（脚手架范围见其第 6、7 节）

**计划存放约定：** 计划文档统一存放 `docs/plans/`（不使用 superpowers 默认的 `docs/superpowers/plans/`，原因见初始化设计 6.1-3）

---

### Task 1: 环境确认与 Next.js 工程初始化

**Files:**
- Create: `package.json`、`app/`、`public/`、`next.config.ts`、`tsconfig.json`、`eslint.config.mjs`、`postcss.config.mjs`、`.gitignore` 等（由 create-next-app 生成）

- [x] **Step 1: 确认环境**

Run:
```bash
node -v && npm -v
```
Expected: `v24.x.x` 与 `11.x.x`（Node ≥ 18.18 即可）

- [x] **Step 2: 运行 create-next-app（非交互）**

Run（在 `C:\Users\Otirik\Desktop\WorkStation\job-helper` 下）:
```bash
npx --yes create-next-app@latest . --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*" --use-npm --turbopack --yes
```
Expected: 输出 `Success! Created job-helper at ...`，不报错。
说明：目录已有 `.git` 时 create-next-app 自动跳过 git init；`docs/` 目录不受影响。

- [x] **Step 3: 确认生成结果与 git 状态**

Run:
```bash
git status --short | head -20 && ls app/ && cat package.json | head -30
```
Expected: 看到 create-next-app 生成的文件（未提交）；`app/` 下有 `layout.tsx`、`page.tsx`、`globals.css`；package.json 含 next/react/typescript/tailwindcss 依赖。

- [x] **Step 4: 提交**

```bash
git add -A && git commit -m "chore: create-next-app 初始化工程骨架"
```

### Task 2: 工程可运行验证 + 首页占位

**Files:**
- Modify: `app/page.tsx`（替换示例页为极简占位）
- Modify: `app/layout.tsx`（metadata 标题改为项目名）

- [x] **Step 1: 构建验证（首次，应通过）**

Run: `npm run build`
Expected: `✓ Compiled successfully`，`Route (app)` 列出 `/`，构建成功退出码 0

- [x] **Step 2: 替换首页为极简占位**

Modify: `app/page.tsx` 全文替换为:
```tsx
export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">job-helper</h1>
        <p className="mt-2 text-sm text-gray-500">个人求职 Agent 应用（脚手架阶段）</p>
      </div>
    </main>
  );
}
```

- [x] **Step 3: 修改 layout 元信息**

Modify: `app/layout.tsx` 中 `metadata` 的 `title` 改为 `"job-helper"`、`description` 改为 `"个人求职 Agent 应用"`（其余内容保留 create-next-app 默认）

- [x] **Step 4: 构建复验**

Run: `npm run build`
Expected: `✓ Compiled successfully`

- [x] **Step 5: 开发服务器验证**

```bash
npm run dev &  # 后台启动，等待数秒
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```
Expected: 输出 `200`。验证后停止 dev 进程（`kill %1` 或任务管理器关闭 node 进程）。

- [x] **Step 6: 提交**

```bash
git add app/ && git commit -m "chore: 首页极简占位与元信息"
```

### Task 3: 落地 AGENTS.md（薄）

**Files:**
- Create: `AGENTS.md`

- [x] **Step 1: 写入 AGENTS.md**

Create: `AGENTS.md`，完整内容如下：
```markdown
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
```

- [x] **Step 2: 提交**

```bash
git add AGENTS.md && git commit -m "docs: 落地 AGENTS.md（薄）"
```

### Task 4: 落地根基规范①——spec-autonomy.md

**Files:**
- Create: `.agents/specs/00-governance/spec-autonomy.md`

- [x] **Step 1: 写入规范文件**

Create: `.agents/specs/00-governance/spec-autonomy.md`，完整内容如下：
```markdown
# 规范文档自治规范（spec-autonomy.md）

> 规范"规范本身"，是项目一切规范（含自身）的元规则。
> 为什么：防止规范体系膨胀（前身项目 91 份规范、部分失效未淘汰的教训）。

## 新增规范的条件

- 同一主题跨 3 处以上重复约定/纠错时，才允许立规范
- 单一场景规则不立规范，写进相关文件即可
- 为什么：规范是手段不是目的，规范越多维护成本越高

## 内容边界

- 每条规范必须可执行：命令、清单、模板
- 禁止空泛原则（如"注意代码质量"）
- 每条附一行"为什么"
- 为什么：不可执行的规范只会被忽略，空泛规范无法检验

## 修订流程

- 先改规范文档，再改代码
- 规范变更需在计划文档（docs/plans/）中记录
- 为什么：文档与实现脱节是规范失效的主要原因

## 淘汰机制

- 失效规范必须归档或删除，不允许"躺着占位"
- 为什么：僵尸规范会误导后续决策

## 唯一权威

- 一个主题只允许一份规范
- 冲突时以最新修订为准
- 为什么：多头权威导致执行歧义
```

- [x] **Step 2: 提交**

```bash
git add .agents/specs/ && git commit -m "docs: 落地根基规范①规范自治"
```

### Task 5: 落地根基规范②——plan-document.md

**Files:**
- Create: `.agents/specs/00-governance/plan-document.md`

- [x] **Step 1: 写入规范文件**

Create: `.agents/specs/00-governance/plan-document.md`，完整内容如下：
```markdown
# 计划文档规范（plan-document.md）

> 项目的规划与执行推进机制。
> 为什么：前身项目 openspec 工作流（proposal/design/tasks/archive 四件套）过重，本规范以轻量 Markdown 取代。

## 文档形态

- 轻量 Markdown，单文件 = 单个计划
- 存放于 `docs/plans/`，命名 `YYYY-MM-DD-<主题>.md`
- 为什么：单文件便于跟踪与检索

## 元信息块（头部）

每个计划头部必须包含：日期、状态（草稿/生效/完成/放弃）、目标、关联规范（如有）。
为什么：元信息是计划生命周期管理与恢复点的依据。

## 生命周期

- 草稿 → 生效 → 完成 / 放弃
- 草稿：规划中，未开始执行；生效：开始执行；完成：验收通过；放弃：明确记录放弃原因
- 为什么：状态不清的计划无法管理

## 恢复点（checkpoint）

- 每个计划必须有可验证的检查点（checkpoint）
- 检查点 = 可验证的中间产出（如"xxx 接口可用"、"xxx 文件就位"）
- 中断后从最近的已完成检查点继续
- 为什么：保证计划随时可中断、可恢复，不依赖执行者记忆

## 任务状态跟进

- 任务清单用 `- [ ]` / `- [x]` 实时打勾
- 任务完成立即更新，进度不靠脑记
- 为什么：打勾即证据，也是恢复点的载体

## 与规范联动

- 涉及规范变更的计划：先改规范文档，再实施代码
- 为什么：规范先行，实现后置，避免文档失效
```

- [x] **Step 2: 提交**

```bash
git add .agents/specs/ && git commit -m "docs: 落地根基规范②计划文档"
```

### Task 6: 验收核对

**Files:**
- 无（核对为主）

- [x] **Step 1: 核对工程可运行**

Run: `npm run build`
Expected: `✓ Compiled successfully`（退出码 0）

- [x] **Step 2: 核对规范文件就位**

Run:
```bash
ls AGENTS.md .agents/specs/00-governance/spec-autonomy.md .agents/specs/00-governance/plan-document.md
```
Expected: 三个文件均列出

- [x] **Step 3: 核对无业务功能实现**

Run:
```bash
find app src -type f 2>/dev/null | head -20 && grep -ri "drizzle\|@ai-sdk\|shadcn\|analyzeResume\|matchJob" app src package.json 2>/dev/null | head -5
```
Expected: 只有 create-next-app 默认文件；grep 无输出（无业务依赖与业务代码）

- [x] **Step 4: 核对 git 状态**

Run: `git status --short && git log --oneline`
Expected: 工作区干净；提交历史为 Task 1-5 的 5 个提交

- [x] **Step 5: 核对本计划文件归档**

Run: `ls docs/plans/`
Expected: `2026-08-04-scaffold-setup.md` 存在（本文件即首个计划文档样例）

- [x] **Step 6: 更新本计划状态并提交**

- 将本文档头部 `状态` 由 `草稿` 改为 `完成`（如无元信息块则按 plan-document.md 规范补充：日期 2026-08-04、状态 完成、目标 脚手架搭建）
```bash
git add docs/plans/ && git commit -m "docs: 脚手架搭建计划完成归档"
```

---

## 自审记录（执行前已核对）

- **规格覆盖**：初始化设计第 6.1 节（工程初始化→Task 1-2；规范落地→Task 3-5；文档目录→Task 6-5）与第 7 节验收标准（5 项→Task 6）全部有对应任务；第 6.2 节"不包含"（无业务依赖/功能）由 Task 1 依赖清单与 Task 6-3 兜底核对
- **无占位符**：所有文件内容与命令完整给出
- **类型一致性**：规范文件名（spec-autonomy.md / plan-document.md）、目录（docs/plans/、docs/designs/）与设计文档一致
