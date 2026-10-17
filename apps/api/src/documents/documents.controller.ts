import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { DocumentsService } from "./documents.service";

/** features/documents/mocks.ts. documents.issue for all three; POST is an export, so a read-only session may issue (exportRead). */
@Controller()
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Get("documents")
  log() {
    return this.documents.log();
  }

  @Get("patients/:id/documents")
  forPatient(@Param("id") id: string) {
    return this.documents.forPatient(id);
  }

  // Body parsed after the 404 (CONVENTIONS → Traps: the mock's order). 201, as the mock.
  @Post("patients/:id/documents")
  issue(@Param("id") id: string, @Body() body: unknown) {
    return this.documents.issue(id, body);
  }
}
