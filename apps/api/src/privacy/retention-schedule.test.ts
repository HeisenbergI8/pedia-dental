import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUTH_SWEEP } from "../auth/auth.jobs";
import { IDEMPOTENCY_SWEEP } from "../idempotency/idempotency.jobs";
import { OPERATOR_AUDIT_PRUNE } from "../operator-audit/operator-audit.jobs";
import { OUTBOX_PRUNE } from "../outbox/outbox.jobs";
import { PORTAL_LINK_PRUNE } from "../portal/portal.jobs";
import { MODEL_SCOPE } from "../prisma/model-scope";
import { PURGE } from "../signups/signups.jobs";
import { PRIVACY_ANONYMISE } from "./privacy.jobs";
import { RETENTION_SCHEDULE } from "./retention-schedule";

const JOBS = new Set([AUTH_SWEEP, IDEMPOTENCY_SWEEP, OPERATOR_AUDIT_PRUNE, OUTBOX_PRUNE, PORTAL_LINK_PRUNE, PURGE, PRIVACY_ANONYMISE].map((j) => j.name));
/** B13c2b-2: operator scripts that enforce a period, each a real package script. */
const SCRIPTS = new Set(["db:clinic-purge"]);
const PACKAGE = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { scripts: Record<string, string> };

describe("the retention schedule (B13c2a)", () => {
  it("lists every model MODEL_SCOPE lists, and no other", () => {
    expect(Object.keys(RETENTION_SCHEDULE).sort()).toEqual(Object.keys(MODEL_SCOPE).sort());
  });
  it("names a real job, a real operator script or 'kept' as what enforces each period (no 'B13c2b' left)", () => {
    const bad = Object.entries(RETENTION_SCHEDULE).filter(([, r]) => !JOBS.has(r.enforcedBy) && !SCRIPTS.has(r.enforcedBy) && r.enforcedBy !== "kept");
    expect(bad.map(([m]) => m)).toEqual([]);
    for (const script of SCRIPTS) expect(PACKAGE.scripts[script], script).toBeDefined();
  });
  it("marks every clinical, money and audit period for counsel", () => {
    const unmarked = Object.entries(RETENTION_SCHEDULE).filter(([, r]) => ["clinical record", "money", "audit trail"].includes(r.holds) && !("counsel" in r));
    expect(unmarked.map(([m]) => m)).toEqual([]);
  });
});
