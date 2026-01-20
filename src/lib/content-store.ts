import { promises as fs } from "fs";
import path from "path";

const baseDir = path.join(process.cwd(), "data");
const uploadsDir = path.join(baseDir, "uploads");
const rendersDir = path.join(baseDir, "renders");
const thumbnailsDir = path.join(uploadsDir, "thumbnails");
const videosDir = path.join(uploadsDir, "videos");
const songsDir = path.join(uploadsDir, "songs");
export const contentPaths = {
  baseDir,
  uploadsDir,
  rendersDir,
  thumbnailsDir,
  videosDir,
  songsDir,
};

export const resolveContentPath = (relativePath: string) =>
  path.join(baseDir, relativePath);

export async function ensureContentStore() {
  await fs.mkdir(thumbnailsDir, { recursive: true });
  await fs.mkdir(videosDir, { recursive: true });
  await fs.mkdir(songsDir, { recursive: true });
  await fs.mkdir(rendersDir, { recursive: true });
}
