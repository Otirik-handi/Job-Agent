CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`company` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`jd_text` text NOT NULL,
	`url` text,
	`status` text DEFAULT 'saved' NOT NULL,
	`fit_result_json` text,
	`channels_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`message_json` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `messages_conversation_id_idx` ON `messages` (`conversation_id`);--> statement-breakpoint
CREATE TABLE `resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_type` text NOT NULL,
	`source_text` text NOT NULL,
	`analysis_json` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tailored_resumes` (
	`id` text PRIMARY KEY NOT NULL,
	`resume_id` text NOT NULL,
	`job_opportunity_id` text NOT NULL,
	`content_markdown` text NOT NULL,
	`version` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`resume_id`) REFERENCES `resumes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_opportunity_id`) REFERENCES `job_opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tailored_resumes_resume_idx` ON `tailored_resumes` (`resume_id`);--> statement-breakpoint
CREATE INDEX `tailored_resumes_job_idx` ON `tailored_resumes` (`job_opportunity_id`);