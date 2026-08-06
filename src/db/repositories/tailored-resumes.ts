import { randomUUID } from 'node:crypto';
import { and, desc, eq, max } from 'drizzle-orm';
import { db } from '../index';
import { tailoredResumes } from '../schema';
import { nowIso } from './conversations';

export type TailoredResumeRecord = {
  id: string; resumeId: string; jobOpportunityId: string;
  contentMarkdown: string; version: number; createdAt: string; updatedAt: string;
};

/** 创建专属简历版本：version 自动 = 同 resume+job 组合 max(version)+1（无历史则为 1） */
export function createTailoredResume(input: { resumeId: string; jobOpportunityId: string; contentMarkdown: string }): TailoredResumeRecord {
  const row = db
    .select({ v: max(tailoredResumes.version) })
    .from(tailoredResumes)
    .where(and(
      eq(tailoredResumes.resumeId, input.resumeId),
      eq(tailoredResumes.jobOpportunityId, input.jobOpportunityId),
    ))
    .get();
  const record: TailoredResumeRecord = {
    id: randomUUID(),
    resumeId: input.resumeId,
    jobOpportunityId: input.jobOpportunityId,
    contentMarkdown: input.contentMarkdown,
    version: (row?.v ?? 0) + 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.insert(tailoredResumes).values(record).run();
  return record;
}

export function listTailoredResumes(filter: { resumeId?: string; jobOpportunityId?: string } = {}): TailoredResumeRecord[] {
  const conditions = [];
  if (filter.resumeId) conditions.push(eq(tailoredResumes.resumeId, filter.resumeId));
  if (filter.jobOpportunityId) conditions.push(eq(tailoredResumes.jobOpportunityId, filter.jobOpportunityId));
  const base = db.select().from(tailoredResumes);
  const rows = conditions.length > 0 ? base.where(and(...conditions)) : base;
  return rows.orderBy(desc(tailoredResumes.version)).all();
}

export function getTailoredResume(id: string): TailoredResumeRecord | null {
  return db.select().from(tailoredResumes).where(eq(tailoredResumes.id, id)).get() ?? null;
}

export function deleteTailoredResume(id: string): void {
  db.delete(tailoredResumes).where(eq(tailoredResumes.id, id)).run();
}
