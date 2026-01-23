CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
	`render_path` text,
	`song_duration_seconds` real DEFAULT 0 NOT NULL,
	`segment_duration_seconds` real DEFAULT 0 NOT NULL,
	`video_duration_seconds` real DEFAULT 0 NOT NULL,
	`fade_duration_seconds` real DEFAULT 0 NOT NULL,
	`intro_fade_seconds` real DEFAULT 0 NOT NULL,
	`outro_fade_seconds` real DEFAULT 0 NOT NULL,
	`audio_fade_in_seconds` real DEFAULT 0 NOT NULL,
	`audio_fade_out_seconds` real DEFAULT 0 NOT NULL,
	`audio_fade_in_offset_seconds` real DEFAULT 0 NOT NULL,
	`audio_fade_out_offset_seconds` real DEFAULT 0 NOT NULL,
	`overlap_ratio` real,
	`playback_rate` real DEFAULT 1 NOT NULL,
	`fps` integer DEFAULT 30 NOT NULL,
	`width` integer DEFAULT 1280 NOT NULL,
	`height` integer DEFAULT 720 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_items_status` ON `content_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_content_items_created_at` ON `content_items` (`created_at`);