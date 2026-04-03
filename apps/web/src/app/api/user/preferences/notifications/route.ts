import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  handleGetUserNotificationPreferences,
  handleUpdateUserNotificationPreferences,
} from "@/lib/api/user-preferences";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleGetUserNotificationPreferences(user.id);
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleUpdateUserNotificationPreferences(request, user.id);
}
