# UI 轻量装饰实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-05 · 状态：完成 · 目标：在 Soft UI 已落地基础上加 6 项轻量装饰（3+4+6+8+9+10）· 关联规范：AGENTS.md、plan-document.md、SoftUI.md（本期已新增空状态条目）

**Goal:** 为 job-helper 增加 6 项轻量装饰：侧栏淡彩+底部圆点（3）、聊天区极淡网格（4）、空状态插画化（6）、品牌 Logo 区（8）、页面角落光斑（9）、资源项彩色图标底（10），布局结构与功能逻辑零改动。

**Architecture:** 装饰以纯 CSS 背景/定位为主（光斑、网格、渐变），新增 1 个通用组件 `EmptyState`（渐变圆底+图标+文案，可选动作区），替换全部裸灰字空状态；SoftUI.md 先加「空状态」规范条目（规范先行）。

**Tech Stack:** Tailwind CSS v4（@theme inline）、React 19、Next.js 16、lucide-react。

**设计依据：** `docs/designs/2026-08-05-ui-decoration-design.md`（第 2-5 节）
**验收标准：** 设计文档第 5 节 6 项 + 功能回归（对话流/工具进度/会话切换/抽屉）

---

### Task 1: SoftUI.md 新增「空状态」规范条目（规范先行）

**Files:**
- Modify: `SoftUI.md`（组件规则区，L59-65 附近）

- [x] **Step 1: 在「组件规则」列表追加空状态条目**

在 `SoftUI.md` 组件规则 `- 图标使用圆形背景 rounded-full bg-[color]/10` 之后追加一行：

```markdown
- 空状态：任何出现空状态的场景（新对话、列表为空、抽屉无内容）必须使用统一空状态组件（渐变圆底 + 图标 + 引导文案），禁止仅裸灰字提示
```

- [x] **Step 2: 验证与提交**

```bash
grep -n "空状态" SoftUI.md
# 预期输出：包含新条目行
git add SoftUI.md
git commit -m "docs: SoftUI.md 新增空状态规范条目"
```

**Checkpoint:** SoftUI.md 含空状态条目

---

### Task 2: 页面角落光斑（9）+ 聊天区极淡网格（4）

**Files:**
- Modify: `app/page.tsx`（main 根元素内）
- Modify: `src/components/chat/chat-panel.tsx`（消息滚动区）

- [x] **Step 1: page.tsx 主框架加两枚装饰光斑**

在 `app/page.tsx` 的 `<main className="flex h-screen">` 内、`<Sidebar` 之前插入：

```tsx
{/* 装饰光斑：固定背景层，不挡交互 */}
<div aria-hidden className="pointer-events-none fixed -bottom-24 -right-24 -z-10 size-96 rounded-full bg-indigo-500/15 blur-3xl" />
<div aria-hidden className="pointer-events-none fixed -left-24 -top-24 -z-10 size-80 rounded-full bg-pink-500/10 blur-3xl" />
```

- [x] **Step 2: chat-panel.tsx 消息滚动区叠加网格纹理**

将 `src/components/chat/chat-panel.tsx` 中消息滚动区：

```tsx
<div className="flex-1 overflow-y-auto p-4">
```

改为：

```tsx
<div
  className="flex-1 overflow-y-auto p-4"
  style={{
    backgroundImage:
      'linear-gradient(rgba(100,116,139,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(100,116,139,0.05) 1px, transparent 1px)',
    backgroundSize: '24px 24px',
  }}
>
```

- [x] **Step 3: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add app/page.tsx src/components/chat/chat-panel.tsx
git commit -m "feat: 页面角落光斑与聊天区极淡网格装饰"
```

**Checkpoint:** 构建通过；首页角落有极淡光斑、聊天区有细网格

---

### Task 3: 侧栏 Logo 区（8）+ 淡彩渐变与底部圆点（3）

**Files:**
- Modify: `src/components/sidebar/sidebar.tsx`

- [x] **Step 1: import 补充**

`sidebar.tsx` 顶部新增 lucide 导入：

```tsx
import { Sparkles } from 'lucide-react';
```

- [x] **Step 2: aside 背景改淡彩渐变**

```tsx
<aside className="flex w-[272px] shrink-0 flex-col border-r border-slate-200/60 bg-gradient-to-b from-indigo-50/70 via-white to-white shadow-card">
```

- [x] **Step 3: Tabs 前插入 Logo 区**

在 `<Tabs value={tab} ...>` 之前插入：

```tsx
{/* 品牌 Logo 区 */}
<div className="flex items-center gap-2.5 px-4 pb-2 pt-4">
  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-soft">
    <Sparkles className="size-4 text-white" />
  </div>
  <span className="truncate text-sm font-semibold text-slate-700">Job Helper</span>
</div>
```

- [x] **Step 4: Tabs 改为 flex-1 占满，尾部插底部圆点**

Tabs 组件加 `flex-1 min-h-0` 类名，并在 `</Tabs>` 之后、`</aside>` 之前插入：

```tsx
{/* 底部分色圆点装饰 */}
<div aria-hidden className="flex shrink-0 items-center justify-center gap-1.5 border-t border-slate-200/60 px-4 py-3 opacity-60">
  <span className="size-1.5 rounded-full bg-indigo-500" />
  <span className="size-1.5 rounded-full bg-pink-500" />
  <span className="size-1.5 rounded-full bg-emerald-500" />
  <span className="size-1.5 rounded-full bg-amber-500" />
</div>
```

- [x] **Step 5: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/sidebar/sidebar.tsx
git commit -m "feat: 侧栏 Logo 区、淡彩渐变与底部分色圆点"
```

**Checkpoint:** 侧栏顶部有渐变 Logo、背景淡彩、底部一排低饱和圆点

---

### Task 4: 资源项彩色图标底（10）

**Files:**
- Modify: `src/components/sidebar/resource-tabs.tsx`

- [x] **Step 1: import 补充**

```tsx
import { Briefcase, FileText, Trash2, Upload } from 'lucide-react';
```

- [x] **Step 2: 简历项加 indigo 圆底图标**

将简历列表项内：

```tsx
<div className="flex items-center justify-between gap-1">
  <span className="truncate">{r.name}</span>
```

改为：

```tsx
<div className="flex items-center justify-between gap-1">
  <span className="flex min-w-0 items-center gap-2">
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-indigo-500/10">
      <FileText className="size-3.5 text-indigo-600" />
    </span>
    <span className="truncate">{r.name}</span>
  </span>
```

- [x] **Step 3: 岗位项加 emerald 圆底图标**

将岗位列表项内：

```tsx
<div className="flex items-center justify-between gap-1">
  <span className="truncate">{job.company ? `${job.company} · ${job.title}` : '未命名岗位'}</span>
```

改为：

```tsx
<div className="flex items-center justify-between gap-1">
  <span className="flex min-w-0 items-center gap-2">
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/10">
      <Briefcase className="size-3.5 text-emerald-600" />
    </span>
    <span className="truncate">{job.company ? `${job.company} · ${job.title}` : '未命名岗位'}</span>
  </span>
```

- [x] **Step 4: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/sidebar/resource-tabs.tsx
git commit -m "feat: 资源列表项加分色圆形图标底"
```

**Checkpoint:** 简历项前 indigo 圆底文件图标、岗位项前 emerald 圆底公文包图标

---

### Task 5: 通用 EmptyState 组件（6）

**Files:**
- Create: `src/components/ui/empty-state.tsx`

- [x] **Step 1: 创建组件**

```tsx
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-10 text-center', className)}>
      <div
        className={cn(
          'flex items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-pink-100',
          compact ? 'size-10' : 'size-14',
        )}
      >
        <Icon className={compact ? 'size-5 text-indigo-500' : 'size-6 text-indigo-500'} />
      </div>
      <p className={cn('font-medium text-slate-700', compact ? 'text-xs' : 'text-sm')}>{title}</p>
      {description && (
        <p className={cn('max-w-60 leading-relaxed text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
```

- [x] **Step 2: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/ui/empty-state.tsx
git commit -m "feat: 通用空状态组件 EmptyState"
```

**Checkpoint:** 组件文件就位，构建通过

---

### Task 6: 全部空状态替换为 EmptyState（6）

**Files:**
- Modify: `src/components/sidebar/conversation-list.tsx`
- Modify: `src/components/sidebar/resource-tabs.tsx`
- Modify: `src/components/chat/chat-panel.tsx`
- Modify: `src/components/artifacts/resume-drawer.tsx`
- Modify: `src/components/artifacts/job-drawer.tsx`

- [x] **Step 1: 会话列表空状态**

`conversation-list.tsx`：import 加 `EmptyState` 与 `MessageSquare`，替换：

```tsx
{conversations.length === 0 && (
  <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">暂无会话</div>
)}
```

为：

```tsx
{conversations.length === 0 && (
  <EmptyState
    compact
    icon={MessageSquare}
    title="暂无会话"
    description="点击「＋ 新对话」开始求职之旅"
    className="rounded-2xl bg-slate-100/60 px-3 py-6"
  />
)}
```

- [x] **Step 2: 资源列表两处空状态**

`resource-tabs.tsx`：import 加 `EmptyState`（`FileText`/`Briefcase` 已在 Task 4 导入）。替换简历空状态：

```tsx
{resumes.length === 0 && (
  <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
    暂无简历，可上传文件（PDF / DOCX / TXT / MD）或在对话中粘贴文本导入
  </div>
)}
```

为：

```tsx
{resumes.length === 0 && (
  <EmptyState
    compact
    icon={FileText}
    title="暂无简历"
    description="上传 PDF / DOCX / TXT / MD，或在对话中粘贴文本导入"
    className="rounded-2xl bg-slate-100/60 px-3 py-6"
  />
)}
```

替换岗位空状态：

```tsx
{jobs.length === 0 && (
  <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
    暂无岗位，可在对话中粘贴 JD 导入
  </div>
)}
```

为：

```tsx
{jobs.length === 0 && (
  <EmptyState
    compact
    icon={Briefcase}
    title="暂无岗位"
    description="在对话中粘贴 JD，即可导入并匹配"
    className="rounded-2xl bg-slate-100/60 px-3 py-6"
  />
)}
```

- [x] **Step 3: 新对话主区空状态**

`chat-panel.tsx`：import 加 `EmptyState` 与 `Sparkles`。将消息区：

```tsx
<div className="flex-1 overflow-y-auto p-4">
  {messages.map((message, index) => (
```

改为（空消息时显示引导插画，非空时原样渲染）：

```tsx
<div className="flex-1 overflow-y-auto p-4">
  {messages.length === 0 ? (
    <EmptyState
      icon={Sparkles}
      title="你好，我是你的求职助手"
      description="让我帮你分析简历、匹配岗位、发现机会——直接告诉我你的需求吧"
      className="h-full"
    />
  ) : messages.map((message, index) => (
```

并同步调整闭合：`)}` 改为 `))}`（map 结束处多一层三目）。

- [x] **Step 4: 抽屉未分析/未匹配占位**

`resume-drawer.tsx`：import 加 `EmptyState` 与 `FileText`，替换：

```tsx
{detail && !analysis && (
  <p className="mt-4 text-sm text-muted-foreground">尚未分析，可在对话中让 Agent 分析这份简历。</p>
)}
```

为：

```tsx
{detail && !analysis && (
  <EmptyState
    icon={FileText}
    title="尚未分析"
    description="在对话中让 Agent 分析这份简历，结果会出现在这里"
    className="mt-8"
  />
)}
```

`job-drawer.tsx`：import 加 `EmptyState` 与 `Briefcase`，替换：

```tsx
{detail && !fit && (
  <p className="mt-4 text-sm text-muted-foreground">尚未匹配，可在对话中让 Agent 匹配这份岗位。</p>
)}
```

为：

```tsx
{detail && !fit && (
  <EmptyState
    icon={Briefcase}
    title="尚未匹配"
    description="在对话中让 Agent 匹配这份岗位，结果会出现在这里"
    className="mt-8"
  />
)}
```

- [x] **Step 5: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/sidebar/conversation-list.tsx src/components/sidebar/resource-tabs.tsx src/components/chat/chat-panel.tsx src/components/artifacts/resume-drawer.tsx src/components/artifacts/job-drawer.tsx
git commit -m "feat: 全部空状态场景替换为统一 EmptyState 插画"
```

**Checkpoint:** 会话/资源/新对话/抽屉空状态均显示统一插画，无裸灰字残留

---

### Task 7: 端到端验证与收尾

**Files:**
- 无（验证 + 更新计划文档打勾）

- [x] **Step 1: 静态检查**

```bash
grep -rn "rounded-none\|border-black" app src --include="*.tsx" --include="*.css"
# 预期：无输出（或无新增残留）
```

- [x] **Step 2: 构建与功能回归**

```bash
npm run build
```

手动回归清单（`npm run dev` 后验证）：
1. 首页：右下/右上角落极淡光斑（左上因侧栏遮挡已改为右上），不遮挡点击
2. 侧栏：顶部 Logo 渐变块 + 品牌名，背景淡彩渐变，底部四色圆点
3. 聊天区：极淡网格背景；新对话显示引导插画；消息渲染正常
4. 会话列表空时显示插画；资源页简历/岗位空时显示插画；资源项前有分色圆底图标
5. 抽屉：未分析简历/未匹配岗位显示插画；已分析内容正常
6. 对话流与工具进度卡工作正常

- [x] **Step 3: 更新计划状态并提交**

```bash
# 本文件头部状态：草稿 → 完成，全部 Task 打勾
git add docs/plans/2026-08-05-ui-decoration.md
git commit -m "docs: UI 轻量装饰计划完成（Task 1-7 打勾，端到端验证通过）"
```

**Checkpoint:** 构建通过、6 项验收全部满足、计划文档打勾提交
