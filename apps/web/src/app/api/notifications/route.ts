import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import { handleListNotifications } from "@/lib/api/notifications/list";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "notifications:read");
  if (permissionError) return permissionError;
  const { searchParams } = new URL(request.url);
  const query = Object.fromEntries(searchParams.entries());
  return handleListNotifications(actor.userId, query);
}
