import { Module } from "@nestjs/common";
import { UsageService } from "./usage.service";

/** B12: what each clinic uses against its plan. A leaf over raw grouped SQL. */
@Module({ providers: [UsageService], exports: [UsageService] })
export class UsageModule {}
