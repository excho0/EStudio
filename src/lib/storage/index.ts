import "server-only";

import { createReadStream, createWriteStream, promises as fs } from "fs";
import { mkdirSync } from "fs";
import path from "path";
import type { StorageAdapter } from "@/types";

const normalizeKey = (key: string) => {
  const segments = key.split("/");
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(segment);
  }
  return normalized.join("/");
};

const createLocalAdapter = (baseDir: string): StorageAdapter => {
  const resolvePath = (key: string) => path.join(baseDir, normalizeKey(key));
  return {
    baseDir,
    resolvePath,
    ensureDir: async (key: string) => {
      await fs.mkdir(resolvePath(key), { recursive: true });
    },
    list: async (key: string) => {
      try {
        return await fs.readdir(resolvePath(key));
      } catch {
        return [];
      }
    },
    stat: async (key: string) => {
      try {
        const stats = await fs.stat(resolvePath(key));
        return { size: stats.size, mtimeMs: stats.mtimeMs };
      } catch {
        return null;
      }
    },
    exists: async (key: string) => {
      try {
        await fs.access(resolvePath(key));
        return true;
      } catch {
        return false;
      }
    },
    readFile: async (key: string) => fs.readFile(resolvePath(key)),
    writeFile: async (key: string, data: Buffer | string) => {
      await fs.mkdir(path.dirname(resolvePath(key)), { recursive: true });
      await fs.writeFile(resolvePath(key), data);
    },
    deleteFile: async (key: string) => {
      await fs.rm(resolvePath(key), { force: true });
    },
    deleteDir: async (key: string) => {
      await fs.rm(resolvePath(key), { recursive: true, force: true });
    },
    move: async (from: string, to: string) => {
      await fs.mkdir(path.dirname(resolvePath(to)), { recursive: true });
      await fs.rename(resolvePath(from), resolvePath(to));
    },
    createReadStream: (key: string, options?: { start?: number; end?: number }) =>
      createReadStream(resolvePath(key), options),
    createWriteStream: (key: string) => {
      const absolutePath = resolvePath(key);
      fs.mkdir(path.dirname(absolutePath), { recursive: true }).catch(() => null);
      return createWriteStream(absolutePath);
    },
    getPublicUrl: () => null,
  };
};

let storage: StorageAdapter | null = null;

export const getStorage = () => {
  if (!storage) {
    const driver = (process.env.STORAGE_DRIVER ?? "local").toLowerCase();
    const baseDir = process.env.STORAGE_BASE_DIR
      ? path.resolve(process.env.STORAGE_BASE_DIR)
      : path.join(process.cwd(), "data");
    storage = createLocalAdapter(baseDir);
    if (driver !== "local") {
      // TODO: swap to remote adapter when implemented.
      storage = createLocalAdapter(baseDir);
    }
  }
  return storage;
};

export const resolveStoragePath = (key: string) => getStorage().resolvePath(key);

export const storageKey = (...segments: string[]) =>
  normalizeKey(segments.join("/"));

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
