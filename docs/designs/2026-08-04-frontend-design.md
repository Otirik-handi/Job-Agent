# 前端界面设计（PC 端优先）

日期：2026-08-04
状态：完成
关联规范：AGENTS.md（关键硬约束）
设计依据：`docs/designs/2026-08-04-agent-architecture-design.md`（第 5 节）、`docs/designs/2026-08-04-api-design.md`（第 8 节接口）、`docs/designs/2026-08-04-data-model-design.md`（第 7 节接口）

## 1. 设计决策（2026-08-04 确认）

| # | 决策 | 结论 |
|---|---|---|
| 1 | 布局 | 左栏双区 Tabs（会话 \| 资源库）+ 聊天主区 + 产物详情抽屉 |
| 2 | 产物库入口 | 资源库：简历 / 岗位 / 专属简历三个列表（用户浏览全部产物的常驻入口） |
| 3 | 数据获取 | useChat + 原生 fetch hooks；**不引入 TanStack Query**（YAGNI） |
| 4 | 设备范围 | **仅 PC 端，不考虑移动端适配**（不做响应式折叠、不做移动专项） |

## 2. 布局骨架（PC 端固定布局）

```
┌────────────┬──────────────────────────────────────┐
│ 左栏（固定宽）│ 聊天主区                              │
│ ┌────────┐ │  ┌──────────────────────────────┐   │
│ │ Tab:会话 │ │  │ 消息流（user/assistant 气泡、  │   │
│ │ Tab:资源 │ │  │ 进度卡片、确认卡片、产物卡片）  │   │
│ └────────┘ │  │                              │   │
│ 会话列表 /   │  │  …                          │   │
│ 资源列表     │  ├──────────────────────────────┤   │
│ （简历/岗位/ │  │ 输入框（多行 + 发送/停止）       │   │
│  专属简历）  │  └──────────────────────────────┘   │
└────────────┴──────────────────────────────────────┘
                └── 抽屉（产物详情，从卡片/列表项打开）──┘
```

## 3. 组件结构

```
app/page.tsx                    聊天主页面（布局组装 + 会话状态）
components/
├── layout/AppLayout            左栏 + 主区 + 抽屉骨架
├── sidebar/
│   ├── SidebarTabs             [会话 | 资源] 切换
│   ├── ConversationList        会话列表（标题/预览/删除/新建）
│   └── ResourceTabs            简历 / 岗位 / 专属简历 子列表
├── chat/
│   ├── MessageList             消息渲染（role 分流）
│   ├── MessageBubble           user 气泡 / assistant 气泡
│   ├── MarkdownText            react-markdown + DOMPurify
│   ├── ToolProgressCard        进度卡片（排队/进行/完成/失败 状态机）
│   ├── ConfirmationCard        确认卡片（描述/数据/风险 + 确认/拒绝）
│   └── ChatInput               多行输入 + 发送/停止
├── artifacts/
│   ├── ResumeCard / ResumeDrawer
│   ├── JobCard / JobDrawer
│   ├── MatchResultCard / Drawer（三段式结果渲染）
│   └── TailoredResumeDrawer    专属简历（Markdown 预览 + 版本切换）
└── ui/                         shadcn/ui 组件（button/dialog/sheet/tabs…）
```

## 4. 状态与数据获取

- **对话**：`useChat`（AI SDK，POST /api/chat，SSE 流式）+ `onCustomMessage` 接收进度事件（驱动 ToolProgressCard）
- **会话/资源数据**：原生 fetch hooks（`useConversations` / `useResumes` / `useJobs` / `useTailoredResumes`），React 组件状态持有
- **不引入 TanStack Query**：本地单用户、端点少、无缓存失效压力；出现多视图同步需求时再引入
- **刷新时机**：对话流结束（stop/complete）与工具完成后刷新相关资源列表（对话与资源库保持一致）

## 5. 交互细节

| 交互 | 行为 |
|---|---|
| 发送消息 | Enter 发送、Shift+Enter 换行；发送中可"停止"（useChat.stop） |
| 进度卡片 | 工具执行期间实时更新状态文案；完成显示摘要，失败显示错误 + 提示重发 |
| 确认卡片 | 确认 → `POST /api/confirmations/[id]/approve` → 流式追加结果轮；拒绝 → reject |
| 会话切换 | 切换时 useChat `setMessages` 回填该会话消息（GET messages） |
| 新建会话 | 左栏"+"；对话首条消息自动生成标题 |
| 空状态 | 无会话/无资源时引导文案（"从对话开始：粘贴简历或输入岗位 JD…"） |
| 产物查看 | 对话卡片摘要 → 点击开抽屉详情；资源库列表项 → 同样开抽屉 |

## 6. 主题与样式

- shadcn/ui（zinc 默认浅色）+ Tailwind v4 + lucide-react 图标
- 产物渲染统一走 MarkdownText（react-markdown + DOMPurify 安全净化）
- PC 端固定布局：左栏固定宽度，主区自适应；不做移动端适配

## 7. 依赖与边界

- **新增依赖**：shadcn/ui（含 reka-ui）、lucide-react、react-markdown、dompurify
- **边界**：
  - ❌ 移动端适配（专注 PC 端，2026-08-04 决策）
  - ❌ 深色模式（默认浅色，后续按需）
  - ❌ i18n（中文单语）
  - ⏸ 组件视觉细节在实现阶段以 shadcn 默认样式起步，不做定制主题

## 8. 与实现计划的接口

- 前端依赖安装（shadcn/ui 初始化）并入实现计划第 1 期（Agent 骨架 + 简历分析闭环需要聊天界面）
- 组件按功能分步实现：先聊天核心（消息流/输入/进度卡片）→ 会话栏 → 产物卡片/抽屉 → 资源库
