# OpenCLI 插件设计（批次 D2）

日期：2026-08-12
状态：已定稿（用户批准），待写实现计划
依据：`docs/research/2026-08-12-opencli-collection-assessment.md`（OpenCLI 采集实测）、`docs/designs/2026-08-12-web-tools-design.md`（批次 D 设计，D2 概要）
关联：`src/plugins/` 为项目首个插件域（用户决议 2026-08-12：插件形态与目录由设计者重新设计——顶层 src/plugins/，非 agent 域内）

---

## 1. 背景与目标

批次 D2 概要任务（OpenCLI 后端接入）细化为**插件形态**：

- **职责分离**：OpenCLI（外部工具后端）从"web-fetch-router 的一层占位"独立为可插拔插件——router 只做降级决策，插件自管可用性/命令/解析
- **可替换性**：未来其他采集后端（新站点适配器）同级扩展 `src/plugins/<name>/`
- **失败隔离**：插件未注册/不可用时降级链跳过该层，主功能零影响
- **环境确认**：2026-08-12 实测本机 OpenCLI 可用（daemon 19825 运行中 + Chrome 扩展 v1.0.22 已连接）——D2 可真实实现并冒烟

## 2. 目录结构（顶层 src/plugins/）

```
src/plugins/
  types.ts                  ← 插件接口（FetchBackendPlugin / PluginFetchOutcome）
  registry.ts               ← 静态注册表（registerPlugin/getPlugin/listPlugins）
  open-cli/
    index.ts                ← 插件对象组装（id/isAvailable/canHandle/fetch）
    doctor.ts               ← opencli doctor 检查（spawn 超时 10s，进程内缓存）
    runner.ts               ← spawn 封装（opencli <site> <cmd> -f json，30s 超时，execImpl 可注入）
    parser.ts               ← 纯函数：JSON 解析 + security_id 剥离 + 51job 字段修复
    site-mapper.ts          ← 纯函数：URL → { site, cmd, query? }
```

理由：插件是独立可替换单元（外部工具后端），不属于 agent 核心；依赖方向单向（agent 编排层 → plugins 接口）；`src/agent/` 已有 web-* 模块保持不动（除 router 小改）。

## 3. 插件接口（types.ts）

```ts
export type PluginFetchOutcome =
  | { ok: true; title: string; content: string; citations: string[] }
  | { ok: false; code: 'NEEDS_LOGIN' | 'BLOCKED' | 'FAILED'; message: string; hint: string };

export interface FetchBackendPlugin {
  id: string;                       // 'open-cli'
  name: string;
  isAvailable(): boolean;           // doctor 检查（进程内缓存）
  canHandle(url: string): boolean;  // 域名判断（51job/zhipin）
  fetch(url: string): Promise<PluginFetchOutcome>;
}
```

注册表（registry.ts，静态）：

```ts
const plugins = new Map<string, FetchBackendPlugin>();
export function registerPlugin(p: FetchBackendPlugin): void;
export function getPlugin(id: string): FetchBackendPlugin | undefined;
export function listPlugins(): FetchBackendPlugin[];
```

## 4. 与降级链集成（web-fetch-router 小改）

- `decideRoute` 返回 `opencli` 的 URL（51job/zhipin，D1 已有）——routeFetch 的 opencli 层从"预留占位"改为：

```ts
// routeFetch 内（direct/jina 失败后）：
const plugin = getPlugin('open-cli');
if (plugin && plugin.canHandle(url)) {
  const outcome = await plugin.fetch(url);
  if (outcome.ok) { /* 成功：组装 FetchOutcome（source: 'opencli'）*/ }
  else { /* 失败：NEEDS_LOGIN → FETCH_NEEDS_LOGIN；BLOCKED/FAILED → FETCH_BLOCKED/FETCH_FAILED */ }
}
// 未注册/不可用 → 跳过该层（保持 D1 行为：FETCH_BLOCKED hint 提示人工查看）
```

- **D1 已验收代码基本不动**：direct/jina 内置层不变；只改 routeFetch 的 opencli 分支（约 10 行）
- 插件未注册时 webFetch 行为 = D1 现状（零回归）；注册后 51job/zhipin 走插件

## 5. 插件内部设计

### 5.1 site-mapper.ts（纯函数）

- `mapUrlToCommand(url): { site, cmd, query? } | null`：
  - `we.51job.com/jobs/*.html` → `{ site: '51job', cmd: 'detail' }`
  - `we.51job.com` / 列表页 → `{ site: '51job', cmd: 'search' }`（query 从 URL 参数推断，缺省由调用方补）
  - `zhipin.com/job_detail/*.html` → `{ site: 'boss', cmd: 'detail' }`
  - `zhipin.com` 搜索 → `{ site: 'boss', cmd: 'search' }`
  - 其他 → null（不处理）
- 具体 site 名/命令以 opencli 实际 CLI 为准（实现时 `opencli --help` / 调研报告实测命令核对）

### 5.2 parser.ts（纯函数，安全重点）

- `parseSiteJson(raw: string): SiteJson | null`：JSON 解析（容错：截取首个 `{` 到末尾 `}`）
- `stripSecurityFields(obj): obj`：**递归删除 `security_id` 等 token 字段**（AGENTS.md 红线——实测 Boss 输出含加密 token；白名单字段名：security_id/securityKey/encryptToken 等，实现按实测输出补全）
- `fix51jobFields(job): job`：51job 字段错位修复——title/companyName 偶发抓到"APP下载"按钮文案，用 companyIntro/category 交叉校验替换（纯函数，实测样本驱动）

### 5.3 runner.ts（spawn 封装）

- `runOpenCli(args: string[], opts?: { execImpl?, timeoutMs? }): Promise<{ stdout, stderr, code }>`：
  - 默认 `child_process.spawn('opencli', args, { windowsHide: true })`，超时 30s（kill）
  - `execImpl` 可注入（测试 mock，不依赖真实环境）
  - 写操作命令（greet/send 等）**不暴露**——插件只映射只读命令（search/detail）

### 5.4 doctor.ts

- `checkDoctor(execImpl?): boolean`：spawn `opencli doctor`（超时 10s）解析 `[OK]`；**进程内缓存**（首次检查缓存结果；fetch 失败时复查一次并更新缓存）

### 5.5 index.ts（插件组装）

- `openCliPlugin: FetchBackendPlugin`：
  - `id: 'open-cli'`，`name: 'OpenCLI 站点采集器'`
  - `isAvailable()` → checkDoctor()
  - `canHandle(url)` → mapUrlToCommand(url) !== null
  - `fetch(url)`：mapUrlToCommand → runOpenCli(`[site, cmd, ...]`) → parseSiteJson → stripSecurityFields → fix51jobFields（51job 时）→ 组装 content（结构化字段转 Markdown 摘要 + citations）；`AUTH_REQUIRED` 错误 → `NEEDS_LOGIN`（hint 引导 `opencli boss login` 一次人工登录）
- 注册：模块加载时 `registerPlugin(openCliPlugin)`（registry 静态注册表）

## 6. 安全与边界

| 项 | 处理 |
|---|---|
| security_id 剥离 | parser 递归删除 token 字段，不进入工具结果与日志 |
| 日志边界 | 只记 URL/status/长度；opencli 输出与正文不进日志 |
| 写操作 | 插件只暴露只读命令（search/detail）；greet/send 等写命令不映射 |
| 登录态 | Boss AUTH_REQUIRED → FETCH_NEEDS_LOGIN（hint 引导人工登录一次）；cookie 有效期实测记录 |
| 敏感信息 | 结构化采集内容仍按"不可信输入"处理（工具结果进对话，不进 system prompt） |

## 7. 测试策略

| 层 | 内容 |
|---|---|
| 纯函数单测 | site-mapper（URL→命令映射）、parser（security_id 剥离/51job 字段修复/容错解析） |
| 注入测试 | runner/doctor（mock execImpl）、router 集成（注册 mock 插件 → opencli 层走插件；未注册 → 跳过零回归） |
| 真实冒烟 | 本机 OpenCLI 已确认可用 → 51job 真实采集（未登录三层）+ Boss（登录态记录有效期） |

## 8. 明确不做

- 动态目录扫描（静态注册表足够）；插件热加载/重载
- 多插件管理 UI；写操作命令暴露（greet/send）
- 51job/Boss 之外的新站点适配器（插件接口就绪，未来扩展）

## 9. 文档链

- 本设计 → 实现计划（`docs/plans/2026-08-12-opencli-plugin.md`）→ PROJECT_STATUS 更新（D2 完成）
- 关联：web-tools 设计 §7.2（OpenCLI 集成要点）被本设计细化覆盖
