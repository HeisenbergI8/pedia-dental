"use client";
import { useState } from "react";
import { toast } from "sonner";
import { CircleCheckIcon, CircleDashedIcon, CircleOffIcon, ClockIcon, SendIcon } from "lucide-react";
import { maskedNumber, type GuardianView, type PortalAccess } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePortalAction } from "@/features/portal/api";
import { formatDate } from "@/lib/format";

/** Icon and words together: the state never rests on colour (decision 17). */
function status(a: PortalAccess): { icon: typeof ClockIcon; text: string } {
  const on = (iso: string | undefined) => (iso ? formatDate(iso) : "");
  if (a.state === "active") return { icon: CircleCheckIcon, text: `Portal: active since ${on(a.activatedAt)}` };
  if (a.state === "off") return { icon: CircleOffIcon, text: `Portal: turned off on ${on(a.turnedOffAt)}` };
  if (a.state === "invited") {
    const expired = !a.inviteExpiresAt || Date.parse(a.inviteExpiresAt) <= Date.now();
    return { icon: ClockIcon, text: expired ? `Portal: invite expired (sent ${on(a.invitedAt)})` : `Portal: invited on ${on(a.invitedAt)} · expires ${on(a.inviteExpiresAt)}` };
  }
  return { icon: CircleDashedIcon, text: "Portal: not invited" };
}

/**
 * One guardian's portal access on the child's Overview (B11 decisions 2, 16–18): the status, then Invite, Resend or
 * Turn off. Rendered only for staff with portal.manage.
 */
export function GuardianPortal({ patientId, childName, guardian, access }: { patientId: string; childName: string; guardian: GuardianView; access: PortalAccess }) {
  const act = usePortalAction(patientId);
  const [confirming, setConfirming] = useState(false);
  const { icon: Icon, text } = status(access);
  const send = () =>
    act.mutate(
      { guardianId: guardian.id, action: "invite" },
      { onSuccess: () => toast.success(`Invite sent to ${maskedNumber(guardian.phone)}`), onError: (e) => toast.error(e.message) },
    );
  const turnOff = () =>
    act.mutate(
      { guardianId: guardian.id, action: "off" },
      {
        onSuccess: () => {
          setConfirming(false);
          toast.success(`${guardian.fullName}'s portal access is off`);
        },
        onError: (e) => toast.error(e.message),
      },
    );

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1">
      <p className="flex items-center gap-1.5 text-sm text-ink-muted">
        <Icon className="size-4 shrink-0" aria-hidden />
        {text}
      </p>
      {access.state !== "active" && access.blocked ? (
        <p className="text-sm text-ink-muted">{access.blocked}</p>
      ) : (
        access.state !== "active" && (
          <Button variant="outline" size="sm" className="min-h-11 sm:min-h-0" disabled={act.isPending} onClick={send}>
            <SendIcon aria-hidden /> {access.state === "invited" ? "Resend invite" : "Invite to portal"}
          </Button>
        )
      )}
      {(access.state === "invited" || access.state === "active") && (
        <Button variant="ghost" size="sm" className="min-h-11 sm:min-h-0" disabled={act.isPending} onClick={() => setConfirming(true)}>
          Turn off access
        </Button>
      )}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent size="confirm">
          <DialogHeader>
            <DialogTitle>Turn off {guardian.fullName}&apos;s portal access?</DialogTitle>
            <DialogDescription>
              {guardian.fullName} will be signed out and won&apos;t see {childName}&apos;s records until you invite them again.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep access
            </Button>
            <Button variant="strong" disabled={act.isPending} onClick={turnOff}>
              Turn off access
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
