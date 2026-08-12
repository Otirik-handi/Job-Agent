/** OpenCLI 采集插件：51job/Boss 结构化采集（只读命令），安全剥离 + 字段修复 + 登录态引导。 */
import type { FetchBackendPlugin, PluginFetchOutcome } from '../types';
import { mapUrlToCommand } from './site-mapper';
import { fix51jobFields, parseSiteJson, stripSecurityFields } from './parser';
import { runOpenCli, type ExecImpl } from './runner';
import { checkDoctor, ensureDoctor } from './doctor';

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
      // 可用性：冷缓存首次 await 真实 doctor（冒烟决策：避免首轮保守 false 误判 BLOCKED）；doctorOk 为测试注入
      const available = doctorOk !== undefined ? doctorOk : await ensureDoctor({ execImpl });
      if (!available) {
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
      // 脱敏（递归剥离 security_id 等）+ 51job 字段修复
      const safe = stripSecurityFields(parsed) as unknown;
      // 真实 CLI 输出：51job 为数组（detail 单元素 / search 多元素），boss 为对象——摘要取首条
      const list = (Array.isArray(safe) ? safe : [safe]) as unknown[];
      const first = list[0] && typeof list[0] === 'object'
        ? (cmd.site === '51job' ? fix51jobFields(list[0] as Record<string, unknown>) : list[0] as Record<string, unknown>)
        : null;
      // 结构化字段 → Markdown 摘要（字段名经 Task 7 真实冒烟校准：companyName→company、jd→description、boss 用 name）
      const lines: string[] = [];
      if (first) {
        for (const key of ['title', 'name', 'company', 'salary', 'city', 'category', 'workYear', 'degree', 'description']) {
          const v = first[key];
          if (typeof v === 'string' && v.trim()) lines.push(`${key}: ${v.trim()}`);
        }
      }
      // 搜索列表（多元素）：摘要 + 完整列表（超长由 web-fetch-router 截断兜底）；单条/对象走摘要
      const content = lines.length
        ? (list.length > 1 ? `${lines.join('\n')}\n\n--- 完整列表（共 ${list.length} 条）---\n${JSON.stringify(safe, null, 2)}` : lines.join('\n'))
        : JSON.stringify(safe, null, 2);
      const title = first && typeof first.title === 'string' && first.title.trim()
        ? first.title.slice(0, 120)
        : first && typeof first.name === 'string'
          ? first.name.slice(0, 120)
          : '';
      return { ok: true, title, content, citations: [url] };
    },
  };
}

/** 默认插件实例（生产路径）：模块加载时注册 */
export const openCliPlugin = createOpenCliPlugin();

// 模块副作用：注册到静态注册表（web-fetch-router 经 getPlugin 消费）
import { registerPlugin } from '../registry';
registerPlugin(openCliPlugin);
