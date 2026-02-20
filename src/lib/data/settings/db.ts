import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

const getDb = () => getDrizzleDb();

export type PgSettingsContext = {
  db: PostgresDrizzleDb;
  table: typeof schema.appSettings;
  now: Date;
};

export type SqliteSettingsContext = {
  db: SqliteDrizzleDb;
  table: typeof sqliteSchema.appSettings;
  now: Date;
};

export const withSettingsDb = async <T>(handlers: {
  pg: (ctx: PgSettingsContext) => Promise<T>;
  sqlite: (ctx: SqliteSettingsContext) => Promise<T>;
}) => {
  const db = getDb();
  if (isPostgres) {
    return handlers.pg({
      db: db as PostgresDrizzleDb,
      table: schema.appSettings,
      now: new Date(),
    });
  }
  return handlers.sqlite({
    db: db as SqliteDrizzleDb,
    table: sqliteSchema.appSettings,
    now: new Date(),
  });
};
