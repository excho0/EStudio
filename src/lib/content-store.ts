import path from "path";

import { getStorage, resolveStoragePath, storageKey } from "@/lib/storage";

const storage = getStorage();
const baseDir = storage.baseDir;
const uploadsDir = storageKey("uploads");
const rendersDir = storageKey("renders");
const manifestsDir = storageKey("manifests");
const videosDir = storageKey("uploads", "videos");

export const contentPaths = {
  baseDir,
  uploadsDir: resolveStoragePath(uploadsDir),
  rendersDir: resolveStoragePath(rendersDir),
  manifestsDir: resolveStoragePath(manifestsDir),
  videosDir: resolveStoragePath(videosDir),
};

export const contentKeys = {
  uploadsDir,
  rendersDir,
  manifestsDir,
  videosDir,
};

export const resolveContentPath = (relativePath: string) =>
  resolveStoragePath(relativePath);

export type ContentAssetKind = "thumbnail" | "video" | "song";

export async function ensureContentStore() {
  await storage.ensureDir(videosDir);
  await storage.ensureDir(rendersDir);
  await storage.ensureDir(manifestsDir);
}

export function getContentAssetPath(
  id: string,
  kind: ContentAssetKind,
  extension: string
) {
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `${kind}${safeExtension}`;
  return storageKey("uploads", "videos", id, fileName);
}

export function getContentAssetDir(id: string) {
  return storageKey("uploads", "videos", id);
}

export function getContentRenderPath(id: string, fileName: string) {
  return storageKey("renders", id, fileName);
}

export function getContentRenderDir(id: string) {
  return storageKey("renders", id);
}

export function getContentUploadsDir() {
  return uploadsDir;
}

export function getContentRendersRootDir() {
  return rendersDir;
}

export function getContentManifestsDir() {
  return manifestsDir;
}

export async function findLatestRenderPath(id: string) {
  const dirKey = getContentRenderDir(id);
  const entries = await storage.list(dirKey);
  const candidates = entries.filter((entry) => entry.toLowerCase().endsWith(".mp4"));
  if (candidates.length === 0) return null;

  let latest: { name: string; mtimeMs: number } | null = null;
  for (const name of candidates) {
    const stat = await storage.stat(storageKey(dirKey, name));
    if (!stat) continue;
    if (!latest || stat.mtimeMs > latest.mtimeMs) {
      latest = { name, mtimeMs: stat.mtimeMs };
    }
  }

  return latest ? storageKey(getContentRenderDir(id), latest.name) : null;
}

export async function findContentAssetPath(
  id: string,
  kind: ContentAssetKind
) {
  const dirKey = getContentAssetDir(id);
  const entries = await storage.list(dirKey);
  const match = entries.find((entry) => entry.startsWith(`${kind}.`));
  return match ? storageKey("uploads", "videos", id, match) : null;
}

export async function removeContentAssetFiles(
  id: string,
  kind: ContentAssetKind
) {
  const dirKey = getContentAssetDir(id);
  const entries = await storage.list(dirKey);
  const targets = entries.filter((entry) => entry.startsWith(`${kind}.`));
  await Promise.all(
    targets.map((entry) => storage.deleteFile(storageKey(dirKey, entry)))
  );
}

export async function removeContentAssets(id: string) {
  const dirKey = getContentAssetDir(id);
  await storage.deleteDir(dirKey);
}

export async function writeContentManifest(
  id: string,
  data: Record<string, unknown>
) {
  await storage.ensureDir(manifestsDir);
  const manifestPath = storageKey(manifestsDir, `${id}.json`);
  const payload = {
    version: 1,
    ...data,
  };
  await storage.writeFile(manifestPath, JSON.stringify(payload, null, 2));
}

export async function deleteContentManifest(id: string) {
  const manifestPath = storageKey(manifestsDir, `${id}.json`);
  await storage.deleteFile(manifestPath);
}

export const getStorageBaseDir = () => baseDir;
