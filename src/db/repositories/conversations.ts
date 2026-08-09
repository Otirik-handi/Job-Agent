import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { conversations } from '../schema';
import { nowIso } from './shared';

export type ConversationRecord = {
  id: string; title: string; createdAt: string; updatedAt: string;
};

export function createConversation(title: string): ConversationRecord {
  const record: ConversationRecord = { id: randomUUID(), title, createdAt: nowIso(), updatedAt: nowIso() };
  db.insert(conversations).values(record).run();
  return record;
}

export function listConversations(): ConversationRecord[] {
  return db.select().from(conversations).orderBy(desc(conversations.updatedAt)).all();
}

export function getConversation(id: string): ConversationRecord | null {
  return db.select().from(conversations).where(eq(conversations.id, id)).get() ?? null;
}

export function renameConversation(id: string, title: string): void {
  db.update(conversations).set({ title, updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
}

export function touchConversation(id: string): void {
  db.update(conversations).set({ updatedAt: nowIso() }).where(eq(conversations.id, id)).run();
}

export function deleteConversation(id: string): void {
  db.delete(conversations).where(eq(conversations.id, id)).run();
}
