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

  const songPath = await findContentAssetPath(userId, id, "song");
  if (!songPath) {
    throw new Error("Song asset not found for caption generation.");
  }
  const audio = await storage.readFile(songPath);
  const fileName = path.basename(songPath);

  const captionDocument = await transcribeWithBackend({
    backend,
    userId,
    contentId: id,
    mode: activeMode,
    audio,
    fileName,
    language,
  });

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

  logger.info(
    { id, userId, mode: activeMode, segments: captionDocument.segments.length },
    "Caption generation completed."
  );
};
