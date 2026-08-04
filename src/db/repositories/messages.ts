import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { db } from '../index';
import { messages } from '../schema';
import { nowIso } from './conversations';

export type MessageRecord = {
  id: string; conversationId: string; role: string; messageJson: string; createdAt: string;
};

export function insertMessage(conversationId: string, role: string, messageJson: string): MessageRecord {
  const record: MessageRecord = { id: randomUUID(), conversationId, role, messageJson, createdAt: nowIso() };
  db.insert(messages).values(record).run();
  return record;
}

export function listMessages(conversationId: string): MessageRecord[] {
  return db.select().from(messages).where(eq(messages.conversationId, conversationId))
    .orderBy(asc(messages.createdAt)).all();
}

export function deleteMessagesByConversation(conversationId: string): void {
  db.delete(messages).where(eq(messages.conversationId, conversationId)).run();
}
