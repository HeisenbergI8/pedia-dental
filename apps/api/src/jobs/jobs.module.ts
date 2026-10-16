import { Global, Module } from "@nestjs/common";
import { JobRunner } from "./job-runner";

/** `JobRunner` for every feature's `@Cron` class. The crons themselves live in the module that owns their tables. */
@Global()
@Module({ providers: [JobRunner], exports: [JobRunner] })
export class JobsModule {}
