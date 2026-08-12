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
