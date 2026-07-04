import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import {
  handleGetUserNotificationPreferences,
  handleUpdateUserNotificationPreferences,
} from "@/lib/api/user-preferences";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "preferences:read");
  if (permissionError) return permissionError;
  return handleGetUserNotificationPreferences(actor.userId);
}

export async function PATCH(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) {
    throw new Error("resolveRequestActor returned no actor and no error.");
  }
  const permissionError = ensureActorPermission(actor, "preferences:write");
  if (permissionError) return permissionError;
  return handleUpdateUserNotificationPreferences(request, actor.userId);
}
