import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import type { Session } from "next-auth";
import { auth } from "@/auth";
import {
  getDrizzleDb,
  type PostgresDrizzleDb,
  type SqliteDrizzleDb,
} from "@/lib/drizzle/client";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";

export const runtime = "nodejs";

const resolveIsPostgres = () => {
  const driver = process.env.DB_DRIVER?.toLowerCase();
  if (driver === "sqlite") return false;
  if (driver === "postgres") return true;
  if (process.env.SQLITE_URL) return false;
  return Boolean(process.env.POSTGRES_URL ?? process.env.DATABASE_URL);
};

const isPostgres = resolveIsPostgres();

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

const ensureDir = async (dir: string) => {
  await fs.mkdir(dir, { recursive: true });
};

const readCache = async (filePath: string) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as {
      fetchedAt: number;
      channel?: {
        id?: string | null;
        title?: string | null;
        thumbnail?: string | null;
      } | null;
    };
  } catch {
    return null;
  }
};

const writeCache = async (
  filePath: string,
  data: { fetchedAt: number; channel?: { id?: string | null; title?: string | null; thumbnail?: string | null } | null }
) => {
  await fs.writeFile(filePath, JSON.stringify(data), "utf8");
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

  let connected = false;
  let accessToken: string | null = null;
  if (isPostgres) {
    const [account] = await (getDrizzleDb() as PostgresDrizzleDb)
      .select({
        provider: schema.accounts.provider,
        access_token: schema.accounts.access_token,
      })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, user.id),
          eq(schema.accounts.provider, "google-youtube")
        )
      )
      .limit(1);
    connected = Boolean(account);
    accessToken = account?.access_token ?? null;
  } else {
    const [account] = await (getDrizzleDb() as SqliteDrizzleDb)
      .select({
        provider: sqliteSchema.accounts.provider,
        access_token: sqliteSchema.accounts.access_token,
      })
      .from(sqliteSchema.accounts)
      .where(
        and(
          eq(sqliteSchema.accounts.userId, user.id),
          eq(sqliteSchema.accounts.provider, "google-youtube")
        )
      )
      .limit(1);
    connected = Boolean(account);
    accessToken = account?.access_token ?? null;
  }

  if (!connected || !accessToken) {
    return NextResponse.json({ connected: Boolean(connected) });
  }

  const cacheDir = path.join(process.cwd(), "data", "users", user.id, "cache");
  await ensureDir(cacheDir);
  const cacheFile = path.join(cacheDir, "youtube-channel.json");
  const cacheTtlMs: number | null = null;
  const cached = await readCache(cacheFile);
  if (
    cached?.fetchedAt &&
    (cacheTtlMs === null || Date.now() - cached.fetchedAt < cacheTtlMs)
  ) {
    return NextResponse.json({
      connected,
      channel: cached.channel
        ? { ...cached.channel, thumbnail: "/api/publish/providers/youtube/avatar" }
        : null,
    });
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
      return NextResponse.json({
        connected,
        needsReconnect: true,
      });
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
    await writeCache(cacheFile, {
      fetchedAt: Date.now(),
      channel: channelPayload,
    });

    return NextResponse.json({
      connected,
      channel: {
        ...channelPayload,
        thumbnail: "/api/publish/providers/youtube/avatar",
      },
    });
  } catch {
    return NextResponse.json({ connected });
  }
}

export async function DELETE() {
  const session = await auth();
  const email = getSessionEmail(session);
  if (!email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await fetchUserByEmail(email);
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const db = getDrizzleDb();
  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .delete(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, user.id),
          eq(schema.accounts.provider, "google-youtube")
        )
      );
  } else {
    await (db as SqliteDrizzleDb)
      .delete(sqliteSchema.accounts)
      .where(
        and(
          eq(sqliteSchema.accounts.userId, user.id),
          eq(sqliteSchema.accounts.provider, "google-youtube")
        )
      );
  }

  const cacheDir = path.join(process.cwd(), "data", "users", user.id, "cache");
  const cacheFile = path.join(cacheDir, "youtube-channel.json");
  const avatarMetaFile = path.join(cacheDir, "youtube-channel-avatar.json");
  const avatarFile = path.join(cacheDir, "youtube-channel-avatar");
  try {
    await fs.unlink(cacheFile);
  } catch {
    // ignore missing cache
  }
  try {
    await fs.unlink(avatarMetaFile);
  } catch {
    // ignore missing cache
  }
  try {
    await fs.unlink(avatarFile);
  } catch {
    // ignore missing cache
  }

  return NextResponse.json({ ok: true });
}
