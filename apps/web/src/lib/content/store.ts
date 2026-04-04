import { getStorage, resolveStoragePath, storageKey } from "@/lib/storage";
import type { ContentAssetKind } from "@/types";

const storage = getStorage();
const baseDir = storage.baseDir;
const rootUsersDir = storageKey("users");

export const contentPaths = {
  baseDir,
  usersDir: resolveStoragePath(rootUsersDir),
};

export const contentKeys = {
  usersDir: rootUsersDir,
};

export const resolveContentPath = (relativePath: string) =>
  resolveStoragePath(relativePath);

export type { ContentAssetKind } from "@/types";

export const getUserRoot = (userId: string) => storageKey("users", userId);

export const getUserUploadsDir = (userId: string) =>
  storageKey(getUserRoot(userId), "uploads");

export const getUserPublishesDir = (userId: string) =>
  storageKey(getUserUploadsDir(userId), "publishes");

export const getUserVideosDir = (userId: string) =>
  storageKey(getUserUploadsDir(userId), "videos");

export const getUserRendersRootDir = (userId: string) =>
  storageKey(getUserRoot(userId), "renders");

export const getUserManifestsDir = (userId: string) =>
  storageKey(getUserRoot(userId), "manifests");

export async function ensureContentStore(userId: string) {
  await storage.ensureDir(getUserVideosDir(userId));
  await storage.ensureDir(getUserRendersRootDir(userId));
  await storage.ensureDir(getUserManifestsDir(userId));
}

export function getContentAssetPath(
  userId: string,
  id: string,
  kind: ContentAssetKind,
  extension: string
) {
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  const fileName = `${kind}${safeExtension}`;
  return storageKey(getUserVideosDir(userId), id, fileName);
}

export function getContentAssetDir(userId: string, id: string) {
  return storageKey(getUserVideosDir(userId), id);
}

export function getContentRenderPath(
  userId: string,
  id: string,
  fileName: string
) {
  return storageKey(getUserRendersRootDir(userId), id, fileName);
}

export function getContentRenderDir(userId: string, id: string) {
  return storageKey(getUserRendersRootDir(userId), id);
}

export function getPublishAssetDir(
  userId: string,
  contentId: string,
  publishId: string
) {
  return storageKey(getUserPublishesDir(userId), contentId, publishId);
}

export function getPublishThumbnailPath(
  userId: string,
  contentId: string,
  publishId: string,
  extension: string
) {
  const safeExtension = extension.startsWith(".") ? extension : `.${extension}`;
  return storageKey(
    getPublishAssetDir(userId, contentId, publishId),
    `thumbnail${safeExtension || ".bin"}`
  );
}

export async function findLatestRenderPath(userId: string, id: string) {
  const dirKey = getContentRenderDir(userId, id);
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

  return latest ? storageKey(getContentRenderDir(userId, id), latest.name) : null;
}

export async function hasAnyRenderedOutput(userId: string, id: string) {
  const dirKey = getContentRenderDir(userId, id);
  const entries = await storage.list(dirKey).catch(() => []);
  return entries.some((entry) => entry.toLowerCase().endsWith(".mp4"));
}

export async function findContentAssetPath(
  userId: string,
  id: string,
  kind: ContentAssetKind
) {
  const dirKey = getContentAssetDir(userId, id);
  const entries = await storage.list(dirKey);
  const match = entries.find((entry) => entry.startsWith(`${kind}.`));
  return match ? storageKey(getUserVideosDir(userId), id, match) : null;
}

export async function removeContentAssetFiles(
  userId: string,
  id: string,
  kind: ContentAssetKind
) {
  const dirKey = getContentAssetDir(userId, id);
  const entries = await storage.list(dirKey);
  const targets = entries.filter((entry) => entry.startsWith(`${kind}.`));
  await Promise.all(
    targets.map((entry) => storage.deleteFile(storageKey(dirKey, entry)))
  );
}

export async function removeContentAssets(userId: string, id: string) {
  const dirKey = getContentAssetDir(userId, id);
  await storage.deleteDir(dirKey);
}

export async function writeContentManifest(
  userId: string,
  id: string,
  data: Record<string, unknown>
) {
  const manifestsDir = getUserManifestsDir(userId);
  await storage.ensureDir(manifestsDir);
  const manifestPath = storageKey(manifestsDir, `${id}.json`);
  const payload = {
    version: 1,
    ...data,
  };
  await storage.writeFile(manifestPath, JSON.stringify(payload, null, 2));
}

export async function deleteContentManifest(userId: string, id: string) {
  const manifestPath = storageKey(getUserManifestsDir(userId), `${id}.json`);
  await storage.deleteFile(manifestPath);
}

export const getStorageBaseDir = () => baseDir;

export const getUserContentPaths = (userId: string) => ({
  rootDir: resolveStoragePath(getUserRoot(userId)),
  uploadsDir: resolveStoragePath(getUserUploadsDir(userId)),
  videosDir: resolveStoragePath(getUserVideosDir(userId)),
  rendersDir: resolveStoragePath(getUserRendersRootDir(userId)),
  manifestsDir: resolveStoragePath(getUserManifestsDir(userId)),
});
