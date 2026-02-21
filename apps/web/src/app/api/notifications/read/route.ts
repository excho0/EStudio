import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleMarkNotificationsRead } from "@/lib/api/notifications/mark-read";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const payload = await request.json().catch(() => ({}));
  return handleMarkNotificationsRead(user.id, payload);
}
