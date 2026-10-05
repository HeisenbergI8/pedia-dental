"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { MONEY_METHODS, PaymentMethod, RecordPaymentInput, formatPeso, invoiceBalance, invoiceTotal, pesos, type Invoice, type Payment } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStaff } from "@/features/clinic/api";
import { METHOD_LABEL, useRecordDeposit, useRecordPayment } from "../api";

/** Money against an invoice, or held on the account as a deposit (refunds are negative in both). */
export type PaymentTarget = { invoice: Invoice; refund: boolean } | { deposit: true; patientId: string; held: number; refund: boolean };

/**
 * Records a payment or a deposit, or a refund of either as a negative amount. One form for both, so the fields,
 * validation and receipt hand-off can't drift. Mounted fresh per open (keyed by the caller).
 */
export function PaymentDialog({ target, payments, onClose }: { target: PaymentTarget; payments: Payment[]; onClose: () => void }) {
  const { refund } = target;
  const invoice = "invoice" in target ? target.invoice : undefined;
  const balance = invoice ? invoiceBalance(invoice, payments) : 0;
  const paid = invoice ? invoiceTotal(invoice) - balance : 0;
  const staff = useStaff().data ?? [];
  const recordPayment = useRecordPayment();
  const recordDeposit = useRecordDeposit("invoice" in target ? target.invoice.patientId : target.patientId);
  const pending = recordPayment.isPending || recordDeposit.isPending;
  const what = invoice ? (refund ? "Refund" : "Payment") : refund ? "Deposit refund" : "Deposit";
  const [amount, setAmount] = useState(refund || !invoice ? "" : String(balance / 100)); // a payment defaults to the full balance
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
    const handlers = {
      onSuccess: (p: Payment) => {
        toast.success(`${what} recorded · receipt ${p.receiptNo}`);
        onClose();
      },
      onError: (err: Error) => toast.error(err.message), // e.g. more than the balance; the dialog stays open
    };
    if (invoice) recordPayment.mutate({ invoiceId: invoice.id, ...parsed.data }, handlers);
    else recordDeposit.mutate(parsed.data, handlers);
  }

  const fieldError = (key: string) => errors[key] && <p id={`pay-${key}-error`} className="text-sm text-danger">{errors[key]}</p>;
  const described = (key: string) => (errors[key] ? { "aria-invalid": true, "aria-describedby": `pay-${key}-error` } : {});

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{invoice ? (refund ? "Record a refund" : "Record a payment") : refund ? "Refund a deposit" : "Take a deposit"}</DialogTitle>
          <DialogDescription>
            {invoice
              ? refund
                ? `${formatPeso(paid)} paid on this invoice so far.`
                : `Balance ${formatPeso(balance)}. Partial payments are fine.`
              : refund
                ? `${formatPeso("held" in target ? target.held : 0)} on deposit.`
                : "Held on the account and applied to later invoices."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount">{refund ? "Amount refunded (₱)" : invoice ? "Amount received (₱)" : "Deposit received (₱)"}</Label>
            <Input id="pay-amount" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} {...described("amount")} />
            {fieldError("amount")}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(PaymentMethod.parse(v))}>
              <SelectTrigger id="pay-method" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONEY_METHODS.map((m) => <SelectItem key={m} value={m}>{METHOD_LABEL[m]}</SelectItem>)}
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
            <Button type="submit" disabled={pending}>{refund ? "Record refund" : invoice ? "Record payment" : "Record deposit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
