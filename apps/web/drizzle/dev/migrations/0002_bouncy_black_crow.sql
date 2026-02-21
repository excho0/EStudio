ALTER TABLE `publishes` ADD `providerAccountId` text;--> statement-breakpoint
CREATE INDEX `publishes_provider_account_idx` ON `publishes` (`provider`,`providerAccountId`);
