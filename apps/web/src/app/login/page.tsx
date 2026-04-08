import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LoginPageClient } from "@/app/login/login-page-client";

const normalizeCallbackUrl = (value: string | string[] | undefined) => {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || typeof raw !== "string") return "/dashboard";

  if (!raw.startsWith("/")) return "/dashboard";
  if (raw.startsWith("//")) return "/dashboard";
  if (raw.startsWith("/login")) return "/dashboard";

  return raw;
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const callbackUrl = normalizeCallbackUrl(resolvedSearchParams?.callbackUrl);
  const authError = Array.isArray(resolvedSearchParams?.error)
    ? resolvedSearchParams?.error[0]
    : resolvedSearchParams?.error;
  const session = await auth();

  if (session?.user) {
    redirect(callbackUrl);
  }

  return <LoginPageClient callbackUrl={callbackUrl} authError={authError} />;
}
