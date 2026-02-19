CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`key` text NOT NULL,
	`contentId` text NOT NULL,
	`mode` text,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`progress` real,
	`stage` text,
	`error` text,
	`metadata` text,
	`readAt` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_id_idx` ON `notifications` (`userId`);--> statement-breakpoint
CREATE INDEX `notifications_user_updated_at_idx` ON `notifications` (`userId`,`updatedAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_read_at_idx` ON `notifications` (`userId`,`readAt`);--> statement-breakpoint
CREATE INDEX `notifications_user_key_idx` ON `notifications` (`userId`,`key`);