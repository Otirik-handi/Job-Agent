import { sqliteTable, text, integer, index, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  // 会话级滚动摘要：首次达轮数上限截断时由 LLM 生成一次（规范见 02-backend「会话摘要」）；空 = 未生成
  summary: text('summary'),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  messageJson: text('message_json').notNull(),
  createdAt: text('created_at').notNull(),
  // 语义检索向量（JSON 数组，如 [0.1, -0.2, ...]）；null = 未嵌入（存量消息或嵌入失败）
  embeddingJson: text('embedding_json'),
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

export const lessons = sqliteTable('lessons', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  category: text('category').notNull(),
  sourceTaskId: text('source_task_id'),
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('lessons_category_idx').on(t.category),
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

// 关键动作（applyJob/recordStatus/tailoredResume 等）的结构化审计记录；详情溯源走 messages
export const actions = sqliteTable('actions', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),          // apply_job / record_status / tailored_resume / import_resume / import_job / plan_create / plan_update
  entityType: text('entity_type').notNull(), // resume / job_opportunity / tailored_resume / plan
  entityId: text('entity_id').notNull(),     // 对象 id（无对象记空串）
  result: text('result').notNull(),          // ok | 结构化错误码（如 JOB_MATCH_REQUIRED）
  createdAt: text('created_at').notNull(),
}, (t) => [
  index('actions_conversation_idx').on(t.conversationId, t.createdAt),
  index('actions_action_idx').on(t.action, t.createdAt),
]);
