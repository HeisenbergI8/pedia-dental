import { Controller, Get, NotFoundException, Param, Res, StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { LocalDiskStorage } from "./local-disk.storage";
import { FileStorage } from "./storage";

export const LINK_GONE = "This link has expired. Open the file again from the app.";

/**
 * GET /files/:token: the local-disk driver's private links (E2). Public (PUBLIC_RULES): the HMAC is the authority, and the
 * access check ran when the link was made. With the S3 driver every token is 404: S3 serves its own links.
 */
@Controller()
export class LocalFilesController {
  constructor(private readonly files: FileStorage) {}

  @Get("files/:token")
  async open(@Param("token") token: string, @Res({ passthrough: true }) res: Response): Promise<StreamableFile> {
    const file = this.files instanceof LocalDiskStorage ? await this.files.open(token) : undefined;
    if (!file) throw new NotFoundException(LINK_GONE);
    res.set({
      "Content-Type": file.contentType,
      "Content-Length": String(file.bytes),
      "Content-Disposition": `${file.download ? "attachment" : "inline"}; filename="${file.name}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox", // as the logo: a PDF or image opened on its own can't run anything here
      "Cache-Control": "private, max-age=300",
    });
    return new StreamableFile(file.stream);
  }
}
