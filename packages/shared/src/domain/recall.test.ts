import { describe, expect, it } from "vitest";
import { dueBucket, dueDateFor, dueItemFor, findRule, isDueItemOpen } from "./recall";

describe("follow-up rules", () => {
  it("extraction → 7 days", () => {
    expect(dueDateFor(findRule("extraction")!, "2026-10-02")).toBe("2026-10-09");
  });
  it("pulpotomy → 2 weeks", () => {
    expect(dueDateFor(findRule("pulpotomy")!, "2026-10-02")).toBe("2026-10-16");
  });
  it("sealant → 6 months", () => {
    expect(dueDateFor(findRule("sealant")!, "2026-10-02")).toBe("2027-04-02");
  });
  it("an extraction done today is due in 7 days, in this week's list", () => {
    const item = dueItemFor("extraction", "2026-10-03")!; // a Saturday: a calendar week would miss it
    expect(item).toEqual({ ruleId: "extraction", kind: "follow_up", procedure: "extraction", dueOn: "2026-10-10" });
    expect(dueBucket(item.dueOn, "2026-10-03")).toBe("this_week");
  });
  it("creates nothing for a procedure without a rule", () => {
    expect(dueItemFor("restoration", "2026-10-03")).toBeUndefined();
  });
  it("buckets by rolling window from today", () => {
    expect(dueBucket("2026-10-02", "2026-10-03")).toBe("overdue");
    expect(dueBucket("2026-10-03", "2026-10-03")).toBe("this_week");
    expect(dueBucket("2026-10-11", "2026-10-03")).toBe("this_month");
    expect(dueBucket("2026-11-02", "2026-10-03")).toBe("this_month");
    expect(dueBucket("2026-11-03", "2026-10-03")).toBeUndefined();
  });
  it("leaves the list when booked, and returns if the booking is cancelled or missed", () => {
    const item = { appointmentId: "a1" };
    expect(isDueItemOpen({}, [])).toBe(true);
    expect(isDueItemOpen(item, [{ id: "a1", status: "booked" }])).toBe(false);
    expect(isDueItemOpen(item, [{ id: "a1", status: "done" }])).toBe(false);
    expect(isDueItemOpen(item, [{ id: "a1", status: "cancelled" }])).toBe(true);
    expect(isDueItemOpen(item, [{ id: "a1", status: "no_show" }])).toBe(true);
    expect(isDueItemOpen({ closedAt: "2026-10-03T00:00:00Z" }, [])).toBe(false);
  });

  it("closes a 6-month recall once the child has a completed checkup or cleaning after it, booked from the list or not", () => {
    const item = { patientId: "p", ruleId: "routine", createdAt: "2026-04-01T02:00:00.000Z" };
    const appt = (procedureCode: string, status: "done" | "booked", startsAt = "2026-09-30T02:00:00.000Z") => ({ id: "x", patientId: "p", procedureCode, status, startsAt });
    expect(isDueItemOpen(item, [appt("prophylaxis", "done")])).toBe(false);
    expect(isDueItemOpen(item, [appt("oral_exam", "done")])).toBe(false);
    expect(isDueItemOpen(item, [appt("oral_exam", "booked")])).toBe(true); // not done yet
    expect(isDueItemOpen(item, [appt("extraction", "done")])).toBe(true); // an emergency isn't a checkup
    expect(isDueItemOpen(item, [appt("oral_exam", "done", "2026-03-01T02:00:00.000Z")])).toBe(true); // before the item
    expect(isDueItemOpen({ ...item, ruleId: "extraction" }, [appt("oral_exam", "done")])).toBe(true); // follow-ups need their own visit
  });
});
