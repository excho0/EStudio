import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import {
  handleCreateContent,
  handleListContent,
} from "@/lib/api/content/collection";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleListContent(request, user.id);
}

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return handleCreateContent(request, user.id);
}
