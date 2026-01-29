import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getContentRenderDir, resolveContentPath } from "@/lib/content-store";
import { getContentItem } from "@/lib/data/content";

export const runtime = "nodejs";

const parsePositiveInt = (value: string | null, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getContentItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const limitRaw = parsePositiveInt(searchParams.get("limit"), 20);
  const limit = Math.min(100, Math.max(1, limitRaw));

  const renderDir = resolveContentPath(getContentRenderDir(id));
  let entries: string[] = [];
  try {
    entries = await fs.readdir(renderDir);
  } catch {
    return NextResponse.json({
      page,
      limit,
      total: 0,
      items: [],
    });
  }

  const candidates = entries.filter((entry) => entry.toLowerCase().endsWith(".mp4"));
  const stats = (
    await Promise.all(
      candidates.map(async (name) => {
        const absolutePath = path.join(renderDir, name);
        try {
          const stat = await fs.stat(absolutePath);
          return {
            name,
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          };
        } catch {
          return null;
        }
      })
    )
  ).filter((entry): entry is { name: string; size: number; mtimeMs: number } =>
    Boolean(entry)
  );

  stats.sort((a, b) => b.mtimeMs - a.mtimeMs);
  const total = stats.length;
  const start = (page - 1) * limit;
  const end = start + limit;
  const items = stats.slice(start, end).map((entry) => ({
    name: entry.name,
    size: entry.size,
    mtimeMs: entry.mtimeMs,
    assetUrl: `/api/content/${id}/asset?type=render&name=${encodeURIComponent(
      entry.name
    )}`,
  }));

  return NextResponse.json({
    page,
    limit,
    total,
    items,
  });
}
