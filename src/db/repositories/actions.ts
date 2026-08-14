/** actions 审计表存取：关键动作的结构化记录（设计见批次 C 设计文档 §3）。
 * 与 status_history（状态机流转）互补：本表记"动作执行与成败"，详情溯源走 messages。
 * detailsJson 列（2026-08-14 新增，吸收 refine-06 投递-版本关联）：动作关联明细，
 * 如 apply_job 携带 tailoredResumeId/tailoredResumeVersion（投递时所用专属简历版本）。 */
import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../index';
import { actions } from '../schema';
import { nowIso } from './shared';

export type ActionRecord = {
  id: string; conversationId: string; action: string; entityType: string; entityId: string; result: string; createdAt: string;
  detailsJson: string | null;
};

export function insertAction(args: {
  conversationId: string; action: string; entityType: string; entityId: string; result: string;
  detailsJson?: string | null;
}): ActionRecord {
  const record: ActionRecord = {
    id: randomUUID(),
    conversationId: args.conversationId,
    action: args.action,
    entityType: args.entityType,
    entityId: args.entityId,
    result: args.result,
    detailsJson: args.detailsJson ?? null,
    createdAt: nowIso(),
  };
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

export type ApplyActionDetails = {
  tailoredResumeId: string;
  tailoredResumeVersion: number;
};

/** 解析某条动作记录的 details_json（宽容解析，非法/缺失返回 null） */
export function parseActionDetails(json: string | null): ApplyActionDetails | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json) as ApplyActionDetails;
    return typeof parsed?.tailoredResumeId === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

/** 最近一次成功 apply_job 的关联明细（"我投 X 用的哪个版本"查询路径；无记录返回 null） */
export function getLatestApplyActionDetails(jobOpportunityId: string): ApplyActionDetails | null {
  const row = db
    .select({ detailsJson: actions.detailsJson })
    .from(actions)
    .where(and(
      eq(actions.action, 'apply_job'),
      eq(actions.entityType, 'job_opportunity'),
      eq(actions.entityId, jobOpportunityId),
      eq(actions.result, 'ok'),
    ))
    .orderBy(desc(actions.createdAt), desc(sql`rowid`))
    .limit(1)
    .get();
  return row ? parseActionDetails(row.detailsJson) : null;
}
