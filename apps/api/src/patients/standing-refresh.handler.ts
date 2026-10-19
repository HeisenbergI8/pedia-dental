import { Injectable, type OnModuleInit } from "@nestjs/common";
import { type OutboxEnvelope, type OutboxHandler, OutboxHandlers } from "../outbox/outbox.handlers";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { lockPatientIfExists } from "./patient-lock";
import { PatientStandingService } from "./patient-standing.service";
import { STANDING_REFRESH } from "./standing-refresh";

/**
 * B14 (D4): a text settled, so the child's "no contact" is recomputed here, under the patient's lock that the send
 * handler must not take (E8). Idempotent (it recomputes) and crash-safe (the outbox retries).
 */
@Injectable()
export class StandingRefreshHandler implements OutboxHandler, OnModuleInit {
  readonly kind = STANDING_REFRESH;

  constructor(private readonly prisma: PrismaService, private readonly registry: OutboxHandlers, private readonly standing: PatientStandingService) {}

  onModuleInit() {
    this.registry.register(this);
  }

  async handle({ payload }: OutboxEnvelope): Promise<void> {
    const { patientId } = payload as { patientId: string };
    // Lock first, then read: an unlocked pre-check could see a refresh still in flight and skip a change it then misses.
    await runInTransaction(this.prisma, async (tx) => {
      if (!(await lockPatientIfExists(tx, patientId))) return; // purged: nothing to keep
      await this.standing.refresh(tx, [patientId], ["contact"]);
    });
  }
}
