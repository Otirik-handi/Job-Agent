# 前端工程规范（frontend-conventions.md）

> 前端代码的组织与写法约定（现状沉淀：固化 `src/`、`app/` 已稳定一致的实践）。
> 为什么：前端跨 7 个 hooks、4 个组件域、3 个产物抽屉重复一致的约定，需要一份权威清单防止风格漂移。

## 目录组织

- `src/components/ui/`：shadcn 原始组件，保持低自定义（`button`/`card`/`badge`/`input`/`textarea`/`sheet`/`tabs`/`separator`/`scroll-area`/`status-badge`/`empty-state`/`confirm-dialog`）
- `src/components/<域>/`：业务组件按域分目录（现有 `chat/`、`sidebar/`、`artifacts/`），新增业务域先建目录
- `src/lib/use-*.ts`：每个资源一个数据 hook（`use-conversations`、`use-resumes`、`use-job-opportunities`、`use-tailored-resumes` 及各自详情 hook）
- `src/lib/api.ts`：统一 API 客户端（`apiGet` / `apiSend` / `apiUpload`）
- `src/lib/*.ts`：纯逻辑直接放 lib，同名 `.test.ts` 同目录
- 为什么：目录即职责边界，组件/数据/纯逻辑分离，便于定位与复用

## 命名

- 文件：kebab-case（`conversation-list.tsx`）；组件：PascalCase；hook：`use` 前缀 + 驼峰
- 需要浏览器 API 的文件（`useState`/`useEffect`/DOM）首行 `'use client'`
- 为什么：Next.js App Router 与 React 惯例；`'use client'` 是 RSC 边界标记

## 数据访问

- 一律经 `api.ts`：`apiGet<T>(url)` 读、`apiSend<T>(url, method, body?)` 写、`apiUpload<T>(url, file)` 上传，**不在组件内裸 `fetch` 业务端点**
- 错误解析统一：从响应 `{ message }` 提取中文错误，缺省兜底"请求失败（status）"
- 为什么：`api.ts` 集中错误解析与契约处理，避免每个 hook 重复且不一致

## 列表 hooks

- 模式：`useState` + `refresh`（`useCallback` 包装 `apiGet`）+ `useEffect` 挂载刷新
- 变更后重新 `refresh`：删除、上传、重命名等操作完成后调用 `refresh()` 同步列表
- 数据 hook 支持可选 `refreshSignal?: number` 参数（挂进 `useEffect` 依赖）：对话落库后页面层递增该信号，驱动列表/抽屉详情重新拉取；透传链 `page → Sidebar/ResourceTabs/Drawers`
- 为什么：现有 hook 的一致模式，数据源单一、状态自动同步，避免手工维护两份列表；对话驱动资源变更需在 UI 侧自动同步（修复"状态更新后需手动刷新"历史教训）

## UI 约定

- 空状态一律用 `EmptyState`（渐变圆底 + 图标 + 引导文案），禁止裸灰字
- 产物展示（简历/岗位/专属简历详情）用 `artifacts/` 抽屉组件
- 投递状态用 `StatusBadge`，仅渲染 9 状态枚举（saved/matched/applying/applied/skipped/interview/offer/hired/rejected）
- 确认型操作（删除/重命名）用 `ConfirmDialog`
- 为什么：统一视觉与交互语言，验收过的组件复用而非重写

## 样式边界

- 样式令牌遵循 `SoftUI.md`（primary indigo-600、muted slate-600、input slate-300）与 AGENTS.md 对比度要求
- 新增样式不得推翻令牌体系或引入风格漂移
- 为什么：UI 系列已多轮验收，风格统一是产品一致性前提
