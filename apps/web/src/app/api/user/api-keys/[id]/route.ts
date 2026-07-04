import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import {
  handleDeleteUserApiKey,
  handleUpdateUserApiKey,
} from "@/lib/api/user/api-keys";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "api_keys:write");
  if (permissionError) return permissionError;
  const { id } = await context.params;
  return handleUpdateUserApiKey(request, actor.userId, id);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { actor, error } = await resolveRequestActor(_request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "api_keys:write");
  if (permissionError) return permissionError;
  const { id } = await context.params;
  return handleDeleteUserApiKey(actor.userId, id);
}
