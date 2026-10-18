import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LimitNotice } from "./limit-notice";

const usage = (inUse: number, limit: number | null) => ({
  tier: "small" as const, branches: { inUse, limit }, staffLogins: { inUse, limit },
  storage: { inUse: 0, limit: 1 }, texts: { inUse: 0, limit: 1 }, month: "2026-10",
});

describe("LimitNotice (decision #8)", () => {
  it("says the limit and how to lift it at the limit, and after a downgrade over it", () => {
    expect(renderToStaticMarkup(h(LimitNotice, { usage: usage(5, 5), limit: "staffLogins" }))).toContain("Your Small plan includes 5 staff logins. Contact Primolar to upgrade.");
    expect(renderToStaticMarkup(h(LimitNotice, { usage: usage(2, 1), limit: "branches" }))).toContain("Contact Primolar to upgrade.");
  });
  it("stays quiet while there is room", () => {
    expect(renderToStaticMarkup(h(LimitNotice, { usage: usage(4, 5), limit: "staffLogins" }))).toBe("");
  });
});
