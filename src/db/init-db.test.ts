import { describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { db, initDb } from './index';
import { createConversation, deleteConversation, getConversation } from './repositories/conversations';

describe('initDb 连接切换', () => {
  it(':memory: 切换成功，WAL/foreign_keys pragma 不抛错，经 db 可建表读写', () => {
    expect(() => initDb(':memory:')).not.toThrow();
    db.run(sql`CREATE TABLE smoke_test (id INTEGER PRIMARY KEY, v TEXT NOT NULL)`);
    db.run(sql`INSERT INTO smoke_test (v) VALUES ('a')`);
    const rows = db.all<{ v: string }>(sql`SELECT v FROM smoke_test`);
    expect(rows).toHaveLength(1);
    expect(rows[0].v).toBe('a');
  });

  it('恢复默认连接后 dev 库经 repository 仍可读写（数据自清理）', () => {
    initDb();
    const record = createConversation('init-db-smoke');
    expect(getConversation(record.id)?.title).toBe('init-db-smoke');
    deleteConversation(record.id);
    expect(getConversation(record.id)).toBeNull();
  });
});
