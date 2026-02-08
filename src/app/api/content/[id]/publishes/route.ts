import {
  handleCreatePublish,
  handleListPublishes,
} from "@/lib/api/content/publishes";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return handleListPublishes(request, params.id);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return handleCreatePublish(request, params.id);
}
