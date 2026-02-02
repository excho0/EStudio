"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthPage, authProviderIcons } from "@/components/auth/auth-page";

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
  const [enabledProviders, setEnabledProviders] = useState<string[]>([]);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const { status } = useSession();
  const router = useRouter();
  const getCallbackUrl = () =>
    typeof window === "undefined" ? "/dashboard" : `${window.location.origin}/dashboard`;

  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/");
    }
  }, [status, router]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/meta/providers");
        if (!response.ok) return;
        const payload = (await response.json()) as {
          oauthProviders?: string[];
          emailEnabled?: boolean;
        };
        setEnabledProviders(payload.oauthProviders ?? []);
        setEmailEnabled(payload.emailEnabled ?? false);
      } catch {
        setEnabledProviders(allProviders.map((provider) => provider.id));
        setEmailEnabled(true);
      }
    })();
  }, []);

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
