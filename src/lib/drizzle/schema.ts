import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  index as pgIndex,
  integer as pgInteger,
  pgTable,
  text as pgText,
  timestamp as pgTimestamp,
  real as pgReal,
} from "drizzle-orm/pg-core";

export const contentItems = sqliteTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    status: text("status").notNull().default("uploaded"),
    thumbnailPath: text("thumbnail_path").notNull(),
    videoPath: text("video_path").notNull(),
    songPath: text("song_path").notNull(),
    renderPath: text("render_path"),
    songDurationSeconds: real("song_duration_seconds").notNull().default(0),
    segmentDurationSeconds: real("segment_duration_seconds").notNull().default(0),
    videoDurationSeconds: real("video_duration_seconds").notNull().default(0),
    fadeDurationSeconds: real("fade_duration_seconds").notNull().default(0),
    fps: integer("fps").notNull().default(30),
    width: integer("width").notNull().default(1280),
    height: integer("height").notNull().default(720),
    createdAt: text("created_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("idx_content_items_status").on(table.status),
    index("idx_content_items_created_at").on(table.createdAt),
  ]
);

export const contentItemsPg = pgTable(
  "content_items",
  {
    id: pgText("id").primaryKey(),
    title: pgText("title").notNull(),
    status: pgText("status").notNull().default("uploaded"),
    thumbnailPath: pgText("thumbnail_path").notNull(),
    videoPath: pgText("video_path").notNull(),
    songPath: pgText("song_path").notNull(),
    renderPath: pgText("render_path"),
    songDurationSeconds: pgReal("song_duration_seconds").notNull().default(0),
    segmentDurationSeconds: pgReal("segment_duration_seconds").notNull().default(0),
    videoDurationSeconds: pgReal("video_duration_seconds").notNull().default(0),
    fadeDurationSeconds: pgReal("fade_duration_seconds").notNull().default(0),
    fps: pgInteger("fps").notNull().default(30),
    width: pgInteger("width").notNull().default(1280),
    height: pgInteger("height").notNull().default(720),
    createdAt: pgTimestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: pgTimestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    pgIndex("idx_content_items_status").on(table.status),
    pgIndex("idx_content_items_created_at").on(table.createdAt),
  ]
);

export const sqliteSchema = {
  contentItems,
};

export const schema = {
  contentItems: contentItemsPg,
};
