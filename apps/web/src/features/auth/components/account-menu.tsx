"use client";
import { ChevronsUpDownIcon, LogOutIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { ROLE_LABEL, useSession } from "../access";
import { useDemoAccounts, useSignIn, useSignOut } from "../api";

/** Reseeds the mock database. Imported lazily, like providers.tsx, so mocks stay out of the bundle. */
function resetDemoData() {
  if (!window.confirm("Reset all demo data? Every patient, visit and appointment you added will be replaced by the original sample data.")) return;
  void import("@/mocks/db").then((m) => m.resetDb());
}

const initials = (name: string) =>
  name
    .replace(/^Dr\.\s*/, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

/** Who is signed in, with sign out and (in the demo) one-click account switching. */
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const session = useSession();
  const demo = useDemoAccounts();
  const signIn = useSignIn();
  const signOut = useSignOut();
  if (!session) return null;
  const { user } = session;
  const others = (demo.data?.accounts ?? []).filter((a) => a.id !== user.id);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className={cn("h-auto min-h-11 justify-start gap-3 px-2 text-left", !compact && "w-full")}>
          <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-sm font-semibold text-brand">
            {initials(user.name)}
          </span>
          <span className={cn("min-w-0 flex-1", compact && "sr-only")}>
            <span className="block truncate text-sm font-medium">{user.name}</span>
            <span className="block text-xs font-normal text-ink-muted">{ROLE_LABEL[user.role]}</span>
          </span>
          <ChevronsUpDownIcon className="size-4 text-ink-muted" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {env.apiMocking && others.length > 0 && (
          <>
            <DropdownMenuLabel>Switch account</DropdownMenuLabel>
            {others.map((a) => (
              <DropdownMenuItem
                key={a.id}
                disabled={signIn.isPending}
                onSelect={() =>
                  signIn.mutate({ email: a.email, password: demo.data?.password ?? "" }, { onError: (e) => toast.error(e.message) })
                }
              >
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                <span className="text-xs text-ink-muted">{ROLE_LABEL[a.role]}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={resetDemoData}>
              <RotateCcwIcon /> Reset demo data
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuItem onSelect={signOut}>
          <LogOutIcon /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
