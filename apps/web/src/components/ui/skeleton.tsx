import { cn } from "@/lib/utils";

/** A placeholder block for content that is on its way. Pulses gently; still under reduced motion. */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="skeleton" aria-hidden className={cn("animate-pulse rounded-md bg-line/70 motion-reduce:animate-none", className)} {...props} />;
}

export { Skeleton };
