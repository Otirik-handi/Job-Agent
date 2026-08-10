import { eq } from 'drizzle-orm';
import { db } from '../index';
import { sessionState } from '../schema';
import { nowIso } from './shared';

export type SessionStateRecord = {
  conversationId: string; stateJson: string; updatedAt: string;
};

export function getSessionState(conversationId: string): SessionStateRecord | null {
  return db.select().from(sessionState).where(eq(sessionState.conversationId, conversationId)).get() ?? null;
}

export function setSessionState(conversationId: string, stateJson: string): void {
  db.insert(sessionState).values({ conversationId, stateJson, updatedAt: nowIso() })
    .onConflictDoUpdate({ target: sessionState.conversationId, set: { stateJson, updatedAt: nowIso() } })
    .run();
}

export function clearSessionState(conversationId: string): void {
  db.delete(sessionState).where(eq(sessionState.conversationId, conversationId)).run();
}
