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
import { useOperatorSessionStore } from "@/stores/operator-session-store";
import { useSessionStore } from "@/stores/session-store";
import { useThemeStore } from "@/stores/theme-store";

// Any validation message a schema doesn't word itself reads as plain English, not Zod's developer text.
z.config({ customError: plainLanguageError });

/**
 * Holds rendering until MSW is ready, so the first request isn't missed. The demo's data lives in a service worker,
 * which some browsers refuse (Firefox private windows, locked-down work laptops): say so rather than load forever.
 */
function MockGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"starting" | "ready" | "blocked">(env.apiMocking ? "starting" : "ready");
  useEffect(() => {
    if (!env.apiMocking) return;
    import("@/mocks/browser")
      .then(({ worker }) => worker.start({ onUnhandledFrame: "bypass", quiet: true }))
      .then(
        () => setState("ready"),
        () => setState("blocked"),
      );
  }, []);
  if (state === "ready") return children;
  if (state === "starting") return <LoadingScreen />;
  return (
    <main role="alert" className="flex min-h-screen items-center justify-center bg-ground px-4">
      <div className="max-w-md space-y-3 rounded-2xl border border-line bg-surface p-6 text-center shadow-card">
        <h1 className="text-xl font-semibold">This browser can&apos;t run the demo</h1>
        <p className="text-sm text-ink-muted">
          The Primolar demo keeps its sample data in your browser, and this browser blocked that. Open the link in a normal
          (not private) window of Chrome, Edge, Safari or Firefox.
        </p>
      </div>
    </main>
  );
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
        // A 401 means the session is gone (another tab signed out, storage cleared): back to sign-in. Operator
        // queries (keys under "operator") end the operator's session only, never a clinic session in the same browser.
        queryCache: new QueryCache({
          onError: (e, query) => {
            if (!(e instanceof ApiError) || e.status !== 401) return;
            if (query.queryKey[0] === "operator") useOperatorSessionStore.getState().signOut();
            else useSessionStore.getState().signOut();
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
