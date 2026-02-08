import { randomUUID } from "crypto";
import path from "path";
import { NextResponse } from "next/server";
import { getUserUploadsDir } from "@/lib/content/store";
import { getStorage, storageKey } from "@/lib/storage";
import { getSessionUser } from "@/lib/auth/session";

export const runtime = "nodejs";

const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;
const storage = getStorage();
const getDraftBaseDir = (userId: string) =>
  storageKey(getUserUploadsDir(userId), "drafts");

const ensureDraftDirs = async (userId: string) => {
  const draftBaseDir = getDraftBaseDir(userId);
  await storage.ensureDir(storageKey(draftBaseDir, "thumbnails"));
  await storage.ensureDir(storageKey(draftBaseDir, "videos"));
  await storage.ensureDir(storageKey(draftBaseDir, "songs"));
};

const cleanupDrafts = async (userId: string) => {
  const draftBaseDir = getDraftBaseDir(userId);
  const now = Date.now();
  const entries = await storage.list(draftBaseDir);
  await Promise.all(
    entries.map(async (entry) => {
      const dirKey = storageKey(draftBaseDir, entry);
      const files = await storage.list(dirKey);
      await Promise.all(
        files.map(async (file) => {
          const fileKey = storageKey(dirKey, file);
          const stats = await storage.stat(fileKey);
          if (!stats) return;
          if (now - stats.mtimeMs > DRAFT_TTL_MS) {
            await storage.deleteFile(fileKey);
          }
        })
      );
    })
  );
};

const writeDraft = async (
  userId: string,
  file: File,
  kind: "thumbnail" | "video" | "song"
) => {
  const extension = path.extname(file.name || "");
  const id = randomUUID();
  const fileName = `${id}${extension || ""}`;
  const draftBaseDir = getDraftBaseDir(userId);
  const targetDir = storageKey(draftBaseDir, `${kind}s`);
  const targetPath = storageKey(targetDir, fileName);
  const buffer = Buffer.from(await file.arrayBuffer());

  await storage.ensureDir(targetDir);
  await storage.writeFile(targetPath, buffer);

  return targetPath;
};

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await ensureDraftDirs(user.id);
  await cleanupDrafts(user.id);

  const formData = await request.formData();
  const file = formData.get("file");
  const kind = formData.get("kind");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file." }, { status: 400 });
  }
  if (kind !== "thumbnail" && kind !== "video" && kind !== "song") {
    return NextResponse.json({ error: "Invalid kind." }, { status: 400 });
  }

  const path = await writeDraft(user.id, file, kind);
  return NextResponse.json({
    path,
    kind,
    expiresAt: Date.now() + DRAFT_TTL_MS,
  });
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as
    | { path?: string }
    | null;
  if (!body?.path) {
    return NextResponse.json({ error: "Missing path." }, { status: 400 });
  }
  const draftBaseDir = getDraftBaseDir(user.id);
  if (!body.path.startsWith(draftBaseDir)) {
    return NextResponse.json({ error: "Invalid path." }, { status: 400 });
  }
  await storage.deleteFile(body.path);
  return NextResponse.json({ ok: true });
}
