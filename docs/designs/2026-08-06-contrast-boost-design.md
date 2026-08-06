# 界面对比度提升设计（方案 2+3 组合 + 输入框加宽）

日期：2026-08-06
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）、SoftUI.md（风格权威文档）、`docs/designs/2026-08-05-ui-ux-softui-design.md`（令牌单一真相源决策）

## 1. 背景与目标

Soft UI 风格全面落地后，用户反馈主题色之间对比度过小：主按钮与白字对比仅 4.6:1、输入框灰底（`#f9fafb`）与页面背景（`#f8fafc`）几乎无区分、主按钮 hover 反而变浅（反馈弱）。

目标：在不越 SoftUI 风格红线（低饱和、柔和阴影、圆角、无纯黑硬边）的前提下，拉大元素与背景的区分度，让按钮、输入框等组件更明显。

## 2. 方案决策（2026-08-06 经视觉伴侣确认）

用户在 10 个渐进式对比度方案中选定 **方案 2 + 方案 3 组合**：

| # | 决策 | 结论 |
|---|---|---|
| 1 | 方案组合 | 方案 2（输入框白底淡边框 slate-300）+ 方案 3（主色加深一档 indigo-600、hover 加深而非变浅、次要文字 slate-600） |
| 2 | 输入框宽度 | 聊天主区输入框加宽 **25%**（`max-w-2xl` 672px → 840px），仅聊天输入区，抽屉等输入框不动 |
| 3 | 落地方式 | **路径 A：令牌优先**——globals.css shadcn 令牌为单一真相源，组件仅引用令牌；符合 2026-08-05 设计既有决策 |
| 4 | 不改项 | 正文/标题颜色、卡片白底、柔和阴影与圆角、侧栏布局、光斑与网格装饰、布局结构、功能逻辑 |

## 3. 令牌改动（app/globals.css）

| 令牌 | 现值 | 新值 | 说明 |
|---|---|---|---|
| `--primary` | `#6366f1` (indigo-500) | `#4f46e5` (indigo-600) | 白字对比 ~6.3:1（AAA） |
| `--muted-foreground` | `#64748b` (slate-500) | `#475569` (slate-600) | 次要文字/占位符更易读 |
| `--input` | `#e2e8f0` (slate-200) | `#cbd5e1` (slate-300) | 输入类边框（浅灰→可见） |
| `--color-primary-hover` | 无 | `#4338ca` (indigo-700) | 新增 @theme 令牌：主按钮 hover 加深色 |

## 4. 组件改动

### src/components/ui/button.tsx

- **default（主按钮）**：`hover:bg-primary/80`（变浅，问题点）→ `hover:bg-primary-hover`（加深）；`hover:shadow-lift` 保留
- **secondary（次要按钮）**：加 `border-border`（淡边框 slate-200），与页面背景区分
- **outline（描边按钮）**：`border-0` → `border border-slate-300`；`shadow-soft` 保留

### src/components/ui/input.tsx

- `bg-gray-50 border-0` → `bg-white border border-input`（白底 + slate-300 边框）
- 聚焦态：`focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-indigo-500/50` → `focus-visible:ring-primary/50`（跟随主色，ring 值不变透明度）

### src/components/ui/textarea.tsx

- 同 input.tsx 改法（聊天输入区共用）

### src/components/chat/chat-input.tsx

- 输入区容器 `mx-auto w-full max-w-2xl` → `max-w-[52.5rem]`（672px × 1.25 = 840px）

### src/components/chat/message-bubble.tsx

- 用户头像/气泡：`bg-indigo-500/10 text-indigo-600` → `bg-primary/10 text-primary`（主色令牌化，值恰好与新主色一致；气泡底色 `bg-primary/10` 自动跟随）

## 5. 影响面说明

- `--primary` 变深影响所有 `bg-primary` 引用（主按钮、Tab 选中态等），属目标效果；主色仅用于按钮/重点小面积，不触碰 SoftUI"禁止高饱和大面积"红线
- `--muted-foreground` 影响占位符、辅助提示、次要文字——全部为期望提升
- `--input` 令牌在 light 模式下主要被 input/textarea 引用（sheet 等仅 dark 模式引用），影响可控

## 6. 验证

- `npm run lint` + `npm run build` 通过
- 本地 `npm run dev` 目视检查：主按钮（含 hover 加深）、输入框/聊天文本域（边框 + 聚焦 ring）、次要/描边按钮、用户气泡、聊天输入区宽度

## 7. 实施边界

- ❌ 不改布局结构、不加新页面、不做深色模式
- ❌ 不动功能逻辑（useChat / 工具 / API 端点零改动）
- ❌ 不调整 SoftUI.md 风格文档（本次仅色值加深，无新规范条目）
