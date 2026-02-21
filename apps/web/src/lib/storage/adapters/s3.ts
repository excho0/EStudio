import { createWriteStream, promises as fs } from "fs";
import { tmpdir } from "os";
import path from "path";
import { PassThrough, Readable } from "stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { StorageAdapter } from "@/types";
import { normalizeStorageKey } from "@/lib/storage/helpers";

const readBodyAsBuffer = async (body: unknown): Promise<Buffer> => {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body);

  const maybeTransform = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof maybeTransform.transformToByteArray === "function") {
    return Buffer.from(await maybeTransform.transformToByteArray());
  }

  if (body instanceof Readable) {
    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      body.on("data", (chunk) => {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      body.on("end", resolve);
      body.on("error", reject);
    });
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported S3 object body type.");
};

export const createS3Adapter = (baseDir: string): StorageAdapter => {
  const bucket = process.env.STORAGE_S3_BUCKET?.trim();
  if (!bucket) {
    throw new Error("Missing STORAGE_S3_BUCKET for s3 storage driver.");
  }
  const region = process.env.STORAGE_S3_REGION?.trim() || "us-east-1";
  const endpoint = process.env.STORAGE_S3_ENDPOINT?.trim() || undefined;
  const forcePathStyle = process.env.STORAGE_S3_FORCE_PATH_STYLE === "true";
  const publicBaseUrl = process.env.STORAGE_S3_PUBLIC_URL?.trim() || null;
  const prefix = normalizeStorageKey(process.env.STORAGE_S3_PREFIX?.trim() || "");
  const accessKeyId = process.env.STORAGE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.STORAGE_S3_SESSION_TOKEN?.trim();

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle,
    credentials:
      accessKeyId && secretAccessKey
        ? {
            accessKeyId,
            secretAccessKey,
            sessionToken,
          }
        : undefined,
  });

  const withPrefix = (key: string) => {
    const safe = normalizeStorageKey(key);
    if (!prefix) return safe;
    if (!safe) return prefix;
    return `${prefix}/${safe}`;
  };
  const toObjectKey = (key: string) => withPrefix(key);
  const stripPrefix = (key: string) => {
    if (!prefix) return key;
    if (key === prefix) return "";
    if (key.startsWith(`${prefix}/`)) return key.slice(prefix.length + 1);
    return key;
  };

  return {
    baseDir,
    resolvePath: (key: string) => `s3://${bucket}/${toObjectKey(key)}`,
    ensureDir: async () => {
      // no-op for object storage
    },
    list: async (key: string) => {
      const objectPrefix = toObjectKey(key);
      const prefixWithSlash = objectPrefix ? `${objectPrefix}/` : "";
      const safeKey = normalizeStorageKey(key);
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefixWithSlash,
          Delimiter: "/",
          MaxKeys: 1000,
        })
      );
      const names = new Set<string>();
      for (const entry of response.CommonPrefixes ?? []) {
        const raw = entry.Prefix ?? "";
        const stripped = stripPrefix(raw).replace(/\/$/, "");
        const segments = stripped.split("/").filter(Boolean);
        const candidate = segments[segments.length - 1];
        if (candidate) names.add(candidate);
      }
      for (const entry of response.Contents ?? []) {
        const rawKey = entry.Key ?? "";
        if (!rawKey || rawKey.endsWith("/")) continue;
        const stripped = stripPrefix(rawKey);
        if (!stripped) continue;
        const relative = prefixWithSlash ? stripped.slice(safeKey.length + 1) : stripped;
        if (!relative || relative.includes("/")) continue;
        names.add(relative);
      }
      return Array.from(names);
    },
    stat: async (key: string) => {
      try {
        const response = await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: toObjectKey(key),
          })
        );
        return {
          size: Number(response.ContentLength ?? 0),
          mtimeMs: response.LastModified
            ? response.LastModified.getTime()
            : Date.now(),
        };
      } catch {
        return null;
      }
    },
    exists: async (key: string) => {
      try {
        await client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: toObjectKey(key),
          })
        );
        return true;
      } catch {
        return false;
      }
    },
    readFile: async (key: string) => {
      const response = await client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: toObjectKey(key),
        })
      );
      return readBodyAsBuffer(response.Body);
    },
    writeFile: async (key: string, data: Buffer | string) => {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: toObjectKey(key),
          Body: typeof data === "string" ? Buffer.from(data) : data,
        })
      );
    },
    deleteFile: async (key: string) => {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: toObjectKey(key),
        })
      );
    },
    deleteDir: async (key: string) => {
      const objectPrefix = toObjectKey(key);
      const prefixWithSlash = objectPrefix ? `${objectPrefix}/` : "";
      let continuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefixWithSlash,
            ContinuationToken: continuationToken,
          })
        );
        const keys = (listed.Contents ?? [])
          .map((item) => item.Key)
          .filter((item): item is string => Boolean(item));
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                Objects: keys.map((entry) => ({ Key: entry })),
                Quiet: true,
              },
            })
          );
        }
        continuationToken = listed.NextContinuationToken;
      } while (continuationToken);
    },
    move: async (from: string, to: string) => {
      const fromKey = toObjectKey(from);
      const toKey = toObjectKey(to);
      await client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: toKey,
          CopySource: `${bucket}/${fromKey}`,
        })
      );
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: fromKey,
        })
      );
    },
    createReadStream: (key: string, options?: { start?: number; end?: number }) => {
      const stream = new PassThrough();
      const range =
        typeof options?.start === "number"
          ? `bytes=${options.start}-${typeof options.end === "number" ? options.end : ""}`
          : undefined;
      void client
        .send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: toObjectKey(key),
            Range: range,
          })
        )
        .then(async (response) => {
          const body = response.Body;
          if (!body) {
            stream.end();
            return;
          }
          if (body instanceof Readable) {
            body.on("error", (error) => stream.destroy(error));
            body.pipe(stream);
            return;
          }
          stream.end(await readBodyAsBuffer(body));
        })
        .catch((error) => stream.destroy(error));
      return stream;
    },
    createWriteStream: (key: string) => {
      const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const tempPath = path.join(tmpdir(), `excho-s3-upload-${unique}`);
      const fileStream = createWriteStream(tempPath);
      fileStream.on("finish", () => {
        void (async () => {
          try {
            const fileBuffer = await fs.readFile(tempPath);
            await client.send(
              new PutObjectCommand({
                Bucket: bucket,
                Key: toObjectKey(key),
                Body: fileBuffer,
              })
            );
          } finally {
            await fs.rm(tempPath, { force: true }).catch(() => null);
          }
        })();
      });
      fileStream.on("error", () => {
        void fs.rm(tempPath, { force: true }).catch(() => null);
      });
      return fileStream;
    },
    getPublicUrl: (key: string) => {
      if (!publicBaseUrl) return null;
      return `${publicBaseUrl.replace(/\/$/, "")}/${toObjectKey(key)}`;
    },
  };
};

