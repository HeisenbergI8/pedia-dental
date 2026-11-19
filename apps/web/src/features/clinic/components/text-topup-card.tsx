"use client";
import { useState } from "react";
import { format, parseISO } from "date-fns";
import { formatPeso, textTopUpQuote, vatPart } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PayByQr } from "@/features/payments/components/pay-by-qr";
import { ReceiptList } from "@/features/payments/components/receipt-list";
import { ReceiptUpload } from "@/features/payments/components/receipt-upload";
import { clinicReceiptImageUrl, useBuyTextTopUp, useTextTopUps } from "../api";

/** The anchor the text notices point at (D13). */
export const BUY_TEXTS_ID = "buy-texts";
const MAX_PACKS = 20; // D2

/**
 * Feature 16 (revised), D1–D3, D13: buy more texts for this month, any time. Paid by Primolar's QR with a receipt, like the
 * month; the texts are added once Primolar confirms it, and they don't carry over. One receipt waits at a time.
 */
export function TextTopUpCard() {
  const topUps = useTextTopUps();
  const buy = useBuyTextTopUp();
  const [packs, setPacks] = useState(1);
  if (topUps.isLoading) return <Loading label="Loading text top-ups" />;
  if (!topUps.data) return <ErrorState what="text top-ups" onRetry={() => void topUps.refetch()} />;
  const t = topUps.data;
  const { parts, amount } = textTopUpQuote(t.pack, packs);
  const latest = t.receipts[0];
  const month = format(parseISO(`${t.month}-01`), "MMMM");

  return (
    <section id={BUY_TEXTS_ID} tabIndex={-1} className="scroll-mt-6 outline-none">
      <SectionCard
        title="Buy more texts"
        description={`${t.pack.parts.toLocaleString("en-PH")} texts for ${formatPeso(t.pack.price)} a pack. Texts you buy are for ${month} only; they don't carry over to next month.`}
      >
        {t.partsThisMonth > 0 && <p className="text-sm">You&apos;ve added {t.partsThisMonth.toLocaleString("en-PH")} texts this month.</p>}
        {latest?.status !== "pending" && (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="topup-packs">Packs</Label>
                <Input
                  id="topup-packs"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_PACKS}
                  value={packs}
                  onChange={(e) => setPacks(Math.min(MAX_PACKS, Math.max(1, Math.trunc(Number(e.target.value)) || 1)))}
                  className="w-24"
                  aria-describedby="topup-packs-total"
                />
              </div>
              <p id="topup-packs-total" className="pb-2 text-sm tabular-nums">
                = {parts.toLocaleString("en-PH")} texts for {formatPeso(amount)}
              </p>
            </div>
            <PayByQr qr={t.paymentQr} amount={amount} vat={vatPart(amount)} />
          </>
        )}
        {(t.paymentQr || latest) && (
          <ReceiptUpload
            label="Send your text top-up receipt"
            latest={latest}
            pending={buy.isPending}
            error={buy.error?.message}
            onSubmit={(input, file) => buy.mutate({ input: { ...input, packs }, file })}
          />
        )}
        {t.receipts.length > 0 && (
          <div className="space-y-2 border-t border-line pt-4">
            <h3 className="text-sm font-semibold">Top-up receipts you sent</h3>
            <ReceiptList receipts={t.receipts} imageUrl={clinicReceiptImageUrl} />
          </div>
        )}
      </SectionCard>
    </section>
  );
}
