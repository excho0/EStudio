import { handleGetPublishProviders } from "@/lib/api/publish/providers";

export const runtime = "nodejs";

export async function GET() {
  return handleGetPublishProviders();
}
