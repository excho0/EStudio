import { promises as fs } from "fs";
import path from "path";

const baseDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(baseDir, "uploads");
const rendersDir = path.join(baseDir, "renders");
const manifestsDir = path.join(baseDir, "manifests");
const videosDir = path.join(uploadsDir, "videos");
export const contentPaths = {
  baseDir,
  uploadsDir,
  rendersDir,
  manifestsDir,
  videosDir,
};

export const resolveContentPath = (relativePath: string) =>
  path.join(baseDir, relativePath);

export type ContentAssetKind = "thumbnail" | "video" | "song";

export async function ensureContentStore() {
  await fs.mkdir(videosDir, { recursive: true });
  await fs.mkdir(rendersDir, { recursive: true });
  await fs.mkdir(manifestsDir, { recursive: true });
}

export function getContentAssetPath(
  id: string,
  kind: ContentAssetKind,
  extension: string
) {
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `${kind}${safeExtension}`;
  return path.join("uploads", "videos", id, fileName);
}

export function getContentAssetDir(id: string) {
  return path.join("uploads", "videos", id);
}

export function getContentRenderPath(id: string, fileName: string) {
  return path.join("renders", id, fileName);
}

export function getContentRenderDir(id: string) {
  return path.join("renders", id);
}

export async function findLatestRenderPath(id: string) {
  const dir = resolveContentPath(getContentRenderDir(id));
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const candidates = entries.filter((entry) => entry.toLowerCase().endsWith(".mp4"));
  if (candidates.length === 0) return null;

  let latest: { name: string; mtimeMs: number } | null = null;
  for (const name of candidates) {
    try {
      const stat = await fs.stat(path.join(dir, name));
      if (!latest || stat.mtimeMs > latest.mtimeMs) {
        latest = { name, mtimeMs: stat.mtimeMs };
      }
    } catch {
      continue;
    }
  }

  return latest ? path.join(getContentRenderDir(id), latest.name) : null;
}

export async function findContentAssetPath(
  id: string,
  kind: ContentAssetKind
) {
  const dir = resolveContentPath(getContentAssetDir(id));
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return null;
  }
  const match = entries.find((entry) => entry.startsWith(`${kind}.`));
  return match ? path.join("uploads", "videos", id, match) : null;
}

export async function removeContentAssetFiles(
  id: string,
  kind: ContentAssetKind
) {
  const dir = resolveContentPath(getContentAssetDir(id));
  let entries: string[] = [];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  const targets = entries.filter((entry) => entry.startsWith(`${kind}.`));
  await Promise.all(
    targets.map((entry) => fs.rm(path.join(dir, entry), { force: true }))
  );
}

export async function removeContentAssets(id: string) {
  const dir = resolveContentPath(getContentAssetDir(id));
  await fs.rm(dir, { force: true, recursive: true });
}

export async function writeContentManifest(
  id: string,
  data: Record<string, unknown>
) {
  await fs.mkdir(manifestsDir, { recursive: true });
  const manifestPath = path.join(manifestsDir, `${id}.json`);
  const payload = {
    version: 1,
    ...data,
  };
  await fs.writeFile(manifestPath, JSON.stringify(payload, null, 2));
}

export async function deleteContentManifest(id: string) {
  const manifestPath = path.join(manifestsDir, `${id}.json`);
  await fs.rm(manifestPath, { force: true });
}
