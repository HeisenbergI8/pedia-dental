"use client";
import { MapPinIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useClinic, useSwitchBranch } from "../api";

/**
 * Which branch this device is working at (decision #14). Hidden for anyone at a single branch, the common case.
 * The kit's Select (Radix), so keyboard and screen-reader behaviour match every other picker.
 */
export function BranchSwitcher({ className }: { className?: string }) {
  const { data } = useClinic();
  const switchBranch = useSwitchBranch();
  if (!data || data.branches.length < 2) return null;
  return (
    <Select value={data.activeBranchId} onValueChange={switchBranch}>
      <SelectTrigger size="sm" aria-label="Branch" className={cn("min-w-0", className)}>
        <MapPinIcon aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {data.branches.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
