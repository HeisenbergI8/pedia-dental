import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLINIC_RULES, OPERATOR_RULES, PUBLIC_RULES, clinicRefusal, matchRoute, type Route } from "./access-rules";

// A guard that reads source, like apps/web/src/design/*: the mock's gate IS the contract (CONVENTIONS → Data flow).
const source = readFileSync(new URL("../../../web/src/mocks/access.ts", import.meta.url), "utf8");

/** The `{ method, path, permission? }` entries of one `const NAME ... = [ ... ];` block of the web's access.ts. */
function webRules(name: string) {
  const start = source.indexOf(`const ${name}`);
  expect(start, `${name} not found in apps/web/src/mocks/access.ts`).toBeGreaterThan(-1);
  const block = source.slice(start, source.indexOf("];", start));
  return [...block.matchAll(/method:\s*"(\w+)",\s*path:\s*"([^"]+)"(?:,\s*permission:\s*(\[[^\]]*\]|"[^"]+"))?/g)].map(
    ([, method, path, permission]) => ({ method: method!, path: path!, ...(permission && { permission: [JSON.parse(permission)].flat() as string[] }) }),
  );
}
const key = (r: Route & { permission?: unknown }) => `${r.method} ${r.path} ${JSON.stringify(r.permission ?? null)}`;
const sorted = (rules: (Route & { permission?: unknown })[]) => rules.map(key).sort();

describe("the API's route map mirrors the mock's gate", () => {
  it("has every clinic rule with the same permissions, and no other", () => {
    const api = CLINIC_RULES.map(({ method, path, permission }) => ({ method, path, permission: [permission].flat() }));
    expect(sorted(api)).toEqual(sorted(webRules("RULES")));
  });
  it("has every operator and public route, and no other (plus GET /health)", () => {
    expect(sorted([...OPERATOR_RULES])).toEqual(sorted(webRules("OPERATOR_RULES")));
    expect(sorted(PUBLIC_RULES.filter((r) => r.path !== "/health"))).toEqual(sorted(webRules("PUBLIC_RULES")));
  });
});

describe("matchRoute: deny by default", () => {
  it("finds a rule with its params, and nothing for an unlisted route", () => {
    expect(matchRoute("GET", "/patients/p1/plan")).toMatchObject({ kind: "clinic", params: { id: "p1" } });
    expect(matchRoute("DELETE", "/patients/p1/plan")).toBeUndefined();
    expect(matchRoute("GET", "/operator/nothing")).toBeUndefined();
    expect(matchRoute("GET", "/auth/me")).toMatchObject({ kind: "self" });
    expect(matchRoute("GET", "/health")).toMatchObject({ kind: "public" });
  });
  it("never lets a clinic rule answer an /operator path", () => {
    expect(matchRoute("GET", "/operator/accounts")).toMatchObject({ kind: "operator" });
  });
});

describe("clinicRefusal (rolesCan only)", () => {
  const rule = (path: string, method = "GET") => {
    const m = matchRoute(method, path);
    if (m?.kind !== "clinic") throw new Error(path);
    return m;
  };
  const q = new URLSearchParams();
  it("lets a role holding the permission at `all` through, and refuses one without it", () => {
    const { rule: r, params } = rule("/reports/finance");
    expect(clinicRefusal(["admin"], r, params, q, new Set())).toBeUndefined();
    expect(clinicRefusal(["dentist"], r, params, q, new Set())).toBe("You don't have access to this");
  });
  it("lets a parent reach only their own child's record, and a filtered list", () => {
    const { rule: r, params } = rule("/patients/kid1/plan");
    expect(clinicRefusal(["parent"], r, params, q, new Set(["kid1"]))).toBeUndefined();
    expect(clinicRefusal(["parent"], r, params, q, new Set(["kid2"]))).toBe("This isn't one of your children's records");
    const list = rule("/patients");
    expect(clinicRefusal(["parent"], list.rule, list.params, q, new Set())).toBeUndefined();
  });
  it("refuses a parent on a record-owned route until its lookup exists (fail closed)", () => {
    const { rule: r, params } = rule("/appointments/a1/status", "POST");
    expect(clinicRefusal(["parent"], r, params, q, new Set(["kid1"]))).toBe("This isn't one of your children's records");
  });
});
