import { describe, expect, it } from "vitest";
import { differenceInYears, format, parseISO } from "date-fns";
import {
  subscriptionDueOn,
  ClinicalPhoto,
  PatientDocument,
  PriceList,
  choiceDeclined,
  isMoneyIn,
  Signup,
  Subscription,
  TIER_LIMITS,
  amountDue,
  accountUsage,
  brandColorProblem,
  canAddUnder,
  findConflict,
  habitTimeline,
  matchesFilter,
  needsAttention,
  patientStanding,
  primolarInvoiceNo,
  sameClinicName,
  subscriptionStatus,
} from "@pedia/shared";
import { accountsByLogin, allAccounts } from "./logins";
import { seedPlatform } from "./platform";
import { DEMO_CLINIC_ID, seed } from "./seed";
import { IPIN_ID } from "./seed-ipin";
import { SEED_FILES } from "./seed-files";
import { SEED_PRICES } from "./seed-signups";
import { seedFileOf } from "./seed-files";

const today = format(new Date(), "yyyy-MM-dd");
const db = seed();
const rows = db.patients.map((p) => ({ ...p, ...patientStanding(p.id, db, today) }));
const share = (pred: (r: (typeof rows)[number]) => boolean) => rows.filter(pred).length / rows.length;

describe("seed", () => {
  it("keeps the first patients exactly as before the roster (faker order unchanged)", () => {
    // Measured 2026-10-03 from seed() at 5a984a0. Changing seedPatient() changes these on purpose.
    expect(db.patients.slice(0, 3).map((p) => p.lastName)).toEqual(["Reynolds-Miller", "Johnson", "Lynch"]);
  });

  it("answers agree with the lists, and some patients were never asked", () => {
    expect(db.patients.filter((p) => p.noKnownAllergies === true).every((p) => p.allergies.length === 0)).toBe(true);
    expect(db.patients.filter((p) => p.allergies.length > 0).every((p) => p.noKnownAllergies !== true)).toBe(true);
    expect(db.patients.some((p) => p.noKnownAllergies === undefined)).toBe(true);
  });

  it("is the same on every load: same patients and the same labels", () => {
    const again = seed();
    expect(again.patients.map((p) => [p.id, p.firstName, p.lastName])).toEqual(db.patients.map((p) => [p.id, p.firstName, p.lastName]));
    expect(again.patients.map((p) => patientStanding(p.id, again, today).flags)).toEqual(rows.map((r) => r.flags));
  });

  it("has enough patients to page, and only children", () => {
    expect(db.patients).toHaveLength(61);
    expect(db.patients.every((p) => differenceInYears(new Date(), parseISO(p.birthDate)) < 18)).toBe(true);
  });

  it("flags a minority for each label, never everyone", () => {
    expect(share((r) => r.flags.recallDue)).toBeGreaterThan(0.15);
    expect(share((r) => r.flags.recallDue)).toBeLessThan(0.35);
    expect(share((r) => r.flags.balanceDue)).toBeGreaterThan(0.15);
    expect(share((r) => r.flags.balanceDue)).toBeLessThan(0.35);
    expect(share((r) => r.flags.noContact)).toBeGreaterThan(0);
    expect(share((r) => r.flags.noContact)).toBeLessThan(0.15);
    expect(share((r) => needsAttention(r.flags))).toBeLessThan(0.6);
    const recent = share((r) => matchesFilter("recent_visit", r, today));
    expect(recent).toBeGreaterThan(0.2);
    expect(recent).toBeLessThan(0.6);
  });

  it("has today's birthdays and pending requests to act on", () => {
    if (today.slice(5) !== "02-29") expect(db.patients.filter((p) => p.birthDate.slice(5) === today.slice(5))).toHaveLength(2);
    expect(db.appointmentRequests.filter((r) => r.status === "pending")).toHaveLength(2);
  });

  it("gives the clinic's appointment requests distinct times, so every sort agrees on their order", () => {
    const times = db.appointmentRequests.map((q) => q.createdAt);
    expect(new Set(times).size).toBe(times.length);
  });

  it("never gives one patient two due items with the same day and creation time", () => {
    const keys = db.dueItems.map((i) => `${i.patientId}|${i.dueOn}|${i.createdAt}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("lists same-start appointments in chair order, so the API's chair-order tie-break matches it", () => {
    const chair = new Map(db.chairs.map((c, i) => [c.id, i]));
    db.appointments.forEach((a, i) => {
      const prev = db.appointments.slice(0, i).filter((b) => b.startsAt === a.startsAt);
      for (const b of prev) expect(chair.get(b.chairId)!).toBeLessThanOrEqual(chair.get(a.chairId)!);
    });
  });

  it("never double-books a chair or a dentist", () => {
    for (const a of db.appointments) expect(findConflict(a, db.appointments), a.id).toBeUndefined();
  });

  it("has growth examples: an explicit stop, an ongoing habit and an inferred stop", () => {
    const db = seed();
    expect(db.growth).toHaveLength(6);
    expect(db.growth.every((g) => db.visits.some((v) => v.id === g.visitId))).toBe(true);
    const third = db.growth.slice(4);
    expect(habitTimeline(third)[0]).toMatchObject({ habit: "mouth_breathing", stopInferred: true });
  });

  it("seeds 3-month recalls for high caries risk exams", () => {
    expect(seed().dueItems.some((i) => i.ruleId === "routine_high_risk")).toBe(true);
  });
});

describe("platform seed", () => {
  const platform = seedPlatform();
  const tenants = Object.entries(platform.tenants);

  it("has the demo clinic, a second Small-tier account and Ipin (chunk 23's grace demo), each with its own store", () => {
    expect(platform.accounts.map((a) => [a.id, a.tier, a.status])).toEqual([
      ["clinic_demo", "mid", "active"],
      ["clinic_ngiti", "small", "active"],
      ["clinic_ipin", "small", "active"],
    ]);
    expect(tenants.map(([id]) => id)).toEqual(platform.accounts.map((a) => a.id));
  });

  it("stamps every record with its own account, and every branch-level record with one of that account's branches", () => {
    for (const [clinicId, t] of tenants) {
      const branchIds = new Set(t.branches.map((b) => b.id));
      for (const rows of [t.patients, t.staff, t.visits, t.appointments, t.chairs, t.invoices, t.payments, t.messages]) {
        expect(rows.every((r) => r.clinicId === clinicId), clinicId).toBe(true);
      }
      for (const rows of [t.appointments, t.chairs, t.invoices, t.payments]) {
        expect(rows.every((r) => branchIds.has(r.branchId)), clinicId).toBe(true);
      }
      // An appointment's chair is at the appointment's branch.
      expect(t.appointments.every((a) => t.chairs.find((c) => c.id === a.chairId)?.branchId === a.branchId), clinicId).toBe(true);
    }
  });

  it("never shares a patient or staff id between accounts", () => {
    const [demo, ngiti] = tenants.map(([, t]) => new Set([...t.patients, ...t.staff].map((r) => r.id)));
    expect([...demo!].filter((id) => ngiti!.has(id))).toEqual([]);
  });

  it("keeps Dasmariñas billing-free, so the Imus finance figures are unchanged", () => {
    const demo = platform.tenants.clinic_demo!;
    expect(demo.appointments.some((a) => a.branchId === "branch_dasma")).toBe(true);
    expect([...demo.invoices, ...demo.payments].every((r) => r.branchId === "branch_imus")).toBe(true);
  });
});

describe("demo accounts' branding and limits (chunk 20)", () => {
  const p = seedPlatform();
  it("gives each account its own passing colour and its own logo", () => {
    const [demo, ngiti] = p.accounts;
    expect(demo!.brandColor).not.toBe(ngiti!.brandColor);
    expect(demo!.logoRef).not.toBe(ngiti!.logoRef);
    for (const a of p.accounts) expect(brandColorProblem(a.brandColor), a.name).toBeUndefined();
    // Ipin (chunk 23) is in the default look, so only the two branded clinics carry a logo.
    for (const a of [demo!, ngiti!]) expect(a.logoRef, a.name).toMatch(/^demo\/.+\.svg$/);
  });
  it("puts Ngiti (Small) exactly at its limits, so the next branch or login is refused", () => {
    const ngiti = p.tenants.clinic_ngiti!;
    expect(accountUsage(ngiti)).toEqual({ branches: 1, staffLogins: TIER_LIMITS.small.staffLogins });
    expect(canAddUnder("small", "staffLogins", accountUsage(ngiti).staffLogins)).toBe(false);
    expect(Object.values(p.tenants).every((t) => t.staffCredentials.length === 0)).toBe(true);
  });
});

describe("sign-ups seed (billing #34)", () => {
  const p = seedPlatform();
  it("has one sign-up waiting for its setup fee, quoted from the price list", () => {
    expect(p.signups.map((s) => [s.status, !!s.payment, s.branding.choice])).toEqual([["waiting", false, "designed"]]);
    const s = Signup.parse(p.signups[0]);
    expect(s.quote).toEqual(amountDue(PriceList.parse(p.prices), s.account.tier, s.branding.choice));
  });
  it("clashes with no clinic by name or contact email", () => {
    const s = p.signups[0]!;
    expect(p.accounts.some((a) => sameClinicName(a.name, s.account.name) || a.contactEmail === s.account.contactEmail)).toBe(false);
  });
});

describe("demo subscriptions (billing #34, S11)", () => {
  const p = seedPlatform();
  const today = format(new Date(), "yyyy-MM-dd");

  it("has Bulilit and Ngiti paid up and Ipin in its grace period, whatever today is", () => {
    expect(p.subscriptions.map((s) => [s.clinicId, subscriptionStatus(s, today).state])).toEqual([
      ["clinic_demo", "paid"],
      ["clinic_ngiti", "due_soon"],
      ["clinic_ipin", "overdue"],
    ]);
  });

  it("gives every account one valid subscription, a payment per paid month, and invoice numbers without gaps", () => {
    expect(p.subscriptions.map((s) => s.clinicId)).toEqual(p.accounts.map((a) => a.id));
    for (const s of p.subscriptions) {
      Subscription.parse(s);
      expect(s.payments, s.clinicId).toHaveLength(s.paidMonths);
    }
    const numbers = p.subscriptions.flatMap((s) => s.payments.map((x) => x.invoiceNo));
    expect(numbers).toEqual(numbers.map((_, i) => primolarInvoiceNo(i + 1)));
  });
});

describe("photos and documents (B10)", () => {
  const child = db.patients.find((p) => p.id === db.photos[0]?.patientId)!;

  it("gives the example child four photos with real files and up to two issued documents", () => {
    expect(db.photos.map((p) => p.id)).toEqual(["photo_seed_1", "photo_seed_2", "photo_seed_3", "photo_seed_4"]);
    expect(db.documents.length).toBeGreaterThanOrEqual(1);
    expect(db.documents.every((d) => d.id.startsWith("doc_seed_") && d.patientId === child.id)).toBe(true);
    for (const p of db.photos) {
      expect(ClinicalPhoto.safeParse(p).success).toBe(true);
      if (p.visitId) expect(db.visits.find((v) => v.id === p.visitId)).toMatchObject({ patientId: child.id, status: "completed" });
      const bytes = seedFileOf(p)!;
      expect(p.contentType === "application/pdf" ? new TextDecoder().decode(bytes.slice(0, 5)) : [...bytes.slice(0, 4)]).toEqual(
        p.contentType === "application/pdf" ? "%PDF-" : [0x89, 0x50, 0x4e, 0x47],
      );
    }
    for (const d of db.documents) expect(PatientDocument.safeParse(d).success).toBe(true);
    const receipt = db.documents.find((d) => d.type === "receipt");
    if (receipt) expect(isMoneyIn(db.payments.find((p) => p.id === receipt.sourceId && p.patientId === child.id)!)).toBe(true);
  });

  it("never seeds photos for a family that declined them, nor for the other clinics", () => {
    expect(choiceDeclined(child, "photos")).toBe(false);
    const { tenants } = seedPlatform();
    expect([tenants["clinic_ngiti"]!.photos, tenants["clinic_ipin"]!.photos]).toEqual([[], []]);
  });

  it("is the same on every seed, apart from times that move with today", () => {
    const strip = <T extends { createdAt: string }>(xs: T[]) => xs.map(({ createdAt: _, ...x }) => x);
    const again = seed();
    expect(strip(again.photos)).toEqual(strip(db.photos));
    expect(strip(again.documents)).toEqual(strip(db.documents));
  });
});

describe("portal accounts (B11)", () => {
  const platform = seedPlatform();
  it("gives every seeded guardian an active account on the demo password (decision 13)", () => {
    for (const db of Object.values(platform.tenants)) {
      const guardians = new Set(db.patients.flatMap((p) => p.guardians.map((g) => g.id)));
      expect(db.portalAccounts.map((a) => a.guardianId).sort()).toEqual([...guardians].sort());
      expect(db.portalAccounts.every((a) => a.state === "active" && !a.password && a.links.length === 0)).toBe(true);
    }
  });
  it("never gives two parents of one clinic the same mobile sign-in (decision 14)", () => {
    for (const db of Object.values(platform.tenants)) {
      const phones = allAccounts(db).flatMap((a) => (a.phone ? [a.phone] : []));
      expect(new Set(phones).size).toBe(phones.length);
    }
  });
  it("still signs the sibling family in as parent@gmail.com, and by their number", () => {
    const [byEmail] = accountsByLogin(platform, "parent@gmail.com");
    expect(byEmail?.account.role).toBe("parent");
    expect(accountsByLogin(platform, byEmail!.account.phone!).map((m) => m.account.id)).toContain(byEmail!.account.id);
  });
  it("drops a guardian whose access is off from the logins", () => {
    const db = structuredClone(platform.tenants[DEMO_CLINIC_ID]!);
    db.portalAccounts[0]!.state = "off";
    expect(allAccounts(db).some((a) => a.guardianId === db.portalAccounts[0]!.guardianId)).toBe(false);
  });
});

describe("Primolar's billing (B12)", () => {
  const platform = seedPlatform();
  it("has no QR and no price change yet, and one receipt waiting: Ipin's first unpaid month at the Small fee", () => {
    expect([platform.paymentQr, platform.priceChanges]).toEqual([null, []]);
    expect(platform.receipts).toHaveLength(1);
    const [receipt] = platform.receipts;
    const ipin = platform.subscriptions.find((s) => s.clinicId === IPIN_ID)!;
    expect(receipt).toMatchObject({ status: "pending", payer: { kind: "subscription", clinicId: IPIN_ID }, amountDue: SEED_PRICES.plans.small.monthlyFee, periodStart: subscriptionDueOn(ipin.anchor, ipin.paidMonths) });
  });
  it("counts each tenant's seeded photos toward its storage", () => {
    for (const db of Object.values(platform.tenants)) {
      const bytes = db.photos.reduce((n, p) => n + SEED_FILES[p.contentType as keyof typeof SEED_FILES].length, 0);
      expect(db.storedFiles.reduce((n, f) => n + f.bytes, 0)).toBe(bytes);
    }
  });
});
