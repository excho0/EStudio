import { handleGetPublishProviderAvatar } from "@/lib/api/publish/provider-item";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return handleGetPublishProviderAvatar(params.id);
}
