import {
  ArmchairIcon,
  BanIcon,
  CheckCheckIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  DoorOpenIcon,
  UserXIcon,
  type LucideIcon,
} from "lucide-react";
import type { AppointmentStatus } from "@pedia/shared";
import { cn } from "@/lib/utils";
import { STATUS_LABEL } from "../api";

/** Every status has its own icon and word, so it never relies on colour (and prints in black and white). */
export const STATUS_ICON: Record<AppointmentStatus, LucideIcon> = {
  booked: CircleDashedIcon,
  confirmed: CircleCheckIcon,
  arrived: DoorOpenIcon,
  in_chair: ArmchairIcon,
  done: CheckCheckIcon,
  no_show: UserXIcon,
  cancelled: BanIcon,
};

/** Status tones from the status triples. Arrived is amber: someone is waiting. Never the clinical alert colour. */
export const STATUS_TONE: Record<AppointmentStatus, string> = {
  booked: "border-line-strong bg-surface text-ink",
  confirmed: "border-brand-ring bg-brand-subtle text-brand",
  arrived: "border-warning-line bg-warning-bg text-warning",
  in_chair: "border-info-line bg-info-bg text-info",
  done: "border-success-line bg-success-bg text-success",
  no_show: "border-danger-line bg-danger-bg text-danger",
  cancelled: "border-line bg-ground text-ink-muted", // muted with the word "Cancelled": never struck through
};

export function StatusChip({ status, className }: { status: AppointmentStatus; className?: string }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_TONE[status], className)}>
      <Icon className="size-3.5" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}
