# 输入框装饰与侧栏加宽设计

日期：2026-08-05
状态：完成
关联规范：AGENTS.md（关键硬约束）、SoftUI.md（风格权威文档）
设计依据：`docs/designs/2026-08-05-ui-decoration-design.md`（轻量装饰系列第一期，已完成）、`SoftUI.md`（柔和界面风）

## 1. 背景与目标

轻量装饰系列第一期已落地（光斑/网格/Logo/空状态/图标底）。本期延续同一风格，装饰聊天底部输入区，并按用户要求将侧边栏加宽 10%。布局结构与功能逻辑零改动。

## 2. 装饰方案（2026-08-05 经视觉伴侣确认）

用户在 8 种候选方案中选定 **方案 5（图标 + 快捷键提示）+ 方案 8（占位引导文案）**，并确认输入区**收窄居中**。

### 2.1 输入区收窄居中

- 输入区容器（`border-t border-slate-200 bg-white p-4` 全宽白条）保持不变
- 容器内部内容包一层 `mx-auto w-full max-w-2xl`：Textarea 与按钮排整体居中收窄，两侧留白（ChatGPT 式布局）
- Textarea 尺寸不动（`min-h-20`、`rows={3}`、`field-sizing-content`）

### 2.2 输入框内浅底图标（方案 5 前半）

- Textarea 外包 `relative` 容器；左上角 `absolute` 定位一枚装饰图标：
  - `rounded-full bg-indigo-500/10` 圆底 + lucide `Paperclip`（`size-4 text-indigo-500`）
  - `aria-hidden`、`pointer-events-none`，纯装饰
- Textarea 加 `pl-10` 避让图标
- 注释标注「未来可接入上传入口」（本期不做上传交互）

### 2.3 占位引导文案（方案 8）

- placeholder 由「输入消息，Enter 发送，Shift+Enter 换行」改为：
  **「💡 试着告诉我：帮我分析简历 / 匹配这个岗位」**

### 2.4 快捷键提示（方案 5 后半）

- 按钮排由 `justify-end` 改为 `justify-end items-center`（结构微调）
- 「Shift+Enter 换行」小字（`text-xs text-muted-foreground`）置于发送按钮左侧，快捷键信息不因占位文案替换而丢失
- 发送按钮保持现状（primary indigo，无渐变、无箭头）

### 2.5 侧边栏加宽 10%

- `src/components/sidebar/sidebar.tsx` 的 aside 宽度：`w-[272px]` → `w-[300px]`（272 × 1.1 ≈ 299.2，取整 300）
- 侧栏内部结构（Logo 区 / Tabs / 列表 / 底部圆点）不变，加宽后列表项自动舒展

## 3. 实施边界

- ❌ 不改消息区宽度、不改容器背景、不加新依赖、不做上传功能
- ❌ 不动功能逻辑（发送/停止/禁用态零改动）
- ✅ 仅 `src/components/chat/chat-input.tsx` 与 `src/components/sidebar/sidebar.tsx` 两处文件
- ✅ 装饰图标纯展示（aria-hidden），不影响键盘可达性

## 4. 验收标准

1. 输入区内容居中收窄（max-w-2xl），两侧留白自然
2. 输入框左上角有浅底 Paperclip 图标，输入文字不与其重叠
3. placeholder 显示 💡 引导文案；发送按钮旁有「Shift+Enter 换行」提示
4. 侧边栏宽度 300px，内部元素布局正常
5. `npm run build` 通过；发送/停止功能回归正常
6. 无 rounded-none/border-black/硬阴影残留（grep 检查）

## 5. 与实施计划的接口

实施计划拆分为：输入区装饰（收窄 + 图标 + 文案 + 提示）→ 侧栏加宽 → 端到端验证。
