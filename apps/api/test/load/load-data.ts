import { DASMA, DEMO_CLINIC_ID, IMUS, seedPatient, seedPlatform, type Platform } from "@pedia/seed";
import type { Appointment, Invoice, Payment, Visit } from "@pedia/shared";

/** B13c1 E9: a large pediatric clinic. Bulilit grows to the seed's patients plus these; both demo clinics stay as seeded. */
export const LOAD_PATIENTS = 5_000;

const DAY = 86_400_000;

/**
 * seedPlatform() with `extra` patients in Bulilit, each with two completed visits and their done appointments in the last
 * two years, and one bill for the later visit, paid in full for two of every three. That fills what the list and Today
 * compute on: last visit, balance and recall standing. Ids, patient numbers and receipt numbers are prefixed `load_`, `KS-9…` and
 * `AR-9…`, clear of the seed's. Deterministic: faker continues the seed's own sequence (seedPatient after seedPlatform, seed.test.ts's rule),
 * and dates come from the patient's index, not a clock.
 */
export function loadPlatform(extra = LOAD_PATIENTS, today = new Date()): Platform {
  const platform = seedPlatform();
  const db = platform.tenants[DEMO_CLINIC_ID]!;
  const procedure = db.procedures[0]!;
  const frontDesk = db.staff.find((s) => s.role === "front_desk")!;
  const atBranch = (branchId: string) => ({
    dentists: db.staff.filter((s) => (s.role === "dentist" || s.alsoRoles?.includes("dentist")) && s.branchIds.includes(branchId)),
    chairs: db.chairs.filter((c) => c.branchId === branchId),
  });
  const branches = { [IMUS]: atBranch(IMUS), [DASMA]: atBranch(DASMA) };
  // A visit at 09:00 Manila (01:00Z) `daysAgo` days back, never today: Today keeps only the seed's own rows.
  const morning = (daysAgo: number) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - daysAgo * DAY + 3_600_000);

  for (let i = 0; i < extra; i++) {
    // KS-90000 on: clear of the seed's numbers (up to 10,000 load patients).
    const patient = { ...seedPatient(), id: `load_p${i}`, patientNo: `KS-${90_000 + i}` };
    db.patients.push(patient);
    const branchId = i % 2 === 0 ? IMUS : DASMA;
    const { dentists, chairs } = branches[branchId]!;
    const dentist = dentists[i % dentists.length]!;
    const chair = chairs[i % chairs.length]!;
    // Two visits ~6 months apart, the later one 1–520 days ago: recall standing spreads over due, overdue and fine.
    const later = 1 + ((i * 37) % 520);
    for (const [n, daysAgo] of [[1, later + 180], [2, later]] as const) {
      const startsAt = morning(daysAgo);
      const appointment: Appointment = {
        id: `load_a${i}_${n}`, clinicId: DEMO_CLINIC_ID, branchId, patientId: patient.id, dentistId: dentist.id, chairId: chair.id,
        startsAt: startsAt.toISOString(), durationMin: 30, reason: procedure.name, procedureCode: procedure.code, status: "done",
      };
      const visit: Visit = {
        id: `load_v${i}_${n}`, clinicId: DEMO_CLINIC_ID, patientId: patient.id, dentistId: dentist.id,
        date: startsAt.toISOString().slice(0, 10), status: "completed",
        startedAt: startsAt.toISOString(), completedAt: new Date(startsAt.getTime() + 30 * 60_000).toISOString(),
      };
      db.appointments.push(appointment);
      db.visits.push(visit);
      if (n === 2) {
        const issuedAt = new Date(startsAt.getTime() + 35 * 60_000).toISOString();
        const invoice: Invoice = {
          id: `load_inv${i}`, clinicId: DEMO_CLINIC_ID, branchId, patientId: patient.id, appointmentId: appointment.id,
          lines: [{ procedureCode: procedure.code, description: procedure.name, amount: procedure.fee }], discount: 0, issuedAt,
        };
        db.invoices.push(invoice);
        if (i % 3 !== 2) {
          const payment: Payment = {
            id: `load_pay${i}`, clinicId: DEMO_CLINIC_ID, branchId, patientId: patient.id, invoiceId: invoice.id,
            amount: procedure.fee, method: "cash", receiptNo: `AR-9${String(i).padStart(5, "0")}`, receivedBy: frontDesk.id,
            receivedAt: new Date(startsAt.getTime() + 40 * 60_000).toISOString(),
          };
          db.payments.push(payment);
        }
      }
    }
  }
  return platform;
}
