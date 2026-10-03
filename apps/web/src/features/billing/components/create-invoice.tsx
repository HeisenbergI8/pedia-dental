"use client";
import { useState } from "react";
import { toast } from "sonner";
import { formatPeso, pesos, unbilledItems, type Invoice, type PlanItem } from "@pedia/shared";
import { SectionCard } from "@/components/section-card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useProcedures } from "@/features/clinic/api";
import { useCreateInvoice } from "../api";

/** Done, unbilled treatments, all ticked by default, plus a discount: becomes one invoice. */
export function CreateInvoice({ patientId, items, invoices }: { patientId: string; items: PlanItem[]; invoices: Invoice[] }) {
  const procedures = useProcedures().data ?? [];
  const create = useCreateInvoice(patientId);
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [discount, setDiscount] = useState("");
  const ready = unbilledItems(items, invoices);
  if (ready.length === 0) return null;

  const picked = ready.filter((i) => !unticked.has(i.id));
  const subtotal = picked.reduce((s, i) => s + i.fee, 0);
  const off = pesos(Number(discount) || 0);
  const discountError = off < 0 ? "A discount can't be negative" : off > subtotal ? `The discount can't be more than ${formatPeso(subtotal)}` : "";
  const name = (code: string) => procedures.find((p) => p.code === code)?.name ?? code;

  function toggle(id: string) {
    setUnticked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function submit() {
    create.mutate(
      { planItemIds: picked.map((i) => i.id), discount: off },
      {
        onSuccess: () => {
          toast.success("Invoice created");
          setDiscount("");
          setUnticked(new Set());
        },
        onError: (e) => toast.error(e.message),
      },
    );
  }

  return (
    <SectionCard title="Ready to bill" description="Completed by a signed note and not on an invoice yet.">
      <ul className="space-y-2">
        {ready.map((i) => (
          <li key={i.id} className="flex items-center gap-3">
            <Checkbox id={`bill-${i.id}`} checked={!unticked.has(i.id)} onCheckedChange={() => toggle(i.id)} />
            <Label htmlFor={`bill-${i.id}`} className="flex-1 font-normal">
              {name(i.procedureCode)}{i.tooth ? ` · tooth ${i.tooth}` : ""}
            </Label>
            <span className="text-sm tabular-nums">{formatPeso(i.fee)}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="invoice-discount">Discount (₱)</Label>
          <Input
            id="invoice-discount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            aria-invalid={!!discountError}
            aria-describedby={discountError ? "invoice-discount-error" : undefined}
            className="w-36"
          />
        </div>
        <p className="text-sm">
          Total <span className="font-semibold tabular-nums">{formatPeso(Math.max(subtotal - off, 0))}</span>
        </p>
        <Button className="ml-auto" disabled={picked.length === 0 || !!discountError || create.isPending} onClick={submit}>
          Create invoice
        </Button>
      </div>
      {discountError && <p id="invoice-discount-error" className="text-sm text-danger">{discountError}</p>}
    </SectionCard>
  );
}
