import { NextResponse } from "next/server";
import {
  getUserNotificationPreferences,
  updateUserNotificationPreferences,
  userNotificationPreferencesUpdateRequestSchema,
} from "@/lib/data/user-preferences";

export async function handleGetUserNotificationPreferences(userId: string) {
  const preferences = await getUserNotificationPreferences(userId);
  return NextResponse.json({ preferences });
}

export async function handleUpdateUserNotificationPreferences(
  request: Request,
  userId: string
) {
  const parsed = userNotificationPreferencesUpdateRequestSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid notification preferences payload." },
      { status: 400 }
    );
  }

  const preferences = await updateUserNotificationPreferences(
    userId,
    parsed.data.notifications
  );
  return NextResponse.json({ ok: true, preferences });
}
