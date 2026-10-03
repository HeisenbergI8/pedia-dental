"use client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { plainLanguageError } from "@pedia/shared";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api-client";
import { env } from "@/lib/env";
import { useSessionStore } from "@/stores/session-store";

// Any validation message a schema doesn't word itself reads as plain English, not Zod's developer text.
z.config({ customError: plainLanguageError });

/** Holds rendering until MSW is ready, so the first request isn't missed. */
function MockGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!env.apiMocking);
  useEffect(() => {
    if (!env.apiMocking) return;
    import("@/mocks/browser")
      .then(({ worker }) => worker.start({ onUnhandledFrame: "bypass", quiet: true }))
      .then(() => setReady(true));
  }, []);
  return ready ? children : null;
}

/** 401 and 403 won't change on a retry. */
const isAuthError = (e: unknown) => e instanceof ApiError && (e.status === 401 || e.status === 403);

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: { queries: { staleTime: 30_000, retry: (count, e) => !isAuthError(e) && count < 1 } },
        // A 401 means the session is gone (another tab signed out, storage cleared): back to /login.
        queryCache: new QueryCache({
          onError: (e) => {
            if (e instanceof ApiError && e.status === 401) useSessionStore.getState().signOut();
          },
        }),
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MockGate>{children}</MockGate>
      <Toaster />
    </QueryClientProvider>
  );
}
