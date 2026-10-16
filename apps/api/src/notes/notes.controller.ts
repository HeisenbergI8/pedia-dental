import { Controller, Get } from "@nestjs/common";
import { NotesService } from "./notes.service";

/** GET /note-templates is clinic.view (access-rules.ts). */
@Controller()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get("note-templates")
  templates() {
    return this.notes.templates();
  }
}
