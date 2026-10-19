import { DEMO_CLINIC_ID } from "@pedia/seed";
import {
  Appointment, ClinicalNote, Invoice, Payment, PatientFilter, PatientListQuery, PatientPage, PatientSort, PatientView, PlanItem, Procedure,
  matchesSearch, rolesCan, type Patient, type Role,
} from "@pedia/shared";
import { addDays, format } from "date-fns";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BillingRecordsService } from "../../src/billing-records/billing-records.service";
import { FixedClock } from "../../src/common/clock";
import { MessageQueueService } from "../../src/message-queue/message-queue.service";
import { SMS_PROVIDER, SmsRejected, type SmsProvider } from "../../src/message-queue/sms-provider";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PatientStandingService } from "../../src/patients/patient-standing.service";
import { PatientsService } from "../../src/patients/patients.service";
import { reconcileAll } from "../../src/patients/standing.jobs";
import { runInTransaction } from "../../src/prisma/transaction";
import { DueItemsService } from "../../src/recalls/due-items.service";
import { VisitDaysService } from "../../src/visits/visit-days.service";
import { loadPlatform } from "../load/load-data";
import { ADMIN, FRONT_DESK, clinicalApp, type Login } from "./clinical-support";
import { inClinic } from "./support/database";
import { standingPage } from "./support/standing-oracle";

/** B14: the stored standing stays equal to its sources after every write, and the SQL list answers as the shared rules. */
const DAY = format(new Date(), "yyyy-MM-dd"); // the load data's dates are relative to the real today
const clock = new FixedClock(new Date(`${DAY}T10:00:00+08:00`)); // inside sending hours
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
beforeAll(async () => {
  t = await clinicalApp({ platform: loadPlatform(300), clock }); // the demo plus 300 load children: every chip has members
  admin = await t.as(ADMIN);
}, 120_000);
afterAll(() => t.app.close());

const inDemo = <T>(fn: () => Promise<T>) => inClinic(DEMO_CLINIC_ID, fn);
const post = (path: string, cookie: string, body: unknown) =>
  request(t.app.getHttpServer()).post(`/api${path}`).set("Cookie", cookie).set("Idempotency-Key", crypto.randomUUID()).send(body as object);
const COLUMNS = { lastVisitOn: true, nextDueOn: true, balance: true, noContact: true } as const;
/** The row as stored, and as PatientStandingService recomputes it from source (each column as a string or number). */
const both = (id: string) => inDemo(async () => {
  const row = await t.prisma.patient.findUniqueOrThrow({ where: { id }, select: COLUMNS });
  const s = (await t.app.get(PatientStandingService).compute(t.prisma, [id])).get(id)!;
  const day = (d: Date | null) => d?.toISOString().slice(0, 10);
  return { stored: { lastVisitOn: day(row.lastVisitOn), nextDueOn: day(row.nextDueOn), balance: row.balance, noContact: row.noContact }, recomputed: s };
});
const agrees = async (id: string, step: string) => {
  const { stored, recomputed } = await both(id);
  expect(stored, step).toEqual({ lastVisitOn: recomputed.lastVisitOn, nextDueOn: recomputed.nextDueOn, balance: recomputed.balance, noContact: recomputed.noContact });
  return stored;
};

describe("stored standing (B14)", () => {
  it("stored standing equals recomputed after every write", async () => {
    const id = await t.register();
    await agrees(id, "registered");
    const fee = Object.fromEntries((await t.ok(t.call("get", "/procedures", admin), z.array(Procedure))).map((p) => [p.code, p.fee]));
    for (const code of ["fluoride", "prophylaxis"]) await t.ok(t.call("post", `/patients/${id}/plan`, admin, { procedureCode: code, fee: fee[code] }), PlanItem, 201);
    const visit = await t.start(id, admin);
    const sign = async (templateId: string, values: object) => {
      const note = await t.ok(t.call("post", `/patients/${id}/notes`, admin, { visitId: visit.id, templateId, values, behavior: [] }), ClinicalNote, 201);
      await t.ok(t.call("post", `/notes/${note.id}/sign`, admin), ClinicalNote);
    };
    await sign("tpl_extraction", { teeth: [75], reason: "Caries, non-restorable" });
    expect((await agrees(id, "signed: a recall opens")).nextDueOn).toBe(format(addDays(new Date(`${DAY}T00:00:00`), 7), "yyyy-MM-dd"));
    await sign("tpl_fluoride", { agent: "5% NaF varnish", teeth: [] });
    await sign("tpl_prophylaxis", { method: "Rubber cup and paste" });
    await t.complete(visit.id, admin);
    expect((await agrees(id, "visit completed")).lastVisitOn).toBe(DAY);

    const booked = await t.ok(post("/appointments", admin, { patientId: id, dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2031-03-03T10:00:00+08:00", durationMin: 30, reason: "Extraction", sourceRuleId: "extraction" }), Appointment, 201);
    expect((await agrees(id, "booked from the due list")).nextDueOn).toBeUndefined();

    const items = await t.ok(t.call("get", `/patients/${id}/plan`, admin), z.array(PlanItem));
    const bill = (code: string) => t.ok(post(`/patients/${id}/invoices`, admin, { planItemIds: [items.find((i) => i.procedureCode === code)!.id] }), Invoice, 201);
    const first = await bill("fluoride");
    expect((await agrees(id, "billed")).balance).toBe(fee.fluoride);
    const pay = (invoiceId: string, body: object) => t.ok(post(`/invoices/${invoiceId}/payments`, admin, { receivedBy: "staff_cruz", method: "cash", ...body }), Payment, 201);
    await pay(first.id, { amount: 10_000 });
    expect((await agrees(id, "paid part")).balance).toBe(fee.fluoride! - 10_000);
    await pay(first.id, { amount: -5_000, note: "Parent overpaid" });
    expect((await agrees(id, "refunded")).balance).toBe(fee.fluoride! - 5_000);
    const second = await bill("prophylaxis");
    await agrees(id, "billed again");
    await t.ok(post(`/invoices/${second.id}/void`, admin, { reason: "Wrong child" }), Invoice);
    expect((await agrees(id, "voided")).balance).toBe(fee.fluoride! - 5_000);
    await t.ok(post(`/patients/${id}/deposits`, admin, { method: "cash", receivedBy: "staff_cruz", amount: 2_000 }), Payment, 201);
    await t.ok(post(`/invoices/${first.id}/apply-credit`, admin, { amount: 2_000, receivedBy: "staff_cruz" }), Payment, 201);
    expect((await agrees(id, "credit applied")).balance).toBe(fee.fluoride! - 7_000);

    await t.ok(t.call("post", `/appointments/${booked.id}/status`, admin, { status: "no_show" }), Appointment);
    expect((await agrees(id, "no-show: the recall is open again")).nextDueOn).toBeDefined();

    // A rejected text: the send handler only queues standing.refresh; the outbox's next pass sets "no contact".
    const sms = vi.spyOn(t.app.get<SmsProvider>(SMS_PROVIDER), "send").mockRejectedValue(new SmsRejected("refused"));
    await inDemo(() => runInTransaction(t.prisma, async (tx) => t.app.get(MessageQueueService).queue(tx, { kind: "birthday", patientId: id, sendAt: clock.now().toISOString() }, (await t.app.get(PatientsService).one(id, tx)))));
    while ((await t.app.get(OutboxWorker).drain()) > 0);
    sms.mockRestore();
    expect((await agrees(id, "a text failed")).noContact).toBe(true);

    // A text born failed (no mobile number to send to) settles too: "no contact" without a send attempt.
    const lone = await t.register();
    const landline = await inDemo(async () => {
      const p = await t.app.get(PatientsService).one(lone);
      return { ...p, guardians: p.guardians.map((g) => ({ ...g, phone: "02 8123 4567" })) };
    });
    await inDemo(() => runInTransaction(t.prisma, (tx) => t.app.get(MessageQueueService).queue(tx, { kind: "birthday", patientId: lone, sendAt: clock.now().toISOString() }, landline)));
    while ((await t.app.get(OutboxWorker).drain()) > 0);
    expect((await agrees(lone, "a text born failed")).noContact).toBe(true);
  });

  it("the reconcile finds nothing to correct twice over, and corrects a row that drifted", async () => {
    const standing = t.app.get(PatientStandingService);
    expect(await reconcileAll(t.prisma, standing)).toBe(0); // the seed and every write above kept it: nothing to correct
    expect(await reconcileAll(t.prisma, standing)).toBe(0);
    await inDemo(() => t.prisma.patient.update({ where: { id: "load_p1" }, data: { balance: 123_456 } }));
    expect(await reconcileAll(t.prisma, standing)).toBe(1);
    await agrees("load_p1", "reconciled");
  });

  it("a booking and a reconcile batch in parallel both commit", async () => {
    const id = await t.register();
    const [booked, drift] = await Promise.all([
      post("/appointments", admin, { patientId: id, dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2031-03-04T10:00:00+08:00", durationMin: 30, reason: "Check-up" }),
      reconcileAll(t.prisma, t.app.get(PatientStandingService)),
    ]);
    expect([booked.status, drift]).toEqual([201, 0]);
  });
});

describe("the list in SQL (B14)", () => {
  /** The B13c1 computation over every match (standingPage), from the same readers: the oracle. */
  async function oracle(cookie: string, roles: readonly Role[], query: PatientListQuery, today: string) {
    const directory = await t.ok(t.call("get", "/patients", cookie), z.array(PatientView)); // q empty: uncapped, the viewer's scope
    const matched = directory.filter((p) => matchesSearch({ ...p, guardians: p.guardians.map((g) => ({ ...g, phone: g.phone ?? "" })) } as Patient, query.q, { phones: rolesCan(roles, "patients.contact") })).map(({ id, firstName, lastName }) => ({ id, firstName, lastName }));
    const ids = matched.map((p) => p.id);
    const [facts, due, bills, tried] = await inDemo(() => Promise.all([
      t.app.get(VisitDaysService).facts(ids), t.app.get(DueItemsService).openFor(ids), t.app.get(BillingRecordsService).billTotals(ids), t.app.get(MessageQueueService).lastTried(ids),
    ]));
    return standingPage(matched, facts, due, bills, tried, query, today, rolesCan(roles, "billing.view"));
  }

  it("the list answers every filter and sort as the shared rules", async () => {
    const viewers: [Login, Role[]][] = [[FRONT_DESK, ["front_desk"]], [[DEMO_CLINIC_ID, "staff_reyes"], ["dentist"]]];
    // Boundary days: today, a week on (recalls cross today+7) and 30 days on (recent visits cross today−29).
    for (const offset of [0, 7, 30]) {
      const today = format(addDays(new Date(`${DAY}T00:00:00`), offset), "yyyy-MM-dd");
      clock.set(new Date(`${today}T10:00:00+08:00`));
      for (const [login, roles] of viewers) {
        const cookie = await t.as(login);
        for (const q of ["", "ma"]) {
          for (const filter of PatientFilter.options) {
            for (const sort of PatientSort.options) {
              const want = await oracle(cookie, roles, PatientListQuery.parse({ q, filter, sort, pageSize: 20 }), today);
              for (const page of [1, Math.max(1, Math.ceil(want.total / 20))]) {
                const query = PatientListQuery.parse({ q, filter, sort, page, pageSize: 20 });
                const exp = page === 1 ? want : await oracle(cookie, roles, query, today);
                const got = await t.ok(t.call("get", `/patient-summaries?q=${q}&filter=${filter}&sort=${sort}&page=${page}&pageSize=20`, cookie), PatientPage);
                const at = `${today} ${roles[0]} q=${q} ${filter} ${sort} p${page}`;
                expect([got.total, got.page, got.counts], at).toEqual([exp.total, exp.page, exp.counts]);
                expect(got.rows.map((r) => [r.id, r.lastVisitOn, r.recallDueOn, r.balance, r.flags]), at)
                  .toEqual(exp.rows.map((r) => [r.id, r.lastVisitOn, r.recallDueOn, rolesCan(roles, "billing.view") ? r.balance : undefined, r.flags]));
              }
            }
          }
        }
      }
      if (offset === 0) { // not vacuous: today, every chip has members (30 days on, nobody has a recent visit)
        const counts = (await t.ok(t.call("get", "/patient-summaries", await t.as(FRONT_DESK)), PatientPage)).counts;
        for (const f of PatientFilter.options) expect([f, counts[f] > 0]).toEqual([f, true]);
      }
    }
    clock.set(new Date(`${DAY}T10:00:00+08:00`));
  }, 300_000);
});
