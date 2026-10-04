import { z } from "zod";
import type { Invoice } from "../schemas/billing";
import type { Procedure } from "../schemas/clinic";
import type { ClinicalNote, NoteTemplate, TemplateField } from "../schemas/notes";
import type { PlanItem } from "../schemas/plan";
import { isValidTooth } from "./teeth";

function fieldSchema(f: TemplateField): z.ZodType {
  switch (f.type) {
    case "text":
      return f.required ? z.string().trim().min(1, `Fill in ${f.label.toLowerCase()}`) : z.string().optional();
    case "select": {
      const options = z.enum(f.options as [string, ...string[]], { error: `Choose ${f.label.toLowerCase()}` });
      return f.required ? options : options.optional();
    }
    case "checkbox":
      return z.boolean().optional();
    case "teeth": {
      const teeth = z.array(z.number().int().refine(isValidTooth, "Use a tooth number like 74 (FDI)"));
      return f.required ? teeth.min(1, "Pick at least one tooth") : teeth.optional();
    }
  }
}

/** Validates a note's values against its template. Used by the note form and by the API alike. */
export function noteValuesSchema(template: NoteTemplate) {
  return z.object(Object.fromEntries(template.fields.map((f) => [f.key, fieldSchema(f)])));
}

/** Consecutive fields with the same `section` become one group; fields without a section stay alone. */
export function groupFields(fields: TemplateField[]): { section?: string; fields: TemplateField[] }[] {
  const groups: { section?: string; fields: TemplateField[] }[] = [];
  for (const f of fields) {
    const last = groups.at(-1);
    if (f.section && last?.section === f.section) last.fields.push(f);
    else groups.push({ section: f.section, fields: [f] });
  }
  return groups;
}

export type NoteService = { planItemId: string; name: string; tooth?: number; amount: number; billed: boolean };

/**
 * What a signed note did, and what it costs: the plan items it completed, priced at the invoice line when
 * billed (the price actually charged, before any invoice-level discount), otherwise at the plan fee.
 */
export function noteServices(
  note: Pick<ClinicalNote, "id">,
  planItems: PlanItem[],
  invoices: Pick<Invoice, "lines">[],
  procedures: Pick<Procedure, "code" | "name">[],
): NoteService[] {
  const lines = new Map(invoices.flatMap((inv) => inv.lines).flatMap((l) => (l.planItemId ? [[l.planItemId, l] as const] : [])));
  return planItems
    .filter((i) => i.completedNoteId === note.id)
    .map((i) => {
      const line = lines.get(i.id);
      return {
        planItemId: i.id,
        name: line?.description ?? procedures.find((p) => p.code === i.procedureCode)?.name ?? i.procedureCode,
        tooth: i.tooth,
        amount: line?.amount ?? i.fee,
        billed: !!line,
      };
    });
}
