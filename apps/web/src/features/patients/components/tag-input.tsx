"use client";
import { useState, type ComponentProps } from "react";
import { XIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

/**
 * Edits a string[] as removable chips. Enter, comma or leaving the field adds the typed item.
 * Chips sit inline with the input so committing on blur doesn't push the page down; a shift
 * there would swallow the click that caused the blur (e.g. on the submit button).
 */
export function TagInput({
  value,
  onChange,
  placeholder,
  ...control
}: { value: string[]; onChange: (next: string[]) => void; placeholder?: string } & Pick<
  ComponentProps<"input">,
  "id" | "aria-invalid" | "aria-describedby"
>) {
  const [draft, setDraft] = useState("");

  function commit() {
    const item = draft.trim();
    if (item && !value.includes(item)) onChange([...value, item]);
    setDraft("");
  }

  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input px-1.5 py-1 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
      {value.map((item) => (
        <Badge key={item} variant="secondary" className="gap-1 border-line py-0.5 text-sm">
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            onClick={() => onChange(value.filter((v) => v !== item))}
            className="rounded-sm hover:text-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <XIcon className="size-3.5" />
          </button>
        </Badge>
      ))}
      <Input
        {...control}
        value={draft}
        placeholder={value.length ? undefined : placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        className="h-7 min-w-32 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
      />
    </div>
  );
}
