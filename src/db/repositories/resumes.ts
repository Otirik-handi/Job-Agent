import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { resumes } from '../schema';
import { nowIso } from './shared';

export type ResumeRecord = {
  id: string; name: string; sourceType: string; sourceText: string;
  analysisJson: string | null; createdAt: string; updatedAt: string;
};

export function createResume(input: { name: string; sourceType: string; sourceText: string }): ResumeRecord {
  const record: ResumeRecord = {
    id: randomUUID(), name: input.name, sourceType: input.sourceType,
    sourceText: input.sourceText, analysisJson: null, createdAt: nowIso(), updatedAt: nowIso(),
  };
  db.insert(resumes).values(record).run();
  return record;
}

export function listResumes(): ResumeRecord[] {
  return db.select().from(resumes).orderBy(desc(resumes.updatedAt)).all();
}

export function getResume(id: string): ResumeRecord | null {
  return db.select().from(resumes).where(eq(resumes.id, id)).get() ?? null;
}

export function updateResumeAnalysis(id: string, analysisJson: string): void {
  db.update(resumes).set({ analysisJson, updatedAt: nowIso() }).where(eq(resumes.id, id)).run();
}

export function deleteResume(id: string): void {
  db.delete(resumes).where(eq(resumes.id, id)).run();
}

/** 重命名简历：未命中返回 null（供路由 404 判断），成功返回更新后的完整记录 */
export function updateResumeName(id: string, name: string): ResumeRecord | null {
  const result = db.update(resumes).set({ name, updatedAt: nowIso() }).where(eq(resumes.id, id)).run();
  return result.changes > 0 ? getResume(id) : null;
}
