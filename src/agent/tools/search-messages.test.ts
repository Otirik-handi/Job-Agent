import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { db, initDb } from '../../db';
import { conversations, messages } from '../../db/schema';
import { setEmbeddingOverride, clearEmbeddingOverride } from '../embedding';
import { searchMessagesTool } from './search-messages';

/** execute 返回类型含 ai v7 的 AsyncIterable 分支，取业务结果分支做类型收窄（对齐 tool-factory.test.ts 的断言方式） */
type SearchResult = Extract<Awaited<ReturnType<typeof searchMessagesTool.execute>>, { ok: boolean }>;

function ctx() {
  return { toolCallId: 'test', messages: [], context: { callStructured: vi.fn() as never, log: vi.fn() } };
}

beforeEach(() => {
  initDb(':memory:');
  migrate(db, { migrationsFolder: 'src/db/migrations' });
});

afterEach(() => {
  initDb();
  clearEmbeddingOverride();
});

describe('searchMessages（语义检索历史对话）', () => {
  it('query 嵌入 → 余弦排序 → 返回结果（含 score 与文本摘要）', async () => {
    setEmbeddingOverride(async () => [1, 0, 0]);
    const convId = 'conv-eval-1';
    db.insert(conversations).values({ id: convId, title: 't', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' }).run();
    db.insert(messages).values([
      { id: 'm1', conversationId: convId, role: 'user', messageJson: JSON.stringify({ id: 'm1', role: 'user', parts: [{ type: 'text', text: '我想去字节跳动' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
      { id: 'm2', conversationId: convId, role: 'user', messageJson: JSON.stringify({ id: 'm2', role: 'user', parts: [{ type: 'text', text: '今天天气不错' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([0, 1, 0]) },
    ]).run();

    const result = (await searchMessagesTool.execute({ query: '想去哪家公司', limit: 5 }, ctx())) as SearchResult;
    expect(result.ok).toBe(true);
    if (result.results) {
      expect(result.count).toBe(2);
      expect(result.results[0]).toMatchObject({ messageId: 'm1', role: 'user' });
      expect(result.results[0].score).toBeCloseTo(1, 4);
      expect(result.results[0].text).toContain('字节跳动');
    }
  });

  it('conversationId 限定会话', async () => {
    setEmbeddingOverride(async () => [1, 0, 0]);
    db.insert(conversations).values([
      { id: 'conv-a', title: 'a', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' },
      { id: 'conv-b', title: 'b', createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' },
    ]).run();
    db.insert(messages).values([
      { id: 'm3', conversationId: 'conv-a', role: 'user', messageJson: JSON.stringify({ id: 'm3', role: 'user', parts: [{ type: 'text', text: '甲' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
      { id: 'm4', conversationId: 'conv-b', role: 'user', messageJson: JSON.stringify({ id: 'm4', role: 'user', parts: [{ type: 'text', text: '乙' }] }), createdAt: '2026-08-12T00:00:00.000Z', embeddingJson: JSON.stringify([1, 0, 0]) },
    ]).run();
    const result = (await searchMessagesTool.execute({ query: 'x', conversationId: 'conv-a' }, ctx())) as SearchResult;
    if (result.results) {
      expect(result.count).toBe(1);
      expect(result.results[0].messageId).toBe('m3');
    }
  });

  it('未配置 embedding（override null）→ EMBEDDING_FAILED', async () => {
    setEmbeddingOverride(async () => null);
    const result = await searchMessagesTool.execute({ query: 'x' }, ctx());
    expect(result).toMatchObject({ ok: false, error: { code: 'EMBEDDING_FAILED' } });
  });
});
