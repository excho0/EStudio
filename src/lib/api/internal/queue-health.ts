import { NextResponse } from "next/server";
import { getQueueHealth } from "@/lib/queue";

export const runtime = "nodejs";

export const handleQueueHealth = async (request: Request) => {
  const workerSecret = process.env.RENDER_WORKER_SECRET?.trim() || "";
  const provided =
    request.headers.get("x-render-worker-secret")?.trim() ||
    new URL(request.url).searchParams.get("secret")?.trim() ||
    "";

  if (!workerSecret || provided !== workerSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const health = await getQueueHealth();
  return NextResponse.json(health, { status: 200 });
};
