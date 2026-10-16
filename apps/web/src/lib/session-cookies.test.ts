import { allAccounts, seedPlatform } from "@pedia/seed";
import type { Session } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { tokenFor } from "@/mocks/demo-accounts";
import { OPERATORS, operatorToken } from "@/mocks/operator";
import { clinicSessionWrites, clinicTokenCookie, mockTokenOf, operatorSessionWrites, operatorTokenCookie } from "./session-cookies";

const platform = seedPlatform();
const owner: Session = { token: "cookie", user: { id: "staff_x", role: "owner", name: "N", email: "n@x.demo", clinicId: "clinic_demo", roles: ["owner"], staffId: "staff_x" } };

describe("the hybrid bridge token", () => {
  it("is the mock's own token for every seeded login, staff and parents, in every clinic", () => {
    const pairs = Object.entries(platform.tenants).flatMap(([clinicId, db]) =>
      allAccounts(db).map((a) => [mockTokenOf({ ...a, clinicId }), tokenFor(clinicId, a)]),
    );
    expect(pairs.some(([, t]) => t.includes(".guardian."))).toBe(true); // parents are in the sweep
    for (const [bridge, mock] of pairs) expect(bridge).toBe(mock);
  });

  it("holds when the API's user id is the bare guardian id", () => {
    expect(mockTokenOf({ id: "g1", clinicId: "clinic_demo", guardianId: "g1" })).toBe("demo.clinic_demo.guardian.g1");
  });

  it("is the operator's mock token", () => {
    const op = OPERATORS[0]!;
    expect(operatorSessionWrites("hybrid", { token: "operator.cookie", operator: op })).toEqual([["pd_mock_operator", operatorToken(op)]]);
  });
});

describe("what each mode writes and MSW reads", () => {
  it("enabled: pd_session with the body's token, as before B2d", () => {
    expect(clinicSessionWrites("enabled", { ...owner, token: "demo.clinic_demo.staff_x" })).toEqual([["pd_session", "demo.clinic_demo.staff_x"]]);
    expect([clinicTokenCookie("enabled"), operatorTokenCookie("enabled")]).toEqual(["pd_session", "pd_operator"]);
  });

  it("hybrid: never pd_session or pd_operator (the API's httpOnly cookies), only the bridge", () => {
    expect(clinicSessionWrites("hybrid", owner)).toEqual([["pd_mock_session", "demo.clinic_demo.staff_x"]]);
    expect(clinicSessionWrites("hybrid", null)).toEqual([["pd_mock_session", null]]);
    expect([clinicTokenCookie("hybrid"), operatorTokenCookie("hybrid")]).toEqual(["pd_mock_session", "pd_mock_operator"]);
  });

  it("disabled: writes nothing", () => {
    expect([...clinicSessionWrites("disabled", owner), ...operatorSessionWrites("disabled", null)]).toEqual([]);
  });
});
