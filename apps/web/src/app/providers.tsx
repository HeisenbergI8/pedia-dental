"use client";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { plainLanguageError } from "@pedia/shared";
import { LoadingScreen } from "@/components/brand";
import { Toaster } from "@/components/ui/sonner";
import { ApiError } from "@/lib/api-client";
import { env } from "@/lib/env";
import { resolveTheme } from "@/lib/theme";
import { useSessionStore } from "@/stores/session-store";
import { useThemeStore } from "@/stores/theme-store";

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
  return ready ? children : <LoadingScreen />;
}

/** Keeps <html data-theme> in step with the saved preference, and with the OS while it is "System". */
function ThemeSync() {
  const preference = useThemeStore((s) => s.preference);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference);
    };
    apply();
    if (preference !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);
  return null;
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
      <ThemeSync />
      <MockGate>{children}</MockGate>
      {/* Top centre: dialogs, sheets and the bottom nav keep their actions at the bottom, so a toast there covers them. */}
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
