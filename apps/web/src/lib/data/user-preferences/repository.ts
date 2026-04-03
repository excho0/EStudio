import { eq } from "drizzle-orm";
import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import {
  defaultNotificationCategoryKeys,
  type UserNotificationPreferences,
  type UserNotificationPreferencesUpdate,
  userNotificationPreferencesSchema,
  userPreferencesSchema,
} from "./schemas";

const buildDefaultNotificationPreferences = (): UserNotificationPreferences =>
  userNotificationPreferencesSchema.parse({
    push: {
      enabled: true,
      groups: {
        content: {
          enabled: true,
          items: Object.fromEntries(
            defaultNotificationCategoryKeys.map((key) => [key, { enabled: true }])
          ),
        },
      },
    },
  });

const normalizeStoredPreferences = (value: unknown): UserNotificationPreferences => {
  const parsed = userPreferencesSchema.parse(value ?? {});
  const itemDefaults = Object.fromEntries(
    defaultNotificationCategoryKeys.map((key) => [key, { enabled: true }])
  );
  return userNotificationPreferencesSchema.parse({
    ...parsed.notifications,
    push: {
      ...parsed.notifications.push,
      enabled: parsed.notifications.push.enabled ?? true,
      groups: {
        ...parsed.notifications.push.groups,
        content: {
          enabled: parsed.notifications.push.groups.content?.enabled ?? true,
          items: {
            ...itemDefaults,
            ...(parsed.notifications.push.groups.content?.items ?? {}),
          },
        },
      },
    },
  });
};

const mergeNotificationPreferences = (
  current: UserNotificationPreferences,
  patch: UserNotificationPreferencesUpdate
): UserNotificationPreferences =>
  userNotificationPreferencesSchema.parse({
    push: {
      ...current.push,
      ...(patch.push ?? {}),
      enabled: patch.push?.enabled ?? current.push.enabled,
      groups: {
        ...current.push.groups,
        ...Object.fromEntries(
          Object.entries(patch.push?.groups ?? {}).map(([groupKey, groupValue]) => [
            groupKey,
            {
              ...(current.push.groups[groupKey] ?? { enabled: true, items: {} }),
              ...groupValue,
              items: {
                ...(current.push.groups[groupKey]?.items ?? {}),
                ...Object.fromEntries(
                  Object.entries(groupValue.items ?? {}).map(([itemKey, itemValue]) => [
                    itemKey,
                    {
                      ...(current.push.groups[groupKey]?.items[itemKey] ?? {
                        enabled: true,
                      }),
                      ...itemValue,
                    },
                  ])
                ),
              },
            },
          ])
        ),
      },
    },
  });

export async function getUserNotificationPreferences(
  userId: string
): Promise<UserNotificationPreferences> {
  const db = getDrizzleDb();

  if (isPostgres) {
    const pg = db as PostgresDrizzleDb;
    const [row] = await pg
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1);
    return row ? normalizeStoredPreferences(row.data) : buildDefaultNotificationPreferences();
  }

  const sqlite = db as SqliteDrizzleDb;
  const [row] = await sqlite
    .select()
    .from(sqliteSchema.userPreferences)
    .where(eq(sqliteSchema.userPreferences.userId, userId))
    .limit(1);
  return row ? normalizeStoredPreferences(row.data) : buildDefaultNotificationPreferences();
}

export async function updateUserNotificationPreferences(
  userId: string,
  patch: UserNotificationPreferencesUpdate
): Promise<UserNotificationPreferences> {
  const current = await getUserNotificationPreferences(userId);
  const next = mergeNotificationPreferences(current, patch);
  const now = new Date();
  const db = getDrizzleDb();

  if (isPostgres) {
    const pg = db as PostgresDrizzleDb;
    const [existing] = await pg
      .select()
      .from(schema.userPreferences)
      .where(eq(schema.userPreferences.userId, userId))
      .limit(1);
    if (!existing) {
      await pg.insert(schema.userPreferences).values({
        userId,
        data: { notifications: next },
        version: 1,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await pg
        .update(schema.userPreferences)
        .set({
          data: { notifications: next },
          version: existing.version > 0 ? existing.version : 1,
          updatedAt: now,
        })
        .where(eq(schema.userPreferences.userId, userId));
    }
    return next;
  }

  const sqlite = db as SqliteDrizzleDb;
  const [existing] = await sqlite
    .select()
    .from(sqliteSchema.userPreferences)
    .where(eq(sqliteSchema.userPreferences.userId, userId))
    .limit(1);
  if (!existing) {
    await sqlite.insert(sqliteSchema.userPreferences).values({
      userId,
      data: { notifications: next },
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  } else {
    await sqlite
      .update(sqliteSchema.userPreferences)
      .set({
        data: { notifications: next },
        version: existing.version > 0 ? existing.version : 1,
        updatedAt: now,
      })
      .where(eq(sqliteSchema.userPreferences.userId, userId));
  }
  return next;
}

export async function isUserPushCategoryEnabled(
  userId: string,
  category: string
) {
  const preferences = await getUserNotificationPreferences(userId);
  if (!preferences.push.enabled) {
    return false;
  }
  const contentGroup = preferences.push.groups.content;
  if (!contentGroup?.enabled) {
    return false;
  }
  return contentGroup.items[category]?.enabled ?? true;
}
