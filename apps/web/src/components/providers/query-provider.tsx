"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
// import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { HttpError } from "@/lib/http/fetch-json";

export const QueryProvider = ({ children }: { children: React.ReactNode }) => {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10_000,
            refetchOnWindowFocus: true,
            retry: (failureCount, error) => {
              if (error instanceof HttpError && error.status === 401) {
                return false;
              }
              return failureCount < 3;
            },
            retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
            // refetchInterval: 30_000,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
};
