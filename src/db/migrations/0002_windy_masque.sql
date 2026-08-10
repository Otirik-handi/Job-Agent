CREATE TABLE `memory_blocks` (
	`label` text PRIMARY KEY NOT NULL,
	`description` text NOT NULL,
	`value` text NOT NULL,
	`limit` integer NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session_state` (
	`conversation_id` text PRIMARY KEY NOT NULL,
	`state_json` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`job_opportunity_id` text NOT NULL,
	`from_status` text NOT NULL,
	`to_status` text NOT NULL,
	`created_at` text NOT NULL,
	`superseded_by` text,
	FOREIGN KEY (`job_opportunity_id`) REFERENCES `job_opportunities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`superseded_by`) REFERENCES `status_history`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `status_history_job_opportunity_id_idx` ON `status_history` (`job_opportunity_id`);
--> statement-breakpoint
-- FTS5 全文检索虚拟表（drizzle-orm 未导出 sqlite 虚拟表支持，手写 SQL；应用层同步写入/删除）
CREATE VIRTUAL TABLE `messages_fts` USING fts5(
  `message_json`,
  `message_id` UNINDEXED,
  `conversation_id` UNINDEXED,
  tokenize = 'trigram'
);