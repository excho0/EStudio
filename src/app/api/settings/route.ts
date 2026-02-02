import { NextResponse } from "next/server";
import {
  contentKeys,
  contentPaths,
  getContentManifestsDir,
  getContentRendersRootDir,
} from "@/lib/content-store";
import { getContentStats } from "@/lib/data/content";
import { getStorage } from "@/lib/storage";

export const runtime = "nodejs";

const storage = getStorage();

const countFiles = async (key: string) => {
  const entries = await storage.list(key);
  return entries.length;
};

export async function GET() {
  const stats = await getContentStats();
  const [uploadsCount, rendersCount, manifestsCount] = await Promise.all([
    countFiles(contentKeys.videosDir),
    countFiles(getContentRendersRootDir()),
    countFiles(getContentManifestsDir()),
  ]);

  return NextResponse.json({
    storage: {
      baseDir: contentPaths.baseDir,
      uploadsDir: contentPaths.videosDir,
      rendersDir: contentPaths.rendersDir,
      manifestsDir: contentPaths.manifestsDir,
      uploadsCount,
      rendersCount,
      manifestsCount,
    },
    stats,
  });
}
