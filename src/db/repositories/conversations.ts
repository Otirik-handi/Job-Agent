import { randomUUID } from 'node:crypto';
import { desc, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { conversations } from '../schema';
import { nowIso } from './shared';

export type ConversationRecord = {
  id: string; title: string; createdAt: string; updatedAt: string;
  /** 会话级滚动摘要（无则 null；规范见 02-backend「会话摘要」） */
  summary: string | null;
};

export function createConversation(title: string): ConversationRecord {
  const record: ConversationRecord = { id: randomUUID(), title, createdAt: nowIso(), updatedAt: nowIso(), summary: null };
  db.insert(conversations).values(record).run();
  return record;
}

export function listConversations(): ConversationRecord[] {
  return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all();
}

export function getConversation(id: string): ConversationRecord | null {
  return db.select().from(conversations).where(eq(conversations.id, id)).get() ?? null;
}

/** 读取会话摘要；会话不存在或未生成摘要时返回 null（调用方无需区分两种空态） */
export function getConversationSummary(conversationId: string): string | null {
  const row = db.select({ summary: conversations.summary }).from(conversations)
    .where(eq(conversations.id, conversationId)).get();
  return row?.summary ?? null;
}

/** 写入会话摘要（覆盖式；会话不存在时静默无操作） */
export function setConversationSummary(conversationId: string, summary: string): void {
  db.update(conversations).set({ summary, updatedAt: nowIso() })
    .where(eq(conversations.id, conversationId)).run();
}

export function renameConversation(id: string, title: string): void {
  db.update(conversations).set({ title, updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
}

export function touchConversation(id: string): void {
  db.update(conversations).set({ updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
}

export function deleteConversation(id: string): void {
  // 会话删除：messages 由外键级联删除，messages_fts 行须同步清理（同事务避免孤儿行）
  db.transaction((tx) => {
    tx.run(sql`DELETE FROM messages_fts WHERE conversation_id = ${id}`);
    tx.delete(conversations).where(eq(conversations.id, id)).run();
  });
}
