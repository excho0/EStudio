import { NextResponse } from "next/server";
import {
  pushSubscriptionDeleteRequestSchema,
  pushSubscriptionInputSchema,
} from "@/lib/push/schemas";
import {
  disablePushSubscriptionByEndpoint,
  upsertPushSubscription,
} from "@/lib/push/repository";

export async function handleSubscribePush(request: Request, userId: string) {
  const parsed = pushSubscriptionInputSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription payload." }, { status: 400 });
  }

  const subscription = await upsertPushSubscription(userId, parsed.data);
  return NextResponse.json({ ok: true, subscriptionId: subscription.id });
}

export async function handleUnsubscribePush(request: Request) {
  const parsed = pushSubscriptionDeleteRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid unsubscribe payload." }, { status: 400 });
  }

  await disablePushSubscriptionByEndpoint(parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
