import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getContentRenderDir, resolveContentPath } from "@/lib/content-store";
import { getContentItem } from "@/lib/data/content";

export const runtime = "nodejs";

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

  const renderDir = resolveContentPath(getContentRenderDir(id));
  const targetPath = path.join(renderDir, safeName);
  await fs.rm(targetPath, { force: true });

  return NextResponse.json({ ok: true });
}
