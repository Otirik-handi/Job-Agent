CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`conversation_id` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `actions_conversation_idx` ON `actions` (`conversation_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `actions_action_idx` ON `actions` (`action`,`created_at`);