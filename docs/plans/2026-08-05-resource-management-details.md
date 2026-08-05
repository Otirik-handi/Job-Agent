# 资源管理细节优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **元信息**：日期 2026-08-05 · 状态：草稿 · 目标：会话删除/重命名、简历/岗位删除（弹窗确认）、列表日期显示 · 关联规范：AGENTS.md、plan-document.md

**Goal:** 侧边栏三类资源（会话/简历/岗位）获得删除能力（AlertDialog 弹窗二次确认）、会话获得悬停重命名、列表日期统一相对时间显示。

**Architecture:** 后端补 DELETE API + repository 删除函数 + 开启 SQLite 外键；前端新建通用 `ConfirmDialog`（Base UI AlertDialog）与 `formatRelativeTime` 纯函数；会话列表与资源面板各自接入悬停操作；`page.tsx` 协调删除当前会话后的切换与被删资源抽屉关闭。

**Tech Stack:** Base UI AlertDialog（@base-ui/react/alert-dialog）、lucide-react（Pencil/Trash2）、vitest（纯函数单测）、现有 drizzle/better-sqlite3。

**设计依据：** `docs/designs/2026-08-05-resource-management-details.md`
**验收标准：** 设计文档第 6 节（formatRelativeTime 单测 + 人工验证）

**已确认的 API 事实**：
- `@base-ui/react/alert-dialog` 导出 `Root/Portal/Backdrop/Popup/Title/Description/Close`（与 Sheet 同构；`Close` 为 render prop：`<AlertDialog.Close render={<Button …/>} />`）
- `useConversations` 已有 `remove(id)`（DELETE → refresh）；`app/api/conversations/[id]` 已有 PATCH/DELETE
- `app/api/resumes/[id]/route.ts` 与 `app/api/job-opportunities/[id]/route.ts` 现有 GET，需补 DELETE
- `src/db/index.ts` 未开启 `PRAGMA foreign_keys`（需补；tailored_resumes 级联依赖）
- 会话列表按 updatedAt 倒序（listConversations）

---

### Task 1: formatRelativeTime 纯函数（TDD）

**Files:**
- Create: `src/lib/format-time.ts`
- Test: `src/lib/format-time.test.ts`

- [ ] **Step 1: 写失败测试**

Create `src/lib/format-time.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './format-time';

describe('format-time', () => {
  it('今天显示 HH:mm', () => {
    expect(formatRelativeTime(new Date().toISOString())).toMatch(/^\d{2}:\d{2}$/);
  });
  it('昨天显示「昨天」', () => {
    expect(formatRelativeTime(new Date(Date.now() - 86400000).toISOString())).toBe('昨天');
  });
  it('同年更早显示 MM-DD', () => {
    const now = new Date();
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    if (now.getDate() === 1) d.setMonth(d.getMonth() - 1);
    expect(formatRelativeTime(d.toISOString())).toMatch(/^\d{2}-\d{2}$/);
  });
  it('更早年份显示 YYYY-MM-DD', () => {
    expect(formatRelativeTime('2025-06-15T08:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('非法时间返回空串', () => {
    expect(formatRelativeTime('not-a-date')).toBe('');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run src/lib/format-time.test.ts`
Expected: FAIL（`formatRelativeTime` 未定义）。

- [ ] **Step 3: 实现**

Create `src/lib/format-time.ts`：

```ts
/** 相对时间显示：今天 HH:mm / 昨天 / 同年 MM-DD / 更早 YYYY-MM-DD；非法输入返回空串 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((startOfToday.getTime() - startOfDate.getTime()) / 86_400_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  if (dayDiff <= 0) return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (dayDiff === 1) return '昨天';
  if (date.getFullYear() === now.getFullYear()) return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run src/lib/format-time.test.ts`
Expected: 5/5 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/lib/format-time.ts src/lib/format-time.test.ts
git commit -m "feat: 列表相对时间格式化工具（今天/昨天/同年/更早）"
```

**Checkpoint：** 单测 5/5 绿。

---

### Task 2: ConfirmDialog 通用确认弹窗

**Files:**
- Create: `src/components/ui/confirm-dialog.tsx`

- [ ] **Step 1: 实现组件**

Create `src/components/ui/confirm-dialog.tsx`（参照 `src/components/ui/sheet.tsx` 的部件用法与 Soft UI 样式令牌）：

```tsx
'use client';
import * as AlertDialog from '@base-ui/react/alert-dialog';
import { Button } from '@/src/components/ui/button';

export function ConfirmDialog({
  open, title, description, confirmText = '删除', onOpenChange, onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmText?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-sm" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(90vw,380px)] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-card">
          <AlertDialog.Title className="text-base font-semibold text-foreground">{title}</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">{description}</AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Close render={<Button variant="outline" size="sm">取消</Button>} />
            <Button variant="destructive" size="sm" onClick={onConfirm}>{confirmText}</Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
```

> 说明：确认按钮非 Close（由父组件在 onConfirm 中负责关闭与执行，保证"确认后必然执行且只执行一次"）。若 Base UI 的 `Close` render prop 语法在构建时报错，检查 `node_modules/@base-ui/react/alert-dialog` 的类型定义调整（如 `render` 传函数形式 `(props) => <Button {...props}/>`），保持语义不变。

- [ ] **Step 2: 构建验证**

Run: `npm run build`
Expected: BUILD SUCCESSFUL。

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/confirm-dialog.tsx
git commit -m "feat: 通用确认弹窗 ConfirmDialog（AlertDialog 封装）"
```

**Checkpoint：** 构建通过。

---

### Task 3: 后端删除能力（PRAGMA + repository + API）

**Files:**
- Modify: `src/db/index.ts`
- Modify: `src/db/repositories/resumes.ts`
- Modify: `src/db/repositories/job-opportunities.ts`
- Modify: `app/api/resumes/[id]/route.ts`
- Modify: `app/api/job-opportunities/[id]/route.ts`

- [ ] **Step 1: 开启 SQLite 外键**

`src/db/index.ts` 第 6 行 `sqlite.pragma('journal_mode = WAL')` 后追加一行：

```ts
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');
```

- [ ] **Step 2: repository 补删除函数**

`src/db/repositories/resumes.ts` 末尾追加（文件顶部已有 `eq` 导入）：

```ts
export function deleteResume(id: string): void {
  db.delete(resumes).where(eq(resumes.id, id)).run();
}
```

`src/db/repositories/job-opportunities.ts` 末尾追加（确认文件顶部有 `eq` 导入，无则补 `import { desc, eq } from 'drizzle-orm';`）：

```ts
export function deleteJobOpportunity(id: string): void {
  db.delete(jobOpportunities).where(eq(jobOpportunities.id, id)).run();
}
```

- [ ] **Step 3: API 补 DELETE**

`app/api/resumes/[id]/route.ts`：导入改为 `import { deleteResume, getResume } from '@/src/db/repositories/resumes';`，文件末尾追加：

```ts
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getResume(id)) return Response.json({ code: 'RESUME_NOT_FOUND', message: '简历不存在' }, { status: 404 });
  deleteResume(id);
  return Response.json({ ok: true });
}
```

`app/api/job-opportunities/[id]/route.ts`：导入改为 `import { deleteJobOpportunity, getJobOpportunity } from '@/src/db/repositories/job-opportunities';`，文件末尾追加：

```ts
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getJobOpportunity(id)) return Response.json({ code: 'JOB_OPPORTUNITY_NOT_FOUND', message: '岗位不存在' }, { status: 404 });
  deleteJobOpportunity(id);
  return Response.json({ ok: true });
}
```

- [ ] **Step 4: 构建验证**

Run: `npm run build`
Expected: BUILD SUCCESSFUL。

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts src/db/repositories/resumes.ts src/db/repositories/job-opportunities.ts app/api/resumes/[id]/route.ts app/api/job-opportunities/[id]/route.ts
git commit -m "feat: 简历/岗位 DELETE API 与删除函数；开启 SQLite 外键"
```

**Checkpoint：** 构建通过；`DELETE /api/resumes/[id]` 与 `DELETE /api/job-opportunities/[id]` 可调用。

---

### Task 4: Hooks 补 remove

**Files:**
- Modify: `src/lib/use-resumes.ts`
- Modify: `src/lib/use-job-opportunities.ts`

- [ ] **Step 1: use-resumes 补 remove**

`src/lib/use-resumes.ts` 整体替换为（参照 `useConversations.remove` 模式）：

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type ResumeSummary = {
  id: string; name: string; sourceType: string; analyzed: boolean;
  createdAt: string; updatedAt: string;
};

export function useResumes() {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const refresh = useCallback(async () => {
    setResumes(await apiGet<ResumeSummary[]>('/api/resumes'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/resumes/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { resumes, refresh, remove };
}
```

- [ ] **Step 2: use-job-opportunities 补 remove**

`src/lib/use-job-opportunities.ts` 整体替换为：

```ts
'use client';
import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from './api';

export type JobOpportunitySummary = {
  id: string; company: string; title: string; status: string; matched: boolean;
  createdAt: string; updatedAt: string;
};

export function useJobOpportunities() {
  const [jobs, setJobs] = useState<JobOpportunitySummary[]>([]);
  const refresh = useCallback(async () => {
    setJobs(await apiGet<JobOpportunitySummary[]>('/api/job-opportunities'));
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await apiSend(`/api/job-opportunities/${id}`, 'DELETE');
    await refresh();
  }, [refresh]);

  return { jobs, refresh, remove };
}
```

- [ ] **Step 3: 构建验证 + Commit**

Run: `npm run build`
Expected: BUILD SUCCESSFUL。

```bash
git add src/lib/use-resumes.ts src/lib/use-job-opportunities.ts
git commit -m "feat: useResumes/useJobOpportunities 补 remove"
```

**Checkpoint：** 构建通过。

---

### Task 5: 会话列表：重命名 + 删除 + 日期显示

**Files:**
- Modify: `src/components/sidebar/conversation-list.tsx`
- Modify: `src/components/sidebar/sidebar.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: conversation-list.tsx 整体替换**

整体替换 `src/components/sidebar/conversation-list.tsx`：

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/button';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { cn } from '@/src/lib/utils';
import { formatRelativeTime } from '@/src/lib/format-time';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function ConversationList({
  conversations, activeId, onSelect, onNew, onRename, onDelete,
}: {
  conversations: ConversationSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummary | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) inputRef.current?.select();
  }, [editingId]);

  const commitRename = () => {
    if (editingId) {
      const title = draft.trim();
      const original = conversations.find((c) => c.id === editingId)?.title;
      if (title && title !== original) onRename(editingId, title);
    }
    setEditingId(null);
  };

  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <Button size="sm" variant="outline" className="mb-1" onClick={onNew}>＋ 新对话</Button>
      {conversations.length === 0 && (
        <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">暂无会话</div>
      )}
      {conversations.map((c) => (
        <div
          key={c.id}
          className={cn(
            'group relative rounded-xl transition-all hover:bg-slate-100',
            c.id === activeId && 'bg-slate-100 font-medium shadow-soft',
          )}
        >
          {editingId === c.id ? (
            <input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                if (e.key === 'Escape') setEditingId(null);
              }}
              onBlur={commitRename}
              className="w-full rounded-xl border border-indigo-300 bg-white px-3 py-2 text-sm outline-none"
            />
          ) : (
            <div
              onClick={() => onSelect(c.id)}
              className="cursor-pointer px-3 py-2 text-left text-sm"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="truncate">{c.title}</span>
                <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditingId(c.id); setDraft(c.title); }}
                    className="rounded-md p-1 text-muted-foreground hover:bg-slate-200/70 hover:text-foreground"
                    aria-label={`重命名会话 ${c.title}`}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }}
                    className="rounded-md p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                    aria-label={`删除会话 ${c.title}`}
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                {c.lastMessagePreview && (
                  <span className="truncate text-xs text-muted-foreground">{c.lastMessagePreview}</span>
                )}
                <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(c.updatedAt)}</span>
              </div>
            </div>
          )}
        </div>
      ))}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="删除会话"
        description={deleteTarget ? `确定要删除「${deleteTarget.title}」吗？会话中的全部消息将一并删除，此操作不可恢复。` : ''}
        confirmText="删除"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={() => { if (deleteTarget) onDelete(deleteTarget.id); setDeleteTarget(null); }}
      />
    </div>
  );
}
```

- [ ] **Step 2: sidebar.tsx 透传 props**

`src/components/sidebar/sidebar.tsx` 整体替换为：

```tsx
'use client';
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/src/components/ui/tabs';
import { ConversationList } from './conversation-list';
import { ResourceTabs } from './resource-tabs';
import type { ConversationSummary } from '@/src/lib/use-conversations';

export function Sidebar({
  conversations, activeConversationId, onSelectConversation, onNewConversation,
  onRenameConversation, onDeleteConversation, onOpenResume, onOpenJob,
}: {
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
}) {
  const [tab, setTab] = useState<'conversations' | 'resources'>('conversations');
  return (
    <aside className="flex w-[272px] shrink-0 flex-col border-r border-slate-200/60 bg-white shadow-card">
      <Tabs value={tab} onValueChange={(v) => setTab(v as 'conversations' | 'resources')}>
        <TabsList className="m-2 grid w-[calc(100%-1rem)] grid-cols-2">
          <TabsTrigger value="conversations">会话</TabsTrigger>
          <TabsTrigger value="resources">资源</TabsTrigger>
        </TabsList>
        <TabsContent value="conversations" className="h-[calc(100%-3rem)]">
          <ConversationList
            conversations={conversations}
            activeId={activeConversationId}
            onSelect={onSelectConversation}
            onNew={onNewConversation}
            onRename={onRenameConversation}
            onDelete={onDeleteConversation}
          />
        </TabsContent>
        <TabsContent value="resources" className="h-[calc(100%-3rem)]">
          <ResourceTabs onOpenResume={onOpenResume} onOpenJob={onOpenJob} />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
```

- [ ] **Step 3: page.tsx 接入重命名/删除**

`app/page.tsx` 整体替换为：

```tsx
'use client';
import { useCallback, useState } from 'react';
import { ChatPanel } from '@/src/components/chat/chat-panel';
import { Sidebar } from '@/src/components/sidebar/sidebar';
import { ResumeDrawer } from '@/src/components/artifacts/resume-drawer';
import { JobDrawer } from '@/src/components/artifacts/job-drawer';
import { useConversations } from '@/src/lib/use-conversations';
import { apiGet, apiSend } from '@/src/lib/api';
import type { UIMessage } from 'ai';

export default function Home() {
  const { conversations, refresh, remove } = useConversations();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [drawerResumeId, setDrawerResumeId] = useState<string | null>(null);
  const [drawerJobId, setDrawerJobId] = useState<string | null>(null);

  const selectConversation = useCallback(async (id: string) => {
    // 先加载消息再切换会话：保证 ChatPanel 重挂载时拿到正确的 initialMessages
    // （useChat 的 messages 参数只在挂载时生效，props 后更新会被忽略）
    const msgs = await apiGet<UIMessage[]>(`/api/conversations/${id}/messages`);
    setInitialMessages(msgs);
    setActiveId(id);
  }, []);

  const newConversation = useCallback(() => {
    setActiveId(null);
    setInitialMessages([]);
  }, []);

  const handleRenameConversation = useCallback(async (id: string, title: string) => {
    await apiSend(`/api/conversations/${id}`, 'PATCH', { title });
    await refresh();
  }, [refresh]);

  const handleDeleteConversation = useCallback(async (id: string) => {
    await remove(id);
    if (id === activeId) {
      const rest = conversations.filter((c) => c.id !== id);
      if (rest.length > 0) await selectConversation(rest[0].id);
      else newConversation();
    }
  }, [remove, activeId, conversations, selectConversation, newConversation]);

  // 当前会话标题（新会话显示"新对话"）
  const currentTitle = activeId
    ? (conversations.find((c) => c.id === activeId)?.title ?? '新对话')
    : '新对话';

  return (
    <main className="flex h-screen">
      <Sidebar
        conversations={conversations}
        activeConversationId={activeId}
        onSelectConversation={selectConversation}
        onNewConversation={newConversation}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onOpenResume={setDrawerResumeId}
        onOpenJob={setDrawerJobId}
      />
      <div className="flex-1">
        <ChatPanel
          key={activeId ?? 'new'}
          conversationId={activeId}
          initialMessages={initialMessages}
          title={currentTitle}
          onChatSettled={refresh}
        />
      </div>
      <ResumeDrawer
        resumeId={drawerResumeId}
        open={drawerResumeId !== null}
        onOpenChange={(open) => { if (!open) setDrawerResumeId(null); }}
      />
      <JobDrawer
        jobId={drawerJobId}
        open={drawerJobId !== null}
        onOpenChange={(open) => { if (!open) setDrawerJobId(null); }}
      />
    </main>
  );
}
```

- [ ] **Step 4: 构建验证 + Commit**

Run: `npm run build`
Expected: BUILD SUCCESSFUL。

```bash
git add src/components/sidebar/conversation-list.tsx src/components/sidebar/sidebar.tsx app/page.tsx
git commit -m "feat: 会话列表支持悬停重命名与弹窗确认删除，列表显示相对时间"
```

**Checkpoint：** 构建通过。

---

### Task 6: 资源面板：简历/岗位删除 + 日期显示

**Files:**
- Modify: `src/components/sidebar/resource-tabs.tsx`
- Modify: `src/components/sidebar/sidebar.tsx`
- Modify: `app/page.tsx`

- [ ] **Step 1: resource-tabs.tsx 整体替换**

整体替换 `src/components/sidebar/resource-tabs.tsx`：

```tsx
'use client';
import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';
import { useResumes } from '@/src/lib/use-resumes';
import { useJobOpportunities } from '@/src/lib/use-job-opportunities';
import { StatusBadge } from '@/src/components/ui/status-badge';
import { Button } from '@/src/components/ui/button';
import { ConfirmDialog } from '@/src/components/ui/confirm-dialog';
import { apiUpload } from '@/src/lib/api';
import { formatRelativeTime } from '@/src/lib/format-time';

const MAX_UPLOAD_SIZE = 20 * 1024 * 1024;

export function ResourceTabs({
  onOpenResume,
  onOpenJob,
  onDeletedResume,
  onDeletedJob,
}: {
  onOpenResume: (id: string) => void;
  onOpenJob: (id: string) => void;
  onDeletedResume: (id: string) => void;
  onDeletedJob: (id: string) => void;
}) {
  const [tab, setTab] = useState<'resume' | 'job'>('resume');
  const { resumes, refresh, remove: removeResume } = useResumes();
  const { jobs, refresh: refreshJobs, remove: removeJob } = useJobOpportunities();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'resume' | 'job'; id: string; name: string } | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选择同一文件
    if (!file) return;
    setNotice(null);
    if (!/\.(pdf|docx|txt|md)$/i.test(file.name)) {
      setNotice({ kind: 'err', text: '不支持的文件格式：仅支持 PDF / DOCX / TXT / MD' });
      return;
    }
    if (file.size > MAX_UPLOAD_SIZE) {
      setNotice({ kind: 'err', text: `文件超过 ${MAX_UPLOAD_SIZE / (1024 * 1024)}MB 上限` });
      return;
    }
    setUploading(true);
    try {
      const r = await apiUpload<{ name: string }>('/api/resumes/upload', file);
      setNotice({ kind: 'ok', text: `已导入《${r.name}》，可在对话中让 Agent 分析` });
      void refresh();
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { kind, id } = deleteTarget;
    setDeleteTarget(null);
    if (kind === 'resume') {
      await removeResume(id);
      onDeletedResume(id);
    } else {
      await removeJob(id);
      onDeletedJob(id);
    }
  };

  return (
    <div className="flex h-full flex-col gap-1.5 p-3">
      <div className="flex gap-1 text-xs text-muted-foreground">
        <span
          onClick={() => setTab('resume')}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors hover:bg-slate-100 ${tab === 'resume' ? 'bg-slate-100' : ''}`}
        >
          简历
        </span>
        <span
          onClick={() => setTab('job')}
          className={`cursor-pointer rounded-full px-3 py-1 transition-colors hover:bg-slate-100 ${tab === 'job' ? 'bg-slate-100' : ''}`}
        >
          岗位
        </span>
        <span className="px-3 py-1">专属简历（第 3 期）</span>
      </div>
      {tab === 'resume' && (
        <>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-3.5" />
              {uploading ? '解析中…' : '上传简历'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.txt,.md"
              className="hidden"
              onChange={handleFile}
            />
          </div>
          {notice && (
            <div role="status" className={`rounded-2xl px-3 py-2 text-xs ${notice.kind === 'ok' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-red-500/10 text-red-700'}`}>
              {notice.text}
            </div>
          )}
          {resumes.length === 0 && (
            <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
              暂无简历，可上传文件（PDF / DOCX / TXT / MD）或在对话中粘贴文本导入
            </div>
          )}
          {resumes.map((r) => (
            <div key={r.id} className="group relative rounded-xl transition-all hover:bg-slate-100">
              <div
                onClick={() => onOpenResume(r.id)}
                className="cursor-pointer px-3 py-2 text-left text-sm"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate">{r.name}</span>
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ kind: 'resume', id: r.id, name: r.name }); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                      aria-label={`删除简历 ${r.name}`}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {r.analyzed ? '已分析' : '未分析'} · {r.sourceType}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(r.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      {tab === 'job' && (
        <>
          {jobs.length === 0 && (
            <div className="rounded-2xl bg-slate-100/60 px-3 py-6 text-center text-xs text-muted-foreground">
              暂无岗位，可在对话中粘贴 JD 导入
            </div>
          )}
          {jobs.map((job) => (
            <div key={job.id} className="group relative rounded-xl transition-all hover:bg-slate-100">
              <div
                onClick={() => onOpenJob(job.id)}
                className="cursor-pointer px-3 py-2 text-left text-sm"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate">{job.company ? `${job.company} · ${job.title}` : '未命名岗位'}</span>
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTarget({ kind: 'job', id: job.id, name: job.company ? `${job.company} · ${job.title}` : '未命名岗位' }); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-red-100 hover:text-red-600"
                      aria-label="删除岗位"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <StatusBadge status={job.status} />
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatRelativeTime(job.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </>
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget?.kind === 'resume' ? '删除简历' : '删除岗位'}
        description={deleteTarget ? `确定要删除「${deleteTarget.name}」吗？此操作不可恢复。` : ''}
        confirmText="删除"
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
```

- [ ] **Step 2: sidebar.tsx 透传新 props**

`src/components/sidebar/sidebar.tsx` 中 `ResourceTabs` 调用处改为：

```tsx
<ResourceTabs
  onOpenResume={onOpenResume}
  onOpenJob={onOpenJob}
  onDeletedResume={onDeletedResume}
  onDeletedJob={onDeletedJob}
/>
```

并同步更新 Sidebar 的 props 类型与解构（新增 `onDeletedResume`、`onDeletedJob` 两个 `(id: string) => void` 参数）。

- [ ] **Step 3: page.tsx 接入删除回调**

`app/page.tsx` 中 `Sidebar` 调用处补两个 props：

```tsx
onDeletedResume={(id) => setDrawerResumeId((prev) => (prev === id ? null : prev))}
onDeletedJob={(id) => setDrawerJobId((prev) => (prev === id ? null : prev))}
```

- [ ] **Step 4: 构建验证 + Commit**

Run: `npm run build`
Expected: BUILD SUCCESSFUL。

```bash
git add src/components/sidebar/resource-tabs.tsx src/components/sidebar/sidebar.tsx app/page.tsx
git commit -m "feat: 简历/岗位列表支持弹窗确认删除，列表显示相对时间"
```

**Checkpoint：** 构建通过。

---

### Task 7: 端到端验证

**Files:** 无（验证与清理）

- [ ] **Step 1: API 层验证（dev server 运行中）**

```bash
# 创建临时会话验证 DELETE（会话删除）
curl -s -X POST http://localhost:3000/api/conversations -H "Content-Type: application/json" -d '{"title":"tmp-del-test"}' | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).id)})"
# 记下输出的 id，然后：
curl -s -X DELETE http://localhost:3000/api/conversations/<id>   # 期望 {"ok":true}
curl -s http://localhost:3000/api/conversations                 # 期望列表不含 tmp-del-test

# 简历/岗位 DELETE（用临时资源验证，或直接在浏览器 UI 验证）
curl -s -X DELETE http://localhost:3000/api/resumes/<不存在的id>  # 期望 404 RESUME_NOT_FOUND
curl -s -X DELETE http://localhost:3000/api/job-opportunities/<不存在的id>  # 期望 404 JOB_OPPORTUNITY_NOT_FOUND
```

- [ ] **Step 2: 外键验证**

Run: `npx tsx -e "import {db} from './src/db'; console.log(db.run('PRAGMA foreign_keys').raw()[0])"`（若 tsx -e 无输出，改用临时脚本文件）
Expected: `[1]`（foreign_keys=ON）。

- [ ] **Step 3: 浏览器 UI 验证（IAB）**

1. **会话重命名**：侧边栏会话列表悬停某项 → 出现 Pencil/Trash2 图标 → 点 Pencil → 标题变输入框 → 改名 + Enter → 列表标题更新，标题栏同步更新
2. **会话删除**：点 Trash2 → 弹窗出现（标题「删除会话」+ 描述）→ 点「删除」→ 会话消失；点「取消」→ 不删除
3. **会话删除当前激活**：删除正在查看的会话 → 自动切换到最近更新的会话
4. **简历删除**：资源 → 简历列表悬停 → Trash2 → 弹窗 → 确认 → 列表移除；若该简历抽屉打开则抽屉关闭
5. **岗位删除**：同简历流程
6. **日期显示**：列表右侧显示相对时间（今天 HH:mm / 昨天 / MM-DD / YYYY-MM-DD）

- [ ] **Step 4: 收尾**

无残留临时文件；工作树干净；计划打勾。

**Checkpoint：** 全部交互按预期；无回归（会话切换、上传、抽屉仍正常）。

---

## 任务依赖与并行批次

- Task 1（format-time）∥ Task 2（ConfirmDialog）∥ Task 3（后端）可并行（文件不相交）
- Task 4（hooks）依赖 Task 3
- Task 5（会话 UI + page.tsx）依赖 Task 1/2
- Task 6（资源 UI + page.tsx）依赖 Task 1/2/4；与 Task 5 串行（都改 page.tsx）
- Task 7 最后执行

## 验收清单（对应设计文档）

- [ ] 会话：悬停重命名（Enter 保存/Esc 取消/失焦保存/空标题不保存）
- [ ] 会话：弹窗确认删除；删除当前激活会话后自动切换
- [ ] 简历/岗位：弹窗确认删除；被删资源抽屉关闭
- [ ] ConfirmDialog：ESC/遮罩点击/取消均可关闭且不执行
- [ ] 日期：今天 HH:mm / 昨天 / 同年 MM-DD / 更早 YYYY-MM-DD
- [ ] SQLite 外键开启（PRAGMA foreign_keys = ON）
- [ ] formatRelativeTime 单测 5/5
