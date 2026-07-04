import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import {
  ensureApiKeyContentAccess,
  ensureApiKeyPermission,
  requireApiKeyAuth,
} from "@/lib/auth/api-key";
import type { ApiKeyPermission } from "@/lib/data/api-keys/schemas";

type SessionActor = {
  kind: "session";
  userId: string;
};

type ApiKeyActor = {
  kind: "api-key";
  userId: string;
  apiKey: NonNullable<Awaited<ReturnType<typeof requireApiKeyAuth>>["apiKey"]>;
};

export type RequestActor = SessionActor | ApiKeyActor;

export async function resolveRequestActor(request: Request) {
  const sessionUser = await getSessionUser();
  if (sessionUser) {
    return {
      actor: { kind: "session", userId: sessionUser.id } satisfies SessionActor,
      error: null as Response | null,
    };
  }

  const { error, apiKey } = await requireApiKeyAuth(request);
  if (error) {
    return { actor: null as RequestActor | null, error };
  }
  if (!apiKey) {
    return {
      actor: null as RequestActor | null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    actor: {
      kind: "api-key",
      userId: apiKey.userId,
      apiKey,
    } satisfies ApiKeyActor,
    error: null as Response | null,
  };
}

export function ensureActorPermission(
  actor: RequestActor,
  permission: ApiKeyPermission
) {
  if (actor.kind === "session") return null;
  return ensureApiKeyPermission(actor.apiKey, permission);
}

export function ensureActorContentAccess(actor: RequestActor, contentId: string) {
  if (actor.kind === "session") return null;
  return ensureApiKeyContentAccess(actor.apiKey, contentId);
}
