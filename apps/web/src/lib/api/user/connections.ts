import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";

import type { Session } from "next-auth";
import { auth } from "@/auth";
import { getDrizzleDb, isPostgres } from "@/lib/drizzle/client";
import type { PostgresDrizzleDb, SqliteDrizzleDb } from "@/types";
import { schema, sqliteSchema } from "@/lib/drizzle/schema";
import { getStorage, storageKey } from "@/lib/storage";
import { eventBus } from "@/lib/event-bus";

const storage = getStorage();

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

const fetchUserById = async (id: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    const [user] = await (db as PostgresDrizzleDb)
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, id))
      .limit(1);
    return user ?? null;
  }
  const [user] = await (db as SqliteDrizzleDb)
    .select()
    .from(sqliteSchema.users)
    .where(eq(sqliteSchema.users.id, id))
    .limit(1);
  return user ?? null;
};

const fetchAccounts = async (userId: string) => {
  const db = getDrizzleDb();
  if (isPostgres) {
    return (db as PostgresDrizzleDb)
      .select({
        provider: schema.accounts.provider,
        providerAccountId: schema.accounts.providerAccountId,
        access_token: schema.accounts.access_token,
      })
      .from(schema.accounts)
      .where(eq(schema.accounts.userId, userId));
  }
  return (db as SqliteDrizzleDb)
    .select({
      provider: sqliteSchema.accounts.provider,
      providerAccountId: sqliteSchema.accounts.providerAccountId,
      access_token: sqliteSchema.accounts.access_token,
    })
    .from(sqliteSchema.accounts)
    .where(eq(sqliteSchema.accounts.userId, userId));
};

export const handleGetConnections = async (userId?: string) => {
  let user = userId ? await fetchUserById(userId) : null;
  if (!user) {
    const session = await auth();
    const email = getSessionEmail(session);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = await fetchUserByEmail(email);
  }
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const accounts = await fetchAccounts(user.id);
  const connected = accounts
    .map((account) => account.provider)
    .filter((provider): provider is string => Boolean(provider));

  const profiles: Record<string, { image?: string | null; name?: string | null }> = {};
  const cacheDir = storageKey("users", user.id, "cache");
  await storage.ensureDir(cacheDir);
  const cacheTtlMs: number | null = null;

  const readProfileCache = async (filePath: string) => {
    try {
      const raw = await storage.readFile(filePath);
      return JSON.parse(raw.toString("utf8")) as {
        fetchedAt: number;
        name?: string | null;
        image?: string | null;
      };
    } catch {
      return null;
    }
  };

  const writeProfileCache = async (
    filePath: string,
    data: { fetchedAt: number; name?: string | null; image?: string | null }
  ) => {
    await storage.writeFile(filePath, JSON.stringify(data));
  };

  const fetchGoogleProfile = async (token: string) => {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      name?: string | null;
      picture?: string | null;
    };
    return { name: payload.name ?? null, image: payload.picture ?? null };
  };

  const fetchGithubProfile = async (token: string) => {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      name?: string | null;
      login?: string | null;
      avatar_url?: string | null;
    };
    return {
      name: payload.name ?? payload.login ?? null,
      image: payload.avatar_url ?? null,
    };
  };

  const fetchDiscordProfile = async (token: string) => {
    const response = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      id?: string | null;
      username?: string | null;
      global_name?: string | null;
      avatar?: string | null;
    };
    const image =
      payload.id && payload.avatar
        ? `https://cdn.discordapp.com/avatars/${payload.id}/${payload.avatar}.png`
        : null;
    return {
      name: payload.global_name ?? payload.username ?? null,
      image,
    };
  };

  const providerFetchers: Record<
    string,
    (token: string) => Promise<{ name?: string | null; image?: string | null } | null>
  > = {
    google: fetchGoogleProfile,
    github: fetchGithubProfile,
    discord: fetchDiscordProfile,
  };

  await Promise.all(
    connected.map(async (provider) => {
      const cacheFile = storageKey(cacheDir, `${provider}-profile.json`);
      const cached = await readProfileCache(cacheFile);
      if (cached?.fetchedAt && (cacheTtlMs === null || Date.now() - cached.fetchedAt < cacheTtlMs)) {
        profiles[provider] = {
          name: cached.name ?? null,
          image: cached.image ?? null,
        };
        return;
      }
      const account = accounts.find((item) => item.provider === provider);
      const fetcher = providerFetchers[provider];
      if (!account?.access_token || !fetcher) {
        profiles[provider] = { name: null, image: null };
        return;
      }
      const profile = await fetcher(account.access_token);
      if (profile) {
        profiles[provider] = profile;
        await writeProfileCache(cacheFile, {
          fetchedAt: Date.now(),
          name: profile.name ?? null,
          image: profile.image ?? null,
        });
      } else {
        profiles[provider] = { name: null, image: null };
      }
    })
  );

  const connections = accounts.map((account) => ({
    provider: account.provider,
    providerAccountId: account.providerAccountId ?? null,
    profile: profiles[account.provider] ?? null,
  }));

  return NextResponse.json({ connections });
};

export const handleDeleteConnection = async (request: Request, userId?: string) => {

  const payload = (await request.json().catch(() => null)) as
    | { provider?: string }
    | null;
  const provider = payload?.provider?.trim();
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  let user = userId ? await fetchUserById(userId) : null;
  if (!user) {
    const session = await auth();
    const email = getSessionEmail(session);
    if (!email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = await fetchUserByEmail(email);
  }
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const db = getDrizzleDb();
  const accounts = isPostgres
    ? await (db as PostgresDrizzleDb)
        .select({ provider: schema.accounts.provider })
        .from(schema.accounts)
        .where(eq(schema.accounts.userId, user.id))
    : await (db as SqliteDrizzleDb)
        .select({ provider: sqliteSchema.accounts.provider })
        .from(sqliteSchema.accounts)
        .where(eq(sqliteSchema.accounts.userId, user.id));

  const linkedProviders = accounts
    .map((account) => account.provider)
    .filter((value): value is string => Boolean(value));

  if (!linkedProviders.includes(provider)) {
    return NextResponse.json({ error: "Provider not linked" }, { status: 404 });
  }

  const emailProviderEnabled = Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD &&
      process.env.SMTP_FROM
  );
  const emailVerified =
    user.emailVerified instanceof Date
      ? user.emailVerified.getTime() > 0
      : typeof user.emailVerified === "number"
        ? user.emailVerified > 0
        : Boolean(user.emailVerified);
  const hasEmailFallback = emailProviderEnabled && emailVerified;

  if (linkedProviders.length <= 1 && !hasEmailFallback) {
    return NextResponse.json(
      { error: "Cannot unlink the last sign-in method." },
      { status: 400 }
    );
  }

  if (isPostgres) {
    await (db as PostgresDrizzleDb)
      .delete(schema.accounts)
      .where(
        and(
          eq(schema.accounts.userId, user.id),
          eq(schema.accounts.provider, provider)
        )
      );
  } else {
    await (db as SqliteDrizzleDb)
      .delete(sqliteSchema.accounts)
      .where(
        and(
          eq(sqliteSchema.accounts.userId, user.id),
          eq(sqliteSchema.accounts.provider, provider)
        )
      );
  }

  const cacheDir = storageKey("users", user.id, "cache");
  const cacheFiles = [
    `${provider}-profile.json`,
    `${provider}-avatar.json`,
    `${provider}-avatar`,
  ];
  await Promise.all(
    cacheFiles.map(async (file) => {
      try {
        await storage.deleteFile(storageKey(cacheDir, file));
      } catch {
        // ignore missing cache files
      }
    })
  );

  void eventBus.emit("provider.connection.deleted", {
    userId: user.id,
    provider,
  });

  return NextResponse.json({ ok: true });
};
