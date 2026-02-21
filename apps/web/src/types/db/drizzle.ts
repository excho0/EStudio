import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import { schema, sqliteSchema } from "@/lib/drizzle/schema";

export type PostgresDrizzleDb = NeonHttpDatabase<typeof schema>;
export type SqliteDrizzleDb = BetterSQLite3Database<typeof sqliteSchema>;
export type DrizzleDb = PostgresDrizzleDb | SqliteDrizzleDb;
