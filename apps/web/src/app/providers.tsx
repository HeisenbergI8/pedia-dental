"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { plainLanguageError } from "@pedia/shared";
import { Toaster } from "@/components/ui/sonner";
import { env } from "@/lib/env";

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

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <MockGate>{children}</MockGate>
      <Toaster />
    </QueryClientProvider>
  );
}
