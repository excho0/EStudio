ALTER TABLE `content_items` ADD `edge_rays_enabled` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `content_items` ADD `edge_rays_intensity` real DEFAULT 0.85 NOT NULL;--> statement-breakpoint
ALTER TABLE `content_items` ADD `edge_rays_vocal_balance` real DEFAULT 0.6 NOT NULL;