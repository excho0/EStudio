import { handleQueueHealth } from "@/lib/api/internal/queue-health";

export const runtime = "nodejs";

export const GET = handleQueueHealth;
