"use client";
import { useId, useState, type ReactNode } from "react";
import { Popover } from "radix-ui";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type ComboboxOption = { value: string; label: ReactNode; description?: ReactNode };

/**
 * Type to search, arrows to move, Enter to pick, Escape to close (WAI-ARIA 1.2 combobox with a listbox popup).
 * The caller does the matching (it may be a server search) and passes the options for the current query.
 * Focus never leaves the input: the list is anchored to it, not triggered by it.
 */
export function Combobox({
  query,
  onQueryChange,
  options,
  onSelect,
  placeholder,
  emptyText = "No matches",
  ...control
}: {
  query: string;
  onQueryChange: (query: string) => void;
  options: ComboboxOption[];
  onSelect: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  id?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const optionId = (i: number) => `${listId}-${i}`;
  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    onSelect(o.value);
  };

  return (
    <Popover.Root open={open && (options.length > 0 || query.trim() !== "")} onOpenChange={setOpen} modal={false}>
      <Popover.Anchor asChild>
        <Input
          {...control}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && options[active] ? optionId(active) : undefined}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              const step = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (options.length ? (i + step + options.length) % options.length : 0));
            } else if (e.key === "Enter" && open) {
              e.preventDefault(); // never submits the surrounding form while the list is open
              pick(active);
            } else if (e.key === "Escape" && open) {
              e.stopPropagation(); // closes the list, not the dialog around it
              setOpen(false);
            }
          }}
        />
      </Popover.Anchor>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-(--z-overlay) max-h-72 w-(--radix-popover-trigger-width) overflow-y-auto rounded-lg border border-line bg-popover p-1 text-popover-foreground shadow-(--shadow-overlay)"
        >
          <ul id={listId} role="listbox">
            {options.length === 0 && <li className="px-3 py-2 text-sm text-ink-muted">{emptyText}</li>}
            {options.map((o, i) => (
              <li
                key={o.value}
                id={optionId(i)}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={cn("flex min-h-(--control-h) cursor-pointer flex-col justify-center rounded-md px-3 py-1.5 text-sm", i === active && "bg-selected")}
              >
                <span className="font-medium">{o.label}</span>
                {o.description && <span className="text-xs text-ink-muted">{o.description}</span>}
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
