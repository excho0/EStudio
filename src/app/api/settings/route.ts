import { NextResponse } from "next/server";
import {
  contentPaths,
  getUserContentPaths,
  getUserManifestsDir,
  getUserRendersRootDir,
  getUserVideosDir,
} from "@/lib/content-store";
import { getContentStats } from "@/lib/data/content";
import { getStorage } from "@/lib/storage";
import { getSessionUser } from "@/lib/auth-session";

export const runtime = "nodejs";

const storage = getStorage();

const countFiles = async (key: string) => {
  const entries = await storage.list(key);
  return entries.length;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await getContentStats(user.id);
  const userPaths = getUserContentPaths(user.id);
  const [uploadsCount, rendersCount, manifestsCount] = await Promise.all([
    countFiles(getUserVideosDir(user.id)),
    countFiles(getUserRendersRootDir(user.id)),
    countFiles(getUserManifestsDir(user.id)),
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
}
