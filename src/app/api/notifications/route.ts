import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleListNotifications } from "@/lib/api/notifications/list";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const query = Object.fromEntries(searchParams.entries());
  return handleListNotifications(user.id, query);
}
