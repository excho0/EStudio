import {
  handleDeletePublish,
  handleRetryPublish,
} from "@/lib/api/content/publish-item";

export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; publishId: string }> }
) {
  const params = await context.params;
  return handleDeletePublish(params.id, params.publishId);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; publishId: string }> }
) {
  const params = await context.params;
  return handleRetryPublish(params.id, params.publishId);
}
