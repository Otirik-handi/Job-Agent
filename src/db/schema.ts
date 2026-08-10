import { sqliteTable, text, integer, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  messageJson: text('message_json').notNull(),
  createdAt: text('created_at').notNull(),
}, (t) => [index('messages_conversation_id_idx').on(t.conversationId)]);

export const resumes = sqliteTable('resumes', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  sourceType: text('source_type').notNull(),
  sourceText: text('source_text').notNull(),
  analysisJson: text('analysis_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const jobOpportunities = sqliteTable('job_opportunities', {
  id: text('id').primaryKey(),
  company: text('company').notNull().default(''),
  title: text('title').notNull().default(''),
  jdText: text('jd_text').notNull(),
  url: text('url'),
  status: text('status').notNull().default('saved'),
  fitResultJson: text('fit_result_json'),
  channelsJson: text('channels_json'),
  interviewPrepJson: text('interview_prep_json'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const memoryBlocks = sqliteTable('memory_blocks', {
  label: text('label').primaryKey(),
  description: text('description').notNull(),
  value: text('value').notNull(),
  limit: integer('limit').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const sessionState = sqliteTable('session_state', {
  conversationId: text('conversation_id').primaryKey()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  stateJson: text('state_json').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const statusHistory = sqliteTable('status_history', {
  id: text('id').primaryKey(),
  jobOpportunityId: text('job_opportunity_id').notNull()
    .references(() => jobOpportunities.id, { onDelete: 'cascade' }),
  fromStatus: text('from_status').notNull(),
  toStatus: text('to_status').notNull(),
  createdAt: text('created_at').notNull(),
  supersededBy: text('superseded_by').references((): AnySQLiteColumn => statusHistory.id),
}, (t) => [
  index('status_history_job_opportunity_id_idx').on(t.jobOpportunityId),
]);

export const tailoredResumes = sqliteTable('tailored_resumes', {
  id: text('id').primaryKey(),
  resumeId: text('resume_id').notNull().references(() => resumes.id, { onDelete: 'cascade' }),
  jobOpportunityId: text('job_opportunity_id').notNull()
    .references(() => jobOpportunities.id, { onDelete: 'cascade' }),
  contentMarkdown: text('content_markdown').notNull(),
  version: integer('version').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, (t) => [
  index('tailored_resumes_resume_idx').on(t.resumeId),
  index('tailored_resumes_job_idx').on(t.jobOpportunityId),
]);
