import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '../index';
import { statusHistory } from '../schema';
import { nowIso } from './shared';

export type StatusHistoryRecord = {
  id: string; jobOpportunityId: string; fromStatus: string; toStatus: string;
  createdAt: string; supersededBy: string | null;
};

/** 记录一次状态转移：只追加不覆盖；写入后把该岗位最近一条未作废记录置为被本记录覆盖 */
export function recordStatusTransition(jobOpportunityId: string, fromStatus: string, toStatus: string): StatusHistoryRecord {
  const record: StatusHistoryRecord = {
    id: randomUUID(), jobOpportunityId, fromStatus, toStatus, createdAt: nowIso(), supersededBy: null,
  };
  // 查前一条 → 插入新记录 → 覆盖前一条，三语句包进事务，避免并发下出现两条「未作废」记录（链断裂）。
  // 顺序约束：superseded_by 外键指向本表 id，对前一条的 UPDATE 必须在新记录落库之后。
  db.transaction((tx) => {
    const previous = tx.select().from(statusHistory)
      .where(and(eq(statusHistory.jobOpportunityId, jobOpportunityId), isNull(statusHistory.supersededBy)))
      .orderBy(desc(statusHistory.createdAt), desc(sql`rowid`))
      .get();
    tx.insert(statusHistory).values(record).run();
    if (previous) {
      tx.update(statusHistory).set({ supersededBy: record.id }).where(eq(statusHistory.id, previous.id)).run();
    }
  });
  return record;
}

export function listStatusHistory(jobOpportunityId: string): StatusHistoryRecord[] {
  return db.select().from(statusHistory)
    .where(eq(statusHistory.jobOpportunityId, jobOpportunityId))
    .orderBy(asc(statusHistory.createdAt), asc(sql`rowid`))
    .all();
}
