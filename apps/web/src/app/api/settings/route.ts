import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleGetSettings, handleUpdateSettings } from "@/lib/api/settings";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "settings:read");
  if (permissionError) return permissionError;
  return handleGetSettings(actor.userId);
}

export async function PATCH(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "settings:write");
  if (permissionError) return permissionError;
  return handleUpdateSettings(request, actor.userId);
}
