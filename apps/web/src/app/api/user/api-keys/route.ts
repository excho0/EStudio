import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import {
  handleCreateUserApiKey,
  handleListUserApiKeys,
} from "@/lib/api/user/api-keys";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "api_keys:read");
  if (permissionError) return permissionError;
  return handleListUserApiKeys(actor.userId);
}

export async function POST(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "api_keys:write");
  if (permissionError) return permissionError;
  return handleCreateUserApiKey(request, actor.userId);
}
