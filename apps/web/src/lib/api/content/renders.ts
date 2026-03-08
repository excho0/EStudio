import path from "path";
import { NextResponse } from "next/server";
import { getContentRenderDir } from "@/lib/content/store";
import { getRenderThumbnailPath } from "@/lib/rendering/render-thumbnail";
import { getContentItem } from "@/lib/data/content";
import { getStorage, storageKey } from "@/lib/storage";

const storage = getStorage();

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const handleListRenders = async (
  request: Request,
  userId: string,
  contentId: string
) => {
  const item = await getContentItem(userId, contentId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const limitRaw = parsePositiveInt(searchParams.get("limit"), 20);
  const limit = Math.min(100, Math.max(1, limitRaw));

  const renderDir = getContentRenderDir(userId, contentId);
  const entries = await storage.list(renderDir);
  if (entries.length === 0) {
    return NextResponse.json({ page, limit, total: 0, items: [] });
  }

  const candidates = entries.filter((entry) => entry.toLowerCase().endsWith(".mp4"));
  const stats = (
    await Promise.all(
      candidates.map(async (name) => {
        const stat = await storage.stat(storageKey(renderDir, name));
        if (!stat) return null;
        return { name, size: stat.size, mtimeMs: stat.mtimeMs };
      })
    )
  ).filter((entry): entry is { name: string; size: number; mtimeMs: number } =>
    Boolean(entry)
  );

  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const total = stats.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const items = await Promise.all(
    stats.slice(start, end).map(async (entry) => {
      const thumbnailKey = getRenderThumbnailPath(userId, contentId, entry.name);
      const thumbnailExists = await storage.exists(thumbnailKey);
      return {
        name: entry.name,
        size: entry.size,
        mtimeMs: entry.mtimeMs,
        assetUrl: `/api/content/${contentId}/asset?type=render&name=${encodeURIComponent(
          entry.name
        )}`,
        thumbnailUrl: thumbnailExists
          ? `/api/content/${contentId}/asset?type=render-thumbnail&name=${encodeURIComponent(entry.name)}`
          : null,
      };
    })
  );

  return NextResponse.json({ page, limit, total, items });
};

export const handleDeleteRender = async (
  userId: string,
  contentId: string,
  name: string
) => {
  const item = await getContentItem(userId, contentId);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safeName = path.basename(name);
  if (safeName !== name || !safeName.toLowerCase().endsWith(".mp4")) {
    return NextResponse.json({ error: "Invalid render name." }, { status: 400 });
  }

  const renderDir = getContentRenderDir(userId, contentId);
  const targetPath = storageKey(renderDir, safeName);
  const thumbnailPath = getRenderThumbnailPath(userId, contentId, safeName);
  await storage.deleteFile(targetPath);
  await storage.deleteFile(thumbnailPath);

  return NextResponse.json({ ok: true });
};
