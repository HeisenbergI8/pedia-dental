import {
  type ArgumentsHost, Body, Catch, Controller, Delete, type ExceptionFilter, Get, HttpCode, NotFoundException, Param, Patch,
  PayloadTooLargeException, Post, Put, Query, Req, Res, StreamableFile, UploadedFile, UseFilters, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { PatientListQuery, RegisterPatientInput } from "@pedia/shared";
import type { Request, Response } from "express";
import { identityOf } from "../auth/access.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { MAX_PHOTO_BYTES, PHOTO_TOO_LARGE, type PhotoUpload } from "./patient-photo";
import { PatientWritesService } from "./patient-writes.service";
import { PatientsService } from "./patients.service";
import { viewerOf } from "./patient.views";

/** Multer stops reading at MAX_PHOTO_BYTES and Nest answers "File too large"; this gives the mock's words. */
@Catch(PayloadTooLargeException)
class PhotoTooLarge implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(413).type("text/plain").send(PHOTO_TOO_LARGE);
  }
}

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

  // Memory storage, at most 10 MB read (the mock's limit). The web downscales first; B10 moves photos to presigned uploads.
  @Put("patients/:id/photo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: MAX_PHOTO_BYTES, files: 1 } }))
  @UseFilters(PhotoTooLarge)
  uploadPhoto(@Req() req: Request, @Param("id") id: string, @UploadedFile() file: PhotoUpload | undefined) {
    return this.writes.uploadPhoto(viewer(req), id, file);
  }

  // The <img> request carries the API's httpOnly cookie, so the guard sees the session as for any read.
  @Get("patients/:id/photo")
  async photo(@Param("id") id: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const found = await this.patients.photo(id);
    if (!found) throw new NotFoundException("No photo");
    res.set({ "Content-Disposition": `inline; filename="${found.name}"`, "X-Content-Type-Options": "nosniff" });
    return new StreamableFile(found.file.body, { type: found.file.contentType });
  }

  @Delete("patients/:id/photo")
  removePhoto(@Req() req: Request, @Param("id") id: string) {
    return this.writes.removePhoto(viewer(req), id);
  }
}
