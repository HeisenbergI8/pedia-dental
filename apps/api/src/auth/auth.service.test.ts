import "reflect-metadata";
import { HttpException } from "@nestjs/common";
import { COMMON_PASSWORD_MESSAGE, LOGIN_PASSWORD_MESSAGE, PIN_POLICY, lockState, type Branch } from "@pedia/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../common/clock";
import { requestContext, type RequestContext } from "../common/request-context";
import type { Env } from "../config/env";
import {
  AuthService, CODE_NEEDED_MESSAGE, CODE_WRONG_MESSAGE, SessionEndedException, TOTP_REQUIRED_MESSAGE, WRONG_PINS_MESSAGE, WRONG_PINS_SIGN_OUT,
} from "./auth.service";
import type { ClinicIdentity } from "./identity.service";
import { ACCOUNT_LOCKOUT, RATE_LIMITS } from "./rate-limit";
import { base32Decode, hotp, newTotpSecret, totpStep } from "./totp";

/**
 * Security review #7, #8, #9 and #20 without a database: AuthService over fakes. The fake RateLimitService keeps the
 * real policy (lockState, ACCOUNT_LOCKOUT); MySQL's side of it (exact counts under concurrency) is
 * test/int/rate-limit.int.test.ts. Fake fixture secrets only (EXAMPLE_*), never a real credential.
 */
const EXAMPLE_RIGHT = "EXAMPLE-right-1";
const EXAMPLE_WRONG = "EXAMPLE-wrong-1";
const EXAMPLE_NEW = "EXAMPLE-blue-tooth-garden";
const EXAMPLE_PIN = "1234";
const totpKey = newTotpSecret();
const clock = new FixedClock(new Date("2026-11-19T02:00:00Z"));

class FakeLimits {
  failures = new Map<string, number[]>();
  rolling = new Map<string, number>();
  async tryPassword(bucket: string) {
    const now = clock.now().getTime();
    const state = lockState(this.failures.get(bucket) ?? [], now, ACCOUNT_LOCKOUT);
    if (state.locked) return { allowed: false as const, retryAfter: Math.ceil((state.until - now) / 1000) };
    this.failures.set(bucket, [...(this.failures.get(bucket) ?? []), now]);
    return { allowed: true as const };
  }
  async passwordRight(bucket: string) {
    this.failures.delete(bucket);
  }
  async hitRolling(bucket: string, limit: { hits: number }) {
    const hits = (this.rolling.get(bucket) ?? 0) + 1;
    this.rolling.set(bucket, hits);
    return { allowed: hits <= limit.hits, hits };
  }
}

const actor = (id: string) => ({ id, name: id, role: "dentist" as const, roles: ["dentist" as const] });
const branch = { id: "branch_imus", name: "Imus" } as Branch;

function setup(env: Partial<Env> = {}) {
  const audits: { actor?: string; action: string; record: string }[] = [];
  const operatorAudits: string[] = [];
  const closed: string[] = [];
  const pins = new Map<string, string[]>();
  const stored = `hash:${EXAMPLE_RIGHT}`;
  const operator = { id: "op1", name: "Ops", email: "ops@primolar.ph", passwordHash: stored, totpSecret: null as string | null, lastStep: null as number | null };
  const identity = {
    loginsBy: async (email: string) =>
      email === "rosa@example.com"
        ? [{ clinicId: "c1", clinicName: "Bulilit", active: true, billingOnly: false, accountId: "staff_rosa", passwordHash: stored, isStaff: true, actor: actor("staff_rosa") }]
        : [],
    forSession: async ({ clinicId, accountId }: { clinicId: string; accountId: string }) =>
      ({ clinicId, user: actor(accountId), email: "rosa@example.com", readOnly: false, billingOnly: false, mustChangePassword: false, branches: [branch] }) as ClinicIdentity,
    operatorByEmail: async (email: string) => (email === operator.email ? { ...operator } : undefined),
    useTotpStep: async (_id: string, step: number) => {
      if (operator.lastStep !== null && operator.lastStep >= step) return false;
      operator.lastStep = step;
      return true;
    },
    switchTarget: async (_clinicId: string, accountId: string) => ({ actor: actor(accountId), staff: { role: "dentist", alsoRoles: [], isOwner: false, branchIds: ["branch_imus"], deactivatedAt: null } }),
    checkPin: async (_clinicId: string, accountId: string, pin: string) => {
      const failedAt = pins.get(accountId) ?? [];
      const now = clock.now();
      const before = lockState(failedAt.map(Date.parse), now.getTime(), PIN_POLICY);
      if (before.locked) return { outcome: "locked", until: new Date(before.until).toISOString() };
      if (pin === EXAMPLE_PIN) return { outcome: "ok", failedAt: [] };
      const kept = [...failedAt, now.toISOString()];
      pins.set(accountId, kept);
      const after = lockState(kept.map(Date.parse), now.getTime(), PIN_POLICY);
      return after.locked ? { outcome: "wrong", failedAt: kept, locked: { until: new Date(after.until).toISOString() }, attemptsLeft: 0 } : { outcome: "wrong", failedAt: kept, attemptsLeft: after.attemptsLeft };
    },
    signInValues: async () => ["rosa@example.com", "639171234567"],
    changePassword: async (_c: string, _a: string, current: string) => current === EXAMPLE_RIGHT,
  };
  const sessions = {
    openClinic: async () => "clinic-token",
    openOperator: async () => "operator-token",
    closeClinic: async (token: string) => { closed.push(token); },
    closeAllFor: async () => {},
  };
  const hasher = { hash: async (s: string) => `hash:${s}`, matches: async (hash: string, s: string) => hash === `hash:${s}` };
  const audit = { record: async (action: string, record: string) => { audits.push({ actor: requestContext.current()?.user?.id, action, record }); } };
  const prisma = { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({}) };
  const subscriptions = { settle: async () => {} };
  const operatorAudit = { tryRecordFor: async (_op: unknown, action: string, _record: string, detail: string) => { operatorAudits.push(`${action}: ${detail}`); } };
  const limits = new FakeLimits();
  const consoleSignIns: string[] = [];
  const metrics = { countConsoleSignIn: () => consoleSignIns.push("in") };
  const fullEnv = { APP_ENV: "local", DEMO_LOGINS: false, ...env } as Env;
  const auth = new AuthService(identity as never, sessions as never, hasher as never, audit as never, prisma as never, clock, fullEnv, subscriptions as never, operatorAudit as never, limits as never, metrics as never);
  auth.signInFloorMs = 0;
  const run = <T>(fn: () => Promise<T>, user?: string) => requestContext.run({ requestId: "t", operator: false, ...(user ? { clinicId: "c1", user: actor(user) } : {}) } as RequestContext, fn);
  return { auth, audits, operatorAudits, consoleSignIns, closed, operator, run };
}

/** The status and message an HttpException carries, or the error itself. */
const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
    return "resolved";
  } catch (error) {
    return error instanceof HttpException ? [error.getStatus(), error.message] : error;
  }
};

beforeEach(() => clock.set(new Date("2026-11-19T02:00:00Z")));

describe("sign-in's per-login lock (security review #7)", () => {
  it("refuses a login after five wrong passwords, even the right one, with words that don't say whether it exists", async () => {
    const { auth, run } = setup();
    for (const email of ["rosa@example.com", "nobody@example.com"]) {
      for (let i = 0; i < 5; i++) expect(await refusal(run(() => auth.login({ email, password: EXAMPLE_WRONG })))).toEqual([401, expect.stringContaining("don't match")]);
      expect(await refusal(run(() => auth.login({ email, password: EXAMPLE_RIGHT })))).toEqual([429, "Too many wrong passwords. Try again in 1 minute."]);
    }
  });

  it("locks for twice as long after each further wrong password, and forgets them all on the right one", async () => {
    const { auth, run } = setup();
    const email = "rosa@example.com";
    for (let i = 0; i < 5; i++) await refusal(run(() => auth.login({ email, password: EXAMPLE_WRONG })));
    clock.set(new Date("2026-11-19T02:01:01Z"));
    expect(await refusal(run(() => auth.login({ email, password: EXAMPLE_WRONG })))).toEqual([401, expect.any(String)]);
    expect(await refusal(run(() => auth.login({ email, password: EXAMPLE_RIGHT })))).toEqual([429, "Too many wrong passwords. Try again in 2 minutes."]);
    clock.set(new Date("2026-11-19T02:03:02Z"));
    expect((await run(() => auth.login({ email, password: EXAMPLE_RIGHT }))).token).toBe("clinic-token");
    for (let i = 0; i < 4; i++) await refusal(run(() => auth.login({ email, password: EXAMPLE_WRONG })));
    expect((await run(() => auth.login({ email, password: EXAMPLE_RIGHT }))).token).toBe("clinic-token"); // four typos, then right
  });

  it("logs a failed sign-in in the account it names without waiting for it (security review #20)", async () => {
    const { auth, audits, run } = setup();
    await refusal(run(() => auth.login({ email: "rosa@example.com", password: EXAMPLE_WRONG })));
    await new Promise((resolve) => setImmediate(resolve));
    expect(audits).toEqual([{ actor: "staff_rosa", action: "sign_in_failed", record: "Session" }]);
  });

  it("holds every failed sign-in to the floor, for a real login and an unknown one alike", async () => {
    const { auth, run } = setup();
    auth.signInFloorMs = 60;
    for (const email of ["rosa@example.com", "nobody@example.com"]) {
      const started = performance.now();
      await refusal(run(() => auth.login({ email, password: EXAMPLE_WRONG })));
      expect(performance.now() - started).toBeGreaterThanOrEqual(55);
    }
  });
});

describe("POST /auth/password (security review #7)", () => {
  const who = { clinicId: "c1", user: actor("staff_rosa"), email: "rosa@example.com", readOnly: false, billingOnly: false, mustChangePassword: false, branches: [branch] } as ClinicIdentity;

  it("refuses a common password and the login itself as the new one", async () => {
    const { auth, run } = setup();
    const change = (next: string) => run(() => auth.changePassword(who, { current: EXAMPLE_RIGHT, next }), "staff_rosa");
    expect(await refusal(change("Password123"))).toEqual([400, expect.anything()]);
    expect(await refusal(change("ROSA@example.com"))).toEqual([400, LOGIN_PASSWORD_MESSAGE]);
    expect(await refusal(change("0917 123 4567"))).toEqual([400, LOGIN_PASSWORD_MESSAGE]);
    expect((await change(EXAMPLE_NEW)).token).toBe("clinic-token");
    expect(COMMON_PASSWORD_MESSAGE).toMatch(/too common/);
  });

  it("locks the current-password check after five wrong ones, as sign-in does", async () => {
    const { auth, run } = setup();
    const change = (current: string) => refusal(run(() => auth.changePassword(who, { current, next: EXAMPLE_NEW }), "staff_rosa"));
    for (let i = 0; i < 5; i++) expect(await change(`${EXAMPLE_WRONG}-${i}`)).toEqual([400, "That isn't your current password"]);
    expect(await change(EXAMPLE_RIGHT)).toEqual([429, "Too many wrong passwords. Try again in 1 minute."]);
  });
});

describe("the operator's two-step sign-in (security review #8)", () => {
  const codeAt = (offsetSteps = 0) => hotp(base32Decode(totpKey)!, totpStep(clock.now()) + offsetSteps);
  const login = (auth: AuthService, code?: string) => auth.operatorLogin({ email: "ops@primolar.ph", password: EXAMPLE_RIGHT, code });
  const notTheCode = () => (codeAt() === "000000" ? "111111" : "000000");

  it("asks an enrolled operator for the code, takes a right one once, and refuses a wrong or reused one", async () => {
    const { auth, operator, operatorAudits, consoleSignIns, run } = setup();
    operator.totpSecret = totpKey;
    expect(await refusal(run(() => login(auth)))).toEqual([401, CODE_NEEDED_MESSAGE]);
    expect(await refusal(run(() => login(auth, notTheCode())))).toEqual([401, CODE_WRONG_MESSAGE]);
    expect((await run(() => login(auth, codeAt()))).token).toBe("operator-token");
    expect(await refusal(run(() => login(auth, codeAt())))).toEqual([401, CODE_WRONG_MESSAGE]); // used once already
    expect(await refusal(run(() => login(auth, codeAt(-1))))).toEqual([401, CODE_WRONG_MESSAGE]); // older than the one used
    expect((await run(() => login(auth, codeAt(1)))).token).toBe("operator-token"); // the next step, early (clock drift)
    expect(operatorAudits.filter((a) => a.includes("two-step"))).toHaveLength(3);
    expect(consoleSignIns).toHaveLength(2); // only the two that got in count towards the sign-in alert
  });

  it("refuses a wrong password before it ever asks for a code", async () => {
    const { auth, operator, run } = setup();
    operator.totpSecret = totpKey;
    const wrong = run(() => auth.operatorLogin({ email: "ops@primolar.ph", password: EXAMPLE_WRONG, code: codeAt() }));
    expect(await refusal(wrong)).toEqual([401, "That email and password don't match a Primolar operator"]);
  });

  it("counts a missing or wrong code against the login, so guessing codes locks it too", async () => {
    const { auth, operator, run } = setup();
    operator.totpSecret = totpKey;
    for (let i = 0; i < 5; i++) await refusal(run(() => login(auth, notTheCode())));
    expect(await refusal(run(() => login(auth, codeAt())))).toEqual([429, "Too many wrong passwords. Try again in 1 minute."]);
  });

  it("refuses an operator who hasn't enrolled in production, and lets one in on demo and local", async () => {
    const prod = setup({ APP_ENV: "production" });
    expect(await refusal(prod.run(() => login(prod.auth)))).toEqual([403, TOTP_REQUIRED_MESSAGE]);
    for (const APP_ENV of ["demo", "local"] as const) {
      const other = setup({ APP_ENV });
      expect((await other.run(() => login(other.auth, "123456"))).token).toBe("operator-token");
    }
  });
});

describe("Switch user's per-session PIN limit (security review #9)", () => {
  const who = { clinicId: "c1", user: { id: "staff_cruz", name: "Cruz", role: "front_desk", roles: ["front_desk"] }, email: "desk@example.com", readOnly: false, billingOnly: false, mustChangePassword: false, branches: [branch] } as ClinicIdentity;
  const switchTo = (s: ReturnType<typeof setup>, accountId: string, pin: string) => s.run(() => s.auth.switchUser(who, "desk-token", branch, { accountId, pin }), "staff_cruz");

  it("signs the session out on its fifth wrong PIN, across different people, and logs it as the person leaving", async () => {
    const s = setup();
    for (const id of ["staff_a", "staff_b", "staff_c", "staff_d"]) expect(await refusal(switchTo(s, id, "0000"))).toEqual([401, expect.stringContaining("isn't right")]);
    const fifth = switchTo(s, "staff_e", "0000");
    await expect(fifth).rejects.toBeInstanceOf(SessionEndedException);
    await expect(fifth).rejects.toThrow(WRONG_PINS_MESSAGE);
    expect(s.closed).toEqual(["desk-token"]);
    expect(s.audits.at(-1)).toEqual({ actor: "staff_cruz", action: "sign_out", record: WRONG_PINS_SIGN_OUT });
    expect(RATE_LIMITS.pins.hits).toBe(5);
  });

  it("checks no PIN past the limit, not even a right one", async () => {
    const s = setup();
    for (let i = 0; i < 5; i++) await refusal(switchTo(s, "staff_a", "0000"));
    expect(await refusal(switchTo(s, "staff_b", EXAMPLE_PIN))).toEqual([401, WRONG_PINS_MESSAGE]);
  });

  it("lets a right PIN through on the session's last try", async () => {
    const s = setup();
    for (const id of ["staff_a", "staff_b", "staff_c", "staff_d"]) await refusal(switchTo(s, id, "0000"));
    expect((await switchTo(s, "staff_e", EXAMPLE_PIN)).token).toBe("clinic-token");
  });
});
