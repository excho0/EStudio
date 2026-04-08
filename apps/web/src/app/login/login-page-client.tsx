"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCsrfToken, signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthPage, authProviderIcons } from "@/components/auth/auth-page";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/http/query-keys";
import { sdk } from "@/lib/sdk";

const allProviders = [
  {
    id: "google" as const,
    label: "Continue with Google",
  },
  {
    id: "github" as const,
    label: "Continue with GitHub",
  },
  {
    id: "discord" as const,
    label: "Continue with Discord",
  },
];

export function LoginPageClient({
  callbackUrl,
  authError,
}: {
  callbackUrl: string;
  authError?: string;
}) {
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { status } = useSession();
  const router = useRouter();
  const didPrimeCsrfRef = useRef(false);
  const didHandleErrorRef = useRef(false);

  useEffect(() => {
    if (didPrimeCsrfRef.current) return;
    didPrimeCsrfRef.current = true;
    void getCsrfToken();
  }, []);

  useEffect(() => {
    if (authError !== "MissingCSRF" || didHandleErrorRef.current) return;
    didHandleErrorRef.current = true;
    toast.error("Security state expired. Please try signing in again.");
    void getCsrfToken().finally(() => {
      const nextUrl = callbackUrl === "/dashboard"
        ? "/login"
        : `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
      router.replace(nextUrl);
    });
  }, [authError, callbackUrl, router]);

  const metaProvidersQuery = useQuery<{
    oauthProviders?: string[];
    emailEnabled?: boolean;
  }>({
    queryKey: queryKeys.metaProviders,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => sdk.meta.providers(),
  });

  const enabledProviders = useMemo(
    () => metaProvidersQuery.data?.oauthProviders ?? [],
    [metaProvidersQuery.data?.oauthProviders]
  );
  const emailEnabled = metaProvidersQuery.data?.emailEnabled ?? true;
  const providersLoading = metaProvidersQuery.isLoading && !metaProvidersQuery.data;

  const providers = useMemo(
    () => allProviders.filter((provider) => enabledProviders.includes(provider.id)),
    [enabledProviders]
  );

  return (
    <AuthPage
      providers={providers.map((provider) => ({
        ...provider,
        icon: authProviderIcons[provider.id],
        onClick: () => {
          void (async () => {
            await getCsrfToken();
            await signIn(provider.id, { callbackUrl });
          })();
        },
      }))}
      onMagicLink={(email) => {
        void (async () => {
          setIsSubmitting(true);
          await getCsrfToken();
          const result = await signIn("nodemailer", {
            email,
            callbackUrl,
            redirect: false,
          });
          if (result?.error) {
            toast.error(result.error);
            setIsSubmitting(false);
            return;
          }
          if (result?.ok) {
            setVerificationEmail(email);
            setIsSubmitting(false);
          }
        })();
      }}
      showMagicLink={!providersLoading && emailEnabled}
      loadingProviders={providersLoading}
      showVerificationNotice={Boolean(verificationEmail)}
      verificationEmail={verificationEmail ?? undefined}
      onVerificationBack={() => {
        setVerificationEmail(null);
        setIsSubmitting(false);
      }}
      loading={isSubmitting || status === "loading"}
    />
  );
}
