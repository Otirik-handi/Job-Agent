import { afterEach, describe, expect, it } from 'vitest';
import { like } from 'drizzle-orm';
import { db } from '../index';
import { conversations } from '../schema';
import { createConversation, getConversationSummary, setConversationSummary } from './conversations';

/** 测试数据统一挂 title 前缀，afterEach 按前缀清理，不触碰库中其他数据 */
const TEST_PREFIX = 'test-summary-';

afterEach(() => {
  db.delete(conversations).where(like(conversations.title, `${TEST_PREFIX}%`)).run();
});

describe('getConversationSummary / setConversationSummary', () => {
  it('新会话未生成摘要时返回 null', () => {
    const conv = createConversation(`${TEST_PREFIX}new`);
    expect(getConversationSummary(conv.id)).toBeNull();
    expect(conv.summary).toBeNull();
  });

  it('set 后可读回（写入-读取往返）', () => {
    const conv = createConversation(`${TEST_PREFIX}roundtrip`);
    setConversationSummary(conv.id, '用户偏好：偏向后端岗位');
    expect(getConversationSummary(conv.id)).toBe('用户偏好：偏向后端岗位');
  });

  it('重复 set 覆盖更新', () => {
    const conv = createConversation(`${TEST_PREFIX}overwrite`);
    setConversationSummary(conv.id, '第一版摘要');
    setConversationSummary(conv.id, '第二版摘要');
    expect(getConversationSummary(conv.id)).toBe('第二版摘要');
  });

  it('set 不存在的会话静默无操作（不抛错），get 返回 null', () => {
    expect(() => setConversationSummary('no-such-conversation-id', '摘要')).not.toThrow();
    expect(getConversationSummary('no-such-conversation-id')).toBeNull();
  });
});
