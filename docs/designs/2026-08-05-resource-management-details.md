# 设计：资源管理细节优化（删除 / 重命名 / 日期显示）

日期：2026-08-05
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）、plan-document.md
设计依据：`docs/designs/2026-08-04-data-model-design.md`（外键）、`docs/designs/2026-08-05-ui-ux-softui-design.md`（Soft UI）
前置：第 1、2 期已交付；上传功能已交付

## 1. 背景

一、二期功能已实现。用户决定暂停功能推进，先做资源管理细节优化：会话/简历/岗位的删除（弹窗二次确认）、会话重命名、列表日期显示优化。**不做搜索**（用户明确不需要）。

## 2. 范围与决策（2026-08-05 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 二次确认形式 | **弹窗**（AlertDialog，非行内交互） |
| 2 | 会话重命名 | 悬停出现重命名按钮，点击后标题变行内输入框（Enter 保存 / Esc 取消 / 失焦保存） |
| 3 | 删除范围 | 会话、简历、岗位三类资源均可删除 |
| 4 | 搜索 | **本期不做**（用户明确不需要） |
| 5 | 日期显示 | 统一相对时间：今天 HH:mm / 昨天 / 今年 MM-DD / 更早 YYYY-MM-DD |
| 6 | 外键完整性 | 开启 SQLite `PRAGMA foreign_keys = ON`（当前未开启；tailored_resumes 级联删除依赖它） |
| 7 | 确认弹窗组件 | 新建 `ConfirmDialog`，基于 Base UI `AlertDialog`（与 Sheet 同技术栈） |

## 3. 组件设计

### 3.1 ConfirmDialog（新建 `src/components/ui/confirm-dialog.tsx`）

```
Props: {
  open: boolean
  title: string          // 如「删除会话」
  description: string    // 如「确定要删除「帮我匹配…」这个会话吗？会话消息将一并删除」
  confirmText: string    // 默认「删除」
  destructive?: boolean  // 默认 true（红色确认按钮）
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}
```

实现要点：
- `AlertDialog.Root open onOpenChange` + Portal/Backdrop/Popup/Title/Description/Close
- Popup 样式对齐 Sheet：`fixed z-50 bg-white rounded-2xl shadow-card p-5 w-[min(90vw,380px)]`（Soft UI：无硬边框、柔和阴影）
- 底部按钮：取消（outline 变体）+ 确认（destructive 变体）
- Backdrop：`bg-slate-900/20 backdrop-blur-sm` 点击关闭

### 3.2 日期显示（新建 `src/lib/format-time.ts`）

```
export function formatRelativeTime(iso: string): string
- 今天 → HH:mm（如 14:30）
- 昨天 → 「昨天」
- 同年 → MM-DD（如 07-28）
- 更早 → YYYY-MM-DD（如 2025-12-01）
纯函数，可单测（本项目唯一新增单测点）
```

## 4. 功能细节

### 4.1 会话（侧边栏会话列表 `conversation-list.tsx`）

- 列表项悬停显示两个图标按钮（右侧）：Pencil（重命名）、Trash2（删除）
- **重命名**：点击后标题区变 `<input>`（预填当前标题），自动聚焦；Enter 保存（调 PATCH）、Esc 取消、失焦保存；标题为空则取消
- **删除**：点击 Trash2 → ConfirmDialog（title「删除会话」、description 含会话标题、确认后调 `useConversations.remove(id)`）
- 删除当前激活会话：删除后自动切到最近更新的会话（`app/page.tsx` 协调，复用 selectConversation）
- 悬停按钮在激活项与普通项样式一致（浅色 hover 背景，避免与删除冲突误触）

### 4.2 简历 / 岗位（`resource-tabs.tsx`）

- 列表项悬停显示 Trash2 按钮
- 点击 → ConfirmDialog（title「删除简历/岗位」、description 含名称）→ 确认后调删除 API 并刷新列表
- 若被删资源详情抽屉正打开（`app/page.tsx` 持有抽屉 open 状态）→ 关闭抽屉

### 4.3 后端

- `src/db/repositories/resumes.ts`：新增 `deleteResume(id)`
- `src/db/repositories/job-opportunities.ts`：新增 `deleteJobOpportunity(id)`
- `app/api/resumes/[id]/route.ts`：新增 DELETE（404 处理同现有模式）
- `app/api/job-opportunities/[id]/route.ts`：新增 DELETE（404 处理同现有模式）
- `src/db/index.ts`：`sqlite.pragma('foreign_keys = ON')`
- 错误响应沿用 `{ code, message }`

### 4.4 Hooks

- `use-resumes.ts` / `use-job-opportunities.ts`：新增 `remove(id)`（参照 `useConversations.remove` 模式：DELETE → refresh）

## 5. 交互细节汇总

| 场景 | 行为 |
|---|---|
| 删除任一资源 | 弹窗确认，确认后执行；取消/Esc/遮罩点击不执行 |
| 重命名会话 | 行内编辑，Enter 保存 / Esc 取消 / 失焦保存 / 空标题不保存 |
| 删除当前激活会话 | 自动切换到最近更新的会话 |
| 删除时抽屉打开 | 关闭对应抽屉 |
| 日期 | 列表统一相对时间格式 |

## 6. 测试

- 纯逻辑单测：`formatRelativeTime`（今天/昨天/同年/更早/边界）
- 其余为 UI 与 API 行为，人工验证（浏览器 + curl）

## 7. 不在本期范围

- 搜索（用户明确不需要）
- 简历 / 岗位重命名
- 岗位状态流转（投递状态机属第 3 期）
- 批量操作
