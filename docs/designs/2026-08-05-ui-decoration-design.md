# UI 轻量装饰设计

日期：2026-08-05
状态：草稿 → 待审阅
关联规范：AGENTS.md（关键硬约束）、SoftUI.md（风格权威文档，2026-08-05 修订版）
设计依据：`docs/designs/2026-08-05-ui-ux-softui-design.md`（Soft UI 风格全面落地，已完成）

## 1. 背景与目标

Soft UI 风格已全面落地（令牌 + 组件 + 布局密度 + 动效），但界面仍显单调。本期在**不动布局结构、不动功能逻辑**的前提下，为界面增加轻量装饰，提升层次感与产品感。

**核心约束（来自 SoftUI.md）**：低饱和、柔和阴影、圆角、极淡装饰密度、WCAG AA、尊重 `prefers-reduced-motion`。

## 2. 装饰方案（2026-08-05 经视觉伴侣确认）

用户在 10 种候选方案中选定 6 项组合：**3+4+6+8+9+10**；侧栏三项（3/8/10）全部保留。

| # | 方案 | 位置 | 实施方式 |
|---|------|------|----------|
| 3 | 侧栏淡彩 + 底部圆点 | 侧栏（aside） | 背景加极淡 `linear-gradient(180deg, indigo-50 → white)` 纵向渐变；底部一排低饱和彩色圆点（indigo #6366f1 / pink #ec4899 / emerald #10b981 / amber #f59e0b），`border-t` 分隔，`opacity-60` 级淡显，`pointer-events-none` |
| 4 | 极淡网格纹理 | 聊天消息区 | 背景叠加双重 `linear-gradient` 细网格（约 5% 透明度 slate），`background-size: 24px 24px`，不干扰文字对比度 |
| 6 | 空状态插画化 | 全部空状态场景 | 新增通用空状态组件 `EmptyState`：渐变圆底（indigo→pink 极淡，`rounded-full`）+ lucide 图标 + 引导文案 + 可选动作按钮；统一用于新对话主区、会话列表空、资源列表空、抽屉占位 |
| 8 | 品牌 Logo 区 | 侧栏顶部 | 渐变圆角方块（`rounded-xl`，indigo #6366f1 → violet #8b5cf6）+ 白色 lucide 图标（如 `Sparkles`）+ 「Job Helper」字标（`font-semibold text-slate-700`） |
| 9 | 角落光斑 | 页面级背景 | 右下 indigo 光斑 + 右上 pink 光斑（注：原设计左上，落地时因左侧被侧栏白底遮挡改为右上）：`fixed` 定位 + `radial-gradient` + 大尺寸模糊，`opacity` 极低（≈0.16/0.10），`pointer-events-none`、`z-0`，不挡交互 |
| 10 | 资源项彩色图标底 | 资源列表（简历/岗位） | 每条资源前加 `rounded-full bg-[color]/10` 圆形浅底 + lucide 图标，按类型分色：简历 indigo、岗位 emerald |

## 3. 规范更新（SoftUI.md）

SoftUI.md「组件规则」新增「空状态」条目：

> **空状态**：任何出现空状态的场景（新对话、列表为空、抽屉占位等）必须使用统一的空状态组件（渐变圆底 + 图标 + 引导文案），禁止仅裸灰字提示。

## 4. 实施边界

- ❌ 不改布局结构（左栏 + 主区框架）、不加新页面、不做深色模式
- ❌ 不动功能逻辑（useChat / 工具 / API 端点零改动）
- ✅ 新增 1 个通用组件 `src/components/ui/empty-state.tsx`，其余为既有组件 class / 背景调整
- ✅ 光斑与网格为纯 CSS 装饰，零运行时开销；`prefers-reduced-motion` 下无动画
- ✅ 装饰全部为 `pointer-events-none` 或背景层，不影响键盘可达性与点击

## 5. 验收标准

1. 打开页面第一眼有层次感：侧栏渐变 + Logo、聊天区网格、角落光斑，装饰密度克制、不喧宾夺主
2. 所有空状态场景显示统一空状态插画，无裸灰字残留
3. 资源列表每条前有分色圆形图标底
4. `npm run build` 通过；功能回归：对话流、工具进度、会话切换、抽屉均正常
5. SoftUI.md 已含空状态条目
6. 无 `rounded-none`/`border-black`/硬阴影/高饱和大面积残留（grep 检查）

## 6. 与实施计划的接口

实施计划拆分为：设计令牌与纯 CSS 装饰（3/4/9）→ Logo 区（8）→ 资源图标底（10）→ EmptyState 组件与全部空状态替换（6）→ SoftUI.md 规范条目 → 端到端验证。
