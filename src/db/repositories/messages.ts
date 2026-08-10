import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { messages } from '../schema';
import { nowIso } from './shared';

export type MessageRecord = {
  id: string; conversationId: string; role: string; messageJson: string; createdAt: string;
};

export function insertMessage(conversationId: string, role: string, messageJson: string): MessageRecord {
  const record: MessageRecord = { id: randomUUID(), conversationId, role, messageJson, createdAt: nowIso() };
  // 事务内同步写 messages_fts（messageJson 为索引内容，message_id/conversation_id 供过滤与生命周期同步）
  db.transaction((tx) => {
    tx.insert(messages).values(record).run();
    tx.run(sql`
      INSERT INTO messages_fts (message_json, message_id, conversation_id)
      VALUES (${record.messageJson}, ${record.id}, ${record.conversationId})
    `);
  });
  return record;
}

export function listMessages(conversationId: string): MessageRecord[] {
  return db.select().from(messages).where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt)).all();
}

export function deleteMessagesByConversation(conversationId: string): void {
  db.transaction((tx) => {
    tx.delete(messages).where(eq(messages.conversationId, conversationId)).run();
    tx.run(sql`DELETE FROM messages_fts WHERE conversation_id = ${conversationId}`);
  });
}
