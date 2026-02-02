import { promises as fs } from "fs";
import path from "path";

import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getDrizzleDb, isPostgres, type PostgresDrizzleDb, type SqliteDrizzleDb } from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

export const runtime = "nodejs";


const getSessionEmail = (session: Session | null) =>
  session?.user?.email ?? null;

const fetchUserByEmail = async (email: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [user] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    return user ?? null;
  }
  const [user] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.users)
    .where(eq(sqliteSchema.users.email, email))
    .limit(1);
  return user ?? null;
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
          eq(schema.accounts.provider, "google-youtube")
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
        eq(sqliteSchema.accounts.provider, "google-youtube")
      )
    )
    .limit(1);
  return account?.access_token ?? null;
};

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const readCacheMeta = async (filePath: string) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as {
      fetchedAt: number;
      contentType?: string;
      sourceUrl?: string;
    };
  } catch {
    return null;
  }
};

const writeCacheMeta = async (
  filePath: string,
  meta: { fetchedAt: number; contentType?: string; sourceUrl?: string }
) => {
  await fs.writeFile(filePath, JSON.stringify(meta), "utf8");
};

const readChannelCache = async (filePath: string) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as {
      channel?: { thumbnail?: string | null } | null;
    };
  } catch {
    return null;
  }
};

export async function GET() {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const cacheDir = path.join(process.cwd(), "data", "users", user.id, "cache");
  await ensureDir(cacheDir);
  const imageFile = path.join(cacheDir, "youtube-channel-avatar");
  const metaFile = path.join(cacheDir, "youtube-channel-avatar.json");
  const channelFile = path.join(cacheDir, "youtube-channel.json");

  const cache = await readCacheMeta(metaFile);
  const channelCache = await readChannelCache(channelFile);
  const channelUrl = channelCache?.channel?.thumbnail ?? null;
  const cacheTtlMs: number | null = null;
  const isCacheFresh = cache?.fetchedAt
    ? cacheTtlMs === null || Date.now() - cache.fetchedAt < cacheTtlMs
    : false;
  const cacheMatchesChannel = channelUrl && cache?.sourceUrl === channelUrl;

  if (isCacheFresh && cacheMatchesChannel) {
    try {
      const file = await fs.readFile(imageFile);
      return new NextResponse(file, {
        headers: {
          "Content-Type": cache?.contentType ?? "image/png",
          "Cache-Control": "public, max-age=600",
        },
      });
    } catch {
      // fall through
    }
  }

  const accessToken = await fetchAccessToken(user.id);
  if (!accessToken) {
    return NextResponse.json({ error: "Missing access token" }, { status: 404 });
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
    return NextResponse.json({ error: "Unable to fetch channel" }, { status: 502 });
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
    return NextResponse.json({ error: "Missing channel thumbnail" }, { status: 404 });
  }

  const imageResponse = await fetch(thumbnail);
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Unable to download thumbnail" }, { status: 502 });
  }

  const contentType = imageResponse.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(imageFile, buffer);
  await writeCacheMeta(metaFile, {
    fetchedAt: Date.now(),
    contentType,
    sourceUrl: thumbnail,
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=600",
    },
  });
}
