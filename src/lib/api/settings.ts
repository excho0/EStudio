import { NextResponse } from "next/server";
import {
  contentPaths,
  getUserContentPaths,
  getUserManifestsDir,
  getUserRendersRootDir,
  getUserVideosDir,
} from "@/lib/content/store";
import { getContentStats } from "@/lib/data/content";
import { getStorage } from "@/lib/storage";

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
  });
};
