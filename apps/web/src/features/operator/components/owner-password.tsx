"use client";
import { toast } from "sonner";
import type { CreateAccountResult } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";

/** The new Owner's temporary password and PIN, shown once (decision #21). "I've passed it on" is the only way out. */
export function OwnerPassword({ result, onDone }: { result: CreateAccountResult; onDone: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        {result.overview.owner?.name} can sign in now with this temporary password, and chooses their own the first time.
        <strong> It is shown only once.</strong>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-lg bg-selected p-4 text-sm">
        <dt className="text-ink-muted">Email</dt>
        <dd className="break-all">{result.overview.owner?.email}</dd>
        <dt className="text-ink-muted">Temporary password</dt>
        <dd className="font-mono text-base select-all">{result.temporaryPassword}</dd>
        <dt className="text-ink-muted">Switch-user PIN</dt>
        <dd className="font-mono select-all">{result.pin}</dd>
      </dl>
      <DialogFooter>
        <Button
          variant="outline"
          onClick={() =>
            navigator.clipboard.writeText(result.temporaryPassword).then(
              () => toast.success("Password copied"),
              () => toast.error("Couldn't copy. Select the password and copy it instead."),
            )
          }
        >
          Copy password
        </Button>
        <Button onClick={onDone}>I&apos;ve passed it on</Button>
      </DialogFooter>
    </div>
  );
}
