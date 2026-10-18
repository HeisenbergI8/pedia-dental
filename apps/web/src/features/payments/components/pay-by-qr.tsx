"use client";
import { QrCodeIcon } from "lucide-react";
import { formatPeso, type PaymentQrView } from "@pedia/shared";
import { paymentQrImageUrl } from "@/features/signup/api";

/**
 * B12 decisions 5, 23: Primolar's one payment QR, what it is for and the amount to send. Before the operator adds a QR,
 * only the promise of payment details.
 */
export function PayByQr({ qr, amount, vat }: { qr: PaymentQrView | null; amount: number; vat: number }) {
  if (!qr) {
    return (
      <p role="status" className="flex gap-2.5 rounded-lg border border-line px-4 py-3 text-sm">
        <QrCodeIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        Primolar will send you payment details.
      </p>
    );
  }
  return (
    <figure className="flex flex-col items-start gap-4 rounded-lg border border-line p-4 sm:flex-row">
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the API, replaced by the operator any time */}
      <img src={paymentQrImageUrl(qr)} alt="Primolar's payment QR code" className="size-48 shrink-0 rounded-md border border-line object-contain" />
      <figcaption className="space-y-2 text-sm">
        <p className="font-semibold">Scan to pay</p>
        {qr.caption && <p className="whitespace-pre-line">{qr.caption}</p>}
        <p>
          Send exactly <span className="font-semibold tabular-nums">{formatPeso(amount)}</span>{" "}
          <span className="text-ink-muted">(includes {formatPeso(vat)} VAT)</span>, then send Primolar a screenshot of your receipt below.
        </p>
      </figcaption>
    </figure>
  );
}
