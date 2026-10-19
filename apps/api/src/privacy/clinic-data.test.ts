import { describe, expect, it } from "vitest";
import { EXPORT_MODELS, KEEP_ON_PURGE, PURGE_MODELS, purgeRefusal } from "./clinic-data";

const ENDED = { anchor: "2026-01-10", paidMonths: 3, cancelledAt: "2026-03-01T00:00:00.000Z" }; // paid to 2026-04-10
const ACCOUNT = { name: "Ngiti Kids Dental", status: "suspended" as const };

describe("the clinic data scripts (B13c2b-2)", () => {
  // On failure: a model was added or changed scope. Decide it (export? purge or keep?) and update these lists deliberately.
  it("exports the clinic's own tables, not the system's", () => {
    expect(EXPORT_MODELS).toEqual([
      "Acknowledgement", "Appointment", "AppointmentRequest", "AuditEvent", "Branch", "Chair", "ChartEntry", "ClinicalNote",
      "ClinicalPhoto", "DueItem", "GrowthRecord", "Invoice", "InvoiceLine", "Message", "MessageTemplate", "NoteTemplate",
      "Patient", "PatientConsent", "PatientDocument", "PatientGuardian", "PatientPrivacyConsent", "Payment", "PlanItem", "PortalAccount",
      "PrivacyChoice", "PrivacyNotice", "PrivacyRequest", "Procedure", "ReceiptCounter", "Staff", "Visit",
    ]);
    expect(EXPORT_MODELS).not.toContain("StoredFile");
    expect(EXPORT_MODELS).not.toContain("IdempotencyKey");
  });
  it("purges every table holding the clinic's rows but Primolar's books, agreements and sign-up", () => {
    for (const m of ["Patient", "AuditEvent", "Payment", "ChartEntry", "Credential", "Session", "DemoLogin", "PortalLink", "OutboxMessage", "StoredFile", "IdempotencyKey"]) expect(PURGE_MODELS).toContain(m);
    for (const m of KEEP_ON_PURGE) expect(PURGE_MODELS).not.toContain(m);
    expect(PURGE_MODELS).not.toContain("ClinicAccount");
    expect(PURGE_MODELS).not.toContain("OperatorAuditEvent");
  });
  it("refuses a purge unless the name is typed, the subscription has ended and the account is paused", () => {
    expect(purgeRefusal(ACCOUNT, ENDED, "Ngiti Kids Dental", "2026-05-01")).toBeUndefined();
    expect(purgeRefusal(ACCOUNT, ENDED, " Ngiti Kids Dental ", "2026-05-01")).toBeUndefined();
    expect(purgeRefusal(ACCOUNT, ENDED, "ngiti kids dental", "2026-05-01")).toMatch(/name typed/);
    expect(purgeRefusal(ACCOUNT, ENDED, "Ngiti Kids Dental", "2026-04-01")).toMatch(/hasn't ended/); // cancelled, paid month running
    expect(purgeRefusal(ACCOUNT, { anchor: "2026-01-10", paidMonths: 3 }, "Ngiti Kids Dental", "2026-05-01")).toMatch(/hasn't ended/); // lapsed, not cancelled
    expect(purgeRefusal(ACCOUNT, undefined, "Ngiti Kids Dental", "2026-05-01")).toMatch(/hasn't ended/);
    expect(purgeRefusal({ ...ACCOUNT, status: "active" }, ENDED, "Ngiti Kids Dental", "2026-05-01")).toMatch(/Pause/);
  });
});
