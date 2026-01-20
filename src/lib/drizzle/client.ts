import fs from "fs";
import path from "path";

import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { drizzle as drizzleSqlite, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema, sqliteSchema } from "@/lib/drizzle/schema";

export type PostgresDrizzleDb = NeonHttpDatabase<typeof schema>;
export type SqliteDrizzleDb = BetterSQLite3Database<typeof sqliteSchema>;
export type DrizzleDb = PostgresDrizzleDb | SqliteDrizzleDb;

let cachedDb: DrizzleDb | null = null;

function createSqliteDb(): SqliteDrizzleDb {
  const sqliteUrl = process.env.SQLITE_URL ?? "file:./data/app.db";
  const filePath = sqliteUrl.startsWith("file:") ? sqliteUrl.slice("file:".length) : sqliteUrl;
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });

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
  const postgresUrl = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
  if (postgresUrl) {
    cachedDb = createPostgresDb(postgresUrl);
    return cachedDb;
  }
  cachedDb = createSqliteDb();
  return cachedDb;
}

export { schema };
