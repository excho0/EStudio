import { randomUUID } from "node:crypto";

import { getDrizzleDb, type PostgresDrizzleDb, type SqliteDrizzleDb } from "../src/lib/drizzle/client";
import { schema, sqliteSchema } from "../src/lib/drizzle/schema";

type SeedOptions = {
  count: number;
  clear: boolean;
};

const parseArgs = (): SeedOptions => {
  const args = process.argv.slice(2);
  const countArg = args.find((arg) => arg.startsWith("--count="));
  const count = countArg ? Number(countArg.split("=")[1]) : 200;
  const clear = args.includes("--clear");

  return {
    count: Number.isFinite(count) && count > 0 ? count : 200,
    clear,
  };
};

const pick = <T>(values: T[]) => values[Math.floor(Math.random() * values.length)];

const nowIso = () => new Date().toISOString();

const generateValues = (count: number) => {
  const statuses = ["uploaded", "rendering", "rendered", "failed"] as const;
  const widths = [1080, 1280, 1920];
  const heights = [1080, 720, 1080];

  return Array.from({ length: count }, (_, index) => {
    const status = pick([...statuses]);
    const width = pick(widths);
    const height = pick(heights);
    const segmentDurationSeconds = Number((Math.random() * 6 + 4).toFixed(2));
    const fadeDurationSeconds = Number((Math.random() * 1.2 + 0.4).toFixed(2));
    const playbackRate = Number((Math.random() * 0.8 + 0.7).toFixed(2));
    const songDurationSeconds = Number((Math.random() * 180 + 60).toFixed(2));
    const videoDurationSeconds = Number((segmentDurationSeconds + Math.random()).toFixed(2));
    const fps = pick([24, 25, 30, 60]);

    return {
      id: randomUUID(),
      title: `Seeded project ${index + 1}`,
      status,
      thumbnailPath: `uploads/thumbnails/seed-${index + 1}.jpg`,
      videoPath: `uploads/videos/seed-${index + 1}.mp4`,
      songPath: `uploads/songs/seed-${index + 1}.mp3`,
      renderPath: status === "rendered" ? `renders/seed-${index + 1}.mp4` : null,
      songDurationSeconds,
      segmentDurationSeconds,
      fadeDurationSeconds,
      playbackRate,
      videoDurationSeconds,
      fps,
      width,
      height,
    };
  });
};

const isPostgres = Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL);

const seedSqlite = async (db: SqliteDrizzleDb, count: number, clear: boolean) => {
  const table = sqliteSchema.contentItems;
  if (clear) {
    await db.delete(table);
  }
  const now = nowIso();
  const values = generateValues(count).map((item) => ({
    ...item,
    createdAt: now,
    updatedAt: now,
  }));
  await db.insert(table).values(values);
};

const seedPostgres = async (db: PostgresDrizzleDb, count: number, clear: boolean) => {
  const table = schema.contentItems;
  if (clear) {
    await db.delete(table);
  }
  const now = new Date();
  const values = generateValues(count).map((item) => ({
    ...item,
    createdAt: now,
    updatedAt: now,
  }));
  await db.insert(table).values(values);
};

const run = async () => {
  const { count, clear } = parseArgs();
  const db = getDrizzleDb();

  if (isPostgres) {
    await seedPostgres(db as PostgresDrizzleDb, count, clear);
  } else {
    await seedSqlite(db as SqliteDrizzleDb, count, clear);
  }

  const target = isPostgres ? "Postgres" : "SQLite";
  console.log(`Seeded ${count} content items into ${target}.`);
};

run().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
