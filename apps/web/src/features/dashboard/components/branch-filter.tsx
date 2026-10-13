"use client";
import { ALL_BRANCHES, type Branch } from "@pedia/shared";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Which branch the reports show (decision #20): each branch the person works at, plus "All branches" for the Owner.
 * Rendered only when useReportBranch offers a filter (Mid and Big, two or more branches). Doesn't move the device:
 * booking and payments still happen at the branch in the top bar.
 */
export function BranchFilter({ id, filter, value, onChange }: {
  id: string;
  filter: { branches: Branch[]; all: boolean };
  value: string | undefined;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Label htmlFor={id} className="text-sm text-ink-muted">Showing</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className="min-w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {filter.all && <SelectItem value={ALL_BRANCHES}>All branches</SelectItem>}
          {filter.branches.map((b) => (
            <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
