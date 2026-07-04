import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleMarkNotificationsRead } from "@/lib/api/notifications/mark-read";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "notifications:write");
  if (permissionError) return permissionError;
  const payload = await request.json().catch(() => ({}));
  return handleMarkNotificationsRead(actor.userId, payload);
}
