import { NextResponse } from "next/server";
import {
  contentPaths,
  getUserContentPaths,
  getUserManifestsDir,
  getUserRendersRootDir,
  getUserVideosDir,
} from "@/lib/content/store";
import { getContentStats } from "@/lib/data/content";
import {
  resolveCaptionBackendSetting,
  settingsUpdateRequestSchema,
  updateSettings,
} from "@/lib/data/settings";
import { emitSettingsUpdated } from "@/lib/socket/manager";
import { getStorage } from "@/lib/storage";
import z from "zod";

const storage = getStorage();

const countFiles = async (key: string) => {
  const entries = await storage.list(key);
  return entries.length;
};

export const handleGetSettings = async (userId: string) => {
  const stats = await getContentStats(userId);
  const userPaths = getUserContentPaths(userId);
  const [uploadsCount, rendersCount, manifestsCount] = await Promise.all([
    countFiles(getUserVideosDir(userId)),
    countFiles(getUserRendersRootDir(userId)),
    countFiles(getUserManifestsDir(userId)),
  ]);

  const captionBackend = await resolveCaptionBackendSetting();

  return NextResponse.json({
    storage: {
      baseDir: contentPaths.baseDir,
      uploadsDir: userPaths.videosDir,
      rendersDir: userPaths.rendersDir,
      manifestsDir: userPaths.manifestsDir,
      uploadsCount,
      rendersCount,
      manifestsCount,
    },
    stats,
    captions: {
      backend: captionBackend,
      defaultLanguage: process.env.CAPTION_DEFAULT_LANGUAGE?.trim() || "en",
      autoOnUpload:
        process.env.CAPTION_AUTO_ON_UPLOAD?.trim().toLowerCase() === "true",
      localModel: process.env.CAPTION_LOCAL_WHISPER_MODEL?.trim() || undefined,
    },
  });
};

export const handleUpdateSettings = async (request: Request, userId: string) => {
  const parsed = settingsUpdateRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid settings payload.",
        details: z.treeifyError(parsed.error),
      },
      { status: 400 }
    );
  }
  const payload = parsed.data;
  const updatedSettings = await updateSettings(
    {
      captions: {
        backend: payload.captions.backend,
      },
    },
    userId
  );
  emitSettingsUpdated({
    userId,
    settings: updatedSettings,
  });
  const response = await handleGetSettings(userId);
  const body = await response.json();
  return NextResponse.json({ ok: true, settings: body });
};
