import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";
import {
  index as pgIndex,
  boolean as pgBoolean,
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
    // asset paths derived from content id
    songDurationSeconds: real("song_duration_seconds").notNull().default(0),
    segmentDurationSeconds: real("segment_duration_seconds").notNull().default(0),
    videoDurationSeconds: real("video_duration_seconds").notNull().default(0),
    fadeDurationSeconds: real("fade_duration_seconds").notNull().default(0),
    introFadeSeconds: real("intro_fade_seconds").notNull().default(0),
    outroFadeSeconds: real("outro_fade_seconds").notNull().default(0),
    audioFadeInSeconds: real("audio_fade_in_seconds").notNull().default(0),
    audioFadeOutSeconds: real("audio_fade_out_seconds").notNull().default(0),
    audioFadeInOffsetSeconds: real("audio_fade_in_offset_seconds")
      .notNull()
      .default(0),
    audioFadeOutOffsetSeconds: real("audio_fade_out_offset_seconds")
      .notNull()
      .default(0),
    scalePercent: real("scale_percent").notNull().default(100),
    visualizationEnabled: integer("visualization_enabled").notNull().default(1),
    visualizationBars: integer("visualization_bars").notNull().default(128),
    edgeRaysEnabled: integer("edge_rays_enabled").notNull().default(1),
    edgeRaysIntensity: real("edge_rays_intensity").notNull().default(0.85),
    edgeRaysVocalBalance: real("edge_rays_vocal_balance").notNull().default(0.6),
    colorPalette: text("color_palette"),
    paletteMode: text("palette_mode").notNull().default("auto"),
    overlapRatio: real("overlap_ratio"),
    playbackRate: real("playback_rate").notNull().default(1),
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
    // asset paths derived from content id
    songDurationSeconds: pgReal("song_duration_seconds").notNull().default(0),
    segmentDurationSeconds: pgReal("segment_duration_seconds").notNull().default(0),
    videoDurationSeconds: pgReal("video_duration_seconds").notNull().default(0),
    fadeDurationSeconds: pgReal("fade_duration_seconds").notNull().default(0),
    introFadeSeconds: pgReal("intro_fade_seconds").notNull().default(0),
    outroFadeSeconds: pgReal("outro_fade_seconds").notNull().default(0),
    audioFadeInSeconds: pgReal("audio_fade_in_seconds").notNull().default(0),
    audioFadeOutSeconds: pgReal("audio_fade_out_seconds").notNull().default(0),
    audioFadeInOffsetSeconds: pgReal("audio_fade_in_offset_seconds")
      .notNull()
      .default(0),
    audioFadeOutOffsetSeconds: pgReal("audio_fade_out_offset_seconds")
      .notNull()
      .default(0),
    scalePercent: pgReal("scale_percent").notNull().default(100),
    visualizationEnabled: pgBoolean("visualization_enabled").notNull().default(true),
    visualizationBars: pgInteger("visualization_bars").notNull().default(128),
    edgeRaysEnabled: pgBoolean("edge_rays_enabled").notNull().default(true),
    edgeRaysIntensity: pgReal("edge_rays_intensity").notNull().default(0.85),
    edgeRaysVocalBalance: pgReal("edge_rays_vocal_balance").notNull().default(0.6),
    colorPalette: pgText("color_palette"),
    paletteMode: pgText("palette_mode").notNull().default("auto"),
    overlapRatio: pgReal("overlap_ratio"),
    playbackRate: pgReal("playback_rate").notNull().default(1),
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
