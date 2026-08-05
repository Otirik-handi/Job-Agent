# UI/UX（Soft UI 风格全面落地）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-05 · 状态：生效 · 目标：Soft UI 风格全面落地（令牌 + 组件 + 布局密度 + 动效）· 关联规范：AGENTS.md、plan-document.md

**Goal:** 将 job-helper 现有界面从 shadcn neutral 默认样式全面改造为 Soft UI 风格（浅底、圆角 2xl/3xl、彩色柔和阴影、低饱和 indigo 主色、实体感动效），布局结构不变，功能逻辑零改动。

**Architecture:** 以 globals.css 的 shadcn CSS 变量为单一真相源（色板/圆角/阴影令牌一次改造，全部 shadcn 组件自动继承），组件级 class 按设计文档第 3 节逐组件调整；动效统一规范（hover 上浮/active 压缩/focus 环/reduced-motion）。

**Tech Stack:** Tailwind CSS v4（@theme inline）、shadcn/ui（Base UI）、React 19、Next.js 16。

**设计依据：** `docs/designs/2026-08-05-ui-ux-softui-design.md`（第 2-7 节）、`SoftUI.md`（风格权威）
**验收标准：** 设计文档第 7 节 5 项 + 功能回归（对话流/进度卡/会话切换/抽屉）

---

### Task 1: globals.css 令牌改造（色板 + 圆角 + 阴影 + reduced-motion）

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: 替换 `:root` 色板与圆角**

Modify `app/globals.css`：将 `:root { ... }` 块（L7-40）整体替换为：
```css
:root {
  --background: #f8fafc;
  --foreground: #334155;
  --card: #ffffff;
  --card-foreground: #334155;
  --popover: #ffffff;
  --popover-foreground: #334155;
  --primary: #6366f1;
  --primary-foreground: #ffffff;
  --secondary: #f1f5f9;
  --secondary-foreground: #334155;
  --muted: #f1f5f9;
  --muted-foreground: #64748b;
  --accent: #f1f5f9;
  --accent-foreground: #334155;
  --destructive: #ef4444;
  --border: #e2e8f0;
  --input: #e2e8f0;
  --ring: #6366f1;
  --chart-1: #6366f1;
  --chart-2: #10b981;
  --chart-3: #f59e0b;
  --chart-4: #ec4899;
  --chart-5: #64748b;
  --radius: 1rem;
  --sidebar: #ffffff;
  --sidebar-foreground: #334155;
  --sidebar-primary: #6366f1;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: #f1f5f9;
  --sidebar-accent-foreground: #334155;
  --sidebar-border: #e2e8f0;
  --sidebar-ring: #6366f1;
}
```

- [ ] **Step 2: @theme inline 增加阴影令牌**

Modify `app/globals.css`：在 `@theme inline { ... }` 块内（`--radius-4xl` 行之后）追加：
```css
  --shadow-soft: 0 4px 12px -2px rgb(100 116 139 / 0.12);
  --shadow-card: 0 10px 24px -6px rgb(100 116 139 / 0.18);
  --shadow-lift: 0 12px 24px -6px rgb(99 102 241 / 0.18);
```

- [ ] **Step 3: 删除 dark 媒体查询与 .dark 块（本项目不做深色模式）**

Modify `app/globals.css`：删除 `@media (prefers-color-scheme: dark) { :root { ... } }` 块（L86-91）与 `.dark { ... }` 块（L99-131）。若 `@custom-variant dark` 声明导致 Tailwind 警告（无 dark: 使用），保留该行无碍；若 build 报错则一并删除。

- [ ] **Step 4: body 字体与 reduced-motion**

Modify `app/globals.css`：`body` 规则改为：
```css
body {
  background: var(--background);
  color: var(--foreground);
  font-family: system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}
```
在文件末尾追加：
```css
@media (prefers-reduced-motion: reduce) {
  *, ::before, ::after {
    transition-duration: 0.01ms !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
  }
}
```

- [ ] **Step 5: 验证与提交**

Run: `npm run build`
Expected: 编译通过（若 Tailwind 因未使用的 dark 变体报错，按 Step 3 注处理）。
```bash
git add app/globals.css && git commit -m "style: Soft UI 设计令牌（色板/圆角/阴影/字体/reduced-motion）"
```

### Task 2: 输入类组件（input / textarea）

**Files:**
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/textarea.tsx`

- [ ] **Step 1: input 改造**

Modify `src/components/ui/input.tsx`：将 className 的 base 串替换为：
```
"h-10 w-full min-w-0 rounded-2xl border-0 bg-gray-50 px-4 py-2 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm"
```
（保留 `className` 拼接与外层结构不变；删除原 border-input/bg-transparent/focus-visible:border-ring 等默认样式）

- [ ] **Step 2: textarea 改造**

Modify `src/components/ui/textarea.tsx`：base 串替换为：
```
"flex field-sizing-content min-h-20 w-full rounded-2xl border-0 bg-gray-50 px-4 py-3 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm"
```

- [ ] **Step 3: 验证与提交**

Run: `npm run build` → 通过
```bash
git add src/components/ui/input.tsx src/components/ui/textarea.tsx && git commit -m "style: 输入组件 Soft UI 化（无边框/浅底/圆角/聚焦环）"
```

### Task 3: 按钮组件（变体 + 动效 + 尺寸）

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: 改造按钮 variants 与 base**

Modify `src/components/ui/button.tsx`：
1. base 串：`rounded-lg` → `rounded-2xl`；`transition-all` 保留；`active:not-aria-[haspopup]:translate-y-px` → `active:not-aria-[haspopup]:scale-95`；新增 `hover:-translate-y-0.5 active:scale-95`（注意与 aria 版本共存：改为 `hover:-translate-y-0.5 active:not-aria-[haspopup]:scale-95`）
2. `default` variant：`bg-primary text-primary-foreground hover:bg-primary/80` → `bg-primary text-primary-foreground shadow-lg shadow-indigo-500/20 hover:bg-primary/80 hover:shadow-lift`
3. `secondary` variant：追加 `shadow-lg shadow-slate-200/50 hover:shadow-lift`
4. `outline` variant：`border-border` → `border-0 bg-white shadow-soft`（保持 hover:bg-muted）
5. `destructive` variant：`bg-destructive/10 text-destructive` → `bg-destructive/10 text-destructive`（保持）
6. size `default`：`h-8 gap-1.5 px-2.5` → `h-10 gap-2 px-5`；size `sm`：`h-7 ... px-2.5` → `h-9 ... px-4`；size `lg`：`h-9 ... px-2.5` → `h-11 ... px-6`
> 具体替换以当前文件实际内容为基准，保持 cva 结构与其余变体（ghost/link/xs/icon 系列）不变；若与上文有出入以文件为准做等价修改，并在提交信息注明。

- [ ] **Step 2: 验证与提交**

Run: `npm run build` → 通过
```bash
git add src/components/ui/button.tsx && git commit -m "style: 按钮 Soft UI 化（圆角/彩影/悬浮位移/按压压缩）"
```

### Task 4: Tabs / Badge 组件微调

**Files:**
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: TabsList pill 化**

Modify `src/components/ui/tabs.tsx`：TabsList 的 base 串中 `rounded-lg p-[3px]` → `rounded-2xl p-1`，`group-data-horizontal/tabs:h-8` → `group-data-horizontal/tabs:h-10`。激活项样式若在 TabsList 内（data-[selected] 相关 class 或独立 Tab 组件），将激活态改为 `bg-white shadow-soft`（以实际文件结构为准，Tab 组件若有 `data-selected:` 变体则替换为 `data-selected:bg-white data-selected:shadow-soft data-selected:text-foreground`）。

- [ ] **Step 2: Badge 点缀化**

Modify `src/components/ui/badge.tsx`：`rounded-4xl` → `rounded-full`；`secondary` variant：`bg-secondary text-secondary-foreground` → `bg-indigo-500/10 text-indigo-700`。

- [ ] **Step 3: 验证与提交**

Run: `npm run build` → 通过
```bash
git add src/components/ui/tabs.tsx src/components/ui/badge.tsx && git commit -m "style: Tabs pill 化 + Badge 点缀化"
```

### Task 5: 布局骨架（主区密度 + 左栏宽度）

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: 布局密度调整**

Modify `app/page.tsx`：
1. `main` 的 `flex h-screen` 保持；在 main 上追加 `bg-background`（令牌已改，可省略）
2. Sidebar 宽度由 `w-64` 改为 `w-[272px]`（Sidebar 组件内修改，见 Task 6）
3. 聊天主区容器 `flex-1` → `flex-1 bg-background`（令牌已生效，可省略）
> 本任务实际改动集中在 Sidebar 组件与 ChatPanel 内部 padding——见 Task 6/7/8；本任务仅验证令牌后全局观感并提交布局相关微调（若页面无其他改动则与 Task 6 合并提交，报告注明）。

- [ ] **Step 2: 验证与提交**

Run: `npm run build` → 通过。若无独立改动，跳过本任务提交（合并进 Task 6）。

### Task 6: 侧栏组件（sidebar / conversation-list / resource-tabs）

**Files:**
- Modify: `src/components/sidebar/sidebar.tsx`
- Modify: `src/components/sidebar/conversation-list.tsx`
- Modify: `src/components/sidebar/resource-tabs.tsx`

- [ ] **Step 1: sidebar.tsx 改造**

Modify `src/components/sidebar/sidebar.tsx`：
- `aside`：`flex w-64 shrink-0 flex-col border-r` → `flex w-[272px] shrink-0 flex-col border-r border-slate-200/60 bg-white shadow-card`（白底 + 柔和阴影替代硬边框观感）
- TabsList 使用 Task 4 的 pill 样式（自动生效）

- [ ] **Step 2: conversation-list.tsx 改造**

Modify `src/components/sidebar/conversation-list.tsx`：
- 列表项 button：`rounded-md px-2 py-1.5 ... hover:bg-muted` → `rounded-xl px-3 py-2 transition-all hover:bg-slate-100`
- active 项：`bg-muted font-medium` → `bg-slate-100 font-medium shadow-soft` + 追加左侧 indigo 指示圆点：
```tsx
<div className="relative">
  {c.id === activeId && <span className="absolute left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-indigo-500" />}
  {/* 原内容 */}
</div>
```
- 容器 `gap-1 p-2` → `gap-1.5 p-3`
- 空状态文案容器 padding 微调（`px-2 py-4` → `px-3 py-6`）

- [ ] **Step 3: resource-tabs.tsx 改造**

Modify `src/components/sidebar/resource-tabs.tsx`：
- 容器 `gap-1 p-2` → `gap-1.5 p-3`
- 子 Tab 标签行：`rounded bg-muted px-2 py-1` → `rounded-full bg-slate-100 px-3 py-1`（未激活的 `px-2 py-1` 同样改 `px-3 py-1`）
- 列表项 button：`rounded-md px-2 py-1.5 ... hover:bg-muted` → `rounded-xl px-3 py-2 transition-all hover:bg-slate-100`
- 空状态文案 `px-2 py-4` → `px-3 py-6`

- [ ] **Step 4: 验证与提交**

Run: `npm run build` → 通过
```bash
git add src/components/sidebar && git commit -m "style: 侧栏 Soft UI 化（白底/柔和阴影/列表项圆角/指示点）"
```

### Task 7: 聊天组件（气泡 / 进度卡 / 输入区）

**Files:**
- Modify: `src/components/chat/message-bubble.tsx`
- Modify: `src/components/chat/tool-progress-card.tsx`
- Modify: `src/components/chat/chat-input.tsx`

- [ ] **Step 1: message-bubble.tsx 改造**

Modify `src/components/chat/message-bubble.tsx`：气泡容器 class 改为：
```tsx
<div
  className={cn(
    'max-w-[80%] rounded-2xl px-4 py-3 shadow-soft',
    isUser
      ? 'bg-primary/10 text-slate-800'
      : 'bg-white text-slate-800',
  )}
>
```
（`mb-3` → `mb-4`；`rounded-lg px-3 py-2` → `rounded-2xl px-4 py-3 shadow-soft`；user 用柔和填充 `bg-primary/10`，assistant 白卡片式）

- [ ] **Step 2: tool-progress-card.tsx 改造**

Modify `src/components/chat/tool-progress-card.tsx`：容器 class 改为：
```tsx
<div className="mb-4 flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm text-slate-600 shadow-soft">
  <span className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
  <span>{progress.message}</span>
</div>
```

- [ ] **Step 3: chat-input.tsx 改造**

Modify `src/components/chat/chat-input.tsx`：
- 容器 `border-t p-3` → `border-t border-slate-200/60 bg-white/60 p-4 backdrop-blur-sm`（柔和分区；backdrop-blur 属于"避免景深"边界——若与 SoftUI 交互规则冲突则去掉 backdrop-blur-sm，保留 bg-white/60）
- 发送按钮利用 Task 3 的按钮新样式（自动生效），文案按钮（停止）用 `variant="outline"`（Task 3 已改 outline 为白底）
- Textarea 用 Task 2 的新样式（自动生效）

- [ ] **Step 4: 验证与提交**

Run: `npm run build` → 通过
```bash
git add src/components/chat && git commit -m "style: 聊天组件 Soft UI 化（气泡柔和填充/进度卡/输入区分区）"
```

### Task 8: 抽屉组件（resume-drawer + sheet 圆角阴影）

**Files:**
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/artifacts/resume-drawer.tsx`

- [ ] **Step 1: sheet 内容圆角与阴影**

Modify `src/components/ui/sheet.tsx`：`SheetContent` 的 base class 中圆角/阴影部分调整为 `rounded-l-3xl shadow-card`（以实际生成代码为基准：找到 SheetContent 的 className，将侧滑侧的对边圆角改为 rounded-l-3xl、阴影改为 shadow-card；Backdrop 背景色保持半透明黑但不突兀，可调为 `bg-slate-900/30`）。

- [ ] **Step 2: resume-drawer 样式**

Modify `src/components/artifacts/resume-drawer.tsx`：
- `SheetContent` 传 `className="w-[480px] overflow-y-auto"` 保持
- 内容区间距：`mt-4 space-y-4` → `mt-6 space-y-5`
- 评分行/列表标题保持；Badge 已由 Task 4 点缀化
- 空状态文案 `text-sm text-muted-foreground` 保持（令牌已生效）

- [ ] **Step 3: 验证与提交**

Run: `npm run build` → 通过
```bash
git add src/components/ui/sheet.tsx src/components/artifacts && git commit -m "style: 抽屉 Soft UI 化（大圆角/柔和阴影）"
```

### Task 9: 空状态与收尾检查

**Files:**
- Modify: 视检查结果而定（conversation-list / resource-tabs 空状态已有，仅确认观感）

- [ ] **Step 1: 空状态补强**

- `resource-tabs.tsx` 与 `conversation-list.tsx` 的空状态文案外层套 `rounded-2xl bg-slate-100/60 px-3 py-6 text-center`（若 Task 6 已含则跳过）

- [ ] **Step 2: 禁止项 grep 检查**

Run:
```bash
grep -rn "rounded-none\|border-black\|bg-black\|shadow-\[" src/components app --include="*.tsx" --include="*.ts" | grep -v "rounded-none:" || echo "无禁止项残留"
grep -rn "bg-indigo-500\|bg-primary" src/components --include="*.tsx" | head -20
```
Expected: 无 `rounded-none`/`border-black`/`bg-black`/`shadow-[`（硬阴影任意值）残留（业务代码中原有的 `bg-primary text-primary-foreground` 等属令牌引用，允许）；记录结果。

- [ ] **Step 3: 提交**

```bash
git add -A && git commit -m "style: 空状态与禁止项检查收尾"
```
（若无改动则跳过提交，在报告中说明）

### Task 10: 验收（回归 + 归档）

**Files:**
- Modify: `docs/plans/2026-08-05-ui-ux-softui.md`（本计划，归档）

- [ ] **Step 1: 构建与单测回归**

Run: `npm test && npm run build`
Expected: 6 单测全绿；构建通过（7 路由生成）。

- [ ] **Step 2: 功能回归（dev 服务器 + curl）**

Run: `npm run dev`（后台）
1. `curl -s http://localhost:3000 | grep -o "job-helper" | head -1` → 页面可访问
2. 对话链路协议级回归（可复用第 1 期 Task 13 的方式，或简化）：POST /api/chat 一条"你好"消息 → 200 + SSE 流含文本（无工具调用路径即可验证端点未破坏）
3. `curl -s http://localhost:3000/api/resumes` → 200（若库中有第 1 期验证数据则返回列表）
停止 dev 服务器（taskkill 端口 3000 进程树）。

- [ ] **Step 3: 浏览器视觉抽查（用户执行）**

用户手动验证（`npm run dev` 后浏览器）：
- 页面第一眼：浅底（slate-50）、白色侧栏、圆角组件、彩色柔和阴影
- 按钮 hover 上浮 + 阴影加深、按压 scale-95
- 输入框聚焦：浅灰底变白 + indigo 光环
- 会话切换、抽屉打开、进度卡片呈现均正常
- 无突兀的深色残留（无深色模式切换入口）

- [ ] **Step 4: 计划归档**

- 本文件头部 `状态：生效` → `状态：完成`；全部 `- [ ]` 打勾
```bash
git add -A && git commit -m "docs: UI/UX 实施计划完成归档"
```

---

## 自审记录

**规格覆盖**：设计文档第 2 节令牌→Task 1；第 3 节组件→Task 2/3/4/6/7/8（9 类组件全覆盖：按钮/输入/气泡/进度卡/侧栏/Tabs/抽屉/Badge/空状态）；第 4 节布局→Task 5/6；第 5 节动效→Task 1（reduced-motion）+ Task 3/7（hover/active）；第 7 节验收→Task 9（grep）+ Task 10；SoftUI 禁止项（无 rounded-none/border-black/硬阴影/高饱和大面积）→Task 9 检查。

**占位符**：无 TBD；shadcn 生成文件的"以实际内容为基准"是等价替换说明（生成文件结构已知），非占位。

**类型一致性**：无类型/签名变更（纯样式任务）；组件 props 结构不变。
