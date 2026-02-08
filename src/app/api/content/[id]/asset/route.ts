import path from "path";
import { NextResponse } from "next/server";
import {
  findContentAssetPath,
  findLatestRenderPath,
  getContentRenderDir,
} from "@/lib/content-store";
import { getContentItem, getContentItemById } from "@/lib/data/content";
import { getStorage } from "@/lib/storage";
import { getSessionUser } from "@/lib/auth-session";
import { verifyContentAssetToken } from "@/lib/content-asset-token";
import type { AssetCacheEntry } from "@/types";
import type { ReadStream } from "fs";

export const runtime = "nodejs";

const assetCache = new Map<string, AssetCacheEntry>();
let assetCacheSize = 0;
const maxCacheMb = Number(process.env.ASSET_MEMORY_CACHE_MAX_MB ?? "128");
const maxCacheBytes = Number.isFinite(maxCacheMb)
  ? Math.max(0, maxCacheMb) * 1024 * 1024
  : 0;

const storage = getStorage();
const assetMetaCache = new Map<
  string,
  {
    relativePath: string;
    size: number;
    mtimeMs: number;
    contentType: string;
    canRange: boolean;
    expiresAt: number;
  }
>();
const assetMetaTtlMs = Math.max(
  250,
  Number(process.env.ASSET_METADATA_CACHE_TTL_MS ?? "5000")
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, Content-Type",
  "Cross-Origin-Resource-Policy": "cross-origin",
  "Timing-Allow-Origin": "*",
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
  ".flac": "audio/flac",
  ".aac": "audio/aac",
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
    if (existing) assetCacheSize -= existing.size;
  }
  assetCache.set(key, cached);
  assetCacheSize += cached.size;

  if (assetCacheSize <= maxCacheBytes) return;

  // LRU eviction
  const entries = Array.from(assetCache.entries()).sort(
    (a, b) => a[1].accessedAt - b[1].accessedAt
  );
  for (const [entryKey, value] of entries) {
    assetCache.delete(entryKey);
    assetCacheSize -= value.size;
    if (assetCacheSize <= maxCacheBytes) break;
  }
};

/**
 * Abort-safe Node stream -> Web ReadableStream bridge.
 * Fixes: "Controller is already closed" when client cancels / seeks / range-switches.
 */
const nodeStreamToWeb = (nodeStream: ReadStream, signal: AbortSignal) => {
  const typedStream = nodeStream as NodeJS.ReadableStream & {
    destroy?: () => void;
    pause?: () => void;
    resume?: () => void;
  };
  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const cleanup = () => {
        nodeStream.off("data", onData);
        nodeStream.off("end", onEnd);
        nodeStream.off("close", onClose);
        nodeStream.off("error", onError);
        signal.removeEventListener("abort", onAbort);
      };

      const safeClose = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.close();
        } catch {
          // ignore "already closed"
        }
      };

      const safeError = (err: unknown) => {
        if (closed) return;
        closed = true;
        cleanup();
        try {
          controller.error(err);
        } catch {
          // ignore
        }
      };

      const onAbort = () => {
        // Client went away (seek/cancel/navigation). Stop reading immediately.
        try {
          nodeStream.destroy();
        } catch {
          // ignore
        }
        safeClose();
      };

      const onData = (chunk: string | Buffer) => {
        if (closed) return;

        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;

        try {
          controller.enqueue(new Uint8Array(buf));
        } catch {
          try {
            typedStream.destroy?.();
          } catch {}
          safeClose();
          return;
        }

        if (controller.desiredSize !== null && controller.desiredSize <= 0) {
          typedStream.pause?.();
        }
      };


      const onEnd = () => safeClose();
      const onClose = () => safeClose();
      const onError = (err: unknown) => safeError(err);

      signal.addEventListener("abort", onAbort);

      nodeStream.on("data", onData);
      nodeStream.on("end", onEnd);
      nodeStream.on("close", onClose);
      nodeStream.on("error", onError);
    },
    pull() {
      try {
        typedStream.resume?.();
      } catch {}
    },

    cancel() {
      // Consumer cancelled (common with Range changes).
      try {
        nodeStream.destroy();
      } catch {
        // ignore
      }
    },
  });
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);

  const token = searchParams.get("token");
  const tokenPayload = token ? verifyContentAssetToken(token) : null;

  if (token && !tokenPayload) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const isTokenAccess = Boolean(tokenPayload && tokenPayload.contentId === id);
  const user = isTokenAccess ? null : await getSessionUser();
  const item = isTokenAccess
    ? await getContentItemById(id)
    : user
      ? await getContentItem(user.id, id)
      : null;

  if (!item) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const userId = item.userId;
  if (!userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }

  if (tokenPayload && tokenPayload.userId !== userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
  }

  const type = searchParams.get("type");
  const renderName = searchParams.get("name");
  const metaCacheKey = [
    userId,
    item.id,
    type ?? "video",
    renderName ?? "",
  ].join(":");
  const now = Date.now();
  const cachedMeta = assetMetaCache.get(metaCacheKey);

  let relativePath: string | null = null;
  let stat: { size: number; mtimeMs: number } | null = null;
  let contentType = "application/octet-stream";
  let canRange = false;

  if (cachedMeta && cachedMeta.expiresAt > now) {
    relativePath = cachedMeta.relativePath;
    stat = { size: cachedMeta.size, mtimeMs: cachedMeta.mtimeMs };
    contentType = cachedMeta.contentType;
    canRange = cachedMeta.canRange;
  } else {
    relativePath =
      type === "render"
        ? renderName
          ? (() => {
              const safeName = path.basename(renderName);
              if (
                safeName !== renderName ||
                !safeName.toLowerCase().endsWith(".mp4")
              ) {
                return null;
              }
              return path.join(getContentRenderDir(userId, item.id), safeName);
            })()
          : await findLatestRenderPath(userId, item.id)
        : await findContentAssetPath(
            userId,
            item.id,
            type === "thumbnail" ? "thumbnail" : type === "song" ? "song" : "video"
          );

    if (relativePath) {
      stat = await storage.stat(relativePath);
      if (stat) {
        const extension = path.extname(relativePath).toLowerCase();
        contentType = mimeByExtension[extension] ?? "application/octet-stream";
        canRange =
          contentType.startsWith("video/") || contentType.startsWith("audio/");
        assetMetaCache.set(metaCacheKey, {
          relativePath,
          size: stat.size,
          mtimeMs: stat.mtimeMs,
          contentType,
          canRange,
          expiresAt: now + assetMetaTtlMs,
        });
      }
    }
  }

  if (!relativePath) {
    return NextResponse.json(
      { error: "Asset not available" },
      { status: 404, headers: corsHeaders }
    );
  }

  if (!stat) {
    assetMetaCache.delete(metaCacheKey);
    return NextResponse.json(
      { error: "Asset not available" },
      { status: 404, headers: corsHeaders }
    );
  }

  const range = request.headers.get("range");

  // Range request
  if (range && canRange) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range.trim());
    if (!match) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...corsHeaders,
          "Content-Range": `bytes */${stat.size}`,
        },
      });
    }

    const start = Number(match[1]);
    const requestedEnd = match[2] ? Number(match[2]) : stat.size - 1;

    if (
      Number.isNaN(start) ||
      Number.isNaN(requestedEnd) ||
      start < 0 ||
      requestedEnd < 0 ||
      start >= stat.size
    ) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...corsHeaders,
          "Content-Range": `bytes */${stat.size}`,
        },
      });
    }

    const end = Math.min(requestedEnd, stat.size - 1);
    if (start > end) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...corsHeaders,
          "Content-Range": `bytes */${stat.size}`,
        },
      });
    }

    const chunkSize = end - start + 1;

    const nodeStream = storage.createReadStream(relativePath, { start, end });
    const webStream = nodeStreamToWeb(nodeStream as unknown as ReadStream, request.signal);

    return new NextResponse(webStream, {
      status: 206,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": String(chunkSize),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  }

  // Small assets cache (audio/images only)
  if (shouldCacheAsset(contentType, stat.size)) {
    const cacheKey = relativePath;
    const cached = assetCache.get(cacheKey);

    if (cached && cached.mtimeMs === stat.mtimeMs) {
      cached.accessedAt = Date.now();
        return new NextResponse(new Uint8Array(cached.buffer), {
          headers: {
            ...corsHeaders,
            "Content-Type": cached.contentType,
            "Content-Length": String(cached.size),
            "Accept-Ranges": canRange ? "bytes" : "none",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
    }

    const buffer = await storage.readFile(relativePath);
    cacheAsset(cacheKey, {
      buffer,
      contentType,
      size: buffer.length,
      mtimeMs: stat.mtimeMs,
    });

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Content-Length": String(buffer.length),
        "Accept-Ranges": canRange ? "bytes" : "none",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });

  }

  // Normal stream (non-range)
  const nodeStream = storage.createReadStream(relativePath);
  const webStream = nodeStreamToWeb(nodeStream as unknown as ReadStream, request.signal);

  return new NextResponse(webStream, {
    headers: {
      ...corsHeaders,
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Accept-Ranges": canRange ? "bytes" : "none",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
