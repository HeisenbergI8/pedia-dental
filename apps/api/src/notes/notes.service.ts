import { Injectable } from "@nestjs/common";
import { NoteTemplate } from "@pedia/shared";
import { PrismaService } from "../prisma/prisma.service";

/** features/notes/mocks.ts. B3 serves the templates; B6 adds the notes. */
@Injectable()
export class NotesService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /note-templates: the clinic's forms in the mock's order (one per catalog procedure). */
  async templates(): Promise<NoteTemplate[]> {
    const rows = await this.prisma.noteTemplate.findMany({ select: { id: true, name: true, procedure: true, fields: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
    return rows.map((t) => NoteTemplate.parse(t));
  }
}
