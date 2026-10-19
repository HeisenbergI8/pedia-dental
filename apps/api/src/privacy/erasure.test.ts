import { describe, expect, it } from "vitest";
import { APPEND_ONLY } from "../prisma/model-scope";
import { scopeArgs } from "../prisma/tenant-scope";
import { ANONYMISE, ErasureService } from "./erasure.service";
import { RETENTION_SCHEDULE } from "./retention-schedule";

const CHILD_MODELS = Object.entries(RETENTION_SCHEDULE)
  .filter(([, r]) => r.holds === "clinical record" || r.holds === "personal data")
  .map(([model]) => model)
  .sort();
const RAW = ["ChartEntry", "ClinicalPhoto", "PatientDocument", "PatientPrivacyConsent", "PrivacyChoice"];

describe("anonymisation (B13c2b-2)", () => {
  it("decides every clinical and personal model of the retention schedule, and no other", () => {
    expect(Object.keys(ANONYMISE).sort()).toEqual(CHILD_MODELS);
  });

  it("still refuses a Prisma update or delete of the append-only tables it changes by raw SQL", () => {
    const ctx = { requestId: "t", clinicId: "clinic_t", operator: false };
    for (const model of RAW) {
      expect(APPEND_ONLY.has(model), model).toBe(true);
      expect(() => scopeArgs(model, "updateMany", { where: {}, data: {} }, ctx), model).toThrow(/append-only/);
      expect(() => scopeArgs(model, "deleteMany", { where: {} }, ctx), model).toThrow(/append-only/);
    }
  });

  it("anonymises nobody, and reads nothing, while the retention periods are unconfirmed", async () => {
    const untouchable = new Proxy({}, { get: (_, key) => { throw new Error(`touched ${String(key)}`); } });
    const erasure = new ErasureService(untouchable as never, untouchable as never, untouchable as never, untouchable as never, untouchable as never);
    await expect(erasure.anonymiseDue({ yearsAfterLastVisit: null, untilAge: null })).resolves.toBe(0);
    await expect(erasure.anonymiseDue({ yearsAfterLastVisit: 10, untilAge: null })).resolves.toBe(0);
  });
});
