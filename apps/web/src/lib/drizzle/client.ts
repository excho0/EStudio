import path from "path";

import Database from "better-sqlite3";
import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/better-sqlite3";

import type {
  DrizzleDb,
  PostgresDrizzleDb,
  SqliteDrizzleDb,
} from "@/types";

import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getLogger } from "@/lib/logging";
import { ensureDirPathSync } from "@/lib/storage";

export type { DrizzleDb, PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";

let cachedDb: DrizzleDb | null = null;
let cachedPgPool: Pool | null = null;
const logger = getLogger("db-drizzle-client");

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

  logger.debug({ absolutePath }, "Using SQLite database.");
  const database = new Database(absolutePath);
  database.pragma("foreign_keys = ON");

  return drizzleSqlite(database, { schema: sqliteSchema });
}

function isLikelyNeonHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host.endsWith(".neon.tech") || host.includes("neon.tech") || host.includes("supabase.co");
}

function resolvePostgresTransport(connectionString: string): "neon" | "pg" {
  const explicit = process.env.DB_POSTGRES_TRANSPORT?.toLowerCase();
  if (explicit === "neon") return "neon";
  if (explicit === "pg") return "pg";

  try {
    const parsed = new URL(connectionString);
    return isLikelyNeonHost(parsed.hostname) ? "neon" : "pg";
  } catch {
    return "pg";
  }
}

function createPostgresDb(connectionString: string): PostgresDrizzleDb {
  const transport = resolvePostgresTransport(connectionString);

  if (transport === "neon") {
    logger.info("Using Neon HTTP driver for Postgres.");
    const client = neon(connectionString);
    return drizzleNeon(client, { schema });
  }

  if (!cachedPgPool) {
    cachedPgPool = new Pool({ connectionString });
  }
  logger.info("Using node-postgres driver for Postgres.");
  return drizzlePg(cachedPgPool, { schema }) as unknown as PostgresDrizzleDb;
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
