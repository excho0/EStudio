import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/dev/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: process.env.SQLITE_URL ?? "file:./data/app.db",
  },
});
