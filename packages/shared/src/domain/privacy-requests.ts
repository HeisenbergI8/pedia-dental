import { addDays, format, isWeekend, parseISO } from "date-fns";
import { auditCursor, readAuditCursor } from "./privacy-operations";

/**
 * B13c2b E3 (C4, confirm with counsel): working days to answer a data-subject request. The API's
 * PRIVACY_REQUEST_DUE_WORKING_DAYS overrides it; MSW uses it as is.
 */
export const PRIVACY_REQUEST_DUE_WORKING_DAYS_DEFAULT = 15;
/** A row this close to its deadline (working days) says "Due soon" (E10). */
export const DUE_SOON_WORKING_DAYS = 3;

/**
 * `days` working days after `day` (yyyy-MM-dd), Monday to Friday. Philippine holidays aren't skipped, so the deadline
 * can only come early, never late (E3; Q6). A request received on a weekend counts from the next Monday.
 */
export function addWorkingDays(day: string, days: number): string {
  let d = parseISO(day);
  for (let left = days; left > 0; ) {
    d = addDays(d, 1);
    if (!isWeekend(d)) left -= 1;
  }
  return format(d, "yyyy-MM-dd");
}

/** How an open request stands on `today`: `overdue` after its due day, `due_soon` within DUE_SOON_WORKING_DAYS of it. */
export function requestStanding(r: { status: string; dueOn: string }, today: string): "overdue" | "due_soon" | undefined {
  if (r.status !== "open") return undefined;
  if (today > r.dueOn) return "overdue";
  return addWorkingDays(today, DUE_SOON_WORKING_DAYS) >= r.dueOn ? "due_soon" : undefined;
}

/** E4: the closed list's cursor, `closedAt|id`: the audit log's shape, so one reader checks both. */
export const requestCursor = (r: { closedAt?: string; id: string }) => auditCursor({ at: r.closedAt!, id: r.id });
export const readRequestCursor = readAuditCursor;
