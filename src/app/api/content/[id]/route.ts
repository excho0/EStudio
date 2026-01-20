import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import {
  resolveContentPath,
} from "@/lib/content-store";
import { emitContentUpdate } from "@/lib/socket";
import {
  deleteContentItem,
  getContentItem,
  updateContentItem,
} from "@/lib/data/content";

export const runtime = "nodejs";

const safeUnlink = async (relativePath?: string | null) => {
  if (!relativePath) return;
  const absolutePath = resolveContentPath(relativePath);
  await fs.rm(absolutePath, { force: true });
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getContentItem(id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(item);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const payload = await request.json();
  const updated = await updateContentItem(id, payload);

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  emitContentUpdate({ type: "content:updated", id });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await getContentItem(id);

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await Promise.all([
    safeUnlink(item.thumbnailPath),
    safeUnlink(item.videoPath),
    safeUnlink(item.songPath),
    safeUnlink(item.renderPath ?? undefined),
  ]);

  await deleteContentItem(id);

  emitContentUpdate({ type: "content:deleted", id });

  return NextResponse.json({ ok: true });
}
