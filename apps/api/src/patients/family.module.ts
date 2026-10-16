import { Module } from "@nestjs/common";
import { FamilyService } from "./family.service";

/** The one patients query the guard needs (a parent's children). Its own module, so AuthModule and PatientsModule can both import it without a cycle. */
@Module({ providers: [FamilyService], exports: [FamilyService] })
export class FamilyModule {}
