import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import { contentPaths } from "@/lib/content-store";
import { getContentStats } from "@/lib/data/content";

export const runtime = "nodejs";

const countFiles = async (path: string) => {
  try {
    const entries = await fs.readdir(path);
    return entries.length;
  } catch {
    return 0;
  }
};

export async function GET() {
  const stats = await getContentStats();
  const [uploadsCount, rendersCount, manifestsCount] = await Promise.all([
    countFiles(contentPaths.videosDir),
    countFiles(contentPaths.rendersDir),
    countFiles(contentPaths.manifestsDir),
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
