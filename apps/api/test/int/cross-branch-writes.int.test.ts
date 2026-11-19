import { DEMO_CLINIC_ID } from "@pedia/seed";
import { Appointment, ClinicalNote, Invoice, Payment, PlanItem, pesos } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, clinicalApp, type Login } from "./clinical-support";

/**
 * #10, the twin of apps/web's mocks/cross-branch.test.ts → "branch-level changes by id": a move, a status change or a
 * void names its record by id, so it reaches only a branch the caller works at (the Owner, `branches.all`, every one).
 * Out of reach answers 404, as if the record weren't there. Paying across branches stays open (CONVENTIONS).
 */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = ""; // Carmen: Imus only
let owner = ""; // both branches
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
beforeAll(async () => {
  t = await clinicalApp();
  [admin, owner] = [await t.as(ADMIN), await t.as(OWNER)];
}, 60_000);
afterAll(() => t.app.close());

const at = (cookie: string, branch: "branch_imus" | "branch_dasma") => `${cookie}; pd_branch=${branch}`;
const post = (path: string, cookie: string, body: unknown) =>
  request(t.app.getHttpServer()).post(`/api${path}`).set("Cookie", cookie).set("Idempotency-Key", crypto.randomUUID()).send(body as object);
const words = async (res: Promise<request.Response>) => { const r = await res; return [r.status, r.text]; };

/** A fluoride bill for a new child, made by the Owner on a Dasmariñas device: the bill is Dasmariñas's. */
async function dasmaBill() {
  const id = await t.register();
  await t.ok(t.call("post", `/patients/${id}/plan`, admin, { procedureCode: "fluoride", fee: pesos(800) }), PlanItem, 201);
  const visit = await t.start(id, admin);
  const note = await t.ok(t.call("post", `/patients/${id}/notes`, admin, { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] }), ClinicalNote, 201);
  await t.ok(t.call("post", `/notes/${note.id}/sign`, admin), ClinicalNote);
  const [item] = await t.ok(t.call("get", `/patients/${id}/plan`, admin), z.array(PlanItem));
  const bill = await t.ok(post(`/patients/${id}/invoices`, at(owner, "branch_dasma"), { planItemIds: [item!.id] }), Invoice, 201);
  expect(bill.branchId).toBe("branch_dasma");
  return bill;
}

describe("branch-level changes by id (#10)", () => {
  it("answers another branch's appointment as missing to staff who don't work there, and lets the Owner change it", async () => {
    const there = (await t.ok(t.call("get", "/appointments", at(owner, "branch_dasma")), z.array(Appointment))).find((a) => a.status === "booked")!;
    expect(there.branchId).toBe("branch_dasma");
    const move = { dentistId: there.dentistId, chairId: there.chairId, startsAt: there.startsAt, durationMin: there.durationMin, reason: there.reason };
    // One request at a time: supertest listens per request, so two built at once share one server and the second fails.
    for (const send of [() => t.call("put", `/appointments/${there.id}`, admin, move), () => t.call("post", `/appointments/${there.id}/status`, admin, { status: "confirmed" })]) {
      expect(await words(send())).toEqual([404, "Appointment not found"]);
    }
    // A bad body from out of reach is still a 404: nothing about the record is told.
    expect(await words(t.call("put", `/appointments/${there.id}`, admin, { nonsense: true }))).toEqual([404, "Appointment not found"]);
    expect((await t.ok(t.call("post", `/appointments/${there.id}/status`, at(owner, "branch_imus"), { status: "confirmed" }), Appointment)).status).toBe("confirmed");
  });

  it("answers another branch's bill as missing to staff who don't work there, but lets them take a payment on it", async () => {
    const bill = await dasmaBill();
    expect(await words(t.call("post", `/invoices/${bill.id}/void`, admin, { reason: "Wrong child" }))).toEqual([404, "Invoice not found"]);
    expect(await words(t.call("post", `/invoices/${bill.id}/void`, admin, { reason: " " }))).toEqual([404, "Invoice not found"]); // before the body
    // Paying stays open across branches: a payment goes to its bill's branch wherever it's paid.
    const paid = await t.ok(post(`/invoices/${bill.id}/payments`, admin, { amount: pesos(100), method: "cash", receivedBy: "staff_cruz" }), Payment, 201);
    expect(paid.branchId).toBe("branch_dasma");
  });

  it("lets the Owner void another branch's bill from any device", async () => {
    const bill = await dasmaBill();
    const voided = await t.ok(t.call("post", `/invoices/${bill.id}/void`, at(owner, "branch_imus"), { reason: "Wrong child" }), Invoice);
    expect(voided.voided).toMatchObject({ by: "staff_villanueva", reason: "Wrong child" });
  });
});
