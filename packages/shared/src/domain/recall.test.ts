import { describe, expect, it } from "vitest";
import { dueDateFor, findRule } from "./recall";

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
});
