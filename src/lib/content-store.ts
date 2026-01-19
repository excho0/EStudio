import { promises as fs } from "fs";
import path from "path";

export type ContentStatus = "uploaded" | "rendering" | "rendered" | "failed";

export type ContentItem = {
  id: string;
  title: string;
  createdAt: string;
  thumbnailPath: string;
  videoPath: string;
  songPath: string;
  renderPath?: string;
  status: ContentStatus;
  songDurationSeconds: number;
  segmentDurationSeconds: number;
  fadeDurationSeconds: number;
  videoDurationSeconds?: number;
  fps: number;
  width: number;
  height: number;
};

export type ContentIndex = {
  items: ContentItem[];
};

const baseDir = path.join(process.cwd(), "local-content");
const uploadsDir = path.join(baseDir, "uploads");
const rendersDir = path.join(baseDir, "renders");
const thumbnailsDir = path.join(uploadsDir, "thumbnails");
const videosDir = path.join(uploadsDir, "videos");
const songsDir = path.join(uploadsDir, "songs");
const indexPath = path.join(baseDir, "index.json");

export const contentPaths = {
  baseDir,
  uploadsDir,
  rendersDir,
  thumbnailsDir,
  videosDir,
  songsDir,
  indexPath,
};

export const resolveContentPath = (relativePath: string) =>
  path.join(baseDir, relativePath);

export async function ensureContentStore() {
  await fs.mkdir(thumbnailsDir, { recursive: true });
  await fs.mkdir(videosDir, { recursive: true });
  await fs.mkdir(songsDir, { recursive: true });
  await fs.mkdir(rendersDir, { recursive: true });

  try {
    await fs.access(indexPath);
  } catch {
    const initial: ContentIndex = { items: [] };
    await fs.writeFile(indexPath, JSON.stringify(initial, null, 2));
  }
}

export async function readContentIndex(): Promise<ContentIndex> {
  await ensureContentStore();
  const raw = await fs.readFile(indexPath, "utf8");
  return JSON.parse(raw) as ContentIndex;
}

export async function writeContentIndex(index: ContentIndex) {
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

export async function addContentItem(item: ContentItem) {
  const index = await readContentIndex();
  index.items.unshift(item);
  await writeContentIndex(index);
}

export async function updateContentItem(
  id: string,
  updates: Partial<ContentItem>
) {
  const index = await readContentIndex();
  const item = index.items.find((entry) => entry.id === id);

  if (!item) {
    return null;
  }

  Object.assign(item, updates);
  await writeContentIndex(index);
  return item;
}

export async function getContentItem(id: string) {
  const index = await readContentIndex();
  return index.items.find((entry) => entry.id === id) ?? null;
}
