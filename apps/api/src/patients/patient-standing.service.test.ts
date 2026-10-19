import { describe, expect, it, vi } from "vitest";
import type { Tx } from "../prisma/transaction";
import { PatientStandingService } from "./patient-standing.service";
import { StandingRefresh } from "./standing-refresh";

/** B14: no database. Stub readers and a stub `tx` holding one stored row. */
function setup(stored = { id: "p", lastVisitOn: null as Date | null, nextDueOn: null as Date | null, balance: 0, noContact: false }) {
  const readers = {
    visitDays: { facts: vi.fn(async () => ({ visits: [{ patientId: "p", status: "completed" as const, date: "2026-10-01" }], done: [] })) },
    dueItems: { openFor: vi.fn(async () => [{ patientId: "p", dueOn: "2026-11-01", ruleId: "routine", createdAt: "2026-01-01T00:00:00.000Z" }]) },
    billing: { billTotals: vi.fn(async () => ({ invoices: [{ id: "i", patientId: "p", discount: 0, lines: [{ amount: 5000 }] }], payments: [{ invoiceId: "i", amount: 2000 }] })) },
    messages: { lastTried: vi.fn(async () => [{ patientId: "p", status: "failed" as const, sendAt: "2026-10-01T00:00:00.000Z" }]) },
  };
  const update = vi.fn(async () => ({}));
  const tx = { patient: { findMany: vi.fn(async () => [stored]), update } } as unknown as Tx;
  const slot = new StandingRefresh();
  const service = new PatientStandingService(slot, readers.visitDays as never, readers.dueItems as never, readers.billing as never, readers.messages as never);
  return { readers, update, tx, slot, service };
}

describe("PatientStandingService", () => {
  it("reads only the facts of the parts asked", async () => {
    const { readers, tx, service } = setup();
    await service.refresh(tx, ["p"], ["due"]);
    expect(readers.dueItems.openFor).toHaveBeenCalledWith(["p"], tx);
    for (const r of [readers.visitDays.facts, readers.billing.billTotals, readers.messages.lastTried]) expect(r).not.toHaveBeenCalled();
  });

  it("writes only the asked columns, and nothing when they are already right", async () => {
    const { update, tx, service } = setup();
    expect(await service.refresh(tx, ["p"], ["balance", "contact"])).toBe(1);
    expect(update).toHaveBeenCalledWith({ where: { id: "p" }, data: { balance: 3000, noContact: true } });
    const right = setup({ id: "p", lastVisitOn: new Date("2026-10-01T00:00:00.000Z"), nextDueOn: new Date("2026-11-01T00:00:00.000Z"), balance: 3000, noContact: true });
    expect(await right.service.refresh(right.tx, ["p"])).toBe(0);
    expect(right.update).not.toHaveBeenCalled();
  });

  it("registers itself in the slot, which refreshes through it", async () => {
    const { update, tx, slot, service } = setup();
    service.onModuleInit();
    await slot.refresh(tx, "p", ["visit"]);
    expect(update).toHaveBeenCalledWith({ where: { id: "p" }, data: { lastVisitOn: new Date("2026-10-01T00:00:00.000Z") } });
  });

  it("an unfilled slot throws", () => {
    expect(() => new StandingRefresh().refresh({} as Tx, "p", ["visit"])).toThrow("No standing refresher is registered");
  });
});
