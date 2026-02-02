import { NextResponse } from "next/server";
import {
  ensureContentStore,
  findContentAssetPath,
  getContentManifestsDir,
} from "@/lib/content-store";
import {
  contentCreateSchema,
  createContentItem,
  getContentItem,
} from "@/lib/data/content";
import { getStorage, storageKey } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST() {
  await ensureContentStore();
  const storage = getStorage();
  const manifestsDir = getContentManifestsDir();
  const files = await storage.list(manifestsDir);
  if (files.length === 0) {
    return NextResponse.json(
      { created: 0, skipped: 0, errors: ["Manifest directory not found."] },
      { status: 404 }
    );
  }

  const manifestFiles = files.filter((file) => file.endsWith(".json"));
  let created = 0;
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
      const candidate = {
        id: data.id,
        title: data.title ?? "Recovered",
        status: data.status ?? "uploaded",
        colorPalette: Array.isArray(data.colorPalette) ? data.colorPalette : null,
        paletteMode: data.paletteMode === "manual" ? "manual" : "auto",
        songDurationSeconds: data.songDurationSeconds ?? 0,
        segmentDurationSeconds: data.segmentDurationSeconds ?? 4,
        fadeDurationSeconds: data.fadeDurationSeconds ?? 1,
        introFadeSeconds: data.introFadeSeconds ?? 0,
        outroFadeSeconds: data.outroFadeSeconds ?? 0,
        audioFadeInSeconds: data.audioFadeInSeconds ?? 0,
        audioFadeOutSeconds: data.audioFadeOutSeconds ?? 0,
        audioFadeInOffsetSeconds: data.audioFadeInOffsetSeconds ?? 0,
        audioFadeOutOffsetSeconds: data.audioFadeOutOffsetSeconds ?? 0,
        scalePercent: data.scalePercent ?? 100,
        visualizationEnabled: data.visualizationEnabled ?? true,
        visualizationBars: data.visualizationBars ?? 128,
        videoDurationSeconds: data.videoDurationSeconds ?? 0,
        overlapRatio: data.overlapRatio ?? null,
        playbackRate: data.playbackRate ?? 1,
        fps: data.fps ?? 30,
        width: data.width ?? 1280,
        height: data.height ?? 720,
      };
      const parsed = contentCreateSchema.parse(candidate);
      const existing = await getContentItem(parsed.id);
      if (existing) {
        skipped += 1;
        continue;
      }
      const [thumbOk, videoOk, songOk] = await Promise.all([
        findContentAssetPath(parsed.id, "thumbnail"),
        findContentAssetPath(parsed.id, "video"),
        findContentAssetPath(parsed.id, "song"),
      ]);
      if (!thumbOk || !videoOk || !songOk) {
        skipped += 1;
        errors.push(`Missing files for ${parsed.id}`);
        continue;
      }
      await createContentItem(parsed);
      created += 1;
    } catch (error) {
      errors.push(
        `Failed to import ${entry.file}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  return NextResponse.json({ created, skipped, errors });
}
