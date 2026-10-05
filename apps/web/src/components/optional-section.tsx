"use client";
import { useState, type ReactNode } from "react";
import { get, useFormContext, useWatch } from "react-hook-form";
import { Collapsible } from "radix-ui";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const isFilled = (v: unknown) => (Array.isArray(v) ? v.length > 0 : typeof v === "string" ? v.trim() !== "" : v != null);

/**
 * Optional fields behind a disclosure ("Add now or later"). Starts open when something is already filled
 * (edit mode, a restored draft) and is held open while any of its fields has an error. `fields` are leaf
 * paths: an object such as { name: "", phone: "" } would count as filled. Content stays mounted so
 * registered inputs keep their refs and a submit error can focus them.
 */
export function OptionalSection({ id, title, fields, children }: { id?: string; title: string; fields: string[]; children: ReactNode }) {
  const { control, formState } = useFormContext();
  const values: unknown[] = useWatch({ control, name: fields });
  const filled = values.filter(isFilled).length;
  const hasError = fields.some((f) => get(formState.errors, f));
  const [open, setOpen] = useState(filled > 0);
  const shown = open || hasError;

  return (
    <Collapsible.Root id={id} open={shown} onOpenChange={setOpen} className="scroll-mt-24 rounded-xl border border-line bg-surface shadow-card">
      <Collapsible.Trigger className="flex min-h-(--control-h) w-full items-center justify-between gap-3 rounded-xl px-4 py-3 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:px-5">
        <span>
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-ink-muted">{filled ? `${filled} of ${fields.length} filled` : "Add now or later"}</span>
        </span>
        <ChevronDownIcon aria-hidden className={cn("size-4 shrink-0 transition-transform duration-(--duration-fast)", shown && "rotate-180")} />
      </Collapsible.Trigger>
      <Collapsible.Content forceMount className="space-y-4 border-t border-line p-4 data-[state=closed]:hidden sm:p-5">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}
