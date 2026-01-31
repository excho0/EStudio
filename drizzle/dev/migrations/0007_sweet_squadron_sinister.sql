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
CREATE INDEX `app_token_type_idx` ON `app_token` (`type`);