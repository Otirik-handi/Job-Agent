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

  it('51job detail 成功（真实字段形状）：数组解包 + APP下载字段修复 + security_id 剥离', async () => {
    const execImpl: ExecImpl = async () => ({
      stdout: JSON.stringify([
        { jobId: '123', title: 'APP下载', category: '前端工程师', company: 'XX科技', salary: '1.3-1.5万', city: '深圳', description: '要求本科', security_id: 'TOPSECRET' },
      ]),
      stderr: '', code: 0,
    });
    const p = makePlugin(execImpl);
    const out = await p.fetch('https://we.51job.com/jobs/123.html');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.title).toBe('前端工程师');
      expect(out.content).toContain('title: 前端工程师');
      expect(out.content).toContain('company: XX科技');
      expect(out.content).toContain('要求本科');
      expect(out.content).not.toContain('TOPSECRET');
      expect(out.citations).toEqual(['https://we.51job.com/jobs/123.html']);
    }
  });

  it('Boss detail 成功（真实字段形状）：name 字段作标题', async () => {
    const execImpl: ExecImpl = async () => ({
      stdout: JSON.stringify({ name: '前端工程师', company: 'XX科技', salary: '12-14K', description: 'React 岗位' }),
      stderr: '', code: 0,
    });
    const p = makePlugin(execImpl);
    const out = await p.fetch('https://www.zhipin.com/job_detail/abc.html');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.title).toBe('前端工程师');
      expect(out.content).toContain('name: 前端工程师');
      expect(out.content).toContain('company: XX科技');
    }
  });

  it('51job search 多元素列表：首条摘要 + 完整列表', async () => {
    const execImpl: ExecImpl = async () => ({
      stdout: JSON.stringify([{ title: 'A岗', company: '甲' }, { title: 'B岗', company: '乙' }]),
      stderr: '', code: 0,
    });
    const p = makePlugin(execImpl);
    const out = await p.fetch('https://we.51job.com/pc/search?keyword=前端');
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.content).toContain('title: A岗');
      expect(out.content).toContain('共 2 条');
      expect(out.content).toContain('B岗');
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
