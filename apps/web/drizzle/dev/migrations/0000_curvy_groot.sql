CREATE TABLE `account` (
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	PRIMARY KEY(`provider`, `providerAccountId`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `app_token` (
	`token` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`createdAt` integer NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `app_token_user_id_idx` ON `app_token` (`userId`);--> statement-breakpoint
CREATE INDEX `app_token_type_idx` ON `app_token` (`type`);--> statement-breakpoint
CREATE TABLE `authenticator` (
	`credentialID` text NOT NULL,
	`userId` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`credentialPublicKey` text NOT NULL,
	`counter` integer NOT NULL,
	`credentialDeviceType` text NOT NULL,
	`credentialBackedUp` integer NOT NULL,
	`transports` text,
	PRIMARY KEY(`userId`, `credentialID`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authenticator_credentialID_unique` ON `authenticator` (`credentialID`);--> statement-breakpoint
CREATE TABLE `content_items` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'uploaded' NOT NULL,
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
	`scale_percent` real DEFAULT 100 NOT NULL,
	`visualization_enabled` integer DEFAULT 1 NOT NULL,
	`visualization_bars` integer DEFAULT 128 NOT NULL,
	`edge_rays_enabled` integer DEFAULT 1 NOT NULL,
	`edge_rays_intensity` real DEFAULT 0.85 NOT NULL,
	`edge_rays_vocal_balance` real DEFAULT 0.6 NOT NULL,
	`color_palette` text,
	`palette_mode` text DEFAULT 'auto' NOT NULL,
	`overlap_ratio` real,
	`playback_rate` real DEFAULT 1 NOT NULL,
	`fps` integer DEFAULT 30 NOT NULL,
	`width` integer DEFAULT 1280 NOT NULL,
	`height` integer DEFAULT 720 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_content_items_user_id` ON `content_items` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_content_items_user_status` ON `content_items` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_content_items_user_created_at` ON `content_items` (`userId`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_content_items_status` ON `content_items` (`status`);--> statement-breakpoint
CREATE INDEX `idx_content_items_created_at` ON `content_items` (`created_at`);--> statement-breakpoint
CREATE TABLE `publishes` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`contentId` text NOT NULL,
	`renderId` text NOT NULL,
	`provider` text NOT NULL,
	`connectionId` text NOT NULL,
	`providerAssetId` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`metadata` text,
	`error` text,
	`publishAttempts` integer DEFAULT 0 NOT NULL,
	`publishedAt` integer,
	`lastSyncedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contentId`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `publishes_user_id_idx` ON `publishes` (`userId`);--> statement-breakpoint
CREATE INDEX `publishes_content_id_idx` ON `publishes` (`contentId`);--> statement-breakpoint
CREATE INDEX `publishes_connection_id_idx` ON `publishes` (`connectionId`);--> statement-breakpoint
CREATE INDEX `publishes_provider_asset_idx` ON `publishes` (`provider`,`providerAssetId`);--> statement-breakpoint
CREATE INDEX `publishes_status_idx` ON `publishes` (`status`);--> statement-breakpoint
CREATE TABLE `session` (
	`sessionToken` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`email` text,
	`emailVerified` integer,
	`image` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verificationToken` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
