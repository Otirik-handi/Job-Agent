import { describe, expect, it, vi } from 'vitest';
import { runOpenCli } from './runner';
import { checkDoctor, refreshDoctor } from './doctor';

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

describe('checkDoctor（可用性检查：首次保守 false + 异步刷新）', () => {
  it('doctor 输出含 [OK] → 异步检查完成后缓存为 true', async () => {
    const execImpl = fakeExec('[OK] Daemon: running on port 19825\n[OK] Extension: connected');
    // 同步语义张力：execImpl 是 async，首次调用时检查未完成 → 保守返回 false
    expect(checkDoctor({ execImpl })).toBe(false);
    await vi.waitFor(() => expect(checkDoctor({ execImpl })).toBe(true));
  });
  it('doctor 输出含失败 → 复查后仍为 false（不误判可用）', async () => {
    const execImpl = fakeExec('[FAIL] Daemon: not running');
    refreshDoctor({ execImpl }); // 强制复查（清缓存并触发异步检查）
    await vi.waitFor(() => expect(checkDoctor({ execImpl })).toBe(false));
  });
});
