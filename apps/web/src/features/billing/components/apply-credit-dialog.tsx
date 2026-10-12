"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ApplyCreditInput, appliedCredit, depositBalance, formatPeso, invoiceBalance, isActiveStaff, pesos, type Invoice, type Payment } from "@pedia/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/features/auth/access";
import { useBranchStaff, useStaff } from "@/features/clinic/api";
import { formatDate } from "@/lib/format";
import { useApplyCredit } from "../api";

/**
 * Moves deposit money onto an invoice, or back to the deposit. No money changes hands, so there is no method:
 * the server records a matching pair (invoice + deposit) and the day's collections don't count it.
 */
export function ApplyCreditDialog({ invoice, payments, mode, onClose }: { invoice: Invoice; payments: Payment[]; mode: "apply" | "return"; onClose: () => void }) {
  const held = depositBalance(payments, invoice.patientId);
  const balance = invoiceBalance(invoice, payments);
  const applied = appliedCredit(invoice.id, payments);
  const most = mode === "apply" ? Math.min(held, balance) : applied;
  const staff = useStaff().data ?? [];
  const branchStaff = useBranchStaff();
  const myId = useSession()?.user.staffId;
  const apply = useApplyCredit();
  const [amount, setAmount] = useState(String(most / 100));
  const [receivedBy, setReceivedBy] = useState("");
  const [error, setError] = useState<string>();
  // Whoever is signed in did it; else this branch's front desk (the server refuses unknown ids).
  const by = receivedBy || (staff.find((s) => s.id === myId) ?? branchStaff.find((s) => s.role === "front_desk"))?.id || "";

  function submit(e: FormEvent) {
    e.preventDefault();
    const centavos = Math.abs(pesos(Number(amount) || 0));
    const parsed = ApplyCreditInput.safeParse({ amount: mode === "apply" ? centavos : -centavos, receivedBy: by });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    if (centavos > most) return setError(`That's more than the ${formatPeso(most)} that can be ${mode === "apply" ? "applied" : "returned"}`);
    apply.mutate(
      { invoiceId: invoice.id, ...parsed.data },
      {
        onSuccess: () => {
          toast.success(mode === "apply" ? `${formatPeso(centavos)} paid from the deposit` : `${formatPeso(centavos)} returned to the deposit`);
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
          <DialogTitle>{mode === "apply" ? "Pay from the deposit" : "Return to the deposit"}</DialogTitle>
          <DialogDescription>
            {mode === "apply"
              ? `Invoice of ${formatDate(invoice.issuedAt)} · balance ${formatPeso(balance)}. ${formatPeso(held)} on deposit.`
              : `${formatPeso(applied)} of the deposit is on the invoice of ${formatDate(invoice.issuedAt)}.`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="credit-amount">Amount (₱)</Label>
            <Input
              id="credit-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!!error}
              aria-describedby={error ? "credit-amount-error" : undefined}
            />
            {error && <p id="credit-amount-error" className="text-sm text-danger">{error}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="credit-by">Done by</Label>
            <Select value={by} onValueChange={setReceivedBy}>
              <SelectTrigger id="credit-by" className="w-full"><SelectValue placeholder="Choose" /></SelectTrigger>
              <SelectContent>
                {staff.filter(isActiveStaff).map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={apply.isPending}>{mode === "apply" ? "Pay from deposit" : "Return to deposit"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
