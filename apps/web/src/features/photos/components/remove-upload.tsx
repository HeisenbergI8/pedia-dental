"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRemovePhoto } from "../api";

/**
 * Audit #5: Remove on a file a parent sent from the portal, after a confirmation (it can't be undone). Rendered only for
 * staff with clinical.write and only on parent uploads; the clinic's own photos are part of the record and stay.
 */
export function RemoveUpload({ patientId, photoId, label }: { patientId: string; photoId: string; label: string }) {
  const remove = useRemovePhoto(patientId);
  const [confirming, setConfirming] = useState(false);
  const confirm = () =>
    remove.mutate(photoId, {
      onSuccess: () => {
        setConfirming(false);
        toast.success(`${label} removed`);
      },
      onError: (e) => toast.error(e.message),
    });

  return (
    <>
      <Button variant="ghost" size="sm" className="min-h-11 px-2 sm:min-h-0" disabled={remove.isPending} onClick={() => setConfirming(true)}>
        Remove
      </Button>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent size="confirm">
          <DialogHeader>
            <DialogTitle>Remove this {label.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              A parent sent it from the portal. It will be deleted for staff and the family, and frees its storage. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="strong" disabled={remove.isPending} onClick={confirm}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
