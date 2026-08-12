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
