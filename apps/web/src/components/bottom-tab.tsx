import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** A phone bottom-bar tab (staff shell and portal): the whole cell is the target, icon over label. */
export function bottomTabClass(active: boolean) {
  return cn(
    "group relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-xs transition-colors duration-(--duration-fast)",
    active ? "font-semibold text-ink" : "font-medium text-ink-muted",
  );
}

/**
 * The tab's icon. The current tab's icon sits in a neutral pill (the same selected fill as the sidebar and rail)
 * and turns brand, and its label turns ink and semibold, so it doesn't rely on hue alone. The pill's box is
 * always there, so switching tabs doesn't shift the icons.
 */
export function BottomTabIcon({ icon: Icon, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-8 w-14 items-center justify-center rounded-full transition-[background-color,transform] duration-(--duration-base) ease-(--ease-enter)",
        active ? "scale-100 bg-selected text-brand" : "scale-90 group-active:bg-selected",
      )}
    >
      <Icon className="size-5" strokeWidth={active ? 2.25 : 1.75} />
    </span>
  );
}
