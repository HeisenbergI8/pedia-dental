import { Body, Controller, Delete, Get, NotFoundException, Put, Req, Res, StreamableFile } from "@nestjs/common";
import type { Request, Response } from "express";
import { LetterheadService } from "./letterhead.service";
import { LOGO_HEADERS } from "./logo";

/**
 * D11: the custom letterhead (features/clinic/mocks.ts). Reads are clinic.view (every staff member makes documents),
 * writes clinic.manage (access-rules.ts).
 */
@Controller("clinic/letterhead")
export class LetterheadController {
  constructor(private readonly letterhead: LetterheadService) {}

  @Get()
  view() {
    return this.letterhead.view();
  }

  // Parsed in the service: the mock answers the body's 400 before the plan's 409.
  @Put()
  save(@Body() body: unknown) {
    return this.letterhead.save(body);
  }

  // Streamed from the API's own origin like the logo (not a 302 to S3), so the PDF's canvas can draw it.
  @Get("image")
  async image(@Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = await this.letterhead.imageFile();
    if (!file) throw new NotFoundException("This clinic has no letterhead image");
    res.set(LOGO_HEADERS);
    return new StreamableFile(file.body, { type: file.contentType });
  }

  // multipart/form-data with `file`: streamed to a temp file and read by the service after the plan's check (E1).
  @Put("image")
  uploadImage(@Req() req: Request) {
    return this.letterhead.uploadImage(req);
  }

  @Delete("image")
  removeImage() {
    return this.letterhead.removeImage();
  }
}
