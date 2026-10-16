import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { PatientListQuery } from "@pedia/shared";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PatientsService } from "./patients.service";
import { viewerOf } from "./patient.views";

/** The guard has loaded a clinic identity on every route here (access-rules.ts: patients.view / patients.write). */
const viewer = (req: Request) => viewerOf(identityOf(req)!);

/** features/patients/mocks.ts. Reads here (B4b); writes in B4c, privacy in B4d, the photo in B4e. */
@Controller()
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get("patients")
  directory(@Req() req: Request, @Query("q") q?: unknown) {
    return this.patients.directory(viewer(req), typeof q === "string" ? q : "");
  }

  // PatientListQuery never fails: every field falls back (.catch), as the mock's parse.
  @Get("patient-summaries")
  summaries(@Req() req: Request, @Query(new ZodValidationPipe(PatientListQuery)) query: PatientListQuery) {
    return this.patients.summaries(viewer(req), query);
  }

  @Get("patient-duplicates")
  duplicates(@Query() q: Record<string, unknown>) {
    const text = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
    return this.patients.duplicates({ firstName: text("firstName"), lastName: text("lastName"), birthDate: text("birthDate") });
  }

  @Get("patients/:id")
  view(@Req() req: Request, @Param("id") id: string) {
    return this.patients.view(viewer(req), id);
  }

  @Get("patients/:id/summary")
  summary(@Req() req: Request, @Param("id") id: string) {
    return this.patients.headerSummary(viewer(req), id);
  }
}
