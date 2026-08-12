# OpenCLI 插件实现计划（批次 D2）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** OpenCLI 以插件形态接入 webFetch 降级链（51job/Boss 结构化采集），实现安全剥离（security_id）、字段修复与失败隔离。

**Architecture:** 顶层 `src/plugins/`（types + registry 静态注册表）→ `open-cli/` 插件（site-mapper 纯函数映射 URL→命令、parser 纯函数解析+脱敏+字段修复、runner spawn 封装可注入、doctor 可用性缓存、index 组装）→ web-fetch-router 的 opencli 层改查注册表（D1 代码小改，未注册零回归）。

**Tech Stack:** child_process.spawn、vitest（纯函数+注入测试）、真实 OpenCLI（本机已确认可用：daemon 19825 + 扩展 v1.0.22）。

**设计文档：** `docs/designs/2026-08-12-opencli-plugin-design.md`

**已核实的 CLI 事实**（本机实测）：
- 通用：`opencli <site> <command> [args] -f json`（-f 支持 table/plain/json/yaml/md/csv）
- 51job 只读命令：`detail <jobId>` / `search <keyword>` / `company <encCoId>` / `hot`
- boss 只读命令：`detail <security-id>`（参数即 URL 中的 securityId）/ `search`；**写命令**（greet/send/exchange/batchgreet）标注 [write]——插件不映射
- Boss AUTH_REQUIRED（未登录）→ 插件转 NEEDS_LOGIN，hint 引导 `opencli boss login` 一次人工登录
- `opencli doctor` 输出 `[OK] Daemon...` / `[OK] Extension...`（可用性判断）

---

### Task 1: plugins 基座（types + registry）

**Files:**
- Create: `src/plugins/types.ts`
- Create: `src/plugins/registry.ts`
- Test: `src/plugins/registry.test.ts`

- [ ] **Step 1: 写失败测试 `src/plugins/registry.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { getPlugin, listPlugins, registerPlugin } from './registry';
import type { FetchBackendPlugin } from './types';

const fake: FetchBackendPlugin = {
  id: 'fake',
  name: '测试插件',
  isAvailable: () => true,
  canHandle: () => false,
  fetch: async () => ({ ok: false, code: 'FAILED', message: '', hint: '' }),
};

describe('registry（静态注册表）', () => {
  it('注册后可按 id 取回、可枚举', () => {
    registerPlugin(fake);
    expect(getPlugin('fake')).toBe(fake);
    expect(listPlugins().some((p) => p.id === 'fake')).toBe(true);
  });
  it('未注册返回 undefined', () => {
    expect(getPlugin('not-exist')).toBeUndefined();
  });
  it('同 id 重复注册覆盖', () => {
    const other: FetchBackendPlugin = { ...fake, name: '覆盖版' };
    registerPlugin(other);
    expect(getPlugin('fake')?.name).toBe('覆盖版');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/plugins/registry.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/plugins/types.ts`:

```ts
/** 插件化外部采集后端（OpenCLI 等）。web-fetch-router 的降级链 opencli 层经注册表调用。 */
export type PluginFetchOutcome =
  | { ok: true; title: string; content: string; citations: string[] }
  | { ok: false; code: 'NEEDS_LOGIN' | 'BLOCKED' | 'FAILED'; message: string; hint: string };

export interface FetchBackendPlugin {
  id: string;
  name: string;
  /** 可用性检查（doctor，进程内缓存）——不可用时降级链跳过该层 */
  isAvailable(): boolean;
  /** 域名/路径判断：该插件能否处理此 URL */
  canHandle(url: string): boolean;
  /** 结构化采集 */
  fetch(url: string): Promise<PluginFetchOutcome>;
}
```

`src/plugins/registry.ts`:

```ts
/** 插件静态注册表（本地单应用，无动态扫描；未来插件在模块加载时注册）。 */
import type { FetchBackendPlugin } from './types';

const plugins = new Map<string, FetchBackendPlugin>();

export function registerPlugin(plugin: FetchBackendPlugin): void {
  plugins.set(plugin.id, plugin);
}

export function getPlugin(id: string): FetchBackendPlugin | undefined {
  return plugins.get(id);
}

export function listPlugins(): FetchBackendPlugin[] {
  return [...plugins.values()];
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/plugins/registry.test.ts`
Expected: PASS（3 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/plugins/types.ts src/plugins/registry.ts src/plugins/registry.test.ts
git commit -m "feat: 插件基座（FetchBackendPlugin 接口 + 静态注册表）"
```

---

### Task 2: open-cli/site-mapper.ts（URL → 命令映射）

**Files:**
- Create: `src/plugins/open-cli/site-mapper.ts`
- Test: `src/plugins/open-cli/site-mapper.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { mapUrlToCommand } from './site-mapper';

describe('mapUrlToCommand（URL → opencli 命令，实测 CLI）', () => {
  it('51job 详情：we.51job.com/jobs/<jobId>.html → 51job detail', () => {
    expect(mapUrlToCommand('https://we.51job.com/jobs/12345678.html'))
      .toEqual({ site: '51job', cmd: 'detail', args: ['12345678'] });
  });
  it('51job 搜索：we.51job.com 关键词页 → 51job search（query 从 URL 参数提取）', () => {
    expect(mapUrlToCommand('https://we.51job.com/pc/search?keyword=前端&city=北京'))
      .toEqual({ site: '51job', cmd: 'search', args: ['前端'] });
  });
  it('Boss 详情：zhipin.com/job_detail/<securityId>.html → boss detail', () => {
    expect(mapUrlToCommand('https://www.zhipin.com/job_detail/abc123xyz.html'))
      .toEqual({ site: 'boss', cmd: 'detail', args: ['abc123xyz'] });
  });
  it('Boss 搜索 → boss search（query 从 URL 参数提取）', () => {
    expect(mapUrlToCommand('https://www.zhipin.com/web/geek/job?query=后端'))
      .toEqual({ site: 'boss', cmd: 'search', args: ['后端'] });
  });
  it('不支持的 URL → null', () => {
    expect(mapUrlToCommand('https://www.zhaopin.com/jobdetail/1.htm')).toBeNull();
    expect(mapUrlToCommand('https://example.com/x')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/plugins/open-cli/site-mapper.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
/** URL → opencli 命令映射（实测 CLI：opencli <site> <cmd> <arg> -f json）。
 * 只映射只读命令（detail/search）；写命令（boss greet/send 等）不暴露。 */
export type SiteCommand = { site: '51job' | 'boss'; cmd: 'detail' | 'search'; args: string[] };

/** 从 URL query 提取搜索词（keyword/query 参数）；无则空数组（search 无参由模型/调用方补） */
function searchQuery(url: URL): string[] {
  const kw = url.searchParams.get('keyword') ?? url.searchParams.get('query') ?? '';
  return kw.trim() ? [kw.trim()] : [];
}

export function mapUrlToCommand(rawUrl: string): SiteCommand | null {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return null; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname;

  if (host.includes('51job.com')) {
    const detail = path.match(/\/jobs\/([^/]+)\.html$/);
    if (detail) return { site: '51job', cmd: 'detail', args: [detail[1]] };
    const kw = searchQuery(url);
    return { site: '51job', cmd: 'search', args: kw };
  }
  if (host.includes('zhipin.com')) {
    const detail = path.match(/\/job_detail\/([^/]+)\.html/);
    if (detail) return { site: 'boss', cmd: 'detail', args: [detail[1]] };
    return { site: 'boss', cmd: 'search', args: searchQuery(url) };
  }
  return null;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/plugins/open-cli/site-mapper.test.ts`
Expected: PASS（5 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/plugins/open-cli/site-mapper.ts src/plugins/open-cli/site-mapper.test.ts
git commit -m "feat: open-cli site-mapper（URL→51job/boss 只读命令映射）"
```

---

### Task 3: open-cli/parser.ts（解析 + security_id 剥离 + 51job 字段修复）

**Files:**
- Create: `src/plugins/open-cli/parser.ts`
- Test: `src/plugins/open-cli/parser.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { parseSiteJson, stripSecurityFields, fix51jobFields } from './parser';

describe('parseSiteJson（容错 JSON 解析）', () => {
  it('解析标准 JSON', () => {
    expect(parseSiteJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('容错：截取首个 { 到末尾 }（CLI 输出可能带前后杂讯）', () => {
    expect(parseSiteJson('prefix {"a":1} suffix')).toEqual({ a: 1 });
  });
  it('无 JSON 返回 null', () => {
    expect(parseSiteJson('nothing')).toBeNull();
  });
});

describe('stripSecurityFields（token 剥离，AGENTS.md 红线）', () => {
  it('递归删除 security_id 等字段', () => {
    const input = { job: { title: 'x', security_id: 'SECRET123' }, list: [{ securityId: 'S2', ok: 1 }] };
    const out = stripSecurityFields(input);
    expect(JSON.stringify(out)).not.toContain('SECRET123');
    expect(JSON.stringify(out)).not.toContain('S2');
    expect((out.job as Record<string, unknown>).title).toBe('x');
    expect(((out.list as unknown[])[0] as Record<string, unknown>).ok).toBe(1);
  });
  it('非对象输入原样返回', () => {
    expect(stripSecurityFields('str' as unknown)).toBe('str');
  });
});

describe('fix51jobFields（字段错位修复：title/companyName 抓到"APP下载"）', () => {
  it('title 错位时用 category/companyIntro 交叉校验修复', () => {
    const job = { title: 'APP下载', companyName: 'APP下载', category: '高级前端工程师', companyIntro: 'XX科技' };
    const out = fix51jobFields(job);
    expect(out.title).toBe('高级前端工程师');
    expect(out.companyName).toBe('XX科技');
  });
  it('正常字段不动', () => {
    const job = { title: '前端工程师', companyName: 'XX科技', category: '高级前端工程师', companyIntro: 'XX科技' };
    expect(fix51jobFields(job)).toEqual(job);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/plugins/open-cli/parser.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

```ts
/** OpenCLI 输出解析与安全处理（纯函数）：
 * 1. 容错 JSON 解析（CLI 输出可能带前后杂讯）
 * 2. security_id 等 token 字段递归剥离（AGENTS.md 红线——实测 Boss 输出含加密 token）
 * 3. 51job 字段错位修复（title/companyName 偶发抓到"APP下载"按钮文案，用 category/companyIntro 交叉校验） */

const SECURITY_FIELDS = new Set(['security_id', 'securityId', 'securityKey', 'encryptToken', 'token']);

export function parseSiteJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function stripSecurityFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => stripSecurityFields(v));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SECURITY_FIELDS.has(k)) continue;
      out[k] = stripSecurityFields(v);
    }
    return out;
  }
  return value;
}

/** 51job 字段错位修复：title/companyName 若命中按钮文案（APP下载 等），用 category/companyIntro 替换 */
const BUTTON_NOISE = /APP下载|APP 下载|下载APP/i;

export function fix51jobFields(job: Record<string, unknown>): Record<string, unknown> {
  const out = { ...job };
  if (typeof out.title === 'string' && BUTTON_NOISE.test(out.title) && typeof out.category === 'string' && out.category.trim()) {
    out.title = out.category.trim();
  }
  if (typeof out.companyName === 'string' && BUTTON_NOISE.test(out.companyName) && typeof out.companyIntro === 'string' && out.companyIntro.trim()) {
    out.companyName = out.companyIntro.trim();
  }
  return out;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/plugins/open-cli/parser.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/plugins/open-cli/parser.ts src/plugins/open-cli/parser.test.ts
git commit -m "feat: open-cli parser（容错解析 + security_id 剥离 + 51job 字段修复）"
```

---

### Task 4: open-cli/runner.ts + doctor.ts（spawn 封装，可注入）

**Files:**
- Create: `src/plugins/open-cli/runner.ts`
- Create: `src/plugins/open-cli/doctor.ts`
- Test: `src/plugins/open-cli/runner.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'vitest';
import { runOpenCli } from './runner';
import { checkDoctor } from './doctor';

/** 假 exec：直接返回预设输出（不 spawn 真实进程） */
function fakeExec(stdout: string, code = 0) {
  return async () => ({ stdout, stderr: '', code }) as { stdout: string; stderr: string; code: number };
}

describe('runOpenCli（spawn 封装，execImpl 可注入）', () => {
  it('返回 stdout/code；参数透传', async () => {
    const execImpl = fakeExec('{"ok":true}');
    const result = await runOpenCli(['51job', 'detail', '123'], { execImpl });
    expect(result.stdout).toBe('{"ok":true}');
    expect(result.code).toBe(0);
  });
  it('非零退出码透传（不抛错——由调用方判定）', async () => {
    const execImpl = fakeExec('', 1);
    const result = await runOpenCli(['x'], { execImpl });
    expect(result.code).toBe(1);
  });
});

describe('checkDoctor（可用性检查）', () => {
  it('doctor 输出含 [OK] → true', () => {
    const execImpl = fakeExec('[OK] Daemon: running on port 19825\n[OK] Extension: connected');
    expect(checkDoctor({ execImpl })).toBe(true);
  });
  it('doctor 输出含失败 → false', () => {
    const execImpl = fakeExec('[FAIL] Daemon: not running');
    expect(checkDoctor({ execImpl })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/plugins/open-cli/runner.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现**

`src/plugins/open-cli/runner.ts`:

```ts
/** opencli 子进程封装：spawn 执行只读命令（-f json），超时 30s；execImpl 可注入（测试 mock）。 */
import { spawn } from 'node:child_process';

export type ExecResult = { stdout: string; stderr: string; code: number };
export type ExecImpl = (cmd: string, args: string[], timeoutMs: number) => Promise<ExecResult>;

const DEFAULT_TIMEOUT_MS = 30_000;

const defaultExec: ExecImpl = (cmd, args, timeoutMs) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ stdout, stderr, code: code ?? -1 }); });
    child.on('error', () => { clearTimeout(timer); resolve({ stdout, stderr, code: -1 }); });
  });

export async function runOpenCli(
  args: string[],
  opts: { execImpl?: ExecImpl; timeoutMs?: number } = {},
): Promise<ExecResult> {
  const execImpl = opts.execImpl ?? defaultExec;
  return execImpl('opencli', [...args, '-f', 'json'], opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}
```

`src/plugins/open-cli/doctor.ts`:

```ts
/** opencli doctor 可用性检查（进程内缓存；fetch 失败时可复查刷新）。 */
import { runOpenCli, type ExecImpl } from './runner';

let cached: boolean | null = null;

export function checkDoctor(opts: { execImpl?: ExecImpl; refresh?: boolean } = {}): boolean {
  if (cached !== null && !opts.refresh) return cached;
  // 同步语义：doctor 检查由 fetch 路径触发，用同步等待（spawn 最快 <1s；超时由 runner 兜底）
  // 实现：runOpenCli 是 async——此处用同步包装不现实；改为：checkDoctor 返回缓存或启动一次异步检查并返回乐观值。
  // 简化方案：checkDoctor 同步返回缓存；首次未检查时触发异步检查（fire-and-forget）并返回 false（保守）。
  if (cached === null) {
    void runOpenCli(['doctor'], opts).then((r) => {
      cached = r.stdout.includes('[OK]');
    });
    cached = false; // 保守：首次未完成视为不可用，检查完成后刷新
  }
  return cached;
}

/** 强制复查（fetch 失败后调用） */
export function refreshDoctor(opts: { execImpl?: ExecImpl } = {}): void {
  cached = null;
  checkDoctor(opts);
}
```

注意：doctor 的同步语义与 runner 的 async 有张力——实现采用"首次保守 false + 异步刷新"（注释已说明）。若实现时发现此方案导致首轮 51job 不可用（后续可用），可改为 fetch 时先 `await runOpenCli(['doctor'])` 再执行（fetch 本身是 async，无同步约束）——**最终方案由实现者按测试与真实冒烟选择，并在 index.ts 的 isAvailable 语义中保持一致**。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/plugins/open-cli/runner.test.ts`
Expected: PASS（4 个用例：runner 2 + doctor 2）

- [ ] **Step 5: 提交**

```bash
git add src/plugins/open-cli/runner.ts src/plugins/open-cli/doctor.ts src/plugins/open-cli/runner.test.ts
git commit -m "feat: open-cli runner/doctor（spawn 封装可注入 + 可用性缓存）"
```

---

### Task 5: open-cli/index.ts（插件组装 + fetch 主逻辑 + 注册）

**Files:**
- Create: `src/plugins/open-cli/index.ts`
- Test: `src/plugins/open-cli/index.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, vi } from 'vitest';
import { openCliPlugin, createOpenCliPlugin } from './index';
import type { ExecImpl } from './runner';

/** 构造可注入 execImpl 的插件实例（测试用；默认插件走真实 spawn） */
function makePlugin(execImpl: ExecImpl, doctorOk = true) {
  return createOpenCliPlugin({ execImpl, doctorOk });
}

describe('open-cli 插件（组装与 fetch 主逻辑）', () => {
  it('身份与能力判断', () => {
    const p = makePlugin(async () => ({ stdout: '{}', stderr: '', code: 0 }));
    expect(p.id).toBe('open-cli');
    expect(p.canHandle('https://we.51job.com/jobs/123.html')).toBe(true);
    expect(p.canHandle('https://we.51job.com/pc/search?keyword=前端')).toBe(true);
    expect(p.canHandle('https://www.zhipin.com/job_detail/abc.html')).toBe(true);
    expect(p.canHandle('https://www.zhaopin.com/x')).toBe(false);
  });

  it('51job detail 成功：解析 → 剥离 security 字段 → 输出 content/citations', async () => {
    const execImpl: ExecImpl = async () => ({
      stdout: JSON.stringify({
        data: { title: '前端工程师', companyName: 'XX科技', security_id: 'TOPSECRET', jd: '要求本科' },
      }),
      stderr: '', code: 0,
    });
    const p = makePlugin(execImpl);
    const out = await p.fetch('https://we.51job.com/jobs/123.html');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.content).toContain('前端工程师');
      expect(out.content).not.toContain('TOPSECRET');
      expect(out.citations).toEqual(['https://we.51job.com/jobs/123.html']);
    }
  });

  it('Boss AUTH_REQUIRED → NEEDS_LOGIN（hint 引导登录）', async () => {
    const execImpl: ExecImpl = async () => ({
      stdout: JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }),
      stderr: '', code: 1,
    });
    const p = makePlugin(execImpl);
    const out = await p.fetch('https://www.zhipin.com/job_detail/abc.html');
    expect(out).toMatchObject({ ok: false, code: 'NEEDS_LOGIN' });
  });

  it('doctor 不可用 → fetch 返回 BLOCKED（不执行命令）', async () => {
    const execImpl = vi.fn(async () => ({ stdout: '{}', stderr: '', code: 0 }));
    const p = makePlugin(execImpl as ExecImpl, false);
    const out = await p.fetch('https://we.51job.com/jobs/123.html');
    expect(out).toMatchObject({ ok: false, code: 'BLOCKED' });
    expect(execImpl).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/plugins/open-cli/index.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/plugins/open-cli/index.ts`**

```ts
/** OpenCLI 采集插件：51job/Boss 结构化采集（只读命令），安全剥离 + 字段修复 + 登录态引导。 */
import type { FetchBackendPlugin, PluginFetchOutcome } from '../types';
import { mapUrlToCommand } from './site-mapper';
import { fix51jobFields, parseSiteJson, stripSecurityFields } from './parser';
import { runOpenCli, type ExecImpl } from './runner';
import { checkDoctor } from './doctor';

/** 插件选项（测试注入 execImpl/doctorOk；生产默认真实 spawn + doctor 缓存） */
export type OpenCliPluginOptions = { execImpl?: ExecImpl; doctorOk?: boolean };

export function createOpenCliPlugin(opts: OpenCliPluginOptions = {}): FetchBackendPlugin {
  const execImpl = opts.execImpl;
  const doctorOk = opts.doctorOk;

  const isAvailable = (): boolean => {
    if (doctorOk !== undefined) return doctorOk;
    return checkDoctor({ execImpl });
  };

  return {
    id: 'open-cli',
    name: 'OpenCLI 站点采集器',
    isAvailable,
    canHandle: (url: string) => mapUrlToCommand(url) !== null,
    fetch: async (url: string): Promise<PluginFetchOutcome> => {
      if (!isAvailable()) {
        return { ok: false, code: 'BLOCKED', message: 'OpenCLI 不可用', hint: '请确认 opencli daemon 与 Chrome 扩展已启动（opencli doctor）。' };
      }
      const cmd = mapUrlToCommand(url);
      if (!cmd) {
        return { ok: false, code: 'BLOCKED', message: '该 URL 不在 OpenCLI 支持范围', hint: '暂不支持该站点采集。' };
      }
      const result = execImpl
        ? await runOpenCli([cmd.site, cmd.cmd, ...cmd.args], { execImpl })
        : await runOpenCli([cmd.site, cmd.cmd, ...cmd.args]);
      const parsed = parseSiteJson(result.stdout);
      if (!parsed) {
        return { ok: false, code: 'FAILED', message: `OpenCLI 输出解析失败（exit ${result.code}）`, hint: '采集输出异常，可重试或人工查看。' };
      }
      // AUTH_REQUIRED（Boss 未登录）→ 引导一次人工登录
      const err = parsed.error as { code?: string } | undefined;
      if (err?.code === 'AUTH_REQUIRED') {
        return {
          ok: false, code: 'NEEDS_LOGIN',
          message: 'Boss 直聘需要登录态',
          hint: '请在本机执行 opencli boss login 完成一次人工登录后重试（登录态长期有效）。',
        };
      }
      if (err) {
        return { ok: false, code: 'BLOCKED', message: `站点返回错误：${err.code ?? 'UNKNOWN'}`, hint: '该页面采集失败，可尝试人工查看后导入。' };
      }
      // 脱敏 + 字段修复（51job）
      const safe = stripSecurityFields(parsed) as Record<string, unknown>;
      const data = cmd.site === '51job' ? fix51jobFields(safe as Record<string, unknown>) : safe;
      // 结构化字段 → Markdown 摘要（title/companyName/jd/salary 等字段按存在拼接）
      const lines: string[] = [];
      for (const key of ['title', 'jobName', 'companyName', 'salary', 'city', 'jd', 'jobDesc', 'requirements']) {
        const v = (data as Record<string, unknown>)[key];
        if (typeof v === 'string' && v.trim()) lines.push(`${key}: ${v.trim()}`);
      }
      const content = lines.join('\n') || JSON.stringify(data, null, 2);
      return { ok: true, title: typeof data.title === 'string' ? data.title.slice(0, 120) : '', content, citations: [url] };
    },
  };
}

/** 默认插件实例（生产路径）：模块加载时注册 */
export const openCliPlugin = createOpenCliPlugin();

// 模块副作用：注册到静态注册表（web-fetch-router 经 getPlugin 消费）
import { registerPlugin } from '../registry';
registerPlugin(openCliPlugin);
```

注意：字段名（title/companyName/salary/jd 等）为 51job/boss 输出的**预期字段**——真实输出结构以冒烟实测为准，Task 7 冒烟时按实际字段调整拼接清单（测试用字段已对齐本实现）。

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/plugins/open-cli/index.test.ts`
Expected: PASS（4 个用例）

- [ ] **Step 5: 提交**

```bash
git add src/plugins/open-cli/index.ts src/plugins/open-cli/index.test.ts
git commit -m "feat: open-cli 插件组装与注册（fetch 主逻辑 + 登录态引导 + 脱敏）"
```

---

### Task 6: web-fetch-router 集成（opencli 层接插件）

**Files:**
- Modify: `src/agent/web-fetch-router.ts`
- Test: `src/agent/web-fetch-router.test.ts`（追加用例）

- [ ] **Step 1: 追加失败测试（web-fetch-router.test.ts）**

```ts
  // —— opencli 插件层（Task 6 追加）——
  it('opencli 层走插件：插件成功 → source=opencli', async () => {
    const { registerPlugin, getPlugin } = await import('../plugins/registry');
    // 清理已有 open-cli 注册（若测试顺序已注册真实插件）
    // 注册 mock 插件
    const mock = {
      id: 'open-cli', name: 'mock',
      isAvailable: () => true,
      canHandle: (u: string) => u.includes('51job.com'),
      fetch: async () => ({ ok: true as const, title: '职位', content: '采集内容', citations: ['https://we.51job.com/jobs/1.html'] }),
    };
    registerPlugin(mock as never);
    const result = await routeFetch({
      url: 'https://we.51job.com/jobs/1.html',
      fetchImpl: async () => new Response('<html>aliyun_waf</html>', { status: 200 }), // direct 失败（WAF）→ jina 也失败 → opencli 插件
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.source).toBe('opencli');
      expect(result.content).toContain('采集内容');
    }
  });

  it('插件未注册 → opencli 层跳过（保持 D1 行为：FETCH_BLOCKED）', async () => {
    // 场景：registry 无 open-cli 插件（测试隔离：注册表是模块级 Map——需可清理；用 registerPlugin 覆盖为不可用插件？）
    // 简化：注册 canHandle=false 的占位插件模拟"未注册"效果
    const { registerPlugin } = await import('../plugins/registry');
    registerPlugin({
      id: 'open-cli', name: 'unavailable', isAvailable: () => false,
      canHandle: () => true,
      fetch: async () => ({ ok: false, code: 'BLOCKED' as const, message: '', hint: '' }),
    });
    const result = await routeFetch({
      url: 'https://we.51job.com/jobs/1.html',
      fetchImpl: async () => new Response('waf', { status: 403 }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('FETCH_BLOCKED');
  });
```

注意：注册表是模块级 Map，测试间会互相污染——**实现时给 registry 加 `clearPlugins()`（测试专用）或在测试 beforeEach 清理**；router 的 opencli 层实现要处理"插件 isAvailable=false 时跳过该层"（保持 D1 的 FETCH_BLOCKED）。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/agent/web-fetch-router.test.ts`
Expected: 新用例 FAIL（opencli 层未接插件）

- [ ] **Step 3: 修改 `src/agent/web-fetch-router.ts`**

routeFetch 的 opencli 分支（direct/jina 失败后）替换为：

```ts
  // opencli 插件层：经注册表调用（插件未注册/不可用 → 跳过，保持 D1 行为）
  const openCliPlugin = getPlugin('open-cli');
  if (openCliPlugin && openCliPlugin.canHandle(url)) {
    if (!openCliPlugin.isAvailable()) {
      // 不可用：跳过该层（降级链结束，返回 FETCH_BLOCKED hint 提示）
    } else {
      const outcome = await openCliPlugin.fetch(url);
      if (outcome.ok) {
        const truncated = outcome.content.length > maxChars;
        return {
          ok: true, url, title: outcome.title,
          content: outcome.content.slice(0, maxChars),
          source: 'opencli', truncated, maxChars,
        };
      }
      if (outcome.code === 'NEEDS_LOGIN') {
        return { ok: false, code: 'FETCH_NEEDS_LOGIN', message: outcome.message, hint: outcome.hint };
      }
      return { ok: false, code: 'FETCH_BLOCKED', message: outcome.message, hint: outcome.hint };
    }
  }
```

（import `getPlugin` from '../plugins/registry'；`FetchSource` 已含 'opencli'）

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/agent/web-fetch-router.test.ts`
Expected: PASS（原 7 + 新 2）

- [ ] **Step 5: 全量验证 + 提交**

Run: `npm test && npm run lint && npx tsc --noEmit`
Expected: 全绿

```bash
git add src/agent/web-fetch-router.ts src/agent/web-fetch-router.test.ts src/plugins/registry.ts
git commit -m "feat: webFetch 降级链 opencli 层接插件注册表（未注册零回归）"
```

---

### Task 7: 真实冒烟 + 文档收尾

**Files:**
- Modify: `docs/plans/2026-08-12-opencli-plugin.md`（冒烟记录）
- Modify: `PROJECT_STATUS.md`
- Modify: `docs/research/2026-08-10-agent-roadmap-discussion.md`

- [ ] **Step 1: 真实冒烟（本机 OpenCLI 已确认可用）**

1. **51job 搜索**：`opencli 51job search 前端 -f json | head -c 500`（记录实际字段结构）
2. **51job 详情**：取搜索结果中一个 jobId → `opencli 51job detail <jobId> -f json | head -c 500`（记录 title/companyName/jd 等实际字段名）
3. **Boss**：`opencli boss detail <securityId> -f json`（记录 AUTH_REQUIRED 行为或登录态可用性；若需登录——按调研报告 Boss 已登录过，验证登录态是否仍有效，**记录 cookie 有效期观测**）
4. 若实际字段名与 Task 5 拼接清单不一致：调整 index.ts 的字段清单（commit 附注）

- [ ] **Step 2: 更新计划冒烟记录**（追加到本计划末尾）：

```markdown
## 冒烟实测记录（2026-08-12，Task 7）

- 51job search 实测：<结果/字段结构>
- 51job detail 实测：<结果/字段结构>
- Boss detail 实测：<AUTH_REQUIRED 或成功 + 登录态有效期观测>
- 字段拼接清单调整：<有/无 + 说明>
```

- [ ] **Step 3: PROJECT_STATUS 更新**

- 批次行：`D1 ✅ + D3 ✅` → `D1 ✅ + D2 ✅ + D3 ✅`（web 工具全链路完成；OpenCLI 插件接入 51job/Boss）
- 已知限制补充：OpenCLI 登录态有效期（实测值）；Boss 未登录时 webFetch 返回 FETCH_NEEDS_LOGIN
- 测试数更新（以实际为准）
- 文档索引补 D2 设计/计划链接

- [ ] **Step 4: 讨论纪要 P2-5 或批次 D 相关节追加实现状态**

- [ ] **Step 5: 提交**

```bash
git add docs/plans/2026-08-12-opencli-plugin.md PROJECT_STATUS.md docs/research/2026-08-10-agent-roadmap-discussion.md
git commit -m "docs: 批次 D2 验收（OpenCLI 插件接入 51job/Boss 采集）"
```

---

## 计划自审记录

- **规格覆盖**：设计文档 §2 目录 → Task 1-5；§3 接口/注册表 → Task 1；§4 集成 → Task 6；§5 插件内部（site-mapper/parser/runner/doctor/index）→ Task 2-5；§6 安全（security_id/写命令/登录态）→ Task 3/5；§7 测试 → 各任务 + Task 7 冒烟；§8 不做 → 无越界。
- **类型一致性**：`FetchBackendPlugin`/`PluginFetchOutcome`/`registerPlugin`/`getPlugin`/`mapUrlToCommand`/`parseSiteJson`/`stripSecurityFields`/`fix51jobFields`/`runOpenCli`/`checkDoctor`/`createOpenCliPlugin` 签名在定义与引用任务间一致。
- **占位符扫描**：无 TODO/待定；51job/boss 输出字段名标注"以冒烟实测为准"（Task 7 调整点，非占位）。
- **自审修正**：registry 测试间污染 → Task 6 注明加 `clearPlugins()`（测试专用）或在测试内覆盖注册；doctor 同步语义张力 → Task 4 注明实现选择（保守 false + 异步刷新，或 fetch 时先 await doctor——最终由实现者按测试/冒烟确定并在 isAvailable 保持一致）。

---

## 冒烟实测记录（2026-08-12，Task 7）

- **51job search 实测**：成功，返回 20 条 JSON **数组**（非对象）。字段：`rank, jobId, title, salary, salaryMin, salaryMax, city, district, workYear, degree, tags, company, companyFull, companyType, companySize, industry, hr, issueDate, url, companyUrl, encCoId`（公司名字段为 `company`，无 `companyName`；无 `jd`）。
- **51job detail 实测**：成功，返回**单元素数组**（与 search 同形态）。字段：`jobId, title, salary, location, workYear, degree, category, address, ageRequirement, description, welfare, company, companyType, companySize, companyIndustry, companyUrl, url`。`title` 实测为按钮文案 **"APP下载"**（Task 3 的 fix51jobFields 真实触发，用 `category` 交叉校验修复为 "前端开发"——真实数据验证修复有效）；JD 在 `description`。
- **Boss detail 实测**：**成功（非 AUTH_REQUIRED）**——本机 Boss 登录态有效。**登录态有效期观测**：2026-08-12 实测 Chrome 扩展 v1.0.22 会话仍有效，detail 正常返回（cookie 长期有效，无需重新登录；失效后 detail 返回 AUTH_REQUIRED，插件转 NEEDS_LOGIN，hint 引导 `opencli boss login` 一次人工登录）。字段：`name, salary, experience, degree, city, district, description, skills, welfare, boss_name, boss_title, active_time, company, industry, scale, stage, address, url`（标题字段为 `name` 而非 `title`；detail 输出不含 security_id，search 输出含 `security_id`——剥离已验证）。非登录态 AUTH_REQUIRED 路径由单测覆盖（不执行 boss login 等写操作）。
- **字段拼接清单调整：有**（Task 5 清单 `title/jobName/companyName/salary/city/jd/jobDesc/requirements` 与真实字段不符，已校准为 `title/name/company/salary/city/category/workYear/degree/description`；标题回退 `title`→`name`；51job detail/search 均为数组，取首元素做摘要、多元素追加完整列表）。**另有冒烟驱动的实现修正**（提交附注说明）：① Windows 下 opencli 是 npm `.cmd` shim，`spawn` 直启 ENOENT/EINVAL——runner 改经 `cmd.exe /d /s /c` 解析（参数 `quoteWinArg` 引用，纯函数单测）；② `opencli doctor` 不支持 `-f json`（实测报 unknown option）——doctor 调用 `json:false` 跳过格式后缀；③ 冷缓存首轮 `isAvailable` 保守 false 会误判 BLOCKED——新增 `ensureDoctor`（fetch 路径 await 真实检查），router 的 opencli 层不再用同步 isAvailable 门控；④ `parseSiteJson` 增加数组形态支持（原实现只取 `{...}`，真实数组输出会解析失败）。全量验证：308 个测试全绿（原 302 + 新增 6）+ lint 0 error + tsc 通过；真实 e2e（插件代码 + 真实 CLI + 真实站点）三条路径全部成功且输出无 security_id 残留。
