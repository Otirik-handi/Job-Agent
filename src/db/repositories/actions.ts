/** actions 审计表存取：关键动作的结构化记录（设计见批次 C 设计文档 §3）。
 * 与 status_history（状态机流转）互补：本表记"动作执行与成败"，详情溯源走 messages。 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { actions } from '../schema';
import { nowIso } from './shared';

export type ActionRecord = {
  id: string; conversationId: string; action: string; entityType: string; entityId: string; result: string; createdAt: string;
};

export function insertAction(args: {
  conversationId: string; action: string; entityType: string; entityId: string; result: string;
}): ActionRecord {
  const record: ActionRecord = { id: randomUUID(), ...args, createdAt: nowIso() };
  db.insert(actions).values(record).run();
  return record;
}

/** 按会话/动作过滤 + limit，createdAt 倒序（最新在前）；条件缺省即不过滤。
 * rowid 决胜：同毫秒写入时按插入序倒序，保证「最新在前」确定性（同 status-history）。 */
export function listActions(args: { conversationId?: string; action?: string; limit?: number } = {}): ActionRecord[] {
  const conds = [];
  if (args.conversationId) conds.push(eq(actions.conversationId, args.conversationId));
  if (args.action) conds.push(eq(actions.action, args.action));
  const order = [desc(actions.createdAt), desc(sql`rowid`)];
  const query = db.select().from(actions);
  const rows = conds.length > 0
    ? query.where(conds.length === 1 ? conds[0] : and(...conds)).orderBy(...order).limit(args.limit ?? 50).all()
    : query.orderBy(...order).limit(args.limit ?? 50).all();
  return rows;
}
