import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { resumes } from '../schema';
import { nowIso } from './conversations';

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
