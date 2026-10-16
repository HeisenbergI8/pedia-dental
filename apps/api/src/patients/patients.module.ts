import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { FamilyModule } from "./family.module";
import { PatientsController } from "./patients.controller";
import { PatientsService } from "./patients.service";

/** The child's record (B4). B5–B8 read patients through PatientsService, never its tables. */
@Module({ imports: [AuditModule, FamilyModule], controllers: [PatientsController], providers: [PatientsService], exports: [PatientsService] })
export class PatientsModule {}
