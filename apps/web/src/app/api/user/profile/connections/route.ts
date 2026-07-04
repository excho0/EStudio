import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import {
  handleDeleteConnection,
  handleGetConnections,
} from "@/lib/api/user/connections";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "profile:read");
  if (permissionError) return permissionError;
  return handleGetConnections(actor.userId);
}

export async function DELETE(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "profile:write");
  if (permissionError) return permissionError;
  return handleDeleteConnection(request, actor.userId);
}
