import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

const getDb = () => getDrizzleDb();

export type PgContentContext = {
  db: PostgresDrizzleDb;
  table: typeof schema.contentItems;
  now: Date;
};

export type SqliteContentContext = {
  db: SqliteDrizzleDb;
  table: typeof sqliteSchema.contentItems;
  now: string;
};

export const withContentDb = async <T>(handlers: {
  pg: (ctx: PgContentContext) => Promise<T>;
  sqlite: (ctx: SqliteContentContext) => Promise<T>;
}) => {
  const db = getDb();

  if (isPostgres) {
    return handlers.pg({
      db: db as PostgresDrizzleDb,
      table: schema.contentItems,
      now: new Date(),
    });
  }

  return handlers.sqlite({
    db: db as SqliteDrizzleDb,
    table: sqliteSchema.contentItems,
    now: new Date().toISOString(),
  });
};
