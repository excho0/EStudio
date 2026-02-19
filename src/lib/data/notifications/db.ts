import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

const getDb = () => getDrizzleDb();

export type PgNotificationsContext = {
  db: PostgresDrizzleDb;
  table: typeof schema.notifications;
  now: Date;
};

export type SqliteNotificationsContext = {
  db: SqliteDrizzleDb;
  table: typeof sqliteSchema.notifications;
  nowMs: number;
};

export const withNotificationsDb = async <T>(handlers: {
  pg: (ctx: PgNotificationsContext) => Promise<T>;
  sqlite: (ctx: SqliteNotificationsContext) => Promise<T>;
}) => {
  const db = getDb();

  if (isPostgres) {
    return handlers.pg({
      db: db as PostgresDrizzleDb,
      table: schema.notifications,
      now: new Date(),
    });
  }

  return handlers.sqlite({
    db: db as SqliteDrizzleDb,
    table: sqliteSchema.notifications,
    nowMs: Date.now(),
  });
};
