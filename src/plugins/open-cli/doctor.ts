/** opencli doctor 可用性检查（进程内缓存；fetch 失败时可复查刷新）。 */
import { runOpenCli, type ExecImpl } from './runner';

let cached: boolean | null = null;

export function checkDoctor(opts: { execImpl?: ExecImpl; refresh?: boolean } = {}): boolean {
  if (cached !== null && !opts.refresh) return cached;
  // 同步语义：doctor 检查由 fetch 路径触发，用同步等待（spawn 最快 <1s；超时由 runner 兜底）
  // 实现：runOpenCli 是 async——此处用同步包装不现实；改为：checkDoctor 返回缓存或启动一次异步检查并返回乐观值。
  // 简化方案：checkDoctor 同步返回缓存；首次未检查时触发异步检查（fire-and-forget）并返回 false（保守）。
  if (cached === null) {
    void runOpenCli(['doctor'], { execImpl: opts.execImpl, json: false }).then((r) => {
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

/** 异步确认可用性（fetch 路径用）：冷缓存时等待真实 doctor 检查——避免"首轮保守 false"误判 BLOCKED（Task 7 冒烟决策） */
export async function ensureDoctor(opts: { execImpl?: ExecImpl } = {}): Promise<boolean> {
  if (cached === null) {
    // doctor 不支持 -f json（实测报 unknown option）——raw 输出含 [OK] 标记
    const r = await runOpenCli(['doctor'], { execImpl: opts.execImpl, json: false });
    cached = r.stdout.includes('[OK]');
  }
  return cached;
}
