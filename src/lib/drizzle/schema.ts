import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import {
  index as pgIndex,
  boolean as pgBoolean,
  integer as pgInteger,
  pgTable,
  primaryKey as pgPrimaryKey,
  text as pgText,
  timestamp as pgTimestamp,
  real as pgReal,
} from "drizzle-orm/pg-core";

export const users = sqliteTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
});

export const accounts = sqliteTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = sqliteTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (verificationToken) => [
    primaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

export const authenticators = sqliteTable(
  "authenticator",
  {
    credentialID: text("credentialID").notNull().unique(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerAccountId: text("providerAccountId").notNull(),
    credentialPublicKey: text("credentialPublicKey").notNull(),
    counter: integer("counter").notNull(),
    credentialDeviceType: text("credentialDeviceType").notNull(),
    credentialBackedUp: integer("credentialBackedUp", { mode: "boolean" }).notNull(),
    transports: text("transports"),
  },
  (authenticator) => [
    primaryKey({
      columns: [authenticator.userId, authenticator.credentialID],
    }),
  ]
);

export const appTokens = sqliteTable(
  "app_token",
  {
    token: text("token").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: text("payload"),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
  },
  (token) => [
    index("app_token_user_id_idx").on(token.userId),
    index("app_token_type_idx").on(token.type),
  ]
);

export const contentItems = sqliteTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    status: text("status").notNull().default("uploaded"),
    // asset paths derived from content id
    songDurationSeconds: real("song_duration_seconds").notNull().default(0),
    segmentDurationSeconds: real("segment_duration_seconds").notNull().default(0),
    videoDurationSeconds: real("video_duration_seconds").notNull().default(0),
    fadeDurationSeconds: real("fade_duration_seconds").notNull().default(0),
    introFadeSeconds: real("intro_fade_seconds").notNull().default(0),
    outroFadeSeconds: real("outro_fade_seconds").notNull().default(0),
    audioFadeInSeconds: real("audio_fade_in_seconds").notNull().default(0),
    audioFadeOutSeconds: real("audio_fade_out_seconds").notNull().default(0),
    audioFadeInOffsetSeconds: real("audio_fade_in_offset_seconds")
      .notNull()
      .default(0),
    audioFadeOutOffsetSeconds: real("audio_fade_out_offset_seconds")
      .notNull()
      .default(0),
    scalePercent: real("scale_percent").notNull().default(100),
    visualizationEnabled: integer("visualization_enabled").notNull().default(1),
    visualizationBars: integer("visualization_bars").notNull().default(128),
    edgeRaysEnabled: integer("edge_rays_enabled").notNull().default(1),
    edgeRaysIntensity: real("edge_rays_intensity").notNull().default(0.85),
    edgeRaysVocalBalance: real("edge_rays_vocal_balance").notNull().default(0.6),
    colorPalette: text("color_palette"),
    paletteMode: text("palette_mode").notNull().default("auto"),
    overlapRatio: real("overlap_ratio"),
    playbackRate: real("playback_rate").notNull().default(1),
    fps: integer("fps").notNull().default(30),
    width: integer("width").notNull().default(1280),
    height: integer("height").notNull().default(720),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_content_items_user_id").on(table.userId),
    index("idx_content_items_user_status").on(table.userId, table.status),
    index("idx_content_items_user_created_at").on(table.userId, table.createdAt),
    index("idx_content_items_status").on(table.status),
    index("idx_content_items_created_at").on(table.createdAt),
  ]
);

export const publishes = sqliteTable(
  "publishes",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contentId: text("contentId")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    renderId: text("renderId").notNull(),
    provider: text("provider").notNull(),
    connectionId: text("connectionId").notNull(),
    providerAssetId: text("providerAssetId").notNull(),
    status: text("status").notNull().default("draft"),
    metadata: text("metadata"),
    error: text("error"),
    publishAttempts: integer("publishAttempts", { mode: "number" })
      .notNull()
      .default(0),
    deletedAt: integer("deletedAt", { mode: "timestamp_ms" }),
    publishedAt: integer("publishedAt", { mode: "timestamp_ms" }),
    lastSyncedAt: integer("lastSyncedAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("publishes_user_id_idx").on(table.userId),
    index("publishes_content_id_idx").on(table.contentId),
    index("publishes_connection_id_idx").on(table.connectionId),
    index("publishes_provider_asset_idx").on(table.provider, table.providerAssetId),
    index("publishes_status_idx").on(table.status),
  ]
);

export const contentItemsPg = pgTable(
  "content_items",
  {
    id: pgText("id").primaryKey(),
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    title: pgText("title").notNull(),
    status: pgText("status").notNull().default("uploaded"),
    // asset paths derived from content id
    songDurationSeconds: pgReal("song_duration_seconds").notNull().default(0),
    segmentDurationSeconds: pgReal("segment_duration_seconds").notNull().default(0),
    videoDurationSeconds: pgReal("video_duration_seconds").notNull().default(0),
    fadeDurationSeconds: pgReal("fade_duration_seconds").notNull().default(0),
    introFadeSeconds: pgReal("intro_fade_seconds").notNull().default(0),
    outroFadeSeconds: pgReal("outro_fade_seconds").notNull().default(0),
    audioFadeInSeconds: pgReal("audio_fade_in_seconds").notNull().default(0),
    audioFadeOutSeconds: pgReal("audio_fade_out_seconds").notNull().default(0),
    audioFadeInOffsetSeconds: pgReal("audio_fade_in_offset_seconds")
      .notNull()
      .default(0),
    audioFadeOutOffsetSeconds: pgReal("audio_fade_out_offset_seconds")
      .notNull()
      .default(0),
    scalePercent: pgReal("scale_percent").notNull().default(100),
    visualizationEnabled: pgBoolean("visualization_enabled").notNull().default(true),
    visualizationBars: pgInteger("visualization_bars").notNull().default(128),
    edgeRaysEnabled: pgBoolean("edge_rays_enabled").notNull().default(true),
    edgeRaysIntensity: pgReal("edge_rays_intensity").notNull().default(0.85),
    edgeRaysVocalBalance: pgReal("edge_rays_vocal_balance").notNull().default(0.6),
    colorPalette: pgText("color_palette"),
    paletteMode: pgText("palette_mode").notNull().default("auto"),
    overlapRatio: pgReal("overlap_ratio"),
    playbackRate: pgReal("playback_rate").notNull().default(1),
    fps: pgInteger("fps").notNull().default(30),
    width: pgInteger("width").notNull().default(1280),
    height: pgInteger("height").notNull().default(720),
    createdAt: pgTimestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: pgTimestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    pgIndex("idx_content_items_user_id").on(table.userId),
    pgIndex("idx_content_items_user_status").on(table.userId, table.status),
    pgIndex("idx_content_items_user_created_at").on(table.userId, table.createdAt),
    pgIndex("idx_content_items_status").on(table.status),
    pgIndex("idx_content_items_created_at").on(table.createdAt),
  ]
);

export const publishesPg = pgTable(
  "publishes",
  {
    id: pgText("id").primaryKey(),
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    contentId: pgText("contentId")
      .notNull()
      .references(() => contentItemsPg.id, { onDelete: "cascade" }),
    renderId: pgText("renderId").notNull(),
    provider: pgText("provider").notNull(),
    connectionId: pgText("connectionId").notNull(),
    providerAssetId: pgText("providerAssetId").notNull(),
    status: pgText("status").notNull().default("draft"),
    metadata: pgText("metadata"),
    error: pgText("error"),
    publishAttempts: pgInteger("publishAttempts").notNull().default(0),
    deletedAt: pgTimestamp("deletedAt", { mode: "date" }),
    publishedAt: pgTimestamp("publishedAt", { mode: "date" }),
    lastSyncedAt: pgTimestamp("lastSyncedAt", { mode: "date" }),
    createdAt: pgTimestamp("createdAt", { mode: "date" }).notNull(),
    updatedAt: pgTimestamp("updatedAt", { mode: "date" }).notNull(),
  },
  (table) => [
    pgIndex("publishes_user_id_idx").on(table.userId),
    pgIndex("publishes_content_id_idx").on(table.contentId),
    pgIndex("publishes_connection_id_idx").on(table.connectionId),
    pgIndex("publishes_provider_asset_idx").on(table.provider, table.providerAssetId),
    pgIndex("publishes_status_idx").on(table.status),
  ]
);

export const usersPg = pgTable("user", {
  id: pgText("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: pgText("name"),
  email: pgText("email").unique(),
  emailVerified: pgTimestamp("emailVerified", { mode: "date" }),
  image: pgText("image"),
});

export const accountsPg = pgTable(
  "account",
  {
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    type: pgText("type").notNull(),
    provider: pgText("provider").notNull(),
    providerAccountId: pgText("providerAccountId").notNull(),
    refresh_token: pgText("refresh_token"),
    access_token: pgText("access_token"),
    expires_at: pgInteger("expires_at"),
    token_type: pgText("token_type"),
    scope: pgText("scope"),
    id_token: pgText("id_token"),
    session_state: pgText("session_state"),
  },
  (account) => [
    pgPrimaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessionsPg = pgTable("session", {
  sessionToken: pgText("sessionToken").primaryKey(),
  userId: pgText("userId")
    .notNull()
    .references(() => usersPg.id, { onDelete: "cascade" }),
  expires: pgTimestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokensPg = pgTable(
  "verificationToken",
  {
    identifier: pgText("identifier").notNull(),
    token: pgText("token").notNull(),
    expires: pgTimestamp("expires", { mode: "date" }).notNull(),
  },
  (verificationToken) => [
    pgPrimaryKey({
      columns: [verificationToken.identifier, verificationToken.token],
    }),
  ]
);

export const authenticatorsPg = pgTable(
  "authenticator",
  {
    credentialID: pgText("credentialID").notNull().unique(),
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    providerAccountId: pgText("providerAccountId").notNull(),
    credentialPublicKey: pgText("credentialPublicKey").notNull(),
    counter: pgInteger("counter").notNull(),
    credentialDeviceType: pgText("credentialDeviceType").notNull(),
    credentialBackedUp: pgBoolean("credentialBackedUp").notNull(),
    transports: pgText("transports"),
  },
  (authenticator) => [
    pgPrimaryKey({
      columns: [authenticator.userId, authenticator.credentialID],
    }),
  ]
);

export const appTokensPg = pgTable(
  "app_token",
  {
    token: pgText("token").primaryKey(),
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    type: pgText("type").notNull(),
    payload: pgText("payload"),
    createdAt: pgTimestamp("createdAt", { mode: "date" }).notNull(),
    expires: pgTimestamp("expires", { mode: "date" }).notNull(),
  },
  (token) => [
    pgIndex("app_token_user_id_idx").on(token.userId),
    pgIndex("app_token_type_idx").on(token.type),
  ]
);

export const sqliteSchema = {
  users,
  accounts,
  sessions,
  verificationTokens,
  authenticators,
  appTokens,
  contentItems,
  publishes,
};

export const schema = {
  users: usersPg,
  accounts: accountsPg,
  sessions: sessionsPg,
  verificationTokens: verificationTokensPg,
  authenticators: authenticatorsPg,
  appTokens: appTokensPg,
  contentItems: contentItemsPg,
  publishes: publishesPg,
};

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  authenticators: many(authenticators),
  appTokens: many(appTokens),
  publishes: many(publishes),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, { fields: [accounts.userId], references: [users.id] }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const authenticatorsRelations = relations(authenticators, ({ one }) => ({
  user: one(users, { fields: [authenticators.userId], references: [users.id] }),
}));

export const appTokensRelations = relations(appTokens, ({ one }) => ({
  user: one(users, { fields: [appTokens.userId], references: [users.id] }),
}));

export const contentItemsRelations = relations(contentItems, ({ one, many }) => ({
  user: one(users, { fields: [contentItems.userId], references: [users.id] }),
  publishes: many(publishes),
}));

export const publishesRelations = relations(publishes, ({ one }) => ({
  user: one(users, { fields: [publishes.userId], references: [users.id] }),
  contentItem: one(contentItems, {
    fields: [publishes.contentId],
    references: [contentItems.id],
  }),
}));

export const usersPgRelations = relations(usersPg, ({ many }) => ({
  accounts: many(accountsPg),
  sessions: many(sessionsPg),
  authenticators: many(authenticatorsPg),
  appTokens: many(appTokensPg),
  contentItems: many(contentItemsPg),
  publishes: many(publishesPg),
}));

export const accountsPgRelations = relations(accountsPg, ({ one }) => ({
  user: one(usersPg, { fields: [accountsPg.userId], references: [usersPg.id] }),
}));

export const sessionsPgRelations = relations(sessionsPg, ({ one }) => ({
  user: one(usersPg, { fields: [sessionsPg.userId], references: [usersPg.id] }),
}));

export const authenticatorsPgRelations = relations(authenticatorsPg, ({ one }) => ({
  user: one(usersPg, {
    fields: [authenticatorsPg.userId],
    references: [usersPg.id],
  }),
}));

export const appTokensPgRelations = relations(appTokensPg, ({ one }) => ({
  user: one(usersPg, { fields: [appTokensPg.userId], references: [usersPg.id] }),
}));

export const contentItemsPgRelations = relations(contentItemsPg, ({ one, many }) => ({
  user: one(usersPg, { fields: [contentItemsPg.userId], references: [usersPg.id] }),
  publishes: many(publishesPg),
}));

export const publishesPgRelations = relations(publishesPg, ({ one }) => ({
  user: one(usersPg, { fields: [publishesPg.userId], references: [usersPg.id] }),
  contentItem: one(contentItemsPg, {
    fields: [publishesPg.contentId],
    references: [contentItemsPg.id],
  }),
}));
