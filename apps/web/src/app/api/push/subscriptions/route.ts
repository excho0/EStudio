import { ensureActorPermission, resolveRequestActor } from "@/lib/auth/request-actor";
import {
  handleSubscribePush,
  handleUnsubscribePush,
} from "@/lib/api/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "notifications:write");
  if (permissionError) return permissionError;
  return handleSubscribePush(request, actor.userId);
}

export async function DELETE(request: Request) {
  const { actor, error } = await resolveRequestActor(request);
  if (error) return error;
  if (!actor) throw new Error("resolveRequestActor returned no actor and no error.");
  const permissionError = ensureActorPermission(actor, "notifications:write");
  if (permissionError) return permissionError;
  return handleUnsubscribePush(request);
}
