import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import { PatientListQuery, RegisterPatientInput } from "@pedia/shared";
import type { Request, Response } from "express";
import { identityOf } from "../auth/access.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PatientWritesService } from "./patient-writes.service";
import { PatientsService } from "./patients.service";
import { viewerOf } from "./patient.views";

/** The guard has loaded a clinic identity on every route here (access-rules.ts: patients.view / patients.write). */
const viewer = (req: Request) => viewerOf(identityOf(req)!);

/** features/patients/mocks.ts. Reads here (B4b); writes in B4c, privacy in B4d, the photo in B4e. */
@Controller()
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly writes: PatientWritesService,
  ) {}

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

  @Post("patients")
  register(@Req() req: Request, @Body(new ZodValidationPipe(RegisterPatientInput)) input: RegisterPatientInput) {
    return this.writes.register(viewer(req), input); // 201, as the mock
  }

  // 404 before 400 (the mock's order): bodies are parsed in the service.
  @Put("patients/:id")
  update(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.writes.update(viewer(req), id, body);
  }

  @Patch("patients/:id")
  quickUpdate(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.writes.quickUpdate(viewer(req), id, body);
  }

  @Post("patients/:id/consents")
  addConsent(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.writes.addConsent(viewer(req), id, body); // 201, as the mock
  }

  @Post("patients/:id/privacy-consent")
  recordConsent(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.writes.recordConsent(viewer(req), id, body); // 201, as the mock
  }

  @Post("patients/:id/privacy-choices")
  @HttpCode(200)
  changeChoices(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.writes.changeChoices(viewer(req), id, body);
  }

  // Streamed to a temp file, checked, then streamed to storage (decision 2, E1): never whole in memory. The body is read
  // by the service, after the 404 (the mock's order).
  @Put("patients/:id/photo")
  uploadPhoto(@Req() req: Request, @Param("id") id: string) {
    return this.writes.uploadPhoto(viewer(req), id, req);
  }

  // The <img> request carries the API's httpOnly cookie, so the guard sees the session as for any read. Answers a 302 to a
  // private link valid 5 minutes (decision 3, E2); no-store, so each open is checked and audited again.
  @Get("patients/:id/photo")
  async photo(@Param("id") id: string, @Res() res: Response): Promise<void> {
    const link = await this.patients.photoLink(id);
    if (!link) throw new NotFoundException("No photo");
    res.set("Cache-Control", "no-store").redirect(302, link);
  }

  @Delete("patients/:id/photo")
  removePhoto(@Req() req: Request, @Param("id") id: string) {
    return this.writes.removePhoto(viewer(req), id);
  }
}
