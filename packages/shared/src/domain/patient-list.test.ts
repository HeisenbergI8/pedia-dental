import { describe, expect, it } from "vitest";
import {
  comparePatients, hasNoContact, lastVisitOn, listBounds, matchesFilter, matchesSearch, paginate, patientSearchText, patientStanding, recallDueOn,
  searchWords, standingOn, storedStanding, type PatientFacts,
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
    // B11: a failed invite to a second guardian isn't the family going unreached.
    expect(hasNoContact("p", [m("2026-09-05", "sent"), { ...m("2026-09-06", "failed"), kind: "portal_invite" as const }])).toBe(false);
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

describe("stored standing (B14)", () => {
  // Boundary days around `today` (2026-10-03): due today+7 / today+8 / today-1; last visit today-29 / today-30.
  const days = ["2026-09-03", "2026-09-04", "2026-10-02", "2026-10-03", "2026-10-10", "2026-10-11"];
  const facts: PatientFacts = { visits: [], appointments: [], dueItems: [], invoices: [], payments: [], messages: [] };
  days.forEach((d, n) => {
    const p = `p${n}`;
    facts.visits.push({ patientId: p, status: n % 2 ? "completed" : "in_progress", date: d });
    if (n % 3 === 0) facts.appointments.push({ id: `a${n}`, patientId: p, status: "done", startsAt: at(days[(n + 1) % days.length]!) });
    facts.dueItems.push({ patientId: p, dueOn: d, ruleId: "routine", createdAt: at("2026-01-01") }, { patientId: p, dueOn: days[(n + 2) % days.length]!, ruleId: "routine", createdAt: at("2026-01-01"), appointmentId: `a${n}` });
    if (n % 2) facts.invoices.push({ id: `i${n}`, patientId: p, lines: [{ amount: 1000 * n }], discount: 0, ...(n === 5 && { voided: { at: at(d), by: "s", reason: "mistake" } }) });
    if (n === 3) facts.payments.push({ invoiceId: "i3", amount: 3000 });
    facts.messages.push({ patientId: p, status: n % 2 ? "failed" : "sent", sendAt: at(d) });
  });
  const ids = [...days.keys()].map((n) => `p${n}`).concat("nobody");

  it("answers patientStanding and the filters from what is stored, on the boundary days", () => {
    for (const today of ["2026-10-03", "2026-10-02", "2026-10-04"]) {
      const { recentFrom } = listBounds(today);
      for (const id of ids) {
        const stored = storedStanding(id, facts);
        const computed = patientStanding(id, facts, today);
        expect(standingOn(stored, today), `${id} ${today}`).toEqual(computed);
        const recent = matchesFilter("recent_visit", { ...row(), ...computed }, today);
        expect(recent, `${id} ${today}`).toBe(!!stored.lastVisitOn && stored.lastVisitOn >= recentFrom);
      }
    }
  });

  it("bounds today: recent from today-29, recall due by today+7", () => {
    expect(listBounds("2026-10-03")).toEqual({ recentFrom: "2026-09-04", recallBy: "2026-10-10" });
  });
});
