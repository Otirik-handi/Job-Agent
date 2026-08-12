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
