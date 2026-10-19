import { Injectable, type OnModuleInit } from "@nestjs/common";
import { storedStanding, type PatientFacts, type StoredStanding } from "@pedia/shared";
import { BillingRecordsService } from "../billing-records/billing-records.service";
import { MessageQueueService } from "../message-queue/message-queue.service";
import type { Tx } from "../prisma/transaction";
import { DueItemsService } from "../recalls/due-items.service";
import { VisitDaysService } from "../visits/visit-days.service";
import { ALL_PARTS, StandingRefresh, type StandingPart } from "./standing-refresh";

const COLUMN = { visit: "lastVisitOn", due: "nextDueOn", balance: "balance", contact: "noContact" } as const;
const toDate = (d: string | undefined) => (d ? new Date(`${d}T00:00:00.000Z`) : null);

/**
 * B14 (D2): the only writer of Patient's stored standing. Recomputes from source with the shared rules (storedStanding),
 * never increments. Reads through `tx` only, so a write's own uncommitted rows count.
 */
@Injectable()
export class PatientStandingService implements OnModuleInit {
  constructor(
    private readonly slot: StandingRefresh,
    private readonly visitDays: VisitDaysService,
    private readonly dueItems: DueItemsService,
    private readonly billing: BillingRecordsService,
    private readonly messages: MessageQueueService,
  ) {}

  onModuleInit() {
    this.slot.register(async (tx, id, parts) => void (await this.refresh(tx, [id], parts)));
  }

  /** Under the patients' locks (the caller's). Writes only the rows that differ; returns how many did (the drift). */
  async refresh(tx: Tx, ids: readonly string[], parts: readonly StandingPart[] = ALL_PARTS): Promise<number> {
    if (!ids.length) return 0;
    const [should, rows] = await Promise.all([
      this.compute(tx, ids, parts),
      tx.patient.findMany({ where: { id: { in: [...ids] } }, select: { id: true, lastVisitOn: true, nextDueOn: true, balance: true, noContact: true } }),
    ]);
    let drifted = 0;
    for (const row of rows) {
      const s = should.get(row.id)!;
      const want = { lastVisitOn: toDate(s.lastVisitOn), nextDueOn: toDate(s.nextDueOn), balance: s.balance, noContact: s.noContact };
      const data = Object.fromEntries(parts.map((p) => COLUMN[p]).filter((c) => String(row[c]) !== String(want[c])).map((c) => [c, want[c]]));
      if (!Object.keys(data).length) continue;
      await tx.patient.update({ where: { id: row.id }, data });
      drifted++;
    }
    return drifted;
  }

  /** The standing these patients should have: storedStanding over each asked part's facts (other parts at defaults). */
  async compute(tx: Tx, ids: readonly string[], parts: readonly StandingPart[] = ALL_PARTS): Promise<Map<string, StoredStanding>> {
    const has = (p: StandingPart) => parts.includes(p);
    const [visits, open, bills, tried] = await Promise.all([
      has("visit") ? this.visitDays.facts(ids, undefined, tx) : undefined,
      has("due") ? this.dueItems.openFor(ids, tx) : undefined,
      has("balance") ? this.billing.billTotals(ids, tx) : undefined,
      has("contact") ? this.messages.lastTried(ids, tx) : undefined,
    ]);
    // openFor's items are open already (isDueItemOpen over the done and named appointments): storedStanding keeps them so.
    const facts: PatientFacts = {
      visits: visits?.visits ?? [], appointments: visits?.done ?? [], dueItems: open ?? [],
      invoices: bills?.invoices ?? [], payments: bills?.payments ?? [], messages: tried ?? [],
    };
    return new Map(ids.map((id) => [id, storedStanding(id, facts)]));
  }
}
