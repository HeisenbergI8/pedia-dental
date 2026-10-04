"use client";
import { useRef, useState } from "react";
import { CameraIcon, ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { PatientView } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useRemovePatientPhoto, useSetPatientPhoto } from "../api";
import { PatientAvatar } from "./patient-avatar";

/** The header avatar is the trigger (44 px). Only rendered for patients.write (patient-header.tsx). */
export function PatientPhotoDialog({ patient: p }: { patient: PatientView }) {
  const [open, setOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const camera = useRef<HTMLInputElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const set = useSetPatientPhoto(p.id);
  const remove = useRemovePatientPhoto(p.id);

  function pick(files: FileList | null) {
    const chosen = files?.[0];
    if (!chosen) return;
    set.mutate(chosen, {
      onSuccess: () => {
        toast.success(`${p.firstName}'s photo saved`);
        setOpen(false);
      },
      onError: (e) => toast.error(e.message),
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (setOpen(next), setConfirmRemove(false))}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={p.photoUpdatedAt ? `Change ${p.firstName}'s photo` : `Add a photo of ${p.firstName}`}
          className="rounded-full focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <PatientAvatar patient={p} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Photo of {p.firstName}</DialogTitle>
          <DialogDescription>Helps staff recognise the right child. It is resized before saving.</DialogDescription>
        </DialogHeader>
        <PatientAvatar patient={p} className="mx-auto size-28 text-3xl" />
        <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files)} />
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files)} />
        {confirmRemove ? (
          <div role="group" aria-labelledby="remove-photo" className="space-y-2">
            <p id="remove-photo" className="font-semibold">Remove {p.firstName}&apos;s photo?</p>
            <p className="text-sm text-ink-muted">Their initials show instead. You can add a new photo any time.</p>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSuccess: () => setOpen(false), onError: (e) => toast.error(e.message) })}>
                Remove photo
              </Button>
              <Button variant="outline" onClick={() => setConfirmRemove(false)}>Keep it</Button>
            </div>
          </div>
        ) : (
          <DialogFooter className="gap-2 sm:justify-between">
            {/* Away from the primary actions, and behind a confirm. */}
            {p.photoUpdatedAt ? (
              <Button variant="ghost" className="text-danger sm:mr-auto" onClick={() => setConfirmRemove(true)}>Remove</Button>
            ) : <span />}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" disabled={set.isPending} onClick={() => file.current?.click()}>
                <ImageIcon aria-hidden /> Choose file
              </Button>
              <Button disabled={set.isPending} onClick={() => camera.current?.click()}>
                <CameraIcon aria-hidden /> {set.isPending ? "Saving…" : "Take photo"}
              </Button>
            </div>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
