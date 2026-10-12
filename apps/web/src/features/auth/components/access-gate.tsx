"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { LockIcon } from "lucide-react";
import { isStaffRole } from "@pedia/shared";
import { LoadingScreen } from "@/components/brand";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import { ROLE_HOME, ROLE_LABEL, useSession } from "../access";
import { useSignOut } from "../api";
import { ChangePasswordScreen } from "./change-password-screen";

/** True once the persisted session has been read, so a signed-in user is never bounced to /login. */
function useHydrated() {
  return useSyncExternalStore(
    (onChange) => useSessionStore.persist.onFinishHydration(onChange),
    () => useSessionStore.persist.hasHydrated(),
    () => false,
  );
}

/** What a direct URL shows when the signed-in user can't use the page. */
export function NoAccess({ reason }: { reason?: string }) {
  const session = useSession();
  const signOut = useSignOut();
  if (!session) return null;
  const { user } = session;
  return (
    <EmptyState
      icon={LockIcon}
      title="You don't have access to this page"
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href={ROLE_HOME[user.role]}>Go to your home page</Link>
          </Button>
          <Button variant="outline" onClick={signOut}>Sign in as someone else</Button>
        </div>
      }
    >
      You&apos;re signed in as {user.name} ({ROLE_LABEL[user.role]}). {reason ?? "Ask a clinic admin if you need it."}
    </EmptyState>
  );
}

/**
 * Wraps the staff app and the portal. Signed out goes to /login. The wrong area (a parent in the staff
 * app, staff in the portal) shows NoAccess. UI only: the API refuses the data anyway (mocks/access.ts).
 */
export function RequireSession({ area, children }: { area: "clinic" | "portal"; children: ReactNode }) {
  const hydrated = useHydrated();
  const user = useSession()?.user;
  const role = user?.role;
  const router = useRouter();
  useEffect(() => {
    if (hydrated && !role) router.replace("/login");
  }, [hydrated, role, router]);

  if (!hydrated || !role) return <LoadingScreen />;
  if ((area === "clinic") !== isStaffRole(role)) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16">
        <NoAccess reason={area === "portal" ? "The parent portal is for parents." : "This part of the app is for clinic staff."} />
      </main>
    );
  }
  // A login the Owner just made: nothing else until they choose their own password (decision #21). The shell isn't
  // mounted, so none of its queries fire while the API would refuse them.
  if (user?.mustChangePassword) return <ChangePasswordScreen />;
  return <>{children}</>;
}

/** `/`: the signed-in role's home, or the login screen. */
export function HomeRedirect() {
  const hydrated = useHydrated();
  const role = useSession()?.user.role;
  const router = useRouter();
  useEffect(() => {
    if (hydrated) router.replace(role ? ROLE_HOME[role] : "/login");
  }, [hydrated, role, router]);
  return <LoadingScreen />;
}
