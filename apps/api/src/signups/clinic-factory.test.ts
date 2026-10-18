import { describe, expect, it } from "vitest";
import type { Signup } from "@pedia/shared";
import { seedPlatform } from "@pedia/seed";
import { FixedClock } from "../common/clock";
import type { Tx } from "../prisma/transaction";
import { ClinicFactory, newClinicIds } from "./clinic-factory";

/** A transaction that records every write: model.operation, and the data written. */
function recordingTx() {
  const calls: { op: string; data: Record<string, unknown> }[] = [];
  const tx = new Proxy({}, {
    get: (_, model: string) => new Proxy({}, {
      get: (__, op: string) => async (args: { data?: Record<string, unknown> }) => {
        calls.push({ op: `${model}.${op}`, data: (args?.data ?? {}) as Record<string, unknown> });
        return {};
      },
    }),
  }) as unknown as Tx;
  return { tx, calls };
}

const signup = (branding: Signup["branding"]): Signup => ({
  ...seedPlatform().signups[0]!,
  branding,
  payment: { method: "gcash", paidOn: "2026-10-18", amount: 1_000_000, recordedAt: "2026-10-18T01:00:00.000Z" },
});

function factory() {
  const done: string[] = [];
  const identity = { createStaffLogin: async () => void done.push("credential") };
  const subscriptions = { start: async () => void done.push("subscription") };
  const audit = { recordFor: async () => void done.push("audit") };
  return { done, make: new ClinicFactory(identity as never, subscriptions as never, audit as never, new FixedClock(new Date("2026-10-18T09:00:00+08:00"))) };
}

describe("ClinicFactory.write (B12 Step 6.3)", () => {
  it("writes the account first and the sign-up's approval last, with every row in between", async () => {
    const { tx, calls } = recordingTx();
    const { make } = factory();
    await make.write(tx, signup({ choice: "default" }), newClinicIds(), { temporaryPassword: "x", pin: "1234", passwordHash: "h", pinHash: "p" });
    const ops = calls.map((c) => c.op);
    expect(ops[0]).toBe("clinicAccount.create");
    expect(ops.at(-1)).toBe("signup.update");
    for (const op of ["agreement.create", "branch.create", "staff.create", "chair.create", "procedure.createMany", "noteTemplate.createMany", "messageTemplate.createMany", "privacyNotice.create"]) {
      expect(ops).toContain(op);
    }
    expect(ops.indexOf("signup.update")).toBeGreaterThan(ops.indexOf("clinicAccount.create"));
  });

  it("keeps Primolar's colour for the default look, the clinic's for Use my own, and marks Design it for me in progress", async () => {
    const ids = { temporaryPassword: "x", pin: "1234", passwordHash: "h", pinHash: "p" };
    const run = async (b: Signup["branding"]) => {
      const { tx, calls } = recordingTx();
      await factory().make.write(tx, signup(b), newClinicIds(), ids);
      return { account: calls[0]!.data, approval: calls.at(-1)!.data };
    };
    expect((await run({ choice: "default" })).account).toMatchObject({ brandColor: "#5b3fa8", headingFont: null, status: "active" });
    expect((await run({ choice: "own", brandColor: "#1d4ed8", headingFont: "nunito" })).account).toMatchObject({ brandColor: "#1d4ed8", headingFont: "nunito" });
    const designed = await run({ choice: "designed", brief: "Calm and playful" });
    expect(designed.approval).toMatchObject({ status: "approved", designStatus: "in_progress" });
    expect((await run({ choice: "default" })).approval).not.toHaveProperty("designStatus");
  });

  it("starts the Owner's login, the first audit event and the subscription inside the same write", async () => {
    const { tx } = recordingTx();
    const { make, done } = factory();
    await make.write(tx, signup({ choice: "default" }), newClinicIds(), { temporaryPassword: "x", pin: "1234", passwordHash: "h", pinHash: "p" });
    expect(done).toEqual(["credential", "audit", "subscription"]);
  });
});
