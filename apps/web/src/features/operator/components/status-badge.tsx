import type { AccountStatus } from "@pedia/shared";
import { Badge } from "@/components/ui/badge";

/** "Paused" is the word parents see on a suspended clinic (PausedNotice); the warning tokens, with the word, never colour alone. */
export function StatusBadge({ status }: { status: AccountStatus }) {
  return status === "active" ? (
    <Badge variant="secondary">Active</Badge>
  ) : (
    <Badge variant="outline" className="border-warning-line bg-warning-bg text-warning">
      Paused
    </Badge>
  );
}
