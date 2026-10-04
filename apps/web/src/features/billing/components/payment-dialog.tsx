"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PaymentMethod, RecordPaymentInput, formatPeso, invoiceBalance, invoiceTotal, pesos, type Invoice, type Payment } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStaff } from "@/features/clinic/api";
import { METHOD_LABEL, useRecordPayment } from "../api";

/** Records a payment, or a refund as a negative payment. Mounted fresh per open (keyed by the caller). */
export function PaymentDialog({ target, payments, onClose }: { target: { invoice: Invoice; refund: boolean }; payments: Payment[]; onClose: () => void }) {
  const { invoice, refund } = target;
  const balance = invoiceBalance(invoice, payments);
  const paid = invoiceTotal(invoice) - balance;
  const staff = useStaff().data ?? [];
  const record = useRecordPayment();
  const [amount, setAmount] = useState(refund ? "" : String(balance / 100)); // a payment defaults to the full balance
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [note, setNote] = useState("");
  const [receivedBy, setReceivedBy] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const by = receivedBy || (staff.find((s) => s.role === "front_desk")?.id ?? "");

  function submit(e: FormEvent) {
    e.preventDefault();
    const centavos = Math.abs(pesos(Number(amount) || 0));
    const parsed = RecordPaymentInput.safeParse({
      amount: refund ? -centavos : centavos,
      method,
      referenceNo: referenceNo.trim() || undefined,
      note: note.trim() || undefined,
      receivedBy: by,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    record.mutate(
      { invoiceId: invoice.id, ...parsed.data },
      {
        onSuccess: (p) => {
          toast.success(`${refund ? "Refund" : "Payment"} recorded · receipt ${p.receiptNo}`);
          onClose();
        },
        onError: (err) => toast.error(err.message), // e.g. more than the balance; the dialog stays open
      },
    );
  }

  const fieldError = (key: string) => errors[key] && <p id={`pay-${key}-error`} className="text-sm text-danger">{errors[key]}</p>;
  const described = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `pay-${key}-error` } : {});

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{refund ? "Record a refund" : "Record a payment"}</DialogTitle>
          <DialogDescription>
            {refund ? `${formatPeso(paid)} paid on this invoice so far.` : `Balance ${formatPeso(balance)}. Partial payments are fine.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">{refund ? "Amount refunded (₱)" : "Amount received (₱)"}</Label>
            <Input id="pay-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} {...described("amount")} />
            {fieldError("amount")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(PaymentMethod.parse(v))}>
              <SelectTrigger id="pay-method" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PaymentMethod.options.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {method !== "cash" && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-referenceNo">Reference number</Label>
              <Input id="pay-referenceNo" value={referenceNo} onChange={(e) => setReferenceNo(e.target.value)} {...described("referenceNo")} />
              {fieldError("referenceNo")}
            </div>
          )}
          {refund && (
            <div className="space-y-1.5">
              <Label htmlFor="pay-note">Reason for the refund</Label>
              <Textarea id="pay-note" value={note} onChange={(e) => setNote(e.target.value)} {...described("note")} />
              {fieldError("note")}
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="pay-receivedBy">{refund ? "Refunded by" : "Received by"}</Label>
            <Select value={by} onValueChange={setReceivedBy}>
              <SelectTrigger id="pay-receivedBy" className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
            {fieldError("receivedBy")}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={record.isPending}>{refund ? "Record refund" : "Record payment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
