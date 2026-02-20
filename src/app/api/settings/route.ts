import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { handleGetSettings, handleUpdateSettings } from "@/lib/api/settings";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleGetSettings(user.id);
}

export async function PATCH(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleUpdateSettings(request, user.id);
}
