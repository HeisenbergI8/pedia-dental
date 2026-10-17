import { describe, expect, it } from "vitest";
import {
  comparePatients, hasNoContact, lastVisitOn, matchesFilter, matchesSearch, paginate, patientSearchText, patientStanding, recallDueOn,
  searchWords,
} from "./patient-list";

const today = "2026-10-03"; // a Saturday
const flags = { recallDue: false, balanceDue: false, noContact: false };
const row = (o: object = {}) => ({ id: "p", firstName: "Ana", lastName: "Cruz", flags, ...o });
const at = (day: string) => `${day}T02:00:00.000Z`; // 10 AM Manila: the same local day

describe("last visit", () => {
  it("takes the later of completed visits and done appointments, ignoring others", () => {
    const visits = [{ patientId: "p", status: "completed" as const, date: "2026-08-01" }, { patientId: "p", status: "in_progress" as const, date: "2026-10-02" }];
    const appts = [{ patientId: "p", status: "done" as const, startsAt: at("2026-09-20") }, { patientId: "p", status: "no_show" as const, startsAt: at("2026-09-30") }];
    expect(lastVisitOn("p", visits, appts)).toBe("2026-09-20");
    expect(lastVisitOn("q", visits, appts)).toBeUndefined();
  });
});

describe("recall due", () => {
  const item = (dueOn: string, o: object = {}) => ({ patientId: "p", dueOn, ruleId: "routine", createdAt: at("2026-03-01"), ...o });
  const appt = (id: string, status: "booked" | "cancelled" | "done", o: object = {}) => ({ id, status, patientId: "p", startsAt: at("2026-09-20"), ...o });
  it("is due when overdue or within 7 days, not 8+ days out", () => {
    expect(recallDueOn("p", [item("2026-09-01")], [], today)).toBe("2026-09-01");
    expect(recallDueOn("p", [item("2026-10-10")], [], today)).toBe("2026-10-10");
    expect(recallDueOn("p", [item("2026-10-11")], [], today)).toBeUndefined();
  });
  it("is not due once booked, and is due again when that booking is cancelled (isDueItemOpen)", () => {
    const booked = item("2026-09-01", { appointmentId: "a1" });
    expect(recallDueOn("p", [booked], [appt("a1", "booked")], today)).toBeUndefined();
    expect(recallDueOn("p", [booked], [appt("a1", "cancelled")], today)).toBe("2026-09-01");
  });
  it("is not due once a checkup or cleaning was done after it, even one not booked from the recall list", () => {
    expect(recallDueOn("p", [item("2026-09-01")], [appt("x", "done", { procedureCode: "prophylaxis" })], today)).toBeUndefined();
    expect(recallDueOn("p", [item("2026-09-01")], [appt("x", "done", { procedureCode: "extraction" })], today)).toBe("2026-09-01");
  });
});

describe("no contact", () => {
  const m = (sendAt: string, status: "sent" | "failed" | "queued" | "cancelled") => ({ patientId: "p", sendAt: at(sendAt), status });
  it("is the latest sent-or-failed message failing; queued and cancelled don't count", () => {
    expect(hasNoContact("p", [m("2026-09-01", "sent"), m("2026-09-05", "failed"), m("2026-09-09", "queued")])).toBe(true);
    expect(hasNoContact("p", [m("2026-09-05", "failed"), m("2026-09-06", "sent")])).toBe(false);
    // One send time, both outcomes: reached, whichever came first in the list (the API reads the same rule).
    expect(hasNoContact("p", [m("2026-09-05", "sent"), m("2026-09-05", "failed")])).toBe(false);
    expect(hasNoContact("p", [m("2026-09-05", "failed"), m("2026-09-05", "sent")])).toBe(false);
    expect(hasNoContact("p", [])).toBe(false);
  });
});

describe("balance", () => {
  it("is the account balance, the dashboard's outstanding rule", () => {
    const invoices = [{ id: "i1", patientId: "p", lines: [{ procedureCode: "x", description: "x", amount: 170_000 }], discount: 0 }];
    const payments = [{ id: "y", clinicId: "c", branchId: "b", patientId: "p", invoiceId: "i1", amount: 50_000, method: "cash" as const, receiptNo: "AR-1", receivedBy: "s", receivedAt: at("2026-09-01") }];
    const s = patientStanding("p", { visits: [], appointments: [], dueItems: [], invoices, payments, messages: [] }, today);
    expect(s.balance).toBe(120_000);
    expect(s.flags).toEqual({ recallDue: false, balanceDue: true, noContact: false });
  });
});

describe("filters and sort", () => {
  it("recent visit is within 30 days, today included", () => {
    expect(matchesFilter("recent_visit", row({ lastVisitOn: "2026-09-04" }), today)).toBe(true); // 29 days
    expect(matchesFilter("recent_visit", row({ lastVisitOn: "2026-09-03" }), today)).toBe(false); // 30 days
    expect(matchesFilter("recent_visit", row(), today)).toBe(false);
  });
  it("needs attention is any flag", () => {
    expect(matchesFilter("needs_attention", row(), today)).toBe(false);
    expect(matchesFilter("needs_attention", row({ flags: { ...flags, noContact: true } }), today)).toBe(true);
  });
  it("sorts last visit and balance descending, unseen and zero last, ties by name", () => {
    const rows = [row({ id: "1", lastName: "B", lastVisitOn: "2026-09-01", balance: 0 }), row({ id: "2", lastName: "A", balance: 500 }), row({ id: "3", lastName: "C", lastVisitOn: "2026-10-01", balance: 500 })];
    expect([...rows].sort(comparePatients("last_visit")).map((r) => r.id)).toEqual(["3", "1", "2"]);
    expect([...rows].sort(comparePatients("balance")).map((r) => r.id)).toEqual(["2", "3", "1"]);
    expect([...rows].sort(comparePatients("name")).map((r) => r.id)).toEqual(["2", "1", "3"]);
  });
});

describe("search and paging", () => {
  const p = { firstName: "Bea", lastName: "Mendoza", guardians: [{ id: "g", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }] };
  it("matches names always and phone digits only when allowed", () => {
    expect(matchesSearch(p, "mendoza rosa", { phones: false })).toBe(true);
    expect(matchesSearch(p, "0917-123-4567", { phones: true })).toBe(true);
    expect(matchesSearch(p, "0917-123-4567", { phones: false })).toBe(false);
  });
  it("clamps the page and reports the total", () => {
    const rows = Array.from({ length: 45 }, (_, i) => i);
    expect(paginate(rows, 3, 20)).toMatchObject({ rows: [40, 41, 42, 43, 44], total: 45, page: 3 });
    expect(paginate(rows, 9, 20).page).toBe(3);
    expect(paginate([], 2, 20)).toMatchObject({ rows: [], total: 0, page: 1 });
  });
});

describe("patientSearchText and searchWords (decision 1)", () => {
  const p = { firstName: "Bea", lastName: "Mendoza", nickname: "Bebe", guardians: [{ fullName: "Rosa Mendoza", phone: "0917 123-4567" }] } as Parameters<typeof patientSearchText>[0];
  it("lowercases the child's and guardians' names, and keeps phone digits apart", () => {
    expect(patientSearchText(p)).toEqual({ names: "bea mendoza bebe rosa mendoza", digits: "09171234567" });
  });
  it("splits on spaces and marks phone words with their digits", () => {
    expect(searchWords("  Bea 0917-123-4567 (02) ")).toEqual([{ text: "bea" }, { text: "0917-123-4567", digits: "09171234567" }, { text: "(02)", digits: "02" }]);
    expect(searchWords("")).toEqual([]);
    expect(searchWords("abc-1")).toEqual([{ text: "abc-1" }]);
  });
  it("still finds by name for everyone and by phone only with phones", () => {
    expect(matchesSearch(p, "mendoza rosa", { phones: false })).toBe(true);
    expect(matchesSearch(p, "1234567", { phones: false })).toBe(false);
    expect(matchesSearch(p, "1234567", { phones: true })).toBe(true);
  });
});
