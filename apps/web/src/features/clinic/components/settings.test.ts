import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LimitNotice } from "./limit-notice";
import { hoursLine } from "./branches-panel";

const usage = (inUse: number, limit: number | null) => ({
  tier: "small" as const, branches: { inUse, limit }, staffLogins: { inUse, limit },
  storage: { inUse: 0, limit: 1 }, texts: { inUse: 0, limit: 1 }, textTopUp: 0, month: "2026-10",
});

describe("LimitNotice (decision #8)", () => {
  it("says the limit and how to lift it at the limit, and after a downgrade over it", () => {
    expect(renderToStaticMarkup(h(LimitNotice, { usage: usage(10, 10), limit: "staffLogins" }))).toContain("Your Starter plan includes 10 staff logins. Contact Primolar to upgrade.");
    expect(renderToStaticMarkup(h(LimitNotice, { usage: usage(2, 1), limit: "branches" }))).toContain("Contact Primolar to upgrade.");
  });
  it("stays quiet while there is room", () => {
    expect(renderToStaticMarkup(h(LimitNotice, { usage: usage(4, 5), limit: "staffLogins" }))).toBe("");
  });
});

describe("LimitNotice while a downgrade waits (bot report #19)", () => {
  it("names the smaller plan and its date, as the API's refusal does", () => {
    const clinic = { ...usage(1, 1), tier: "mid" as const };
    expect(renderToStaticMarkup(h(LimitNotice, { usage: clinic, limit: "branches", downgrade: { tier: "small", on: "2026-12-19" } }))).toContain(
      "Your plan moves to Starter on 19 December 2026, and Starter includes 1 branch.",
    );
  });
});

describe("hoursLine (bot report #43)", () => {
  it("says Open 24 hours for midnight to midnight, and the times otherwise", () => {
    expect(hoursLine({ opensAt: 0, closesAt: 1440, closedWeekdays: [] })).toBe("Open 24 hours");
    expect(hoursLine({ opensAt: 0, closesAt: 1440, closedWeekdays: [0] })).toBe("Open 24 hours, closed Sun");
    expect(hoursLine({ opensAt: 480, closesAt: 1080, closedWeekdays: [] })).not.toContain("24");
  });
});
