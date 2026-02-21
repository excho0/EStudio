PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_publishes` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`contentId` text NOT NULL,
	`renderId` text NOT NULL,
	`provider` text NOT NULL,
	`connectionId` text NOT NULL,
	`providerAccountId` text NOT NULL,
	`providerAssetId` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`metadata` text,
	`error` text,
	`publishAttempts` integer DEFAULT 0 NOT NULL,
	`deletedAt` integer,
	`publishedAt` integer,
	`lastSyncedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`contentId`) REFERENCES `content_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_publishes`("id", "userId", "contentId", "renderId", "provider", "connectionId", "providerAccountId", "providerAssetId", "status", "metadata", "error", "publishAttempts", "deletedAt", "publishedAt", "lastSyncedAt", "createdAt", "updatedAt") SELECT "id", "userId", "contentId", "renderId", "provider", "connectionId", "providerAccountId", "providerAssetId", "status", "metadata", "error", "publishAttempts", "deletedAt", "publishedAt", "lastSyncedAt", "createdAt", "updatedAt" FROM `publishes`;--> statement-breakpoint
DROP TABLE `publishes`;--> statement-breakpoint
ALTER TABLE `__new_publishes` RENAME TO `publishes`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `publishes_user_id_idx` ON `publishes` (`userId`);--> statement-breakpoint
CREATE INDEX `publishes_content_id_idx` ON `publishes` (`contentId`);--> statement-breakpoint
CREATE INDEX `publishes_connection_id_idx` ON `publishes` (`connectionId`);--> statement-breakpoint
CREATE INDEX `publishes_provider_account_idx` ON `publishes` (`provider`,`providerAccountId`);--> statement-breakpoint
CREATE INDEX `publishes_provider_asset_idx` ON `publishes` (`provider`,`providerAssetId`);--> statement-breakpoint
CREATE INDEX `publishes_status_idx` ON `publishes` (`status`);