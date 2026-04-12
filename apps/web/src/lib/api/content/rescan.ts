import { NextResponse } from "next/server";
import {
  ensureContentStore,
  findContentAssetPath,
  getUserManifestsDir,
} from "@/lib/content/store";
import {
  contentCreateSchema,
  createContentItem,
  getContentItem,
  updateContentItem,
} from "@/lib/data/content";
import {
  DEFAULT_CONTENT_MODE,
  getContentMode,
  getOutputDefaultsForMode,
  normalizeSettingsMap,
  resolveContentSettings,
  setSharedContentSettings,
  stripSharedScopedKeys,
} from "@/lib/content/modes";
import { getStorage, storageKey } from "@/lib/storage";

const toNumber = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toPositiveInt = (value: unknown): number | undefined => {
  const parsed = toNumber(value);
  if (parsed === undefined || parsed <= 0) return undefined;
  return Math.round(parsed);
};

const toNonNegative = (value: unknown, fallback = 0) => {
  const parsed = toNumber(value);
  if (parsed === undefined || parsed < 0) return fallback;
  return parsed;
};

const pickStatus = (value: unknown) => {
  if (
    value === "uploaded" ||
    value === "rendering" ||
    value === "rendered" ||
    value === "failed"
  ) {
    return value;
  }
  return "uploaded" as const;
};

const recoverSettingsMap = (mode: string | undefined, raw: Record<string, unknown>) => {
  const resolvedMode = mode || DEFAULT_CONTENT_MODE;
  const legacyOutput = {
    fps: toPositiveInt(raw.fps),
    width: toPositiveInt(raw.width),
    height: toPositiveInt(raw.height),
  };

  let normalized = normalizeSettingsMap(resolvedMode, raw.settings);
  const currentScoped =
    (normalized[resolvedMode] as Record<string, unknown> | undefined) ?? {};
  const outputDefaults = getOutputDefaultsForMode(resolvedMode, currentScoped);
  const scopedOutput =
    currentScoped.outputConfig &&
    typeof currentScoped.outputConfig === "object" &&
    !Array.isArray(currentScoped.outputConfig)
      ? (currentScoped.outputConfig as Record<string, unknown>)
      : {};

  const outputConfig = {
    ...scopedOutput,
    fps: legacyOutput.fps ?? outputDefaults.fps,
    width: legacyOutput.width ?? outputDefaults.width,
    height: legacyOutput.height ?? outputDefaults.height,
  };

  normalized = {
    ...normalized,
    [resolvedMode]: {
      ...currentScoped,
      outputConfig,
      fadeDurationSeconds:
        toNonNegative(currentScoped.fadeDurationSeconds ?? raw.fadeDurationSeconds, 1) ?? 1,
      introFadeSeconds:
        toNonNegative(currentScoped.introFadeSeconds ?? raw.introFadeSeconds, 0) ?? 0,
      outroFadeSeconds:
        toNonNegative(currentScoped.outroFadeSeconds ?? raw.outroFadeSeconds, 0) ?? 0,
      audioFadeInSeconds:
        toNonNegative(currentScoped.audioFadeInSeconds ?? raw.audioFadeInSeconds, 0) ?? 0,
      audioFadeOutSeconds:
        toNonNegative(currentScoped.audioFadeOutSeconds ?? raw.audioFadeOutSeconds, 0) ?? 0,
      audioFadeInOffsetSeconds:
        toNonNegative(
          currentScoped.audioFadeInOffsetSeconds ?? raw.audioFadeInOffsetSeconds,
          0
        ) ?? 0,
      audioFadeOutOffsetSeconds:
        toNonNegative(
          currentScoped.audioFadeOutOffsetSeconds ?? raw.audioFadeOutOffsetSeconds,
          0
        ) ?? 0,
      scalePercent: toNonNegative(currentScoped.scalePercent ?? raw.scalePercent, 100) ?? 100,
      visualizationEnabled:
        typeof currentScoped.visualizationEnabled === "boolean"
          ? currentScoped.visualizationEnabled
          : typeof raw.visualizationEnabled === "boolean"
            ? raw.visualizationEnabled
            : true,
      visualizationBars:
        toPositiveInt(currentScoped.visualizationBars ?? raw.visualizationBars) ?? 128,
      playbackRate: toNumber(currentScoped.playbackRate ?? raw.playbackRate) ?? 1,
    },
  };

  normalized = setSharedContentSettings(normalized, {
    segmentDurationSeconds:
      toNonNegative(currentScoped.segmentDurationSeconds ?? raw.segmentDurationSeconds, 4) ?? 4,
  });
  normalized = stripSharedScopedKeys(normalized, ["segmentDurationSeconds"]);

  const resolved = resolveContentSettings(resolvedMode, normalized);
  return {
    mode: resolved.mode,
    settings: stripSharedScopedKeys(
      {
        ...normalized,
        [resolved.mode]: resolved.settings as Record<string, unknown>,
      } as Record<string, Record<string, unknown>>,
      ["segmentDurationSeconds"]
    ),
  };
};

export const handleRescanContent = async (userId: string) => {
  await ensureContentStore(userId);
  const storage = getStorage();
  const manifestsDir = getUserManifestsDir(userId);
  const files = await storage.list(manifestsDir);
  if (files.length === 0) {
    return NextResponse.json(
      { created: 0, skipped: 0, errors: ["Manifest directory not found."] },
      { status: 404 }
    );
  }

  const manifestFiles = files.filter((file) => file.endsWith(".json"));
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  const manifestEntries: Array<{
    file: string;
    data: Record<string, unknown>;
    sortTime: number;
  }> = [];

  for (const file of manifestFiles) {
    try {
      const manifestPath = storageKey(manifestsDir, file);
      const [raw, stat] = await Promise.all([
        storage.readFile(manifestPath),
        storage.stat(manifestPath),
      ]);
      if (!stat) {
        throw new Error("Missing manifest stat.");
      }
      const text = raw.toString("utf-8");
      const data = JSON.parse(text) as Record<string, unknown>;
      const createdAt =
        typeof data.createdAt === "string" ? Date.parse(data.createdAt) : NaN;
      const sortTime = Number.isFinite(createdAt) ? createdAt : stat.mtimeMs;
      manifestEntries.push({ file, data, sortTime });
    } catch (error) {
      errors.push(
        `Failed to read ${file}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      skipped += 1;
    }
  }

  manifestEntries.sort((a, b) => a.sortTime - b.sortTime);

  for (const entry of manifestEntries) {
    try {
      const data = entry.data;
      const id = typeof data.id === "string" && data.id.length > 0 ? data.id : "";
      if (!id) {
        skipped += 1;
        errors.push(`Skipping ${entry.file}: missing content id.`);
        continue;
      }
      const mode = typeof data.mode === "string" && data.mode ? data.mode : DEFAULT_CONTENT_MODE;
      const recovered = recoverSettingsMap(mode, data);
      const modeDefinition = getContentMode(recovered.mode);
      const candidate = {
        id,
        title: data.title ?? "Recovered",
        status: pickStatus(data.status),
        colorPalette: Array.isArray(data.colorPalette) ? data.colorPalette : null,
        paletteMode: data.paletteMode === "manual" ? "manual" : "auto",
        mode: recovered.mode,
        settings: recovered.settings,
        songDurationSeconds: toNonNegative(data.songDurationSeconds, 0),
        userId,
      };
      const parsed = contentCreateSchema.parse(candidate);
      const existing = await getContentItem(userId, parsed.id);
      const requiredAssets = modeDefinition.requiredAssets;
      const assetChecks = await Promise.all(
        requiredAssets.map((assetType) => findContentAssetPath(userId, parsed.id, assetType))
      );
      if (assetChecks.some((exists) => !exists)) {
        skipped += 1;
        errors.push(`Missing required assets for ${parsed.id} (${requiredAssets.join(", ")}).`);
        continue;
      }
      if (existing) {
        await updateContentItem(userId, parsed.id, {
          mode: parsed.mode,
          settings: parsed.settings,
          songDurationSeconds: parsed.songDurationSeconds,
          paletteMode: parsed.paletteMode,
          colorPalette: parsed.colorPalette ?? null,
        });
        updated += 1;
      } else {
        await createContentItem(parsed);
        created += 1;
      }
    } catch (error) {
      errors.push(
        `Failed to import ${entry.file}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return NextResponse.json({ created, updated, skipped, errors });
};
