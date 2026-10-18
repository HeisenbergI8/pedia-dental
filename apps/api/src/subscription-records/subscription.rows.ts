import { Subscription, SubscriptionPayment, type SettlePatch } from "@pedia/shared";
import type {
  Prisma, Subscription as SubscriptionRow, SubscriptionLine as LineRow, SubscriptionPayment as PaymentRow,
} from "../generated/prisma/client.ts";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
/** A `@db.Date` column back as `yyyy-MM-dd`: stored at UTC midnight, so the UTC date is the Manila date it holds. */
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export const PAYMENT_COLUMNS = {
  id: true, clinicId: true, invoiceNo: true, tier: true, periodStart: true, periodEnd: true, method: true, reference: true,
  paidOn: true, amount: true, recordedAt: true,
} as const satisfies Prisma.SubscriptionPaymentSelect;
export const LINE_COLUMNS = { paymentId: true, position: true, label: true, amount: true } as const satisfies Prisma.SubscriptionLineSelect;

/** Row + its lines (any order) → the contract. Parsed, so a bad row fails here. */
export function toSubscriptionPayment(r: Pick<PaymentRow, keyof typeof PAYMENT_COLUMNS>, lines: Pick<LineRow, keyof typeof LINE_COLUMNS>[]): SubscriptionPayment {
  return SubscriptionPayment.parse({
    id: r.id, invoiceNo: r.invoiceNo, tier: r.tier, periodStart: isoDay(r.periodStart), periodEnd: isoDay(r.periodEnd), method: r.method,
    ...(r.reference ? { reference: r.reference } : {}), paidOn: isoDay(r.paidOn), amount: r.amount, recordedAt: r.recordedAt.toISOString(),
    lines: [...lines].sort((a, b) => a.position - b.position).map(({ label, amount }) => ({ label, amount })),
  });
}

/** Row + its payments (oldest first) → the shared `Subscription`, so every shared rule runs on it unchanged. */
export function toSubscription(r: SubscriptionRow, payments: SubscriptionPayment[]): Subscription {
  return Subscription.parse({
    clinicId: r.clinicId, anchor: isoDay(r.anchor), paidMonths: r.paidMonths,
    ...(r.downgradeTier && r.downgradeOn ? { downgrade: { tier: r.downgradeTier, on: isoDay(r.downgradeOn) } } : {}),
    ...(r.priceTier && r.priceTierUntil ? { priceTier: { tier: r.priceTier, until: isoDay(r.priceTierUntil) } } : {}),
    ...(r.cancelledAt ? { cancelledAt: r.cancelledAt.toISOString() } : {}),
    ...(r.pause ? { pause: r.pause } : {}),
    payments,
  });
}

/** A settle's patch → the Subscription row's `data` (`null` clears; `downgrade: null` clears both columns). `{}` → `{}`. */
export function subscriptionPatch(p: SettlePatch): Prisma.SubscriptionUpdateInput {
  return {
    ...(p.pause !== undefined && { pause: p.pause }),
    ...(p.downgrade === null && { downgradeTier: null, downgradeOn: null }),
    ...(p.priceTier !== undefined && { priceTier: p.priceTier?.tier ?? null, priceTierUntil: p.priceTier ? day(p.priceTier.until) : null }),
  };
}

/** Contract → rows: the subscription, its payments and their invoice lines (the seed, and a new clinic's first payment). */
export function subscriptionRows(s: Subscription) {
  const subscription = {
    clinicId: s.clinicId, anchor: day(s.anchor), paidMonths: s.paidMonths,
    downgradeTier: s.downgrade?.tier ?? null, downgradeOn: s.downgrade ? day(s.downgrade.on) : null,
    priceTier: s.priceTier?.tier ?? null, priceTierUntil: s.priceTier ? day(s.priceTier.until) : null,
    cancelledAt: s.cancelledAt ? new Date(s.cancelledAt) : null, pause: s.pause ?? null,
  };
  const payments = s.payments.map((p) => paymentRow(s.clinicId, p));
  const lines = s.payments.flatMap((p) => lineRows(p));
  return { subscription, payments, lines };
}

export const paymentRow = (clinicId: string, p: SubscriptionPayment, receiptId: string | null = null) => ({
  id: p.id, clinicId, invoiceNo: p.invoiceNo, tier: p.tier, periodStart: day(p.periodStart), periodEnd: day(p.periodEnd),
  method: p.method, reference: p.reference ?? null, paidOn: day(p.paidOn), amount: p.amount, recordedAt: new Date(p.recordedAt), receiptId,
});
export const lineRows = (p: SubscriptionPayment) => p.lines.map((l, position) => ({ paymentId: p.id, position, label: l.label, amount: l.amount }));
