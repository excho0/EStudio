import path from "path";

import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { ensureDirPathSync } from "@/lib/storage";

export type PostgresDrizzleDb = NeonHttpDatabase<typeof schema>;
export type SqliteDrizzleDb = BetterSQLite3Database<typeof sqliteSchema>;
export type DrizzleDb = PostgresDrizzleDb | SqliteDrizzleDb;

let cachedDb: DrizzleDb | null = null;

export const resolveIsPostgres = () => {
  const driver = process.env.DB_DRIVER?.toLowerCase();
  if (driver === "sqlite") return false;
  if (driver === "postgres") return true;
  if (process.env.SQLITE_URL) return false;
  return Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL);
};

export const isPostgres = resolveIsPostgres();

function createSqliteDb(): SqliteDrizzleDb {
  const sqliteUrl = process.env.SQLITE_URL ?? "file:./data/app.db";
  const filePath = sqliteUrl.startsWith("file:") ? sqliteUrl.slice("file:".length) : sqliteUrl;
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  ensureDirPathSync(path.dirname(absolutePath));

  console.info(`[db] Using SQLite database at ${absolutePath}`);
  const database = new Database(absolutePath);
  database.pragma("foreign_keys = ON");

  return drizzleSqlite(database, { schema: sqliteSchema });
}

function createPostgresDb(connectionString: string): PostgresDrizzleDb {
  const client = neon(connectionString);
  return drizzleNeon(client, { schema });
}

export function getDrizzleDb(): DrizzleDb {
  if (cachedDb) {
    return cachedDb;
  }
  const driver = process.env.DB_DRIVER?.toLowerCase();
  const postgresUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  const sqliteUrl = process.env.SQLITE_URL;
  if (driver === "postgres") {
    if (!postgresUrl) {
      throw new Error("DB_DRIVER=postgres but no POSTGRES_URL/DATABASE_URL set.");
    }
    cachedDb = createPostgresDb(postgresUrl);
    return cachedDb;
  }
  if (driver === "sqlite") {
    cachedDb = createSqliteDb();
    return cachedDb;
  }
  if (sqliteUrl) {
    cachedDb = createSqliteDb();
    return cachedDb;
  }
  if (postgresUrl) {
    cachedDb = createPostgresDb(postgresUrl);
    return cachedDb;
  }
  cachedDb = createSqliteDb();
  return cachedDb;
}

export { schema };
