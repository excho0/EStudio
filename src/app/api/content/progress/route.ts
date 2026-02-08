import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { getRenderProgressSnapshot } from "@/lib/socket/manager";

export const runtime = "nodejs";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    items: await getRenderProgressSnapshot(user.id),
  });
}
