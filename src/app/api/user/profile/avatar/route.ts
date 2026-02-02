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

const fetchAccountByProvider = async (userId: string, provider: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [account] = await (db as PostgresDrizzleDb)
      .select({
        access_token: schema.accounts.access_token,
      })
      .from(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, userId),
          eq(schema.accounts.provider, provider)
        )
      )
      .limit(1);
    return account ?? null;
  }
  const [account] = await (db as SqliteDrizzleDb)
    .select({
      access_token: sqliteSchema.accounts.access_token,
    })
    .from(sqliteSchema.accounts)
    .where(
      and(
        eq(sqliteSchema.accounts.userId, userId),
        eq(sqliteSchema.accounts.provider, provider)
      )
    )
    .limit(1);
  return account ?? null;
};

const getGoogleProfileImage = async (accessToken: string) => {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { picture?: string | null };
  return payload.picture ?? null;
};

const getGithubProfileImage = async (accessToken: string) => {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as { avatar_url?: string | null };
  return payload.avatar_url ?? null;
};

const getDiscordProfileImage = async (accessToken: string) => {
  const response = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    id?: string | null;
    avatar?: string | null;
  };
  if (!payload.id || !payload.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${payload.id}/${payload.avatar}.png`;
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

const readProfileCache = async (filePath: string) => {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as {
      fetchedAt: number;
      name?: string | null;
      image?: string | null;
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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const provider = searchParams.get("provider");
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

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
  const imageFile = path.join(cacheDir, `${provider}-avatar`);
  const metaFile = path.join(cacheDir, `${provider}-avatar.json`);
  const profileFile = path.join(cacheDir, `${provider}-profile.json`);

  const cache = await readCacheMeta(metaFile);
  const cacheTtlMs: number | null = null;
  const isCacheFresh = cache?.fetchedAt
    ? cacheTtlMs === null || Date.now() - cache.fetchedAt < cacheTtlMs
    : false;

  const profileCache = await readProfileCache(profileFile);
  const profileImageUrl = profileCache?.image ?? null;
  const cacheMatchesProfile =
    profileImageUrl && cache?.sourceUrl === profileImageUrl;

  if (isCacheFresh && cacheMatchesProfile) {
    try {
      const file = await fs.readFile(imageFile);
      return new NextResponse(file, {
        headers: {
          "Content-Type": cache?.contentType ?? "image/png",
          "Cache-Control": "public, max-age=600",
        },
      });
    } catch {
      // fall through to refetch
    }
  }

  const account = await fetchAccountByProvider(user.id, provider);
  if (!account?.access_token && !profileImageUrl) {
    return NextResponse.json({ error: "Missing access token" }, { status: 404 });
  }

  const imageUrl =
    profileImageUrl ??
    (provider === "google"
      ? await getGoogleProfileImage(account?.access_token ?? "")
      : provider === "github"
        ? await getGithubProfileImage(account?.access_token ?? "")
        : provider === "discord"
          ? await getDiscordProfileImage(account?.access_token ?? "")
          : null);
  if (!imageUrl) {
    return NextResponse.json({ error: "Unable to fetch profile image" }, { status: 502 });
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    return NextResponse.json({ error: "Unable to download profile image" }, { status: 502 });
  }

  const contentType = imageResponse.headers.get("content-type") ?? "image/png";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  await fs.writeFile(imageFile, buffer);
  await writeCacheMeta(metaFile, {
    fetchedAt: Date.now(),
    contentType,
    sourceUrl: imageUrl,
  });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=600",
    },
  });
}
