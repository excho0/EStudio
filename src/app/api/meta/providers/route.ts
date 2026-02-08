import { handleGetMetaProviders } from "@/lib/api/meta/providers";

export const runtime = "nodejs";

export async function GET() {
  return handleGetMetaProviders();
}
