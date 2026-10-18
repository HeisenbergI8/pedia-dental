import type { Subscription } from "@pedia/shared";

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/** Contract → rows: the subscription, its payments and their invoice lines (the seed; Phase 7 writes one at a time). */
export function subscriptionRows(s: Subscription) {
  const subscription = {
    clinicId: s.clinicId, anchor: day(s.anchor), paidMonths: s.paidMonths,
    downgradeTier: s.downgrade?.tier ?? null, downgradeOn: s.downgrade ? day(s.downgrade.on) : null,
    priceTier: s.priceTier?.tier ?? null, priceTierUntil: s.priceTier ? day(s.priceTier.until) : null,
    cancelledAt: s.cancelledAt ? new Date(s.cancelledAt) : null, pause: s.pause ?? null,
  };
  const payments = s.payments.map((p) => ({
    id: p.id, clinicId: s.clinicId, invoiceNo: p.invoiceNo, tier: p.tier, periodStart: day(p.periodStart), periodEnd: day(p.periodEnd),
    method: p.method, reference: p.reference ?? null, paidOn: day(p.paidOn), amount: p.amount, recordedAt: new Date(p.recordedAt),
  }));
  const lines = s.payments.flatMap((p) => p.lines.map((l, position) => ({ paymentId: p.id, position, label: l.label, amount: l.amount })));
  return { subscription, payments, lines };
}
