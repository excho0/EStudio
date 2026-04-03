import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  handleSubscribePush,
  handleUnsubscribePush,
} from "@/lib/api/push";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleSubscribePush(request, user.id);
}

export async function DELETE(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleUnsubscribePush(request);
}
