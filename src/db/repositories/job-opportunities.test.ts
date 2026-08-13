import { afterEach, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { db } from '../index';
import { jobOpportunities } from '../schema';
import { createJobOpportunity, updateJobTitle } from './job-opportunities';

/** 测试数据统一挂 jdText 前缀，afterEach 按前缀清理，不触碰库中其他数据 */
const TEST_PREFIX = 'test-rename-';

afterEach(() => {
  db.delete(jobOpportunities).where(like(jobOpportunities.jdText, `${TEST_PREFIX}%`)).run();
});

describe('updateJobTitle', () => {
  it('更新成功：返回新记录，title 更新、company 保持不变', () => {
    const created = createJobOpportunity(`${TEST_PREFIX}测试 JD`);
    const updated = updateJobTitle(created.id, '前端工程师');
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.title).toBe('前端工程师');
    expect(updated!.company).toBe('');
  });

  it('资源不存在返回 null（不抛错）', () => {
    expect(updateJobTitle('nonexistent-id', '前端工程师')).toBeNull();
  });
});
