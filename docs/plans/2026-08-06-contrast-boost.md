# 界面对比度提升实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-06 · 状态：草稿 · 目标：主题对比度提升（方案 2+3 组合）+ 聊天输入框加宽 25% · 关联规范：AGENTS.md、plan-document.md、SoftUI.md

**Goal:** 主色加深一档（indigo-600）、输入框/文本域白底淡边框（slate-300）、主按钮 hover 加深（indigo-700）、次要/描边按钮边框可见、次要文字 slate-600、聊天输入区加宽 25%；布局结构与功能逻辑零改动。

**Architecture:** 令牌优先（路径 A）：`globals.css` 的 shadcn 变量 + `@theme` 为单一真相源，组件仅引用令牌；hover 加深通过新增 `--primary-hover` 令牌实现。

**Tech Stack:** Tailwind CSS v4（@theme inline）、shadcn 变量、React 19、Next.js 16。

**设计依据：** `docs/designs/2026-08-06-contrast-boost-design.md`
**验收标准：** 设计文档第 3-4 节全部落地 + 功能回归（对话流/输入/按钮/气泡/抽屉）

---

### Task 1: 主题令牌对比度提升（globals.css）

**Files:**
- Modify: `app/globals.css`（:root 变量区 L9-32 + @theme inline 区 L43-88）

- [ ] **Step 1: :root 修改三个令牌值 + 新增 --primary-hover**

`app/globals.css` 的 `:root` 块中：

```css
  --primary: #6366f1;
```
改为：
```css
  --primary: #4f46e5;
```

```css
  --muted-foreground: #64748b;
```
改为：
```css
  --muted-foreground: #475569;
```

```css
  --input: #e2e8f0;
```
改为：
```css
  --input: #cbd5e1;
```

并在 `:root` 块 `--ring: #6366f1;` 之后新增一行：

```css
  --primary-hover: #4338ca;
```

- [ ] **Step 2: @theme inline 注册 --color-primary-hover**

`@theme inline` 块中 `--color-primary: var(--primary);` 之后新增：

```css
  --color-primary-hover: var(--primary-hover);
```

- [ ] **Step 3: 验证与提交**

```bash
grep -n "primary-hover\|#4f46e5\|#475569\|#cbd5e1" app/globals.css
# 预期输出：包含新令牌行
npm run build
# 预期：构建成功
git add app/globals.css
git commit -m "style: 主题令牌对比度提升（primary indigo-600 / muted slate-600 / input slate-300 / primary-hover）"
```

**Checkpoint:** 令牌就位且构建通过

---

### Task 2: 按钮三级对比度（button.tsx）

**Files:**
- Modify: `src/components/ui/button.tsx`（variants 区 L10-22）

- [ ] **Step 1: 主按钮 hover 变浅 → 加深**

`buttonVariants` 的 `default` variant：

```tsx
        default:
          "bg-primary text-primary-foreground shadow-lg shadow-slate-200/50 hover:bg-primary/80 hover:shadow-lift",
```
改为：
```tsx
        default:
          "bg-primary text-primary-foreground shadow-lg shadow-slate-200/50 hover:bg-primary-hover hover:shadow-lift",
```

- [ ] **Step 2: 次要按钮加淡边框**

`secondary` variant：

```tsx
        secondary:
          "bg-secondary text-secondary-foreground shadow-lg shadow-slate-200/50 hover:shadow-lift hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
```
改为（追加 `border-border`，与页面背景区分）：
```tsx
        secondary:
          "border-border bg-secondary text-secondary-foreground shadow-lg shadow-slate-200/50 hover:shadow-lift hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
```

- [ ] **Step 3: 描边按钮边框实化**

`outline` variant：

```tsx
        outline:
          "border-0 bg-white shadow-soft hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
```
改为：
```tsx
        outline:
          "border-slate-300 bg-white shadow-soft hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
```

- [ ] **Step 4: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/ui/button.tsx
git commit -m "style: 按钮层级对比度提升（主按钮 hover 加深/次要加边框/描边实化）"
```

**Checkpoint:** 构建通过；主按钮 hover 变深、次要按钮有淡边框、描边按钮边框 slate-300

---

### Task 3: 输入类组件白底淡边框（input.tsx + textarea.tsx）

**Files:**
- Modify: `src/components/ui/input.tsx`（className 区 L11-14）
- Modify: `src/components/ui/textarea.tsx`（className 区 L9-11）

- [ ] **Step 1: input.tsx 灰底无边框 → 白底 + border-input + 聚焦环跟随主色**

```tsx
        "h-10 w-full min-w-0 rounded-2xl border-0 bg-gray-50 px-4 py-2 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm",
```
改为：
```tsx
        "h-10 w-full min-w-0 rounded-2xl border border-input bg-white px-4 py-2 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm",
```

- [ ] **Step 2: textarea.tsx 同款改法**

```tsx
        "flex field-sizing-content min-h-20 w-full rounded-2xl border-0 bg-gray-50 px-4 py-3 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm",
```
改为：
```tsx
        "flex field-sizing-content min-h-20 w-full rounded-2xl border border-input bg-white px-4 py-3 text-base transition-all outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/50 md:text-sm",
```

- [ ] **Step 3: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/ui/input.tsx src/components/ui/textarea.tsx
git commit -m "style: 输入类组件白底淡边框 + 聚焦环跟随主色"
```

**Checkpoint:** 构建通过；输入框/文本域白底 + slate-300 边框，聚焦环 indigo

---

### Task 4: 聊天输入区加宽 25% + 用户气泡主色令牌化

**Files:**
- Modify: `src/components/chat/chat-input.tsx`（容器 div L17）
- Modify: `src/components/chat/message-bubble.tsx`（头像 class L20）

- [ ] **Step 1: chat-input.tsx 容器加宽**

```tsx
        <div className="mx-auto w-full max-w-2xl">
```
改为（672px × 1.25 = 840px = 52.5rem）：
```tsx
        <div className="mx-auto w-full max-w-[52.5rem]">
```

- [ ] **Step 2: message-bubble.tsx 用户头像/气泡主色令牌化**

```tsx
          isUser ? 'bg-indigo-500/10 text-indigo-600' : 'bg-slate-200/70 text-slate-600',
```
改为（跟随主色加深，值恰好一致）：
```tsx
          isUser ? 'bg-primary/10 text-primary' : 'bg-slate-200/70 text-slate-600',
```

- [ ] **Step 3: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/chat/chat-input.tsx src/components/chat/message-bubble.tsx
git commit -m "style: 聊天输入区加宽 25%（840px）+ 用户气泡主色令牌化"
```

**Checkpoint:** 构建通过；聊天输入区明显加宽，用户气泡底色/图标色跟随主色加深

---

### Task 5: 端到端验证与收尾

**Files:**
- 无（验证 + 更新计划文档打勾）

- [ ] **Step 1: 静态检查**

```bash
grep -rn "bg-gray-50\|border-0\|ring-indigo-500" src/components/ui/input.tsx src/components/ui/textarea.tsx src/components/ui/button.tsx
# 预期：无输出（输入类灰底/无边框残留已被替换）
npm run lint
# 预期：通过
npm run build
# 预期：构建成功
```

- [ ] **Step 2: 手动回归清单（`npm run dev` 后逐项验证）**

1. 主按钮：indigo-600 白字（更醒目），hover 变深（indigo-700）而非变浅
2. 次要按钮：浅灰底 + 可见淡边框；描边按钮：白底 + slate-300 边框
3. 输入框/聊天文本域：白底 + slate-300 边框，聚焦时 indigo 环；占位符文字加深（slate-600）
4. 聊天输入区：宽度明显加宽（约占主区 75% 容器，840px）
5. 用户消息气泡：底色/图标色加深（indigo 系），助手气泡不变
6. 功能回归：对话流正常、工具进度卡正常、发送/停止按钮样式正常、抽屉打开关闭正常
7. 装饰回归：侧栏渐变/Logo/圆点、聊天区网格、光斑均不受影响

- [ ] **Step 3: 更新计划状态并提交**

```bash
# 本文件头部状态：草稿 → 完成，全部 Task 打勾
git add docs/plans/2026-08-06-contrast-boost.md
git commit -m "docs: 界面对比度提升计划完成（Task 1-5 打勾，端到端验证通过）"
```

**Checkpoint:** lint/build 通过、回归清单全部满足、计划文档打勾提交
