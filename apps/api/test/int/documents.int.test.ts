import { DEMO_CLINIC_ID } from "@pedia/seed";
import { ClinicalNote, Invoice, Patient, PatientDocument, Payment, PlanItem } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inClinic } from "./support/database";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp, type Login } from "./clinical-support";

/** apps/web's "documents" handler tests against the API (CHUNKS B10): the log, the checks in the mock's order, receipts. */
let t: Awaited<ReturnType<typeof clinicalApp>>;
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
let [admin, desk, dentist] = ["", "", ""];
beforeAll(async () => {
  t = await clinicalApp();
  [admin, desk, dentist] = [await t.as(ADMIN), await t.as(FRONT_DESK), await t.as(DENTIST)];
}, 60_000);
afterAll(() => t.app.close());

const issue = (patientId: string, body: object, cookie = desk) => t.call("post", `/patients/${patientId}/documents`, cookie, body);
const said = async (res: Promise<request.Response>) => {
  const r = await res;
  return [r.status, r.text];
};
const docsOf = (patientId: string) => t.ok(t.call("get", `/patients/${patientId}/documents`, desk), z.array(PatientDocument));
const log = (cookie = desk) => t.ok(t.call("get", "/documents", cookie), z.array(PatientDocument));
const pay = (path: string, body: object) => request(t.app.getHttpServer()).post(`/api${path}`).set("Cookie", desk).set("Idempotency-Key", crypto.randomUUID()).send(body);

/** A child with a completed visit, a signed extraction note and a paid bill, all through the API's own routes. */
async function child({ byCredit = false } = {}) {
  const id = await t.register();
  await t.ok(t.call("post", `/patients/${id}/plan`, admin, { procedureCode: "fluoride", fee: 80_000 }), PlanItem, 201);
  const visit = await t.start(id, admin);
  const draft = (templateId: string, values: object) => t.ok(t.call("post", `/patients/${id}/notes`, admin, { visitId: visit.id, templateId, values, behavior: [] }), ClinicalNote, 201);
  const extraction = await draft("tpl_extraction", { teeth: [74], reason: "Caries, non-restorable", hemostasis: true });
  const unsigned = await draft("tpl_fluoride", { agent: "5% NaF varnish", teeth: [] });
  await t.ok(t.call("post", `/notes/${extraction.id}/sign`, admin), ClinicalNote);
  const fluoride = await draft("tpl_fluoride", { agent: "5% NaF varnish", teeth: [] });
  await t.ok(t.call("post", `/notes/${fluoride.id}/sign`, admin), ClinicalNote);
  await t.complete(visit.id, admin);
  const [item] = await t.ok(t.call("get", `/patients/${id}/plan`, admin), z.array(PlanItem));
  const invoice = Invoice.parse((await pay(`/patients/${id}/invoices`, { planItemIds: [item!.id] })).body);
  // byCredit: the bill is settled from a deposit, so its payment is a transfer of credit (account_credit), not money in.
  if (byCredit) Payment.parse((await pay(`/patients/${id}/deposits`, { amount: 80_000, method: "cash", receivedBy: "staff_cruz" })).body);
  const settle = byCredit ? pay(`/invoices/${invoice.id}/apply-credit`, { amount: 80_000, receivedBy: "staff_cruz" }) : pay(`/invoices/${invoice.id}/payments`, { amount: 80_000, method: "cash", receivedBy: "staff_cruz" });
  const payment = Payment.parse((await settle).body);
  return { id, visit, extraction, unsigned, payment };
}

describe("documents (apps/web handlers.test.ts → documents)", () => {
  it("logs a notes report issued by front desk, first in the child's list and the clinic's log", async () => {
    const { id } = await child();
    const doc = await t.ok(issue(id, { type: "notes_report", issuedBy: "staff_cruz" }), PatientDocument, 201);
    expect(doc.title).toMatch(/^Clinical notes report · Bea Record\d+$/);
    expect((await docsOf(id))[0]!.id).toBe(doc.id);
    expect((await log())[0]!.id).toBe(doc.id);
  });

  it("logs a dental certificate and a receipt for a payment made on the API (B8's receipts as documents)", async () => {
    const { id, visit, payment } = await child();
    const certificate = await t.ok(issue(id, { type: "dental_certificate", sourceId: visit.id, issuedBy: "staff_reyes" }), PatientDocument, 201);
    const receipt = await t.ok(issue(id, { type: "receipt", sourceId: payment.id, issuedBy: "staff_cruz" }), PatientDocument, 201);
    expect((await docsOf(id)).map((d) => d.id)).toEqual([receipt.id, certificate.id]);
    expect((await log()).map((d) => d.id)).toContain(receipt.id);
  });

  it("refuses in the mock's order, with its words, and writes nothing for a refusal", async () => {
    const a = await child();
    const b = await child();
    const rows = () => inClinic(DEMO_CLINIC_ID, () => t.prisma.patientDocument.count({ where: { patientId: a.id } }));
    const audits = () => inClinic(DEMO_CLINIC_ID, () => t.prisma.auditEvent.count({ where: { patientId: a.id, record: "Document" } }));
    const [rowsBefore, auditsBefore] = [await rows(), await audits()];
    expect(await said(issue("nobody", { nonsense: true }))).toEqual([404, "Patient not found"]); // before the body
    expect(await said(issue(a.id, { type: "dental_certificate", sourceId: a.visit.id, issuedBy: "staff_cruz" }))).toEqual([400, "A dentist has to issue the dental certificate"]);
    expect(await said(issue(a.id, { type: "receipt", sourceId: b.payment.id, issuedBy: "staff_cruz" }))).toEqual([400, "Pick the payment for this patient"]);
    for (const sourceId of [a.visit.id, a.unsigned.id]) {
      expect(await said(issue(a.id, { type: "post_op_instructions", sourceId, issuedBy: "staff_reyes" }))).toEqual([400, "Pick the signed treatment note for this patient"]);
    }
    for (const issuedBy of ["nobody", "ngiti_staff_lim"]) {
      expect(await said(issue(a.id, { type: "notes_report", issuedBy }))).toEqual([400, "Unknown staff member"]); // another clinic's staff is unknown here
    }
    const bad = await issue(a.id, { type: "receipt", issuedBy: "staff_cruz" });
    expect([bad.status, Array.isArray(bad.body)]).toEqual([400, true]); // the schema's "Pick the payment"
    expect([await rows(), await audits()]).toEqual([rowsBefore, auditsBefore]);
    const postOp = await t.ok(issue(a.id, { type: "post_op_instructions", sourceId: a.extraction.id, issuedBy: "staff_reyes" }), PatientDocument, 201);
    expect(postOp.sourceId).toBe(a.extraction.id);
    expect([await rows(), await audits()]).toEqual([rowsBefore + 1, auditsBefore + 1]);
  });

  it("gives no receipt for a transfer of credit, only for money received", async () => {
    const { id, payment } = await child({ byCredit: true });
    expect(payment.method).toBe("account_credit");
    expect(await said(issue(id, { type: "receipt", sourceId: payment.id, issuedBy: "staff_cruz" }))).toEqual([400, "Pick the payment for this patient"]);
  });

  it("issues a dental clearance only through a dentist, from a visit of this child", async () => {
    const a = await child();
    const b = await child();
    const clearance = (visitId: string, issuedBy: string) => issue(a.id, { type: "dental_clearance", sourceId: visitId, issuedBy, details: { purpose: "School enrolment" } });
    expect((await clearance(a.visit.id, "staff_cruz")).status).toBe(400);
    expect((await clearance(b.visit.id, "staff_reyes")).status).toBe(400);
    expect(await t.ok(clearance(a.visit.id, "staff_reyes"), PatientDocument, 201)).toMatchObject({ type: "dental_clearance", details: { purpose: "School enrolment" } });
  });

  it("never prescribes an S2 drug, and stops a prescription that clashes with a recorded allergy", async () => {
    const { id } = await child();
    const p = Patient.parse((await t.call("get", `/patients/${id}`, admin)).body);
    await t.ok(t.call("put", `/patients/${id}`, admin, { ...p, allergies: ["Penicillin"], noKnownAllergies: false }), Patient);
    const rx = (drugId: string) => issue(id, { type: "prescription", issuedBy: "staff_reyes", items: [{ drugId, sig: "Give 5 mL by mouth every 8 hours for 7 days.", quantity: "1 bottle" }] }, dentist);
    expect((await rx("midazolam_2_syr")).status).toBe(400);
    expect(await said(rx("amoxicillin_250_susp"))).toEqual([409, "Bea is allergic to Amoxicillin (recorded: Penicillin)"]);
    expect((await t.ok(rx("paracetamol_120_syr"), PatientDocument, 201)).items?.[0]?.drugId).toBe("paracetamol_120_syr");
  });
});

describe("B10's documents guarantees", () => {
  it("keeps each clinic's log to itself", async () => {
    const { id } = await child();
    const ngiti = await t.as(NGITI_OWNER);
    expect((await issue(id, { type: "notes_report", issuedBy: "ngiti_staff_lim" }, ngiti)).status).toBe(404);
    expect((await log(ngiti)).every((d) => d.clinicId === "clinic_ngiti")).toBe(true);
  });

  it("serves the seed's issued documents with the seed's ids", async () => {
    const seeded = t.platform.tenants[DEMO_CLINIC_ID]!.documents;
    expect(seeded.length).toBeGreaterThan(0);
    const listed = await docsOf(seeded[0]!.patientId);
    expect(listed.map((d) => d.id)).toEqual(expect.arrayContaining(seeded.map((d) => d.id)));
  });

  it("has no way to change an issued document", async () => {
    const { id } = await child();
    const doc = await t.ok(issue(id, { type: "notes_report", issuedBy: "staff_cruz" }), PatientDocument, 201);
    await expect(inClinic(DEMO_CLINIC_ID, () => t.prisma.patientDocument.update({ where: { id: doc.id }, data: { title: "x" } }))).rejects.toThrow(/append-only/);
  });
});
