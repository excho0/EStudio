import { and, eq } from "drizzle-orm";

import {
  getDrizzleDb,
  isPostgres,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import {
  YOUTUBE_AVATAR_ENDPOINT,
  YOUTUBE_OAUTH_PROVIDER_ID,
} from "@/lib/publishing/providers/youtube/constants";
import { getStorage, storageKey } from "@/lib/storage";

type YoutubeChannel = {
  id?: string | null;
  title?: string | null;
  thumbnail?: string | null;
} | null;

type YoutubeChannelCache = {
  fetchedAt: number;
  channel?: YoutubeChannel;
} | null;

type AvatarCacheMeta = {
  fetchedAt: number;
  contentType?: string;
  sourceUrl?: string;
} | null;

export type YoutubeConnection = {
  connected: boolean;
  needsReconnect?: boolean;
  channel?: YoutubeChannel;
};

const storage = getStorage();

const readChannelCache = async (filePath: string): Promise<YoutubeChannelCache> => {
  try {
    const raw = await storage.readFile(filePath);
    return JSON.parse(raw.toString("utf8")) as YoutubeChannelCache;
  } catch {
    return null;
  }
};

const writeChannelCache = async (
  filePath: string,
  data: { fetchedAt: number; channel?: YoutubeChannel }
) => {
  await storage.writeFile(filePath, JSON.stringify(data));
};

const readAvatarMeta = async (filePath: string): Promise<AvatarCacheMeta> => {
  try {
    const raw = await storage.readFile(filePath);
    return JSON.parse(raw.toString("utf8")) as AvatarCacheMeta;
  } catch {
    return null;
  }
};

const writeAvatarMeta = async (
  filePath: string,
  meta: { fetchedAt: number; contentType?: string; sourceUrl?: string }
) => {
  await storage.writeFile(filePath, JSON.stringify(meta));
};

const fetchAccessToken = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [account] = await (db as PostgresDrizzleDb)
      .select({ access_token: schema.accounts.access_token })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, YOUTUBE_OAUTH_PROVIDER_ID)
        )
      )
      .limit(1);
    return account?.access_token ?? null;
  }
  const [account] = await (db as SqliteDrizzleDb)
    .select({ access_token: sqliteSchema.accounts.access_token })
    .from(sqliteSchema.accounts)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, YOUTUBE_OAUTH_PROVIDER_ID)
      )
    )
    .limit(1);
  return account?.access_token ?? null;
};

const fetchConnectedAccount = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [account] = await (db as PostgresDrizzleDb)
      .select({ provider: schema.accounts.provider })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, YOUTUBE_OAUTH_PROVIDER_ID)
        )
      )
      .limit(1);
    return Boolean(account);
  }
  const [account] = await (db as SqliteDrizzleDb)
    .select({ provider: sqliteSchema.accounts.provider })
    .from(sqliteSchema.accounts)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, YOUTUBE_OAUTH_PROVIDER_ID)
      )
    )
    .limit(1);
  return Boolean(account);
};

const resolveCachePaths = (userId: string) => {
  const cacheDir = storageKey("users", userId, "cache");
  return {
    cacheDir,
    channelFile: storageKey(cacheDir, "youtube-channel.json"),
    avatarMetaFile: storageKey(cacheDir, "youtube-channel-avatar.json"),
    avatarFile: storageKey(cacheDir, "youtube-channel-avatar"),
  };
};

export const clearYoutubeCache = async (userId: string) => {
  const { channelFile, avatarMetaFile, avatarFile } = resolveCachePaths(userId);
  try {
    await storage.deleteFile(channelFile);
  } catch {
    // ignore missing cache
  }
  try {
    await storage.deleteFile(avatarMetaFile);
  } catch {
    // ignore missing cache
  }
  try {
    await storage.deleteFile(avatarFile);
  } catch {
    // ignore missing cache
  }
};

export const getYoutubeConnection = async (
  userId: string
): Promise<YoutubeConnection> => {
  const connected = await fetchConnectedAccount(userId);
  if (!connected) return { connected: false };

  const accessToken = await fetchAccessToken(userId);
  if (!accessToken) {
    return { connected: true, needsReconnect: true };
  }

  const { cacheDir, channelFile } = resolveCachePaths(userId);
  await storage.ensureDir(cacheDir);
  const cacheTtlMs: number | null = null;
  const cached = await readChannelCache(channelFile);
  if (
    cached?.fetchedAt &&
    (cacheTtlMs === null || Date.now() - cached.fetchedAt < cacheTtlMs)
  ) {
    return {
      connected: true,
      channel: cached.channel
        ? { ...cached.channel, thumbnail: YOUTUBE_AVATAR_ENDPOINT }
        : null,
    };
  }

  try {
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      return { connected: true, needsReconnect: true };
    }

    const payload = (await response.json()) as {
      items?: Array<{
        id?: string;
        snippet?: {
          title?: string;
          thumbnails?: {
            default?: { url?: string };
            medium?: { url?: string };
            high?: { url?: string };
          };
        };
      }>;
    };

    const channel = payload.items?.[0];
    const thumbnail =
      channel?.snippet?.thumbnails?.high?.url ??
      channel?.snippet?.thumbnails?.medium?.url ??
      channel?.snippet?.thumbnails?.default?.url ??
      null;

    const channelPayload = {
      id: channel?.id ?? null,
      title: channel?.snippet?.title ?? null,
      thumbnail,
    };

    await writeChannelCache(channelFile, {
      fetchedAt: Date.now(),
      channel: channelPayload,
    });

    return {
      connected: true,
      channel: {
        ...channelPayload,
        thumbnail: YOUTUBE_AVATAR_ENDPOINT,
      },
    };
  } catch {
    return { connected: true };
  }
};

export const getYoutubeAvatar = async (userId: string) => {
  const { cacheDir, avatarFile, avatarMetaFile, channelFile } =
    resolveCachePaths(userId);
  await ensureDir(cacheDir);

  const cache = await readAvatarMeta(avatarMetaFile);
  const channelCache = await readChannelCache(channelFile);
  const channelUrl = channelCache?.channel?.thumbnail ?? null;
  const cacheTtlMs: number | null = null;
  const isCacheFresh = cache?.fetchedAt
    ? cacheTtlMs === null || Date.now() - cache.fetchedAt < cacheTtlMs
    : false;
  const cacheMatchesChannel = channelUrl && cache?.sourceUrl === channelUrl;

  if (isCacheFresh && cacheMatchesChannel) {
    try {
      const file = await storage.readFile(avatarFile);
      return {
        buffer: file,
        contentType: cache?.contentType ?? "image/png",
        cached: true,
      };
    } catch {
      // fall through
    }
  }

  const accessToken = await fetchAccessToken(userId);
  if (!accessToken) {
    return { error: "Missing access token", status: 404 } as const;
  }

  const response = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok) {
    return { error: "Unable to fetch channel", status: 502 } as const;
  }

  const payload = (await response.json()) as {
    items?: Array<{
      snippet?: {
        thumbnails?: {
          high?: { url?: string };
          medium?: { url?: string };
          default?: { url?: string };
        };
      };
    }>;
  };

  const channel = payload.items?.[0];
  const thumbnail =
    channel?.snippet?.thumbnails?.high?.url ??
    channel?.snippet?.thumbnails?.medium?.url ??
    channel?.snippet?.thumbnails?.default?.url ??
    null;

  if (!thumbnail) {
    return { error: "Missing channel thumbnail", status: 404 } as const;
  }

  const imageResponse = await fetch(thumbnail);
  if (!imageResponse.ok) {
    return { error: "Unable to download thumbnail", status: 502 } as const;
  }

  const contentType = imageResponse.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await storage.writeFile(avatarFile, buffer);
  await writeAvatarMeta(avatarMetaFile, {
    fetchedAt: Date.now(),
    contentType,
    sourceUrl: thumbnail,
  });

  return {
    buffer,
    contentType,
  };
};
