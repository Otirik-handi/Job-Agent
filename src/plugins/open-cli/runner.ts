/** opencli 子进程封装：spawn 执行只读命令（-f json），超时 30s；execImpl 可注入（测试 mock）。 */
import { spawn } from 'node:child_process';

export type ExecResult = { stdout: string; stderr: string; code: number };
export type ExecImpl = (cmd: string, args: string[], timeoutMs: number) => Promise<ExecResult>;

const DEFAULT_TIMEOUT_MS = 30_000;

/** cmd.exe 元字符（含空白）——命中则整体加双引号；`%`/`!` 在引号内仍会展开，为已知边角（本地单用户应用可接受） */
const CMD_META = /[\s"&|<>^()%!]/;

/** 单参数 cmd.exe 安全引用（纯函数，仅用于 Windows shell 路径） */
export function quoteWinArg(arg: string): string {
  if (CMD_META.test(arg)) return `"${arg.replace(/"/g, '""')}"`;
  return arg;
}

/** 组装 Windows shell 命令行：opencli 是 npm .cmd shim，spawn 直启会 ENOENT/EINVAL——经 cmd.exe 解析 */
export function buildWinCommand(cmd: string, args: string[]): string {
  return [cmd, ...args].map(quoteWinArg).join(' ');
}

const defaultExec: ExecImpl = (cmd, args, timeoutMs) =>
  new Promise((resolve) => {
    // Windows：cmd.exe /d /s /c 解析（等价 node 内部 shell 路径的组装方式，避免 DEP0190 噪音）
    const child = process.platform === 'win32'
      ? spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${buildWinCommand(cmd, args)}"`], { windowsHide: true, windowsVerbatimArguments: true })
      : spawn(cmd, args, { windowsHide: true });
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
  opts: { execImpl?: ExecImpl; timeoutMs?: number; json?: boolean } = {},
): Promise<ExecResult> {
  const execImpl = opts.execImpl ?? defaultExec;
  // doctor 命令不支持 -f json（实测报 unknown option）——json:false 跳过格式后缀
  const full = opts.json === false ? args : [...args, '-f', 'json'];
  return execImpl('opencli', full, opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}
