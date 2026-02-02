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
CREATE INDEX `publishes_status_idx` ON `publishes` (`status`);