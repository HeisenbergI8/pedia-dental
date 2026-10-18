import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { DemoResetJobs } from "./demo-reset.jobs";

/** B13c1 E5: the nightly demo reset. Imported only with DEMO_DAILY_RESET (demo deployments). */
@Module({ imports: [AuthModule], providers: [DemoResetJobs] })
export class DemoModule {}
