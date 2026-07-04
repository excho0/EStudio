CREATE TABLE `user_api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`label` text NOT NULL,
	`tokenPrefix` text NOT NULL,
	`tokenHash` text NOT NULL,
	`permissions` text NOT NULL,
	`resources` text NOT NULL,
	`lastUsedAt` integer,
	`expiresAt` integer,
	`revokedAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_api_keys_tokenPrefix_unique` ON `user_api_keys` (`tokenPrefix`);--> statement-breakpoint
CREATE INDEX `user_api_keys_user_id_idx` ON `user_api_keys` (`userId`);--> statement-breakpoint
CREATE INDEX `user_api_keys_prefix_idx` ON `user_api_keys` (`tokenPrefix`);--> statement-breakpoint
CREATE INDEX `user_api_keys_revoked_at_idx` ON `user_api_keys` (`revokedAt`);