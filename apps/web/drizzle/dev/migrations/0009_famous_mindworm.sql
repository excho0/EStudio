CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`endpoint` text NOT NULL,
	`expirationTime` integer,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`userAgent` text,
	`lastSeenAt` integer NOT NULL,
	`disabledAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_id_idx` ON `push_subscriptions` (`userId`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_updated_at_idx` ON `push_subscriptions` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_endpoint_idx` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`userId` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `user_preferences_updated_at_idx` ON `user_preferences` (`updatedAt`);