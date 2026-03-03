CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updatedBy" text,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_token" (
	"token" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"payload" text,
	"createdAt" timestamp NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authenticator" (
	"credentialID" text NOT NULL,
	"userId" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"credentialPublicKey" text NOT NULL,
	"counter" integer NOT NULL,
	"credentialDeviceType" text NOT NULL,
	"credentialBackedUp" boolean NOT NULL,
	"transports" text,
	CONSTRAINT "authenticator_userId_credentialID_pk" PRIMARY KEY("userId","credentialID"),
	CONSTRAINT "authenticator_credentialID_unique" UNIQUE("credentialID")
);
--> statement-breakpoint
CREATE TABLE "content_items" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"song_duration_seconds" real DEFAULT 0 NOT NULL,
	"color_palette" text,
	"palette_mode" text DEFAULT 'auto' NOT NULL,
	"mode" text DEFAULT 'video_loop' NOT NULL,
	"settings" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"key" text NOT NULL,
	"contentId" text NOT NULL,
	"mode" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"progress" real,
	"stage" text,
	"error" text,
	"metadata" jsonb,
	"readAt" timestamp,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publishes" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"contentId" text NOT NULL,
	"renderId" text NOT NULL,
	"provider" text NOT NULL,
	"connectionId" text NOT NULL,
	"providerAccountId" text,
	"providerAssetId" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata" text,
	"error" text,
	"publishAttempts" integer DEFAULT 0 NOT NULL,
	"deletedAt" timestamp,
	"publishedAt" timestamp,
	"lastSyncedAt" timestamp,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_updatedBy_user_id_fk" FOREIGN KEY ("updatedBy") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_token" ADD CONSTRAINT "app_token_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authenticator" ADD CONSTRAINT "authenticator_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishes" ADD CONSTRAINT "publishes_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publishes" ADD CONSTRAINT "publishes_contentId_content_items_id_fk" FOREIGN KEY ("contentId") REFERENCES "public"."content_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_settings_updated_at_idx" ON "app_settings" USING btree ("updatedAt");--> statement-breakpoint
CREATE INDEX "app_settings_updated_by_idx" ON "app_settings" USING btree ("updatedBy");--> statement-breakpoint
CREATE INDEX "app_token_user_id_idx" ON "app_token" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "app_token_type_idx" ON "app_token" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_content_items_user_id" ON "content_items" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "idx_content_items_user_status" ON "content_items" USING btree ("userId","status");--> statement-breakpoint
CREATE INDEX "idx_content_items_user_created_at" ON "content_items" USING btree ("userId","created_at");--> statement-breakpoint
CREATE INDEX "idx_content_items_status" ON "content_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_content_items_created_at" ON "content_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_user_id_idx" ON "notifications" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "notifications_user_updated_at_idx" ON "notifications" USING btree ("userId","updatedAt");--> statement-breakpoint
CREATE INDEX "notifications_user_read_at_idx" ON "notifications" USING btree ("userId","readAt");--> statement-breakpoint
CREATE INDEX "notifications_user_key_idx" ON "notifications" USING btree ("userId","key");--> statement-breakpoint
CREATE INDEX "publishes_user_id_idx" ON "publishes" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "publishes_content_id_idx" ON "publishes" USING btree ("contentId");--> statement-breakpoint
CREATE INDEX "publishes_connection_id_idx" ON "publishes" USING btree ("connectionId");--> statement-breakpoint
CREATE INDEX "publishes_provider_account_idx" ON "publishes" USING btree ("provider","providerAccountId");--> statement-breakpoint
CREATE INDEX "publishes_provider_asset_idx" ON "publishes" USING btree ("provider","providerAssetId");--> statement-breakpoint
CREATE INDEX "publishes_status_idx" ON "publishes" USING btree ("status");