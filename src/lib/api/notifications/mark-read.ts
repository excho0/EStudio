import { NextResponse } from "next/server";
import {
  markNotificationsRead,
  notificationsMarkReadRequestSchema,
} from "@/lib/data/notifications";

export const handleMarkNotificationsRead = async (
  userId: string,
  payload: unknown
) => {
  const parsed = notificationsMarkReadRequestSchema.parse(payload ?? {});
  const updated = await markNotificationsRead(userId, parsed.ids);
  return NextResponse.json({
    ok: true as const,
    updated,
  });
};
