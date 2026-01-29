import { createReadStream, promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import {
  findContentAssetPath,
  findLatestRenderPath,
  getContentRenderDir,
  resolveContentPath,
} from "@/lib/content-store";
import { getContentItem } from "@/lib/data/content";
import { Readable } from "stream";

export const runtime = "nodejs";

type AssetCacheEntry = {
  buffer: Buffer;
  contentType: string;
  size: number;
  mtimeMs: number;
  accessedAt: number;
};

const assetCache = new Map<string, AssetCacheEntry>();
let assetCacheSize = 0;
const maxCacheMb = Number(process.env.ASSET_MEMORY_CACHE_MAX_MB ?? "128");
const maxCacheBytes = Number.isFinite(maxCacheMb)
  ? Math.max(0, maxCacheMb) * 1024 * 1024
  : 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

const mimeByExtension: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const shouldCacheAsset = (contentType: string, size: number) => {
  if (maxCacheBytes <= 0) return false;
  if (size > maxCacheBytes) return false;
  return contentType.startsWith("audio/") || contentType.startsWith("image/");
};

const cacheAsset = (
  key: string,
  entry: Omit<AssetCacheEntry, "accessedAt">
) => {
  const cached: AssetCacheEntry = {
    ...entry,
    accessedAt: Date.now(),
  };
  if (assetCache.has(key)) {
    const existing = assetCache.get(key);
    if (existing) {
      assetCacheSize -= existing.size;
    }
  }
  assetCache.set(key, cached);
  assetCacheSize += cached.size;

  if (assetCacheSize <= maxCacheBytes) return;
  const entries = Array.from(assetCache.entries()).sort(
    (a, b) => a[1].accessedAt - b[1].accessedAt
  );
  for (const [entryKey, value] of entries) {
    assetCache.delete(entryKey);
    assetCacheSize -= value.size;
    if (assetCacheSize <= maxCacheBytes) break;
  }
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
  const type = searchParams.get("type");
  const renderName = searchParams.get("name");

  const relativePath =
    type === "render"
      ? renderName
        ? (() => {
            const safeName = path.basename(renderName);
            if (safeName !== renderName || !safeName.toLowerCase().endsWith(".mp4")) {
              return null;
            }
            return path.join(getContentRenderDir(item.id), safeName);
          })()
        : await findLatestRenderPath(item.id)
      : await findContentAssetPath(
          item.id,
          type === "thumbnail" ? "thumbnail" : type === "song" ? "song" : "video"
        );

  if (!relativePath) {
    return NextResponse.json({ error: "Asset not available" }, { status: 404 });
  }

  const absolutePath = resolveContentPath(relativePath);
  const stat = await fs.stat(absolutePath);
  const extension = path.extname(absolutePath).toLowerCase();
  const contentType = mimeByExtension[extension] ?? "application/octet-stream";
  const range = request.headers.get("range");
  const canRange = contentType.startsWith("video/") || contentType.startsWith("audio/");

  if (range && canRange) {
    const match = /bytes=(\d+)-(\d*)/.exec(range);
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${stat.size}`,
        },
      });
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stat.size - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": `bytes */${stat.size}`,
        },
      });
    }

    const safeEnd = Math.min(end, stat.size - 1);
    const chunkSize = safeEnd - start + 1;
    const stream = createReadStream(absolutePath, { start, end: safeEnd });

    return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${safeEnd}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  if (shouldCacheAsset(contentType, stat.size)) {
    const cacheKey = absolutePath;
    const cached = assetCache.get(cacheKey);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      cached.accessedAt = Date.now();
      return new NextResponse(cached.buffer, {
        headers: {
          ...corsHeaders,
          "Content-Type": cached.contentType,
          "Content-Length": String(cached.size),
          "Accept-Ranges": canRange ? "bytes" : "none",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    const buffer = await fs.readFile(absolutePath);
    cacheAsset(cacheKey, {
      buffer,
      contentType,
      size: buffer.length,
      mtimeMs: stat.mtimeMs,
    });
    return new NextResponse(buffer, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Accept-Ranges": canRange ? "bytes" : "none",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  const stream = createReadStream(absolutePath);
  return new NextResponse(Readable.toWeb(stream) as ReadableStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": canRange ? "bytes" : "none",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
