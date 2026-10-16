import {
  type ArgumentsHost, Body, Catch, Controller, Delete, type ExceptionFilter, ForbiddenException, Get, NotFoundException,
  PayloadTooLargeException, Put, Req, Res, StreamableFile, UploadedFile, UseFilters, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { LOGO_RULES, UpdateBrandingInput, UpdateClinicProfileInput } from "@pedia/shared";
import type { Request, Response } from "express";
import { identityOf } from "../auth/access.guard";
import { requireContext } from "../common/request-context";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ClinicService } from "./clinic.service";
import { LOGO_HEADERS, LOGO_TOO_LARGE, type LogoUpload } from "./logo";

/** Multer stops reading at LOGO_RULES.maxBytes and Nest answers "File too large"; this gives the shared rule's words. */
@Catch(PayloadTooLargeException)
class LogoTooLarge implements ExceptionFilter {
  catch(_error: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(413).type("text/plain").send(LOGO_TOO_LARGE);
  }
}

/**
 * The clinic account and its setup (features/clinic/mocks.ts). Reads are clinic.view, writes clinic.manage
 * (access-rules.ts), so the guard has loaded a live identity by the time a handler runs.
 */
@Controller()
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Get("clinic")
  context(@Req() req: Request) {
    const { branchId } = requireContext();
    // A login with no open branch fails closed (B2b's Issues Found); B3's archive flow keeps it from happening.
    if (!branchId) throw new ForbiddenException("You have no open branch to work at. Contact your clinic's Owner.");
    return this.clinic.context(identityOf(req)!, branchId);
  }

  @Get("branches")
  branches() {
    return this.clinic.branches();
  }

  @Get("staff")
  staff() {
    return this.clinic.staff(requireContext().user!.roles);
  }

  @Get("chairs")
  chairs() {
    return this.clinic.chairs();
  }

  @Get("procedures")
  procedures() {
    return this.clinic.procedures();
  }

  @Put("clinic")
  updateProfile(@Body(new ZodValidationPipe(UpdateClinicProfileInput)) input: UpdateClinicProfileInput) {
    return this.clinic.updateProfile(input);
  }

  @Put("clinic/branding")
  updateBranding(@Body(new ZodValidationPipe(UpdateBrandingInput)) input: UpdateBrandingInput) {
    return this.clinic.updateBranding(input);
  }

  // Parents too (clinic.view): the portal shows the clinic's logo. The CSP keeps an SVG opened on its own inert.
  @Get("clinic/logo")
  async logo(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.clinic.logoFile();
    if (!file) throw new NotFoundException("This clinic has no uploaded logo");
    res.set(LOGO_HEADERS);
    return new StreamableFile(file.body, { type: file.contentType });
  }

  // Memory storage, at most 1 MB read (LOGO_RULES): a logo is small. B10's photos go straight to storage instead.
  @Put("clinic/logo")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: LOGO_RULES.maxBytes, files: 1 } }))
  @UseFilters(LogoTooLarge)
  uploadLogo(@UploadedFile() file: LogoUpload | undefined) {
    return this.clinic.uploadLogo(file);
  }

  @Delete("clinic/logo")
  removeLogo() {
    return this.clinic.removeLogo();
  }
}
