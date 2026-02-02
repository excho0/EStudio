import path from "path";
import { NextResponse } from "next/server";
import { getContentRenderDir } from "@/lib/content-store";
import { getContentItem } from "@/lib/data/content";
import { getStorage, storageKey } from "@/lib/storage";

export const runtime = "nodejs";

const storage = getStorage();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const item = await getContentItem(id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safeName = path.basename(name);
  if (safeName !== name || !safeName.toLowerCase().endsWith(".mp4")) {
    return NextResponse.json({ error: "Invalid render name." }, { status: 400 });
  }

  const renderDir = getContentRenderDir(id);
  const targetPath = storageKey(renderDir, safeName);
  await storage.deleteFile(targetPath);

  return NextResponse.json({ ok: true });
}
