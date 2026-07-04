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
  jsonb as pgJsonb,
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

export const userApiKeys = sqliteTable(
  "user_api_keys",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    tokenPrefix: text("tokenPrefix").notNull().unique(),
    tokenHash: text("tokenHash").notNull(),
    permissions: text("permissions", { mode: "json" }).notNull(),
    resources: text("resources", { mode: "json" }).notNull(),
    lastUsedAt: integer("lastUsedAt", { mode: "timestamp_ms" }),
    expiresAt: integer("expiresAt", { mode: "timestamp_ms" }),
    revokedAt: integer("revokedAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("user_api_keys_user_id_idx").on(table.userId),
    index("user_api_keys_prefix_idx").on(table.tokenPrefix),
    index("user_api_keys_revoked_at_idx").on(table.revokedAt),
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
    colorPalette: text("color_palette"),
    paletteMode: text("palette_mode").notNull().default("auto"),
    mode: text("mode").notNull().default("video_loop"),
    settings: text("settings", { mode: "json" }),
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
    providerAccountId: text("providerAccountId").notNull(),
    providerAssetId: text("providerAssetId"),
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
    index("publishes_provider_account_idx").on(table.provider, table.providerAccountId),
    index("publishes_provider_asset_idx").on(table.provider, table.providerAssetId),
    index("publishes_status_idx").on(table.status),
  ]
);

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    contentId: text("contentId").notNull(),
    mode: text("mode"),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    progress: real("progress"),
    stage: text("stage"),
    error: text("error"),
    metadata: text("metadata"),
    readAt: integer("readAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("notifications_user_id_idx").on(table.userId),
    index("notifications_user_updated_at_idx").on(table.userId, table.updatedAt),
    index("notifications_user_read_at_idx").on(table.userId, table.readAt),
    index("notifications_user_key_idx").on(table.userId, table.key),
  ]
);

export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    expirationTime: integer("expirationTime", { mode: "timestamp_ms" }),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("userAgent"),
    lastSeenAt: integer("lastSeenAt", { mode: "timestamp_ms" }).notNull(),
    disabledAt: integer("disabledAt", { mode: "timestamp_ms" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("push_subscriptions_user_id_idx").on(table.userId),
    index("push_subscriptions_user_updated_at_idx").on(table.userId, table.updatedAt),
    index("push_subscriptions_endpoint_idx").on(table.endpoint),
  ]
);

export const appSettings = sqliteTable(
  "app_settings",
  {
    id: text("id").primaryKey(),
    data: text("data", { mode: "json" }).notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: text("updatedBy").references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("app_settings_updated_at_idx").on(table.updatedAt),
    index("app_settings_updated_by_idx").on(table.updatedBy),
  ]
);

export const userPreferences = sqliteTable(
  "user_preferences",
  {
    userId: text("userId")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    data: text("data", { mode: "json" }).notNull(),
    version: integer("version").notNull().default(1),
    createdAt: integer("createdAt", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updatedAt", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("user_preferences_updated_at_idx").on(table.updatedAt),
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
    colorPalette: pgText("color_palette"),
    paletteMode: pgText("palette_mode").notNull().default("auto"),
    mode: pgText("mode").notNull().default("video_loop"),
    settings: pgJsonb("settings"),
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
    providerAccountId: pgText("providerAccountId"),
    providerAssetId: pgText("providerAssetId"),
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
    pgIndex("publishes_provider_account_idx").on(table.provider, table.providerAccountId),
    pgIndex("publishes_provider_asset_idx").on(table.provider, table.providerAssetId),
    pgIndex("publishes_status_idx").on(table.status),
  ]
);

export const notificationsPg = pgTable(
  "notifications",
  {
    id: pgText("id").primaryKey(),
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    key: pgText("key").notNull(),
    contentId: pgText("contentId").notNull(),
    mode: pgText("mode"),
    kind: pgText("kind").notNull(),
    status: pgText("status").notNull(),
    progress: pgReal("progress"),
    stage: pgText("stage"),
    error: pgText("error"),
    metadata: pgJsonb("metadata"),
    readAt: pgTimestamp("readAt", { mode: "date" }),
    createdAt: pgTimestamp("createdAt", { mode: "date" }).notNull(),
    updatedAt: pgTimestamp("updatedAt", { mode: "date" }).notNull(),
  },
  (table) => [
    pgIndex("notifications_user_id_idx").on(table.userId),
    pgIndex("notifications_user_updated_at_idx").on(table.userId, table.updatedAt),
    pgIndex("notifications_user_read_at_idx").on(table.userId, table.readAt),
    pgIndex("notifications_user_key_idx").on(table.userId, table.key),
  ]
);

export const pushSubscriptionsPg = pgTable(
  "push_subscriptions",
  {
    id: pgText("id").primaryKey(),
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    endpoint: pgText("endpoint").notNull(),
    expirationTime: pgTimestamp("expirationTime", { mode: "date" }),
    p256dh: pgText("p256dh").notNull(),
    auth: pgText("auth").notNull(),
    userAgent: pgText("userAgent"),
    lastSeenAt: pgTimestamp("lastSeenAt", { mode: "date" }).notNull(),
    disabledAt: pgTimestamp("disabledAt", { mode: "date" }),
    createdAt: pgTimestamp("createdAt", { mode: "date" }).notNull(),
    updatedAt: pgTimestamp("updatedAt", { mode: "date" }).notNull(),
  },
  (table) => [
    pgIndex("push_subscriptions_user_id_idx").on(table.userId),
    pgIndex("push_subscriptions_user_updated_at_idx").on(table.userId, table.updatedAt),
    pgIndex("push_subscriptions_endpoint_idx").on(table.endpoint),
  ]
);

export const appSettingsPg = pgTable(
  "app_settings",
  {
    id: pgText("id").primaryKey(),
    data: pgJsonb("data").notNull(),
    version: pgInteger("version").notNull().default(1),
    updatedBy: pgText("updatedBy").references(() => usersPg.id, { onDelete: "set null" }),
    createdAt: pgTimestamp("createdAt", { mode: "date" }).notNull(),
    updatedAt: pgTimestamp("updatedAt", { mode: "date" }).notNull(),
  },
  (table) => [
    pgIndex("app_settings_updated_at_idx").on(table.updatedAt),
    pgIndex("app_settings_updated_by_idx").on(table.updatedBy),
  ]
);

export const userPreferencesPg = pgTable(
  "user_preferences",
  {
    userId: pgText("userId")
      .primaryKey()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    data: pgJsonb("data").notNull(),
    version: pgInteger("version").notNull().default(1),
    createdAt: pgTimestamp("createdAt", { mode: "date" }).notNull(),
    updatedAt: pgTimestamp("updatedAt", { mode: "date" }).notNull(),
  },
  (table) => [
    pgIndex("user_preferences_updated_at_idx").on(table.updatedAt),
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

export const userApiKeysPg = pgTable(
  "user_api_keys",
  {
    id: pgText("id").primaryKey(),
    userId: pgText("userId")
      .notNull()
      .references(() => usersPg.id, { onDelete: "cascade" }),
    label: pgText("label").notNull(),
    tokenPrefix: pgText("tokenPrefix").notNull().unique(),
    tokenHash: pgText("tokenHash").notNull(),
    permissions: pgJsonb("permissions").notNull(),
    resources: pgJsonb("resources").notNull(),
    lastUsedAt: pgTimestamp("lastUsedAt", { mode: "date" }),
    expiresAt: pgTimestamp("expiresAt", { mode: "date" }),
    revokedAt: pgTimestamp("revokedAt", { mode: "date" }),
    createdAt: pgTimestamp("createdAt", { mode: "date" }).notNull(),
    updatedAt: pgTimestamp("updatedAt", { mode: "date" }).notNull(),
  },
  (table) => [
    pgIndex("user_api_keys_user_id_idx").on(table.userId),
    pgIndex("user_api_keys_prefix_idx").on(table.tokenPrefix),
    pgIndex("user_api_keys_revoked_at_idx").on(table.revokedAt),
  ]
);

export const sqliteSchema = {
  users,
  accounts,
  sessions,
  verificationTokens,
  authenticators,
  appTokens,
  userApiKeys,
  contentItems,
  publishes,
  notifications,
  pushSubscriptions,
  appSettings,
  userPreferences,
};

export const schema = {
  users: usersPg,
  accounts: accountsPg,
  sessions: sessionsPg,
  verificationTokens: verificationTokensPg,
  authenticators: authenticatorsPg,
  appTokens: appTokensPg,
  userApiKeys: userApiKeysPg,
  contentItems: contentItemsPg,
  publishes: publishesPg,
  notifications: notificationsPg,
  pushSubscriptions: pushSubscriptionsPg,
  appSettings: appSettingsPg,
  userPreferences: userPreferencesPg,
};

export const usersRelations = relations(users, ({ many }) => ({
  accounts: many(accounts),
  sessions: many(sessions),
  authenticators: many(authenticators),
  appTokens: many(appTokens),
  apiKeys: many(userApiKeys),
  publishes: many(publishes),
  notifications: many(notifications),
  pushSubscriptions: many(pushSubscriptions),
  appSettingsUpdates: many(appSettings),
  preferences: many(userPreferences),
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

export const userApiKeysRelations = relations(userApiKeys, ({ one }) => ({
  user: one(users, { fields: [userApiKeys.userId], references: [users.id] }),
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

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));

export const pushSubscriptionsRelations = relations(pushSubscriptions, ({ one }) => ({
  user: one(users, {
    fields: [pushSubscriptions.userId],
    references: [users.id],
  }),
}));

export const appSettingsRelations = relations(appSettings, ({ one }) => ({
  updatedByUser: one(users, {
    fields: [appSettings.updatedBy],
    references: [users.id],
  }),
}));

export const userPreferencesRelations = relations(userPreferences, ({ one }) => ({
  user: one(users, {
    fields: [userPreferences.userId],
    references: [users.id],
  }),
}));

export const usersPgRelations = relations(usersPg, ({ many }) => ({
  accounts: many(accountsPg),
  sessions: many(sessionsPg),
  authenticators: many(authenticatorsPg),
  appTokens: many(appTokensPg),
  apiKeys: many(userApiKeysPg),
  contentItems: many(contentItemsPg),
  publishes: many(publishesPg),
  notifications: many(notificationsPg),
  pushSubscriptions: many(pushSubscriptionsPg),
  appSettingsUpdates: many(appSettingsPg),
  preferences: many(userPreferencesPg),
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

export const userApiKeysPgRelations = relations(userApiKeysPg, ({ one }) => ({
  user: one(usersPg, { fields: [userApiKeysPg.userId], references: [usersPg.id] }),
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

export const notificationsPgRelations = relations(notificationsPg, ({ one }) => ({
  user: one(usersPg, {
    fields: [notificationsPg.userId],
    references: [usersPg.id],
  }),
}));

export const pushSubscriptionsPgRelations = relations(pushSubscriptionsPg, ({ one }) => ({
  user: one(usersPg, {
    fields: [pushSubscriptionsPg.userId],
    references: [usersPg.id],
  }),
}));

export const appSettingsPgRelations = relations(appSettingsPg, ({ one }) => ({
  updatedByUser: one(usersPg, {
    fields: [appSettingsPg.updatedBy],
    references: [usersPg.id],
  }),
}));

export const userPreferencesPgRelations = relations(userPreferencesPg, ({ one }) => ({
  user: one(usersPg, {
    fields: [userPreferencesPg.userId],
    references: [usersPg.id],
  }),
}));
