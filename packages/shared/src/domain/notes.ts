import { z } from "zod";
import type { NoteTemplate, TemplateField } from "../schemas/notes";
import { isValidTooth } from "./teeth";

function fieldSchema(f: TemplateField): z.ZodType {
  switch (f.type) {
    case "text":
      return f.required ? z.string().trim().min(1, "Required") : z.string().optional();
    case "select": {
      const options = z.enum(f.options as [string, ...string[]], { error: "Choose one" });
      return f.required ? options : options.optional();
    }
    case "checkbox":
      return z.boolean().optional();
    case "teeth": {
      const teeth = z.array(z.number().int().refine(isValidTooth, "Invalid FDI tooth"));
      return f.required ? teeth.min(1, "Pick at least one tooth") : teeth.optional();
    }
  }
}

/** Validates a note's values against its template. Used by the note form and by the API alike. */
export function noteValuesSchema(template: NoteTemplate) {
  return z.object(Object.fromEntries(template.fields.map((f) => [f.key, fieldSchema(f)])));
}
