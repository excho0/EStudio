CREATE TABLE "user_api_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"label" text NOT NULL,
	"tokenPrefix" text NOT NULL,
	"tokenHash" text NOT NULL,
	"permissions" jsonb NOT NULL,
	"resources" jsonb NOT NULL,
	"lastUsedAt" timestamp,
	"expiresAt" timestamp,
	"revokedAt" timestamp,
	"createdAt" timestamp NOT NULL,
	"updatedAt" timestamp NOT NULL,
	CONSTRAINT "user_api_keys_tokenPrefix_unique" UNIQUE("tokenPrefix")
);
--> statement-breakpoint
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_api_keys_user_id_idx" ON "user_api_keys" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "user_api_keys_prefix_idx" ON "user_api_keys" USING btree ("tokenPrefix");--> statement-breakpoint
CREATE INDEX "user_api_keys_revoked_at_idx" ON "user_api_keys" USING btree ("revokedAt");