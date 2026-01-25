import { createReadStream, promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { findContentAssetPath, resolveContentPath } from "@/lib/content-store";
import { getContentItem } from "@/lib/data/content";
import { Readable } from "stream";

export const runtime = "nodejs";

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

  const relativePath =
    type === "render"
      ? item.renderPath
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
