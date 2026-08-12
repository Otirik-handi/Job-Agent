CREATE TABLE `fetch_cache` (
	`url` text PRIMARY KEY NOT NULL,
	`markdown` text NOT NULL,
	`source` text NOT NULL,
	`fetched_at` text NOT NULL,
	`ttl_sec` integer DEFAULT 86400 NOT NULL
);
