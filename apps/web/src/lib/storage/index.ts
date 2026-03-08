if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("server-only");
}

import { mkdirSync, promises as fs } from "fs";
import path from "path";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import type { StorageAdapter } from "@/types";
import { createLocalAdapter } from "@/lib/storage/adapters/local";
import { createS3Adapter } from "@/lib/storage/adapters/s3";
import { normalizeStorageKey } from "@/lib/storage/helpers";

let storage: StorageAdapter | null = null;

export const getStorage = () => {
  if (!storage) {
    const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
    const baseDir = process.env.STORAGE_BASE_DIR
      ? path.resolve(process.env.STORAGE_BASE_DIR)
      : path.join(process.cwd(), "data");
    storage = driver === "s3" ? createS3Adapter(baseDir) : createLocalAdapter(baseDir);
  }
  return storage;
};

export const resolveStoragePath = (key: string) => getStorage().resolvePath(key);

export const storageKey = (...segments: string[]) =>
  normalizeStorageKey(segments.join("/"));

export const ensureDirPath = async (absolutePath: string) => {
  await fs.mkdir(absolutePath, { recursive: true });
};

export const ensureDirPathSync = (absolutePath: string) => {
  mkdirSync(absolutePath, { recursive: true });
};

export const writeFilePath = async (absolutePath: string, data: string | Buffer) => {
  await fs.writeFile(absolutePath, data);
};

export const removePath = async (
  absolutePath: string,
  options: { recursive?: boolean; force?: boolean } = {}
) => {
  await fs.rm(absolutePath, { recursive: options.recursive, force: options.force });
};

export const createTempDir = async (prefix: string) => {
  const safePrefix = prefix.endsWith("-") ? prefix : `${prefix}-`;
  const base = path.join(process.cwd(), "data", "tmp");
  await fs.mkdir(base, { recursive: true });
  return fs.mkdtemp(path.join(base, safePrefix));
};


export const readFilePath = async (absolutePath: string) => fs.readFile(absolutePath);

export const writeStreamToPath = async (
  source: NodeJS.ReadableStream,
  absolutePath: string
) => {
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await pipeline(source as NodeJS.ReadableStream, createWriteStream(absolutePath));
};
