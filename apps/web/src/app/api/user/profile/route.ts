import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleGetProfile, handleUpdateProfile } from "@/lib/api/user/profile";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "profile:read");
  if (permissionError) return permissionError;
  return handleGetProfile(actor.userId);
}

export async function PUT(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "profile:write");
  if (permissionError) return permissionError;
  return handleUpdateProfile(request, actor.userId);
}
