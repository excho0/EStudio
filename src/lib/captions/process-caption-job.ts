import path from "path";
import { getLogger } from "@/lib/logging";
import { findContentAssetPath } from "@/lib/content/store";
import { getStorage } from "@/lib/storage";
import { getContentItem, updateContentItem } from "@/lib/data/content";
import {
  normalizeSettingsMap,
  resolveContentSettings,
  setSharedContentSettings,
} from "@/lib/content/modes";
import { emitCaptionUpdate } from "@/lib/socket/manager";
import { transcribeWithBackend } from "./backend";

const logger = getLogger("captions-job");
const storage = getStorage();

export const processCaptionJob = async ({
  id,
  userId,
  mode,
  backend,
  language,
}: {
  id: string;
  userId: string;
  mode: string;
  backend?: string;
  language?: string;
}) => {
  const item = await getContentItem(userId, id);
  if (!item) {
    throw new Error("Content not found.");
  }

  const resolved = resolveContentSettings(mode, item.settings ?? {});
  const activeMode = resolved.mode;
  const settings = resolved.settings as Record<string, unknown>;
  const captionsEnabled = settings.captionsEnabled !== false;
  if (!captionsEnabled) {
    logger.info({ id, userId, mode: activeMode }, "Skipping captions: disabled in mode settings.");
    return;
  }

  let lastPercent = -1;
  const emitProcessingProgress = (percent: number) => {
    const normalized = Math.max(0, Math.min(100, Math.round(percent)));
    if (normalized <= lastPercent) return;
    if (normalized < lastPercent + 1) return;
    lastPercent = normalized;
    emitCaptionUpdate({
      userId,
      id,
      mode: activeMode,
      status: "processing",
      progress: normalized / 100,
    });
  };
  emitProcessingProgress(1);

  try {
    const songPath = await findContentAssetPath(userId, id, "song");
    if (!songPath) {
      throw new Error("Song asset not found for caption generation.");
    }
    emitProcessingProgress(5);
    const audio = await storage.readFile(songPath);
    const fileName = path.basename(songPath);
    emitProcessingProgress(10);

    const captionDocument = await transcribeWithBackend({
      backend,
      userId,
      contentId: id,
      mode: activeMode,
      audio,
      fileName,
      language,
      onProgress: (progress) => {
        const normalizedProgress = Number.isFinite(progress)
          ? progress > 1
            ? progress / 100
            : progress
          : 0;
        const clamped = Math.max(0, Math.min(1, normalizedProgress));
        // Reserve 10-95% for transcription so we can still reflect final persist steps.
        const mapped = 10 + clamped * 85;
        emitProcessingProgress(mapped);
      },
    });
    emitProcessingProgress(95);

    const settingsMap = normalizeSettingsMap(activeMode, item.settings ?? {});
    const nextSettingsMap = setSharedContentSettings(settingsMap, {
      captionsData: captionDocument,
    });
    // Cleanup legacy mode-scoped field if present.
    const currentModeSettings =
      (nextSettingsMap[activeMode] as Record<string, unknown> | undefined) ?? {};
    if ("captionsData" in currentModeSettings) {
      const withoutLegacy = { ...currentModeSettings };
      delete withoutLegacy.captionsData;
      nextSettingsMap[activeMode] = withoutLegacy;
    }

    await updateContentItem(userId, id, {
      settings: nextSettingsMap,
    });
    emitProcessingProgress(99);
    emitCaptionUpdate({
      userId,
      id,
      mode: activeMode,
      status: "completed",
      progress: 1,
    });

    logger.info(
      { id, userId, mode: activeMode, segments: captionDocument.segments.length },
      "Caption generation completed."
    );
  } catch (error) {
    emitCaptionUpdate({
      userId,
      id,
      mode: activeMode,
      status: "failed",
      progress: 1,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};
