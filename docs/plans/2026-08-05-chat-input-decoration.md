# 输入框装饰与侧栏加宽实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-05 · 状态：草稿 · 目标：装饰聊天输入区（收窄居中 + 浅底图标 + 占位引导 + 快捷键提示）并将侧栏加宽 10%（272px → 300px）· 关联规范：AGENTS.md、plan-document.md、SoftUI.md

**Goal:** 将聊天底部输入区改造为 ChatGPT 式收窄居中布局，加浅底 Paperclip 图标、💡 引导占位文案与快捷键提示；侧栏宽度 272px → 300px。布局结构与功能逻辑零改动。

**Architecture:** 纯展示层调整：输入区容器保持全宽白条，内部内容包 `max-w-2xl mx-auto` 收窄居中；Textarea 外包 relative 容器放置 absolute 装饰图标并加 `pl-10`；侧栏 aside 仅改宽度类。

**Tech Stack:** Tailwind CSS v4、React 19、lucide-react（Paperclip 图标）。

**设计依据：** `docs/designs/2026-08-05-chat-input-decoration-design.md`（第 2-4 节）
**验收标准：** 设计文档第 4 节 6 项 + 功能回归（发送/停止/禁用态）

---

### Task 1: 输入区装饰（chat-input.tsx）

**Files:**
- Modify: `src/components/chat/chat-input.tsx`

- [ ] **Step 1: 新增 lucide 导入**

在 `chat-input.tsx` 顶部（`import { useState } from 'react';` 之后）新增：

```tsx
import { Paperclip } from 'lucide-react';
```

- [ ] **Step 2: 输入区收窄居中 + 图标 + 占位文案 + 快捷键提示**

将 `chat-input.tsx` 整个 return 块：

```tsx
  return (
    <div className="border-t border-slate-200 bg-white p-4">
      <Textarea
        value={text}
        placeholder="输入消息，Enter 发送，Shift+Enter 换行"
        disabled={disabled}
        rows={3}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (text.trim() && !disabled) {
              onSend(text.trim());
              setText('');
            }
          }
        }}
      />
      <div className="mt-2 flex justify-end gap-2">
        {streaming ? (
          <Button size="sm" variant="outline" onClick={onStop}>停止</Button>
        ) : (
          <Button size="sm" disabled={disabled || !text.trim()} onClick={() => { onSend(text.trim()); setText(''); }}>
            发送
          </Button>
        )}
      </div>
    </div>
  );
```

替换为：

```tsx
  return (
    <div className="border-t border-slate-200 bg-white p-4">
      <div className="mx-auto w-full max-w-2xl">
        <div className="relative">
          {/* 装饰图标：浅底回形针，纯装饰（未来可接入上传入口） */}
          <span aria-hidden className="pointer-events-none absolute left-3 top-3.5 flex size-6 items-center justify-center rounded-full bg-indigo-500/10">
            <Paperclip className="size-3.5 text-indigo-500" />
          </span>
          <Textarea
            value={text}
            placeholder="💡 试着告诉我：帮我分析简历 / 匹配这个岗位"
            disabled={disabled}
            rows={3}
            className="pl-10"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (text.trim() && !disabled) {
                  onSend(text.trim());
                  setText('');
                }
              }
            }}
          />
        </div>
        <div className="mt-2 flex items-center justify-end gap-2">
          <span className="text-xs text-muted-foreground">Shift+Enter 换行</span>
          {streaming ? (
            <Button size="sm" variant="outline" onClick={onStop}>停止</Button>
          ) : (
            <Button size="sm" disabled={disabled || !text.trim()} onClick={() => { onSend(text.trim()); setText(''); }}>
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
```

- [ ] **Step 3: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/chat/chat-input.tsx
git commit -m "feat: 输入区收窄居中、浅底图标、引导占位与快捷键提示"
```

**Checkpoint:** 输入区居中收窄、图标/文案/提示就位，构建通过

---

### Task 2: 侧栏加宽 10%（sidebar.tsx）

**Files:**
- Modify: `src/components/sidebar/sidebar.tsx`

- [ ] **Step 1: aside 宽度 272px → 300px**

将 `sidebar.tsx` 中：

```tsx
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-slate-200/60 bg-gradient-to-b from-indigo-50/70 via-white to-white shadow-card">
```

改为：

```tsx
    <aside className="flex w-[300px] shrink-0 flex-col border-r border-slate-200/60 bg-gradient-to-b from-indigo-50/70 via-white to-white shadow-card">
```

- [ ] **Step 2: 验证与提交**

```bash
npm run build
# 预期：构建成功
git add src/components/sidebar/sidebar.tsx
git commit -m "style: 侧栏加宽 10%（272px → 300px）"
```

**Checkpoint:** 侧栏 300px，构建通过

---

### Task 3: 端到端验证与收尾

**Files:**
- 无（验证 + 更新计划文档打勾）

- [ ] **Step 1: 静态检查**

```bash
grep -rn "rounded-none\|border-black" app src --include="*.tsx" --include="*.css"
# 预期：仅 tabs.tsx 的 data-[variant=line]:rounded-none 功能性变体（既有代码），无新增残留
```

- [ ] **Step 2: 构建与回归**

```bash
npm run build
npm test
# 预期：构建成功；15/15 单测通过
```

手动回归清单（`npm run dev` 后验证）：
1. 输入区内容居中收窄（max-w-2xl），两侧留白
2. 输入框左上角浅底 Paperclip 图标，输入文字不与图标重叠（pl-10 生效）
3. placeholder 显示 💡 引导文案；发送按钮左侧有「Shift+Enter 换行」小字
4. 输入文字后发送按钮可用，Enter 发送、Shift+Enter 换行正常；停止按钮正常
5. 侧栏 300px 宽，Logo/列表/底部圆点布局正常，会话/资源切换正常

- [ ] **Step 3: 更新计划状态并提交**

```bash
# 本文件头部状态：草稿 → 完成，全部 Task 打勾
git add docs/plans/2026-08-05-chat-input-decoration.md
git commit -m "docs: 输入框装饰与侧栏加宽计划完成（Task 1-3 打勾，端到端验证通过）"
```

**Checkpoint:** 构建/测试通过、验收项全部满足、计划文档打勾提交
