import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled white card: the one way the app groups content on the ground. */
export function SectionCard({
  title,
  description,
  action,
  as: Tag = "section",
  headingLevel = 2,
  className,
  children,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  as?: "section" | "article" | "div";
  headingLevel?: 2 | 3;
  className?: string;
  children: ReactNode;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <Tag className={cn("space-y-4 rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0 space-y-0.5">
            {title && <Heading className="font-title text-lg font-semibold">{title}</Heading>}
            {description && <p className="text-sm text-ink-muted">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      {children}
    </Tag>
  );
}
