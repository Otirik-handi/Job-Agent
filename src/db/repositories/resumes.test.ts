import { afterEach, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { db } from '../index';
import { resumes } from '../schema';
import { createResume, updateResumeName } from './resumes';

/** 测试数据统一挂 name 前缀，afterEach 按前缀清理，不触碰库中其他数据 */
const TEST_PREFIX = 'test-rename-';

afterEach(() => {
  db.delete(resumes).where(like(resumes.name, `${TEST_PREFIX}%`)).run();
});

describe('updateResumeName', () => {
  it('更新成功：返回新记录，id 不变、name 更新', () => {
    const created = createResume({ name: `${TEST_PREFIX}原名`, sourceType: 'text', sourceText: '测试内容' });
    const updated = updateResumeName(created.id, `${TEST_PREFIX}新名`);
    expect(updated).not.toBeNull();
    expect(updated!.id).toBe(created.id);
    expect(updated!.name).toBe(`${TEST_PREFIX}新名`);
    expect(updated!.sourceType).toBe('text');
  });

  it('资源不存在返回 null（不抛错）', () => {
    expect(updateResumeName('nonexistent-id', `${TEST_PREFIX}新名`)).toBeNull();
  });
});
