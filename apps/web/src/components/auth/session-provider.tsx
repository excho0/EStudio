"use client";

import { useEffect } from "react";
import type React from "react";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AUTH_CHANGED_EVENT,
  AUTH_EXPIRED_EVENT,
  invalidateAuthQueries,
  removeAuthQueries,
} from "@/lib/auth/client-sync";

function SessionSyncBridge() {
  const { status, update } = useSession();
  const queryClient = useQueryClient();

  useEffect(() => {
    const syncSession = () => {
      void update();
      void invalidateAuthQueries(queryClient);
    };

    const clearAuthState = () => {
      removeAuthQueries(queryClient);
      void update();
    };

    window.addEventListener(AUTH_CHANGED_EVENT, syncSession);
    window.addEventListener(AUTH_EXPIRED_EVENT, clearAuthState);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncSession);
      window.removeEventListener(AUTH_EXPIRED_EVENT, clearAuthState);
    };
  }, [queryClient, update]);

  useEffect(() => {
    if (status === "unauthenticated") {
      removeAuthQueries(queryClient);
    }
  }, [queryClient, status]);

  return null;
}

export function AppSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <SessionProvider
      session={session}
      refetchOnWindowFocus
      refetchWhenOffline={false}
      refetchInterval={300}
    >
      <SessionSyncBridge />
      {children}
    </SessionProvider>
  );
}
