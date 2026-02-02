import path from "path";
import { NextResponse } from "next/server";
import { getContentRenderDir } from "@/lib/content-store";
import { getContentItem } from "@/lib/data/content";
import { getStorage, storageKey } from "@/lib/storage";
import { getSessionUser } from "@/lib/auth-session";

export const runtime = "nodejs";

const storage = getStorage();

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; name: string }> }
) {
  const { id, name } = await params;
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const item = await getContentItem(user.id, id);
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const safeName = path.basename(name);
  if (safeName !== name || !safeName.toLowerCase().endsWith(".mp4")) {
    return NextResponse.json({ error: "Invalid render name." }, { status: 400 });
  }

  const renderDir = getContentRenderDir(user.id, id);
  const targetPath = storageKey(renderDir, safeName);
  await storage.deleteFile(targetPath);

  return NextResponse.json({ ok: true });
}
