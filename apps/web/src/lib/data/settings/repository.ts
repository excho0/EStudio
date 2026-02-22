import { eq } from "drizzle-orm";
import { withSettingsDb } from "@/lib/data/settings/db";
import { appSettingsSchema, appSettingsUpdateSchema } from "@/lib/data/settings/schemas";
import { z } from "zod";

const APP_SETTINGS_ID = "global";

type AppSettings = z.infer<typeof appSettingsSchema>;
type AppSettingsUpdate = z.infer<typeof appSettingsUpdateSchema>;

type RowPayload = {
  data: AppSettings;
  version: number;
};

const normalizeLegacySettingsShape = (value: unknown): unknown => {
  const obj = (value ?? {}) as { captions?: { backend?: unknown } };
  const backend = obj.captions?.backend;
  if (backend !== "whisperx-remote") {
    return value;
  }
  return {
    ...obj,
    captions: {
      ...(obj.captions ?? {}),
      backend: "captions-api-app",
    },
  };
};

const normalizeRowPayload = (value: unknown): RowPayload => {
  const row = (value ?? {}) as {
    data?: unknown;
    value?: unknown;
    version?: unknown;
  };
  const parsedData = appSettingsSchema.parse(
    normalizeLegacySettingsShape(row.data ?? row.value ?? {})
  );
  const version =
    typeof row.version === "number" && Number.isFinite(row.version) && row.version > 0
      ? row.version
      : 1;
  return { data: parsedData, version };
};

export const getAppSettings = async (): Promise<AppSettings> => {
  const row = await withSettingsDb({
    pg: async ({ db, table }) => {
      const [item] = await db.select().from(table).where(eq(table.id, APP_SETTINGS_ID)).limit(1);
      return item ?? null;
    },
    sqlite: async ({ db, table }) => {
      const [item] = await db.select().from(table).where(eq(table.id, APP_SETTINGS_ID)).limit(1);
      return item ?? null;
    },
  });
  if (!row) {
    return appSettingsSchema.parse({});
  }
  return normalizeRowPayload(row).data;
};

export const updateAppSettings = async (
  patchInput: AppSettingsUpdate,
  updatedBy: string | null
): Promise<AppSettings> => {
  const patch = appSettingsUpdateSchema.parse(patchInput);
  return withSettingsDb({
    pg: async ({ db, table, now }) => {
      const [existing] = await db
        .select()
        .from(table)
        .where(eq(table.id, APP_SETTINGS_ID))
        .limit(1);
      const current = existing ? normalizeRowPayload(existing).data : appSettingsSchema.parse({});
      const next = appSettingsSchema.parse({
        ...current,
        ...patch,
        captions: {
          ...current.captions,
          ...(patch.captions ?? {}),
        },
      });
      if (!existing) {
        await db.insert(table).values({
          id: APP_SETTINGS_ID,
          data: next,
          version: 1,
          updatedBy,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const version = normalizeRowPayload(existing).version + 1;
        await db
          .update(table)
          .set({
            data: next,
            version,
            updatedBy,
            updatedAt: now,
          })
          .where(eq(table.id, APP_SETTINGS_ID));
      }
      return next;
    },
    sqlite: async ({ db, table, now }) => {
      const [existing] = await db
        .select()
        .from(table)
        .where(eq(table.id, APP_SETTINGS_ID))
        .limit(1);
      const current = existing ? normalizeRowPayload(existing).data : appSettingsSchema.parse({});
      const next = appSettingsSchema.parse({
        ...current,
        ...patch,
        captions: {
          ...current.captions,
          ...(patch.captions ?? {}),
        },
      });
      if (!existing) {
        await db.insert(table).values({
          id: APP_SETTINGS_ID,
          data: next,
          version: 1,
          updatedBy,
          createdAt: now,
          updatedAt: now,
        });
      } else {
        const version = normalizeRowPayload(existing).version + 1;
        await db
          .update(table)
          .set({
            data: next,
            version,
            updatedBy,
            updatedAt: now,
          })
          .where(eq(table.id, APP_SETTINGS_ID));
      }
      return next;
    },
  });
};
