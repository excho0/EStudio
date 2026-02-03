"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthPage, authProviderIcons } from "@/components/auth/auth-page";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import { fetchJson } from "@/lib/fetch-json";

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

export default function LoginPage() {
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { status } = useSession();
  const router = useRouter();
  const getCallbackUrl = () =>
    typeof window === "undefined" ? "/dashboard" : `${window.location.origin}/dashboard`;

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  const metaProvidersQuery = useQuery<{
    oauthProviders?: string[];
    emailEnabled?: boolean;
  }>({
    queryKey: queryKeys.metaProviders,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      return fetchJson<{
        oauthProviders?: string[];
        emailEnabled?: boolean;
      }>("/api/meta/providers", undefined, "Failed to load providers.");
    },
  });

  const enabledProviders =
    metaProvidersQuery.data?.oauthProviders ?? allProviders.map((provider) => provider.id);
  const emailEnabled =
    metaProvidersQuery.data?.emailEnabled ?? true;

  const providers = useMemo(
    () => allProviders.filter((provider) => enabledProviders.includes(provider.id)),
    [enabledProviders]
  );

  if (status === "authenticated") {
    return null;
  }

  return (
    <AuthPage
      providers={providers.map((provider) => ({
        ...provider,
        icon: authProviderIcons[provider.id],
        onClick: () => signIn(provider.id, { callbackUrl: getCallbackUrl() }),
      }))}
      onMagicLink={(email) => {
        void (async () => {
          setIsSubmitting(true);
          const result = await signIn("nodemailer", {
            email,
            callbackUrl: getCallbackUrl(),
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
          // Stay on the page and show the verification notice.
        })();
      }}
      showMagicLink={emailEnabled}
      showVerificationNotice={Boolean(verificationEmail)}
      verificationEmail={verificationEmail ?? undefined}
      onVerificationBack={() => {
        setVerificationEmail(null);
        setIsSubmitting(false);
      }}
      loading={isSubmitting}
    />
  );
}
