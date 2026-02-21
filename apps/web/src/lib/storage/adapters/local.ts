import { createReadStream, createWriteStream, promises as fs } from "fs";
import path from "path";
import type { StorageAdapter } from "@/types";
import { normalizeStorageKey } from "@/lib/storage/helpers";

export const createLocalAdapter = (baseDir: string): StorageAdapter => {
  const resolvePath = (key: string) => path.join(baseDir, normalizeStorageKey(key));
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

