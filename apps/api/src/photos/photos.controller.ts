import { Controller, Get, NotFoundException, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { identityOf } from "../auth/access.guard";
import { viewerOf } from "../patients/patient.views";
import { PhotosService } from "./photos.service";

/** The guard has loaded a clinic identity on every route here. */
const viewer = (req: Request) => viewerOf(identityOf(req)!);

/** features/photos/mocks.ts. Rules: access-rules.ts (clinical.view/write or uploads.create; a parent for their own child). */
@Controller()
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  @Get("patients/:id/photos")
  list(@Req() req: Request, @Param("id") id: string) {
    return this.photos.list(viewer(req), id);
  }

  // multipart/form-data: `file` and `meta` (UploadPhotoInput as JSON), in any order; read by the service after the 404 (E1).
  @Post("patients/:id/photos")
  upload(@Req() req: Request, @Param("id") id: string) {
    return this.photos.upload(viewer(req), id, req);
  }

  // A 302 to a private link valid 5 minutes (decision 3); `?download=1` saves it (C1). no-store: every open is checked.
  @Get("photos/:id/file")
  async file(@Req() req: Request, @Param("id") id: string, @Query("download") download: unknown, @Res() res: Response): Promise<void> {
    const link = await this.photos.fileLink(viewer(req), id, download === "1");
    if (!link) throw new NotFoundException("Photo not found");
    res.set("Cache-Control", "no-store").redirect(302, link);
  }
}
