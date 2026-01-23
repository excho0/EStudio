import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { contentPaths, resolveContentPath } from "@/lib/content-store";

export const runtime = "nodejs";

const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;
const draftBaseDir = path.join(contentPaths.uploadsDir, "drafts");

const ensureDraftDirs = async () => {
  await fs.mkdir(path.join(draftBaseDir, "thumbnails"), { recursive: true });
  await fs.mkdir(path.join(draftBaseDir, "videos"), { recursive: true });
  await fs.mkdir(path.join(draftBaseDir, "songs"), { recursive: true });
};

const cleanupDrafts = async () => {
  const now = Date.now();
  const entries = await fs.readdir(draftBaseDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isDirectory()) return;
      const dir = path.join(draftBaseDir, entry.name);
      const files = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      await Promise.all(
        files.map(async (file) => {
          if (!file.isFile()) return;
          const filePath = path.join(dir, file.name);
          const stats = await fs.stat(filePath).catch(() => null);
          if (!stats) return;
          if (now - stats.mtimeMs > DRAFT_TTL_MS) {
            await fs.rm(filePath, { force: true });
          }
        })
      );
    })
  );
};

const writeDraft = async (file: File, kind: "thumbnail" | "video" | "song") => {
  const extension = path.extname(file.name || "");
  const id = randomUUID();
  const fileName = `${id}${extension || ""}`;
  const targetDir = path.join(draftBaseDir, `${kind}s`);
  const targetPath = path.join(targetDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await fs.mkdir(targetDir, { recursive: true });
  await fs.writeFile(targetPath, buffer);

  return path.relative(contentPaths.baseDir, targetPath);
};

export async function POST(request: Request) {
  await ensureDraftDirs();
  await cleanupDrafts();

  const formData = await request.formData();
  const file = formData.get("file");
  const kind = formData.get("kind");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (kind !== "thumbnail" && kind !== "video" && kind !== "song") {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }

  const path = await writeDraft(file, kind);
  return NextResponse.json({
    path,
    kind,
    expiresAt: Date.now() + DRAFT_TTL_MS,
  });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { path?: string }
    | null;
  if (!body?.path) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }
  const absolutePath = resolveContentPath(body.path);
  await fs.rm(absolutePath, { force: true });
  return NextResponse.json({ ok: true });
}
