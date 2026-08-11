CREATE TABLE `lessons` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`source_task_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lessons_category_idx` ON `lessons` (`category`);
--> statement-breakpoint
-- lessons_fts：FTS5 全文检索虚拟表（drizzle-orm 未导出 sqlite 虚拟表支持，手写 SQL；应用层同步写入/删除）
-- content 为可检索内容，id/category 为 UNINDEXED 存储列（供生命周期同步与过滤）
CREATE VIRTUAL TABLE `lessons_fts` USING fts5(
  `content`,
  `id` UNINDEXED,
  `category` UNINDEXED,
  tokenize = 'trigram'
);