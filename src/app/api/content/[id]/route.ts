import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import {
  getContentItem,
  readContentIndex,
  writeContentIndex,
  resolveContentPath,
} from "@/lib/content-store";
import { emitContentUpdate } from "@/lib/socket";

export const runtime = "nodejs";

const safeUnlink = async (relativePath?: string) => {
  if (!relativePath) return;
  const absolutePath = resolveContentPath(relativePath);
  await fs.rm(absolutePath, { force: true });
};

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
    safeUnlink(item.renderPath),
  ]);

  const index = await readContentIndex();
  index.items = index.items.filter((entry) => entry.id !== id);
  await writeContentIndex(index);

  emitContentUpdate({ type: "content:deleted", id });

  return NextResponse.json({ ok: true });
}
