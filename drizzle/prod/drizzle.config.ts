import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/prod/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_PROD_MIGRATIONS_URL ?? process.env.DATABASE_URL!,
  },
});
