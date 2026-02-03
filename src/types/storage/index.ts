export type StorageStat = {
  size: number;
  mtimeMs: number;
};

export type StorageAdapter = {
  baseDir: string;
  resolvePath: (key: string) => string;
  ensureDir: (key: string) => Promise<void>;
  list: (key: string) => Promise<string[]>;
  stat: (key: string) => Promise<StorageStat | null>;
  exists: (key: string) => Promise<boolean>;
  readFile: (key: string) => Promise<Buffer>;
  writeFile: (key: string, data: Buffer | string) => Promise<void>;
  deleteFile: (key: string) => Promise<void>;
  deleteDir: (key: string) => Promise<void>;
  move: (from: string, to: string) => Promise<void>;
  createReadStream: (
    key: string,
    options?: { start?: number; end?: number }
  ) => import("fs").ReadStream;
  createWriteStream: (key: string) => import("fs").WriteStream;
  getPublicUrl?: (key: string) => string | null;
};
