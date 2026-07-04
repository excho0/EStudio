import { NextResponse } from "next/server";

import {
  apiKeyAllowsContent,
  apiKeyHasPermission,
  findApiKeyByToken,
  touchApiKeyLastUsed,
  type ApiKeyPermission,
} from "@/lib/data/api-keys";

type AuthenticatedApiKey = Awaited<ReturnType<typeof findApiKeyByToken>>;

const getBearerToken = (request: Request) => {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token.trim();
};

export async function requireApiKeyAuth(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return {
      error: NextResponse.json({ error: "Missing bearer token." }, { status: 401 }),
      apiKey: null as AuthenticatedApiKey,
    };
  }

  const apiKey = await findApiKeyByToken(token);
  if (!apiKey) {
    return {
      error: NextResponse.json({ error: "Invalid API key." }, { status: 401 }),
      apiKey: null as AuthenticatedApiKey,
    };
  }

  if (apiKey.revokedAt) {
    return {
      error: NextResponse.json({ error: "API key revoked." }, { status: 403 }),
      apiKey,
    };
  }

  if (apiKey.expiresAt && Date.parse(apiKey.expiresAt) <= Date.now()) {
    return {
      error: NextResponse.json({ error: "API key expired." }, { status: 403 }),
      apiKey,
    };
  }

  await touchApiKeyLastUsed(apiKey.id);
  return { error: null, apiKey };
}

export const ensureApiKeyPermission = (
  apiKey: NonNullable<AuthenticatedApiKey>,
  permission: ApiKeyPermission
) =>
  apiKeyHasPermission(apiKey.permissions, permission)
    ? null
    : NextResponse.json({ error: `Missing permission: ${permission}` }, { status: 403 });

export const ensureApiKeyContentAccess = (
  apiKey: NonNullable<AuthenticatedApiKey>,
  contentId: string
) =>
  apiKeyAllowsContent(apiKey, contentId)
    ? null
    : NextResponse.json({ error: "Resource not allowed for this API key." }, { status: 403 });
