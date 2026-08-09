# UI/UX 设计（Soft UI 风格全面落地）

日期：2026-08-05
状态：完成
关联规范：AGENTS.md（关键硬约束）
设计依据：`docs/designs/2026-08-04-frontend-design.md`、`SoftUI.md`（风格权威文档，2026-08-05 修订版）

## 1. 设计范围与决策（2026-08-05 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 设计范围 | **风格全面落地**：主题令牌 + 全部现有组件重样式 + 交互动效；布局结构（左栏+主区）保持不变，只调间距密度 |
| 2 | 落地方式 | **shadcn 主题变量 + Tailwind v4 @theme** 为单一真相源（方案 A），交互 class 在组件代码内统一规范 |
| 3 | 风格权威 | SoftUI.md（核心理念：柔和阴影、圆润边角、低饱和配色；禁止：rounded-none/border-black/硬阴影/高饱和纯色大面积） |
| 4 | 体验重构 | 不在本期（会话切换交互、确认卡片信息设计等留待独立主题） |

## 2. 设计令牌（globals.css 中 shadcn 变量 + @theme）

### 色板映射

| 令牌 | 值 | 说明 |
|---|---|---|
| `--background` | `#f8fafc` (slate-50) | 全局浅底 |
| `--foreground` | `#334155` (slate-700) | 正文（对白底对比 ~10:1，WCAG AA ✅） |
| `--card` / `--card-foreground` | `#ffffff` / `#334155` | 卡片白底 |
| `--primary` / `--primary-foreground` | `#6366f1` / `#ffffff` | 主色（白字对比 ~4.6:1，AA ✅，用于按钮/重点） |
| `--secondary` / `--secondary-foreground` | `#f1f5f9` / `#334155` | 次表面（hover 底、浅按钮） |
| `--muted` / `--muted-foreground` | `#f1f5f9` / `#64748b` | 弱化区域 / 次要文字 |
| `--accent` / `--accent-foreground` | `#f1f5f9` / `#334155` | 高亮底 |
| `--destructive` / `-foreground` | `#ef4444` / `#ffffff` | 错误（保持可识别） |
| `--border` / `--input` | `#e2e8f0` (slate-200) | 仅用于分割线/占位边界（组件默认无边框） |
| `--ring` | `#6366f1` | 焦点环 |

### 圆角

- `--radius: 1rem`（rounded-2xl 等效，全局默认）
- 卡片级 `rounded-3xl`（1.5rem）在组件代码中指定

### 阴影（@theme 扩展，全部柔和模糊阴影）

```css
--shadow-soft: 0 4px 12px -2px rgb(100 116 139 / 0.12);   /* 常规卡片/气泡 */
--shadow-card: 0 10px 24px -6px rgb(100 116 139 / 0.18);  /* 大卡片/抽屉 */
--shadow-lift: 0 12px 24px -6px rgb(99 102 241 / 0.18);   /* hover 彩色浮起 */
```

### 字体

- 系统默认栈；标题 `font-semibold`（SoftUI Token：标题 font-semibold / 正文 font-normal）

## 3. 组件样式规范

| 组件 | 规范 |
|---|---|
| **按钮** | `rounded-2xl px-6 py-3 font-medium shadow-lg shadow-indigo-500/20 bg-primary text-primary-foreground`；hover `-translate-y-0.5 shadow-lift`；active `scale-95`；secondary variant：`bg-secondary text-secondary-foreground shadow-slate-200/50` |
| **输入框 / Textarea** | `bg-gray-50 border-0 rounded-2xl px-5 py-3.5`；focus `ring-2 ring-indigo-500/50 bg-white` |
| **聊天气泡** | user：`bg-primary/10 text-slate-800 rounded-2xl`（柔和填充）；assistant：`bg-white rounded-2xl shadow-soft` |
| **进度卡片** | `bg-white rounded-2xl shadow-soft` + `bg-indigo-500` pulse 点 + 状态文案 |
| **侧栏** | `bg-white` 白底 + 右缘柔和阴影；列表项 `rounded-xl px-3 py-2 hover:bg-slate-100`；active 项 `bg-slate-100` + 左侧 indigo 圆点指示 |
| **Tabs（会话/资源）** | 容器 `bg-slate-100 rounded-2xl p-1`，激活项 `bg-white shadow-soft`（pill 式） |
| **抽屉 Sheet** | 内容白底、`rounded-l-3xl shadow-card`、标题区宽松 |
| **Badge** | `rounded-full bg-indigo-500/10 text-indigo-700`（小面积点缀） |
| **空状态** | 居中：`rounded-full bg-slate-100` 圆形图标底 + 引导文案 + 柔和按钮 |

## 4. 布局与间距（结构不动，密度调整）

| 位置 | 现值 → 目标值 |
|---|---|
| 左栏宽度 | 256px → 272px |
| 列表项内边距 | `px-2 py-1.5` → `px-3 py-2` |
| 聊天主区 | `p-4` → `p-6` |
| 气泡间距 | `mb-3` → `mb-4` |
| 输入区 | 内边距加大、发送按钮 `px-6 py-3` |
| 卡片/内容 gap | `gap-4` → `gap-6` |

## 5. 交互与动效（对应 SoftUI 交互规则）

- 统一过渡：交互元素 `transition-all duration-200`；卡片 hover `duration-300`
- hover：`-translate-y-0.5`（实体碰撞感）+ 阴影加深（`shadow-soft` → `shadow-lift`）
- active：`scale-95`（明显压缩）
- 明确不做：淡入模糊、景深、引发布局变化的动效（SoftUI 禁止项）
- 键盘焦点：`focus-visible:ring-2 ring-indigo-500/50` 全组件保留；`prefers-reduced-motion` 下关闭位移/缩放

## 6. 实施边界

- ✅ 覆盖：全局令牌、全部现有组件样式、布局密度、动效
- ❌ 不改布局结构（左栏+主区框架）、不加新页面
- ❌ 不做深色模式
- ❌ 不动功能逻辑（useChat / 工具 / 端点零改动）
- ⏸ 体验重构（会话切换交互、确认卡片信息设计等）留待后续独立主题

## 7. 验收标准

1. 打开页面第一眼识别为"柔和界面风"（浅底、圆角、彩色柔和阴影）
2. 按钮/输入/卡片/气泡/抽屉/进度卡共享同一视觉语言
3. 交互反馈：hover 上浮、active 压缩、焦点环清晰
4. `npm run build` 通过；功能回归：对话流、工具进度、会话切换、抽屉均正常
5. 无 `rounded-none`/`border-black`/硬阴影/高饱和大面积残留（可 grep 检查）

## 8. 与实施计划的接口

- 实施以 globals.css 令牌改造为第一步（Task 1），组件样式改造按组件分组（ui 基础组件 → 布局组件 → 聊天组件 → 产物组件），最后动效与验收
- 实施计划需覆盖的组件文件清单（现状）：`src/components/ui/*`（button/input/textarea/card/scroll-area/tabs/sheet/badge/separator）、`src/components/chat/*`（chat-panel/message-bubble/tool-progress-card/chat-input/markdown-text）、`src/components/sidebar/*`（sidebar/conversation-list/resource-tabs）、`src/components/artifacts/resume-drawer.tsx`、`app/page.tsx`
