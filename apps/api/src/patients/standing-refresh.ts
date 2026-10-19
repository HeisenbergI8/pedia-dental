import { Global, Injectable, Module } from "@nestjs/common";
import type { Tx } from "../prisma/transaction";

/** Which stored columns a write can change (B14 D4). A refresh recomputes only those, from source. */
export type StandingPart = "visit" | "due" | "balance" | "contact";
export const ALL_PARTS: readonly StandingPart[] = ["visit", "due", "balance", "contact"];
/** B14: the outbox kind that refreshes one child's "no contact" after a text settles (StandingRefreshHandler). */
export const STANDING_REFRESH = "standing.refresh";
export type Refresher = (tx: Tx, patientId: string, parts: readonly StandingPart[]) => Promise<void>;

/**
 * B14: the record services' way to keep Patient's stored standing. A slot PatientStandingService fills in onModuleInit
 * (as PatientRestrictions): the writers (appointments, visits, due items, bills) sit below PatientsModule and can't
 * import it. Call it inside the write's transaction, after the write, under the patient's lock the write already holds.
 * Unfilled, it fails closed.
 */
@Injectable()
export class StandingRefresh {
  private run?: Refresher;
  register(run: Refresher): void {
    if (this.run) throw new Error("A standing refresher is already registered.");
    this.run = run;
  }
  refresh(tx: Tx, patientId: string, parts: readonly StandingPart[]): Promise<void> {
    if (!this.run) throw new Error("No standing refresher is registered (PatientsModule registers it).");
    return this.run(tx, patientId, parts);
  }
}

@Global()
@Module({ providers: [StandingRefresh], exports: [StandingRefresh] })
export class StandingRefreshModule {}
