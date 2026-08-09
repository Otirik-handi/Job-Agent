import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../index';
import { jobOpportunities } from '../schema';
import { nowIso } from './shared';

export type JobOpportunityRecord = {
  id: string; company: string; title: string; jdText: string; url: string | null;
  status: string; fitResultJson: string | null; channelsJson: string | null;
  createdAt: string; updatedAt: string;
};

export function createJobOpportunity(jdText: string): JobOpportunityRecord {
  const record: JobOpportunityRecord = {
    id: randomUUID(), company: '', title: '', jdText, url: null,
    status: 'saved', fitResultJson: null, channelsJson: null,
    createdAt: nowIso(), updatedAt: nowIso(),
  };
  db.insert(jobOpportunities).values(record).run();
  return record;
}

export function listJobOpportunities(status?: string): JobOpportunityRecord[] {
  const base = db.select().from(jobOpportunities);
  const rows = status ? base.where(eq(jobOpportunities.status, status)) : base;
  return rows.orderBy(desc(jobOpportunities.updatedAt)).all();
}

export function getJobOpportunity(id: string): JobOpportunityRecord | null {
  return db.select().from(jobOpportunities).where(eq(jobOpportunities.id, id)).get() ?? null;
}

export function updateJobMatch(id: string, input: { company: string; title: string; fitResultJson: string }): void {
  db.update(jobOpportunities)
    .set({ company: input.company, title: input.title, fitResultJson: input.fitResultJson, status: 'matched', updatedAt: nowIso() })
    .where(eq(jobOpportunities.id, id)).run();
}

export function updateJobChannels(id: string, channelsJson: string): void {
  db.update(jobOpportunities)
    .set({ channelsJson, updatedAt: nowIso() })
    .where(eq(jobOpportunities.id, id)).run();
}

export function updateJobApplication(id: string, status: 'applying' | 'applied' | 'skipped' | 'interview' | 'offer' | 'hired' | 'rejected'): void {
  db.update(jobOpportunities)
    .set({ status, updatedAt: nowIso() })
    .where(eq(jobOpportunities.id, id)).run();
}

export function deleteJobOpportunity(id: string): void {
  db.delete(jobOpportunities).where(eq(jobOpportunities.id, id)).run();
}
