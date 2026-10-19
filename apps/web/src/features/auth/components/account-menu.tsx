"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronsUpDownIcon, KeyRoundIcon, LogOutIcon, RotateCcwIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { env } from "@/lib/env";
import { canResetDemoData } from "../demo";
import { firstName, withoutTitle } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Can, ROLE_LABEL, useSession } from "../access";
import { useSignOut } from "../api";
import { AppearanceItems } from "./appearance-items";
import { SwitchUserDialog } from "./switch-user-dialog";

/** Reseeds the mock database. Imported lazily, like providers.tsx, so mocks stay out of the bundle. */
function resetDemoData() {
  if (!window.confirm("Reset all demo data? Every patient, visit and appointment you added will be replaced by the original sample data.")) return;
  void import("@/mocks/db").then((m) => m.resetDb());
}

const initials = (name: string) =>
  withoutTitle(name)
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("");

/**
 * Who is acting on this device, always visible, with switch user (staff, own PIN), appearance and sign out.
 * `full`: sidebar and phone menu sheet. `bar`: phone and portal top bars. `rail`: the tablet icon rail.
 */
export function AccountMenu({ variant = "full" }: { variant?: "full" | "bar" | "rail" }) {
  const session = useSession();
  const signOut = useSignOut();
  const [switching, setSwitching] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  if (!session) return null;
  const { user } = session;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            aria-label={`${user.name}, ${ROLE_LABEL[user.role]}. Account menu`}
            className={cn(
              "h-auto min-h-11 text-left text-ink", // ghost is muted by default; the account name is not
              // A long name wraps to a second line rather than being cut off (a name is identity).
              variant === "full" && "w-full justify-start gap-2.5 rounded-xl border border-line bg-surface p-2 whitespace-normal hover:bg-selected",
              variant === "bar" && "gap-2 px-2",
              variant === "rail" && "w-full flex-col gap-1 px-1 py-1.5",
            )}
          >
            <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-deep text-sm font-bold text-on-deep">
              {initials(user.name)}
            </span>
            {variant === "full" && (
              <span className="min-w-0 flex-1">
                <span className="block text-sm leading-snug font-semibold break-words">{user.name}</span>
                <span className="block text-xs font-normal text-ink-muted">{ROLE_LABEL[user.role]}</span>
              </span>
            )}
            {variant === "bar" && <span className="max-w-24 truncate text-sm font-medium">{firstName(user.name)}</span>}
            {variant === "rail" && <span className="w-full truncate text-center text-xs font-medium">{firstName(user.name)}</span>}
            {variant !== "rail" && <ChevronsUpDownIcon className="size-4 shrink-0 text-ink-muted" aria-hidden />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuLabel className="font-normal">
            <span className="block font-medium">{user.name}</span>
            <span className="block text-xs text-ink-muted">{ROLE_LABEL[user.role]}</span>
          </DropdownMenuLabel>
          {user.guardianId && (
            <DropdownMenuItem asChild>
              <Link href="/portal/account">
                <KeyRoundIcon /> Change password
              </Link>
            </DropdownMenuItem>
          )}
          <Can permission="session.switch">
            <DropdownMenuItem onSelect={() => setSwitching(true)}>
              <UsersIcon /> Switch user
            </DropdownMenuItem>
          </Can>
          {canResetDemoData(env.apiMockingMode) && (
            <DropdownMenuItem onSelect={resetDemoData}>
              <RotateCcwIcon /> Reset demo data
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <AppearanceItems />
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSigningOut(true)}>
            <LogOutIcon /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu, so the menu's focus handling doesn't fight the dialog's focus trap. */}
      <SwitchUserDialog open={switching} onOpenChange={setSwitching} />
      <Dialog open={signingOut} onOpenChange={setSigningOut}>
        {/* A short question: a bottom sheet on phones, a small card from sm. */}
        <DialogContent size="confirm">
          <DialogHeader>
            <DialogTitle>Sign out?</DialogTitle>
            <DialogDescription>
              {user.name} will be signed out on this device. Anything not yet saved will be lost.
            </DialogDescription>
          </DialogHeader>
          {/* Who is leaving, at a glance: on a shared device the name alone is easy to skim past. aria-hidden because the
              description already says it in words. */}
          <div aria-hidden className="flex items-center gap-3 rounded-xl border border-line bg-ground p-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-deep text-sm font-bold text-on-deep">
              {initials(user.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">{user.name}</span>
              <span className="block text-sm text-ink-muted">{ROLE_LABEL[user.role]}</span>
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSigningOut(false)}>
              Cancel
            </Button>
            <Button variant="strong" onClick={signOut}>
              <LogOutIcon /> Sign out
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
