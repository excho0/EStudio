import {
  handleDeletePublishProvider,
  handleGetPublishProvider,
} from "@/lib/api/publish/provider-item";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return handleGetPublishProvider(params.id);
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return handleDeletePublishProvider(params.id);
}
