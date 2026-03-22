import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { normalizeSettingsMap } from "../src/lib/content/modes";
import { getLogger } from "../src/lib/logging";

const logger = getLogger("script-migrate-settings-map");

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const stableSort = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) {
    return value.map(stableSort);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    const next: Record<string, JsonValue> = {};
    for (const [key, entry] of entries) {
      next[key] = stableSort(entry as JsonValue);
    }
    return next;
  }
  return value;
};

const stableStringify = (value: JsonValue) =>
  JSON.stringify(stableSort(value), null, 2);

const isEmptyObject = (value: unknown) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  Object.keys(value as Record<string, unknown>).length === 0;

const toBoolean = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return undefined;
};

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const buildLegacySettings = (record: Record<string, unknown>) => {
  const value: Record<string, unknown> = {
    songDurationSeconds: toNumber(record.songDurationSeconds),
    segmentDurationSeconds: toNumber(record.segmentDurationSeconds),
    videoDurationSeconds: toNumber(record.videoDurationSeconds),
    fadeDurationSeconds: toNumber(record.fadeDurationSeconds),
    introFadeSeconds: toNumber(record.introFadeSeconds),
    outroFadeSeconds: toNumber(record.outroFadeSeconds),
    audioFadeInSeconds: toNumber(record.audioFadeInSeconds),
    audioFadeOutSeconds: toNumber(record.audioFadeOutSeconds),
    audioFadeInOffsetSeconds: toNumber(record.audioFadeInOffsetSeconds),
    audioFadeOutOffsetSeconds: toNumber(record.audioFadeOutOffsetSeconds),
    scalePercent: toNumber(record.scalePercent),
    visualizationEnabled: toBoolean(record.visualizationEnabled),
    visualizationBars: toNumber(record.visualizationBars),
    edgeRaysEnabled: toBoolean(record.edgeRaysEnabled),
    edgeRaysIntensity: toNumber(record.edgeRaysIntensity),
    edgeRaysVocalBalance: toNumber(record.edgeRaysVocalBalance),
    playbackRate: toNumber(record.playbackRate),
  };
  Object.keys(value).forEach((key) => {
    if (value[key] === undefined) {
      delete value[key];
    }
  });
  return value;
};

const resolveSqlitePath = () => {
  const url = process.env.SQLITE_URL ?? "file:./data/app.db";
  return url.startsWith("file:") ? url.slice("file:".length) : url;
};

const migrateDb = () => {
  const dbPath = resolveSqlitePath();
  if (!fs.existsSync(dbPath)) {
    logger.warn({ dbPath }, "DB not found, skipping DB migration.");
    return;
  }

  const db = new Database(dbPath);
  const rows = db
    .prepare(
      `SELECT id, mode, settings,
        song_duration_seconds as songDurationSeconds,
        segment_duration_seconds as segmentDurationSeconds,
        video_duration_seconds as videoDurationSeconds,
        fade_duration_seconds as fadeDurationSeconds,
        intro_fade_seconds as introFadeSeconds,
        outro_fade_seconds as outroFadeSeconds,
        audio_fade_in_seconds as audioFadeInSeconds,
        audio_fade_out_seconds as audioFadeOutSeconds,
        audio_fade_in_offset_seconds as audioFadeInOffsetSeconds,
        audio_fade_out_offset_seconds as audioFadeOutOffsetSeconds,
        scale_percent as scalePercent,
        visualization_enabled as visualizationEnabled,
        visualization_bars as visualizationBars,
        edge_rays_enabled as edgeRaysEnabled,
        edge_rays_intensity as edgeRaysIntensity,
        edge_rays_vocal_balance as edgeRaysVocalBalance,
        playback_rate as playbackRate,
        fps,
        width,
        height
      FROM content_items`
    )
    .all() as Array<Record<string, unknown>>;
  const update = db.prepare("UPDATE content_items SET settings = ? WHERE id = ?");

  let updated = 0;
  let forced = 0;
  for (const row of rows) {
    let settingsValue: unknown = null;
    if (row.settings) {
      if (typeof row.settings === "string") {
        try {
          settingsValue = JSON.parse(row.settings);
        } catch {
          settingsValue = null;
        }
      } else {
        settingsValue = row.settings;
      }
    }
    const mode = String(row.mode ?? "video_loop");
    const legacyFallback = buildLegacySettings(row as Record<string, unknown>);
    const normalized = normalizeSettingsMap(mode, settingsValue ?? legacyFallback);
    const current = normalized[mode];
    const legacyEmpty = Object.keys(legacyFallback).length === 0;
    const shouldOverwriteEmpty = !legacyEmpty && isEmptyObject(current);
    if (shouldOverwriteEmpty) {
      normalized[mode] = legacyFallback as Record<string, unknown>;
    }
    const nextJson = stableStringify(normalized as JsonValue);
    const prevJson = stableStringify((settingsValue ?? {}) as JsonValue);
    if (shouldOverwriteEmpty) {
      update.run(nextJson, row.id);
      updated += 1;
      forced += 1;
      continue;
    }
    if (nextJson !== prevJson) {
      update.run(nextJson, row.id);
      updated += 1;
    }
  }

  db.close();
  logger.info({ updated, forced }, "DB migration complete.");
};

const migrateManifests = () => {
  const manifestRoot = path.join(process.cwd(), "data", "users");
  if (!fs.existsSync(manifestRoot)) {
    logger.warn("No manifests directory found, skipping manifest migration.");
    return;
  }
  const userIds = fs.readdirSync(manifestRoot);
  let updated = 0;
  let forced = 0;
  for (const userId of userIds) {
    const manifestDir = path.join(manifestRoot, userId, "manifests");
    if (!fs.existsSync(manifestDir)) continue;
    const files = fs.readdirSync(manifestDir).filter((file) => file.endsWith(".json"));
    for (const file of files) {
      const filePath = path.join(manifestDir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        continue;
      }
      const mode = parsed?.mode ?? "video_loop";
      const legacyFallback = buildLegacySettings(parsed ?? {});
      const normalized = normalizeSettingsMap(
        mode,
        parsed?.settings ?? legacyFallback
      );
      const current = normalized[mode];
      const legacyEmpty = Object.keys(legacyFallback).length === 0;
      const shouldOverwriteEmpty = !legacyEmpty && isEmptyObject(current);
      if (shouldOverwriteEmpty) {
        normalized[mode] = legacyFallback as Record<string, unknown>;
      }
      const nextJson = stableStringify(normalized as JsonValue);
      const prevJson = stableStringify((parsed?.settings ?? {}) as JsonValue);
      if (shouldOverwriteEmpty) {
        parsed.settings = normalized;
        fs.writeFileSync(filePath, stableStringify(parsed as JsonValue) + "\n");
        updated += 1;
        forced += 1;
        continue;
      }
      if (nextJson !== prevJson) {
        parsed.settings = normalized;
        fs.writeFileSync(filePath, stableStringify(parsed as JsonValue) + "\n");
        updated += 1;
      }
    }
  }
  logger.info({ updated, forced }, "Manifest migration complete.");
};

const main = () => {
  migrateDb();
  migrateManifests();
};

main();
