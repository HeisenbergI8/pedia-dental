import { Module } from "@nestjs/common";
import { IdempotencyJobs } from "./idempotency.jobs";
import { IdempotencyService } from "./idempotency.service";

/** Idempotency-Keys for every money-moving POST (B8 E2): the claim, the replay and the hourly sweep. */
@Module({ providers: [IdempotencyService, IdempotencyJobs], exports: [IdempotencyService] })
export class IdempotencyModule {}
