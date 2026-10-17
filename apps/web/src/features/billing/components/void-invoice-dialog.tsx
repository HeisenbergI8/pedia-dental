"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { VoidInvoiceInput, formatPeso, invoiceTotal, type Invoice } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { useVoidInvoice } from "../api";

/** Decision 2: void a bill made by mistake. Offered only while nothing was ever paid or applied on it (the server checks too). */
export function VoidInvoiceDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const voiding = useVoidInvoice();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string>();

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = VoidInvoiceInput.safeParse({ reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    voiding.mutate(
      { invoiceId: invoice.id, ...parsed.data },
      {
        onSuccess: () => {
          toast.success("Bill voided. Its treatments can be billed again.");
          onClose();
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this bill?</DialogTitle>
          <DialogDescription>
            The invoice of {formatDate(invoice.issuedAt)} ({formatPeso(invoiceTotal(invoice))}) stays on record, marked voided, and no longer
            counts in the balance. Its treatments can be billed again.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">Why is it voided?</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              aria-invalid={!!error}
              aria-describedby={error ? "void-reason-error" : undefined}
              autoFocus
            />
            {error && <p id="void-reason-error" className="text-sm text-danger">{error}</p>}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Keep bill</Button>
            <Button type="submit" variant="destructive" disabled={voiding.isPending}>Void bill</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
