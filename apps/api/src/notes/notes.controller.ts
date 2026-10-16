import { Body, Controller, Get, HttpCode, Param, Post, Put } from "@nestjs/common";
import { CreateNoteInput } from "@pedia/shared";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { NotesService } from "./notes.service";

/** features/notes/mocks.ts. GET /note-templates is clinic.view; the notes are clinical.view / clinical.write. */
@Controller()
export class NotesController {
  constructor(private readonly notes: NotesService) {}

  @Get("note-templates")
  templates() {
    return this.notes.templates();
  }

  @Get("patients/:id/notes")
  list(@Param("id") id: string) {
    return this.notes.list(id);
  }

  // The body first (400), then the visit (404/409): the mock's order. 201.
  @Post("patients/:id/notes")
  create(@Param("id") id: string, @Body(new ZodValidationPipe(CreateNoteInput)) input: CreateNoteInput) {
    return this.notes.create(id, input);
  }

  // 404 and 409 before 400: parsed in the service.
  @Put("notes/:id")
  update(@Param("id") id: string, @Body() body: unknown) {
    return this.notes.update(id, body);
  }

  @Post("notes/:id/sign")
  @HttpCode(200) // an action, not a creation (CONVENTIONS → Traps)
  sign(@Param("id") id: string) {
    return this.notes.sign(id);
  }
}
