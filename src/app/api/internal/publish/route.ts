import { NextResponse } from "next/server";
import { processPublishJob } from "@/lib/publishing/publish-queue";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const workerSecret = process.env.RENDER_WORKER_SECRET?.trim() || "";
  const provided = request.headers.get("x-render-worker-secret")?.trim() || "";
  if (!workerSecret || provided !== workerSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | { publishId?: string }
    | null;
  const publishId = body?.publishId?.trim();
  if (!publishId) {
    return NextResponse.json({ error: "Missing publishId" }, { status: 400 });
  }

  try {
    await processPublishJob(publishId);
    return NextResponse.json({ ok: true, publishId }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Publish execution failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
