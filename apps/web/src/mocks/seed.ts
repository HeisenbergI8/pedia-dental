import { faker } from "@faker-js/faker";
import { addDays, addMinutes, addMonths, differenceInYears, format, min, parseISO, setHours, startOfDay, startOfWeek, subDays, subMinutes, subMonths, subYears } from "date-fns";
import {
  PERMANENT_TEETH,
  PRIMARY_TEETH,
  PaymentMethod,
  dueItemFor,
  formatPatientNo,
  isAnterior,
  pesos,
  reminderSendAt,
  surfacesFor,
  type Appointment,
  type AppointmentRequest,
  type AuditEvent,
  type Chair,
  type ChartEntry,
  type ClinicalNote,
  type DueItem,
  type Invoice,
  type Message,
  type Patient,
  type Payment,
  type PlanItem,
  type Procedure,
  type StaffMember,
  type Visit,
} from "@pedia/shared";
import type { Db } from "./db";
import { composeMessage, defaultMessageTemplates, type MessageEvent, type MessageRefs } from "./message-templates";
import { NOTE_TEMPLATES } from "./note-templates";

export const CLINIC_ID = "clinic_demo";

/** Fixed ids, so appointments and visits seeded later can point at them. */
const STAFF: StaffMember[] = [
  { id: "staff_reyes", clinicId: CLINIC_ID, fullName: "Dr. Ana Reyes", role: "dentist", licenseNo: "0045821" },
  { id: "staff_santos", clinicId: CLINIC_ID, fullName: "Dr. Miguel Santos", role: "dentist", licenseNo: "0051377" },
  { id: "staff_cruz", clinicId: CLINIC_ID, fullName: "Liza Cruz", role: "front_desk" },
  { id: "staff_delacruz", clinicId: CLINIC_ID, fullName: "Carmen Dela Cruz", role: "admin" },
];

/** Each staff member's own demo PIN, shown on the login screen. Different for everyone: there are no shared logins. */
const STAFF_PINS: Record<string, string> = {
  staff_reyes: "2580",
  staff_santos: "1357",
  staff_cruz: "2468",
  staff_delacruz: "1793",
};

const CHAIRS: Chair[] = ["Chair 1", "Chair 2", "Chair 3"].map((name, i) => ({
  id: `chair_${i + 1}`,
  clinicId: CLINIC_ID,
  name,
}));

/** Fees reproduce the spec's billing example: 1,200 + 800 + 3 × 2,000 + 500 = ₱8,500. */
const PROCEDURES: Procedure[] = (
  [
    ["oral_exam", "Oral examination", 30, 500, false],
    ["prophylaxis", "Prophylaxis (cleaning)", 30, 1200, false],
    ["fluoride", "Fluoride application", 15, 800, false],
    ["sealant", "Pit and fissure sealant", 20, 1000, true],
    ["restoration", "Restoration", 45, 2000, true],
    ["pulpotomy", "Pulpotomy", 60, 3500, true],
    ["pulpectomy", "Pulpectomy", 75, 4500, true],
    ["extraction", "Extraction", 30, 1500, true],
    ["space_maintainer", "Space maintainer", 45, 5000, false],
    ["ortho_assessment", "Orthodontic assessment", 30, 1000, false],
    ["emergency", "Emergency visit", 30, 800, false],
    ["follow_up", "Follow-up visit", 15, 500, false],
  ] as const
).map(([code, name, defaultDurationMin, php, perTooth]) => ({
  clinicId: CLINIC_ID,
  code,
  name,
  defaultDurationMin,
  fee: pesos(php),
  perTooth,
}));

/**
 * One child and their primary guardian, from the shared faker sequence. Every seeded child comes from here,
 * the first 24 and the roster alike, so a new profile field is added once.
 * Adding a faker call here re-rolls every later record: add new fields at the END of this body, and expect
 * seed.test.ts's "unchanged first patients" check to need its names updated deliberately.
 */
function seedPatient(): Patient {
  const lastName = faker.person.lastName();
  const sex = faker.helpers.arrayElement(["male", "female"] as const);
  const guardianId = faker.string.uuid();
  const createdAt = faker.date.past({ years: 2 }).toISOString();
  return {
    id: faker.string.uuid(),
    patientNo: "", // numbered by seedProfiles once every patient exists
    clinicId: CLINIC_ID,
    firstName: faker.person.firstName(sex),
    lastName,
    birthDate: faker.date.birthdate({ mode: "age", min: 2, max: 14 }).toISOString().slice(0, 10),
    sex,
    address: `${faker.location.streetAddress()}, Cavite`,
    guardians: [
      {
        id: guardianId,
        fullName: `${faker.person.firstName("female")} ${lastName}`,
        relationship: "Mother",
        phone: `09${faker.string.numeric(9)}`,
        isPrimary: true,
      },
    ],
    allergies: faker.helpers.maybe(() => ["Penicillin"], { probability: 0.15 }) ?? [],
    medicalConditions: faker.helpers.maybe(() => ["Asthma"], { probability: 0.1 }) ?? [],
    medications: [],
    alerts: faker.helpers.maybe(() => ["Gag reflex: use small films"], { probability: 0.1 }) ?? [],
    dentalHistory: faker.helpers.maybe(
      () => ({ previousClinic: "Smile Kids Dental, Imus", notes: "Two fillings, no complications." }),
      { probability: 0.3 },
    ) ?? { previousClinic: "", notes: "" },
    consents: [{ id: faker.string.uuid(), guardianId, scope: "general_treatment", date: createdAt.slice(0, 10) }],
    createdAt,
  };
}

export function seed(): Db {
  faker.seed(42); // same fake data on every machine
  const patients: Patient[] = Array.from({ length: 24 }, seedPatient);
  // Every sixth child has no data privacy consent yet, so the overview's "missing" notice has examples.
  patients.forEach((p, i) => {
    if (i % 6 === 5) return;
    p.consents.push({ id: `consent_privacy_${i}`, guardianId: p.guardians[0].id, scope: "data_privacy", date: p.createdAt.slice(0, 10) });
  });

  // Past visits, oldest first, all completed. No visit is left in progress.
  const visits: Visit[] = patients.flatMap((p) =>
    faker.date
      .betweens({ from: p.createdAt, to: new Date(), count: faker.number.int({ min: 0, max: 3 }) })
      .map((startedAt) => ({
        id: faker.string.uuid(),
        clinicId: CLINIC_ID,
        patientId: p.id,
        dentistId: faker.helpers.arrayElement(["staff_reyes", "staff_santos"]),
        date: startedAt.toISOString().slice(0, 10),
        status: "completed" as const,
        startedAt: startedAt.toISOString(),
        completedAt: new Date(startedAt.getTime() + 45 * 60_000).toISOString(),
      })),
  );

  const chartEntries = patients.flatMap((p) => seedChart(p, visits.filter((v) => v.patientId === p.id)));

  // Every past visit opened with a signed oral exam, so behavior has a history to trend.
  const notes: ClinicalNote[] = visits.map((v) => {
    const at = parseISO(v.startedAt).getTime();
    return {
      id: faker.string.uuid(),
      clinicId: CLINIC_ID,
      patientId: v.patientId,
      visitId: v.id,
      templateId: "tpl_oral_exam",
      values: {
        oral_hygiene: faker.helpers.arrayElement(["Good", "Fair", "Poor"]),
        plaque: faker.helpers.arrayElement(["Mild", "Moderate"]),
        caries_risk: faker.helpers.arrayElement(["Low", "Mid", "High"]),
        facial_asymmetry: false,
        lymph: false,
        trismus: false,
      },
      behavior: faker.helpers.arrayElements(["cooperative", "anxious", "fearful", "crying", "needs_parent"] as const, {
        min: 1,
        max: 2,
      }),
      authorId: v.dentistId,
      createdAt: new Date(at + 5 * 60_000).toISOString(),
      signedAt: new Date(at + 40 * 60_000).toISOString(),
    };
  });

  const example = seedExamplePlan(patients, visits);
  // Hoisted, not reordered: still the last faker consumer, so every seeded record stays the same.
  const appointments = seedAppointments(patients);
  const billing = seedBilling(appointments, example.planItems[0]?.patientId);
  const messageTemplates = defaultMessageTemplates(CLINIC_ID, new Date().toISOString());
  const family = seedSibling(patients, example.planItems[0]?.patientId);
  // After every other faker consumer, so the records above stay exactly as they were.
  const roster = seedRoster(billing.payments.length, { templates: messageTemplates, staff: STAFF });
  const allVisits = [...visits, ...roster.visits];
  const allNotes = [...notes, ...example.notes, ...roster.notes];

  return {
    patients: seedProfiles([...patients, ...family.patients, ...roster.patients]),
    staff: STAFF,
    chairs: CHAIRS,
    procedures: PROCEDURES,
    visits: allVisits,
    chartEntries: [...chartEntries, ...example.chartEntries],
    noteTemplates: NOTE_TEMPLATES,
    notes: seedExamFindings(allNotes),
    growth: [],
    planItems: example.planItems,
    appointments: [...appointments, ...family.appointments, ...roster.appointments],
    photos: [],
    dueItems: seedDueItems(allVisits, allNotes),
    invoices: [...billing.invoices, ...roster.invoices],
    payments: [...billing.payments, ...roster.payments],
    messageTemplates,
    messages: [...seedMessages(appointments, { templates: messageTemplates, patients, staff: STAFF }), ...roster.messages],
    documents: [],
    appointmentRequests: roster.requests,
    auditEvents: seedAudit(patients, example.planItems[0]?.patientId),
    staffPins: STAFF.map((s) => ({ clinicId: CLINIC_ID, staffId: s.id, pin: STAFF_PINS[s.id], failedAt: [] })),
  };
}

const ROSTER_SIZE = 36;
/** Last exam, by i % 6. With a 6-month recall that is: not due, not due, not due, due in ~32 days (not yet flagged), due in 2–6 days, overdue. */
const LAST_EXAM_DAYS_AGO = [40, 75, 110, 150, 178, 250] as const;
/** First visits this week (i ≥ 33): Monday, Tuesday and Wednesday (clamped to today), on chair 3 outside the seeded hours. */
const NEW_PATIENT_TIMES = [[0, 8, 0], [1, 8, 30], [2, 12, 0]] as const; // [day of week, hour, minute]

/**
 * Patients 26–61: enough to page through, and a spread the patient-list filters can tell apart (the first 25 have
 * all been seen in the last fortnight). Shape comes from the index, so the proportions are known:
 * - i % 6 sets the last exam (LAST_EXAM_DAYS_AGO): i % 6 ∈ {4, 5} is Recall due (10 of 33)
 * - i % 12 = 0: half-paid exam and cleaning, ₱1,200 owed, 40 days ago, inside the dashboard's 6-month window (3)
 * - i % 9 = 4: the last recall text failed, so "No contact" (4)
 * - i = 1 and 7: birthday today, turning 6 and 9
 * - i ≥ 33: new patients, first visit this week, no history (3)
 * - requests from i = 2 and 8 (pending) and 14 (handled)
 * Faker calls only inside seedPatient(). Everything else is derived from `i` and today.
 */
function seedRoster(paymentsSoFar: number, refs: Pick<MessageRefs, "templates" | "staff">) {
  const now = new Date();
  const today = startOfDay(now);
  const at = (day: Date, h: number, m = 0) => addMinutes(setHours(day, h), m);
  const patients = Array.from({ length: ROSTER_SIZE }, seedPatient);
  const out = {
    patients, visits: [] as Visit[], notes: [] as ClinicalNote[], appointments: [] as Appointment[],
    invoices: [] as Invoice[], payments: [] as Payment[], messages: [] as Message[], requests: [] as AppointmentRequest[],
  };
  const exam = PROCEDURES.find((p) => p.code === "oral_exam")!;
  const cleaning = PROCEDURES.find((p) => p.code === "prophylaxis")!;

  patients.forEach((p, i) => {
    const n = i + 1;
    p.id = `patient_roster_${n}`;
    if (i === 1 || i === 7) p.birthDate = format(subYears(today, i === 1 ? 6 : 9), "yyyy-MM-dd");

    if (i >= 33) {
      const [dow, h, m] = NEW_PATIENT_TIMES[i - 33];
      const start = at(min([addDays(startOfWeek(today, { weekStartsOn: 1 }), dow), today]), h, m);
      p.createdAt = subMinutes(start, 20).toISOString();
      p.consents = p.consents.map((c) => ({ ...c, date: format(start, "yyyy-MM-dd") }));
      const status = addMinutes(start, exam.defaultDurationMin) <= now ? "done" : "booked";
      out.appointments.push({
        id: `appointment_roster_${n}`, clinicId: CLINIC_ID, patientId: p.id, dentistId: "staff_santos", chairId: "chair_3",
        startsAt: start.toISOString(), durationMin: exam.defaultDurationMin, reason: exam.name, procedureCode: exam.code, status,
      });
      return;
    }

    const day = subDays(today, LAST_EXAM_DAYS_AGO[i % 6]);
    if (parseISO(p.createdAt) > day) p.createdAt = subDays(day, 30).toISOString();
    const visit: Visit = {
      id: `visit_roster_${n}`, clinicId: CLINIC_ID, patientId: p.id, dentistId: i % 2 ? "staff_santos" : "staff_reyes",
      date: format(day, "yyyy-MM-dd"), status: "completed", startedAt: at(day, 10).toISOString(), completedAt: at(day, 10, 45).toISOString(),
    };
    out.visits.push(visit);
    const note: ClinicalNote = {
      id: `note_roster_${n}`, clinicId: CLINIC_ID, patientId: p.id, visitId: visit.id, templateId: "tpl_oral_exam",
      values: { oral_hygiene: "Good", plaque: "Mild", caries_risk: "Low", facial_asymmetry: false, lymph: false, trismus: false },
      behavior: ["cooperative"], authorId: visit.dentistId, createdAt: at(day, 10, 5).toISOString(), signedAt: at(day, 10, 40).toISOString(),
    };
    out.notes.push(note); // seedDueItems turns it into the routine recall, due 6 months after `day`

    if (i % 12 === 0) {
      const invoice: Invoice = {
        id: `inv_seed_roster_${n}`, clinicId: CLINIC_ID, patientId: p.id, visitId: visit.id, discount: 0, issuedAt: at(day, 10, 50).toISOString(),
        lines: [exam, cleaning].map((x) => ({ procedureCode: x.code, description: x.name, amount: x.fee })),
      };
      out.invoices.push(invoice);
      const k = paymentsSoFar + out.payments.length + 1;
      out.payments.push({
        id: `pay_seed_roster_${n}`, // still "pay_seed_": the financial dashboard test's seeded-only guard holds
        clinicId: CLINIC_ID, patientId: p.id, invoiceId: invoice.id, amount: exam.fee, method: "cash",
        receiptNo: `AR-${String(k).padStart(6, "0")}`, receivedBy: "staff_cruz", receivedAt: at(day, 10, 55).toISOString(),
      });
    }

    if (i % 9 === 4) {
      const sendAt = at(subDays(today, 3), 10).toISOString();
      const m = composeMessage(
        { kind: "recall", patientId: p.id, dueOn: format(addMonths(day, 6), "yyyy-MM-dd"), sendAt },
        { ...refs, patients },
        { id: `msg_roster_${n}`, clinicId: CLINIC_ID, createdAt: sendAt },
      );
      if (m) out.messages.push({ ...m, status: "failed", failureReason: "Number unreachable (simulated)" });
    }
  });

  for (const [i, days, status] of [[2, 3, "pending"], [8, 5, "pending"], [14, 4, "handled"]] as const) {
    const p = patients[i];
    out.requests.push({
      id: `request_roster_${i + 1}`, clinicId: CLINIC_ID, patientId: p.id, guardianId: p.guardians[0].id,
      preferredDate: format(addDays(today, days), "yyyy-MM-dd"), timeOfDay: i === 8 ? "afternoon" : "morning",
      reason: "Check-up and cleaning", status, createdAt: at(subDays(today, 1), 19).toISOString(),
    });
  }
  return out;
}

/** Teeth a child of this age plausibly has: primary until ~12, first molars and incisors from ~6. */
function teethForAge(age: number) {
  const early = PERMANENT_TEETH.filter((t) => [1, 2, 6].includes(t % 10));
  return [...(age < 12 ? PRIMARY_TEETH : []), ...(age >= 6 ? early : []), ...(age >= 12 ? PERMANENT_TEETH : [])];
}

/** Findings at the first visit; some caries are restored at a later one, so history has depth. */
function seedChart(patient: Patient, visits: Visit[]): ChartEntry[] {
  if (visits.length === 0) return [];
  const [first, ...later] = visits;
  const entry = (v: Visit, e: Pick<ChartEntry, "tooth" | "surfaces" | "condition">, minutes: number): ChartEntry => ({
    ...e,
    id: faker.string.uuid(),
    clinicId: CLINIC_ID,
    patientId: patient.id,
    visitId: v.id,
    recordedBy: v.dentistId,
    recordedAt: new Date(parseISO(v.startedAt).getTime() + minutes * 60_000).toISOString(),
  });

  const age = differenceInYears(parseISO(first.date), parseISO(patient.birthDate));
  const teeth = faker.helpers.arrayElements(teethForAge(age), { min: 2, max: 5 });
  const findings = teeth.map((tooth, i) => {
    const condition = isAnterior(tooth)
      ? faker.helpers.arrayElement(["caries", "caries", "restored"] as const)
      : faker.helpers.arrayElement(["caries", "caries", "restored", "sealant"] as const);
    const surfaces = condition === "sealant" ? ["O" as const] : faker.helpers.arrayElements(surfacesFor(tooth), { min: 1, max: 2 });
    return entry(first, { tooth, surfaces, condition }, 10 + i);
  });

  const restorations = later.length
    ? findings
        .filter((f) => f.condition === "caries" && faker.datatype.boolean())
        .map((f, i) => entry(faker.helpers.arrayElement(later), { tooth: f.tooth, surfaces: f.surfaces, condition: "restored" }, 10 + i))
    : [];
  return [...findings, ...restorations];
}

/**
 * The spec's example treatment plan on one young patient with two or more visits: cleaning, fluoride,
 * restorations on 51, 74 and 84, and a follow-up. Caries were charted at an earlier visit; cleaning,
 * fluoride and the 51 restoration were done at the latest one through signed notes, so 3 of 6 are done.
 */
function seedExamplePlan(patients: Patient[], visits: Visit[]) {
  const patient = patients.find((p) => {
    const vs = visits.filter((v) => v.patientId === p.id);
    const age = vs.length && differenceInYears(parseISO(vs[vs.length - 1].date), parseISO(p.birthDate));
    return vs.length >= 2 && age >= 4 && age <= 8;
  });
  if (!patient) return { chartEntries: [], notes: [], planItems: [] };

  const vs = visits.filter((v) => v.patientId === patient.id);
  const [found, done] = [vs[vs.length - 2], vs[vs.length - 1]];
  const at = (v: Visit, minutes: number) => new Date(parseISO(v.startedAt).getTime() + minutes * 60_000).toISOString();
  const base = { clinicId: CLINIC_ID, patientId: patient.id };

  const caries = ([[51, "M"], [74, "O"], [84, "O"]] as const).map(
    ([tooth, surface], i): ChartEntry => ({
      ...base,
      id: `example_caries_${tooth}`,
      visitId: found.id,
      tooth,
      surfaces: [surface],
      condition: "caries",
      recordedBy: found.dentistId,
      recordedAt: at(found, 30 + i),
    }),
  );
  const restored51: ChartEntry = {
    ...caries[0],
    id: "example_restored_51",
    visitId: done.id,
    condition: "restored",
    recordedBy: done.dentistId,
    recordedAt: at(done, 35),
  };

  const note = (templateId: string, values: Record<string, unknown>, minutes: number): ClinicalNote => ({
    ...base,
    id: `example_note_${templateId}`,
    visitId: done.id,
    templateId,
    values,
    behavior: ["cooperative"],
    authorId: done.dentistId,
    createdAt: at(done, minutes),
    signedAt: at(done, minutes + 5),
  });
  const notes = [
    note("tpl_prophylaxis", { method: "Rubber cup and paste", ohi_given: true }, 10),
    note("tpl_fluoride", { agent: "5% NaF varnish", teeth: [], instructions_given: true }, 20),
    note("tpl_restoration", { teeth: [51], anesthesia: "Topical only", material: "Composite" }, 30),
  ];

  const fee = (code: string) => PROCEDURES.find((p) => p.code === code)!.fee;
  const plan: [string, number | undefined, ClinicalNote | undefined][] = [
    ["prophylaxis", undefined, notes[0]],
    ["fluoride", undefined, notes[1]],
    ["restoration", 51, notes[2]],
    ["restoration", 74, undefined],
    ["restoration", 84, undefined],
    ["follow_up", undefined, undefined],
  ];
  const planItems = plan.map(
    ([procedureCode, tooth, doneBy], i): PlanItem => ({
      ...base,
      id: `example_plan_${i + 1}`,
      procedureCode,
      tooth,
      fee: fee(procedureCode),
      status: doneBy ? "done" : "planned",
      sourceChartEntryId: caries.find((c) => c.tooth === tooth)?.id,
      completedVisitId: doneBy?.visitId,
      completedNoteId: doneBy?.id,
      createdAt: at(found, 40 + i),
    }),
  );

  return { chartEntries: [...caries, restored51], notes, planItems };
}

/** Each patient's latest signed note with a rule (in practice their last oral exam) sets their next recall. */
function seedDueItems(visits: Visit[], notes: ClinicalNote[]): DueItem[] {
  const latest = new Map<string, DueItem>();
  for (const n of [...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const procedure = NOTE_TEMPLATES.find((t) => t.id === n.templateId)?.procedure ?? "";
    const visit = visits.find((v) => v.id === n.visitId);
    const due = n.signedAt && visit && dueItemFor(procedure, visit.date);
    if (!due || !n.signedAt) continue;
    latest.set(`${n.patientId}:${due.ruleId}`, {
      ...due,
      id: `due_${n.id}`,
      clinicId: CLINIC_ID,
      patientId: n.patientId,
      sourceNoteId: n.id,
      createdAt: n.signedAt,
    });
  }
  return [...latest.values()];
}

/**
 * Two weeks either side of today. Each dentist keeps one chair and one appointment
 * per hour, so the seed never double-books. Chair 3 is left free for new bookings.
 */
function seedAppointments(patients: Patient[]): Appointment[] {
  const now = new Date();
  const fitsInAnHour = PROCEDURES.filter((p) => p.defaultDurationMin <= 60);
  const rows: Appointment[] = [];
  for (let offset = -14; offset <= 14; offset++) {
    const day = addDays(startOfDay(now), offset);
    if (day.getDay() === 0) continue; // closed on Sundays
    for (const hour of [9, 10, 11, 13, 14, 15, 16]) {
      for (const [chairId, dentistId] of [["chair_1", "staff_reyes"], ["chair_2", "staff_santos"]]) {
        if (!faker.datatype.boolean({ probability: 0.55 })) continue;
        const procedure = faker.helpers.arrayElement(fitsInAnHour);
        const start = setHours(day, hour);
        const end = addMinutes(start, procedure.defaultDurationMin);
        const past = faker.helpers.weightedArrayElement([
          { weight: 85, value: "done" as const },
          { weight: 10, value: "no_show" as const },
          { weight: 5, value: "cancelled" as const },
        ]);
        const status = end <= now ? past : start <= now ? "arrived" : faker.helpers.arrayElement(["booked", "confirmed"] as const);
        rows.push({
          id: faker.string.uuid(),
          clinicId: CLINIC_ID,
          patientId: faker.helpers.arrayElement(patients).id,
          dentistId,
          chairId,
          startsAt: start.toISOString(),
          durationMin: procedure.defaultDurationMin,
          reason: procedure.name,
          procedureCode: procedure.code,
          status,
          ...(status === "cancelled" && { cancelReason: "Child is sick" }),
        });
      }
    }
  }
  return rows;
}

/**
 * A believable log for the appointments three days either side of today: confirmations sent a week before,
 * reminders the day before, and a missed-appointment message after a no-show. A no-show's reminder is shown
 * as failed (simulated) so the log has every status. No faker calls.
 */
function seedMessages(appointments: Appointment[], refs: MessageRefs): Message[] {
  const now = new Date().toISOString();
  const window = 3 * 86_400_000;
  return appointments
    .filter((a) => Math.abs(parseISO(a.startsAt).getTime() - Date.now()) <= window)
    .flatMap((a) => {
      const base = { patientId: a.patientId, appointmentId: a.id, startsAt: a.startsAt, dentistId: a.dentistId };
      const bookedAt = addDays(parseISO(a.startsAt), -7).toISOString();
      const events: MessageEvent[] = [
        { ...base, kind: "appointment_confirmation", sendAt: bookedAt },
        { ...base, kind: "appointment_reminder", sendAt: reminderSendAt(a.startsAt, new Date(0)) },
      ];
      if (a.status === "no_show") {
        events.push({ ...base, kind: "missed_appointment", sendAt: addMinutes(parseISO(a.startsAt), a.durationMin + 60).toISOString() });
      }
      return events.flatMap((e, i): Message[] => {
        const m = composeMessage(e, refs, { id: `msg_${a.id}_${i}`, clinicId: CLINIC_ID, createdAt: bookedAt });
        if (!m) return [];
        if (m.sendAt > now) return [{ ...m, status: a.status === "cancelled" ? "cancelled" : "queued" }];
        if (a.status === "no_show" && e.kind === "appointment_reminder") {
          return [{ ...m, status: "failed", failureReason: "Number unreachable (simulated)" }];
        }
        return [{ ...m, status: "sent" }];
      });
    });
}

/**
 * Bills the seeded appointments that are done, one invoice each, for the procedure in the reason. Most are
 * paid at the counter, every fifth is half-paid and every seventh isn't billed yet, so the dashboard has
 * collections, balances and unpaid appointments to show. No faker calls: the rest of the seed is unchanged.
 */
function seedBilling(appointments: Appointment[], skipPatientId?: string) {
  const invoices: Invoice[] = [];
  const payments: Payment[] = [];
  const done = appointments.filter((a) => a.status === "done" && a.patientId !== skipPatientId);
  done.forEach((a, i) => {
    if (i % 7 === 6) return; // done but not billed yet
    const procedure = PROCEDURES.find((p) => p.name === a.reason);
    if (!procedure) return;
    const end = addMinutes(parseISO(a.startsAt), a.durationMin);
    const invoice: Invoice = {
      id: `inv_seed_${invoices.length + 1}`,
      clinicId: CLINIC_ID,
      patientId: a.patientId,
      appointmentId: a.id,
      lines: [{ procedureCode: procedure.code, description: procedure.name, amount: procedure.fee }],
      discount: 0,
      issuedAt: end.toISOString(),
    };
    invoices.push(invoice);
    const method = PaymentMethod.options[i % PaymentMethod.options.length];
    const n = payments.length + 1;
    payments.push({
      id: `pay_seed_${n}`,
      clinicId: CLINIC_ID,
      patientId: a.patientId,
      invoiceId: invoice.id,
      amount: i % 5 === 4 ? Math.round(procedure.fee / 200) * 100 : procedure.fee, // half, in whole pesos
      method,
      ...(method !== "cash" && { referenceNo: String(4_100_000 + n) }),
      receiptNo: `AR-${String(n).padStart(6, "0")}`,
      receivedBy: "staff_cruz",
      receivedAt: addMinutes(end, 5).toISOString(),
    });
  });
  return { invoices, payments };
}

/**
 * A younger sibling of the example-plan child, under the same guardian, so one parent account has two
 * children to switch between. One booked appointment on chair 3 at 5 PM, outside the seeded hours, so
 * "Confirm" has something to confirm without double-booking anyone. No faker calls.
 */
function seedSibling(patients: Patient[], olderId: string | undefined) {
  const older = patients.find((p) => p.id === olderId);
  if (!older) return { patients: [], appointments: [] };
  const guardian = older.guardians[0];
  const sibling: Patient = {
    id: "patient_sibling",
    patientNo: "", // numbered by seedProfiles
    clinicId: CLINIC_ID,
    firstName: "Mika",
    lastName: older.lastName,
    birthDate: format(subMonths(new Date(), 40), "yyyy-MM-dd"), // 3 years 4 months: never a birthday today
    sex: "female",
    address: older.address,
    guardians: [guardian], // the same guardian id is what makes both children this parent's
    allergies: [],
    medicalConditions: [],
    medications: [],
    alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
    consents: [{ id: "consent_sibling", guardianId: guardian.id, scope: "general_treatment", date: older.createdAt.slice(0, 10) }],
    createdAt: older.createdAt,
  };
  let day = addDays(startOfDay(new Date()), 2);
  if (day.getDay() === 0) day = addDays(day, 1); // closed on Sundays
  const exam = PROCEDURES.find((p) => p.code === "oral_exam")!;
  const appointment: Appointment = {
    id: "appointment_sibling",
    clinicId: CLINIC_ID,
    patientId: sibling.id,
    dentistId: "staff_santos",
    chairId: "chair_3",
    startsAt: setHours(day, 17).toISOString(),
    durationMin: exam.defaultDurationMin,
    reason: exam.name,
    procedureCode: exam.code,
    status: "booked",
  };
  return { patients: [sibling], appointments: [appointment] };
}

/**
 * A few days of audit trail, so the log isn't empty on a fresh demo: sign-ins, a dentist charting and
 * signing, front desk taking a payment and being refused the financial report, a parent checking the
 * plan. Times are relative to today. No faker calls.
 */
function seedAudit(patients: Patient[], exampleId: string | undefined): AuditEvent[] {
  const child = patients.find((p) => p.id === exampleId) ?? patients[0];
  const other = patients[3];
  const guardian = child.guardians[0];
  const actors = {
    admin: { actorId: "staff_delacruz", actorName: "Carmen Dela Cruz", actorRole: "admin" },
    desk: { actorId: "staff_cruz", actorName: "Liza Cruz", actorRole: "front_desk" },
    reyes: { actorId: "staff_reyes", actorName: "Dr. Ana Reyes", actorRole: "dentist" },
    santos: { actorId: "staff_santos", actorName: "Dr. Miguel Santos", actorRole: "dentist" },
    parent: { actorId: `guardian.${guardian.id}`, actorName: guardian.fullName, actorRole: "parent" }, // the account id format in demo-accounts.ts
  } as const;
  type Row = [daysAgo: number, time: string, actor: keyof typeof actors, action: AuditEvent["action"], record: string, patientId?: string];
  const rows: Row[] = [
    [2, "07:58", "admin", "sign_in", "Session"],
    [2, "08:03", "admin", "view", "Financial report"],
    [2, "08:10", "admin", "view", "Audit log"],
    [1, "07:49", "desk", "sign_in_failed", "Session"],
    [1, "07:50", "desk", "sign_in", "Session"],
    [1, "07:52", "desk", "view", "Appointment calendar"],
    [1, "09:15", "desk", "view", "Patient profile", other.id],
    [1, "09:16", "desk", "update", "Patient profile", other.id],
    [1, "10:02", "reyes", "sign_in", "Session"],
    [1, "10:05", "reyes", "view", "Dental chart", child.id],
    [1, "10:31", "reyes", "update", "Dental chart", child.id],
    [1, "10:44", "reyes", "update", "Clinical note (signed)", child.id],
    [1, "10:47", "reyes", "export", "Document", child.id],
    [1, "11:05", "desk", "create", "Payment", child.id],
    [1, "11:20", "desk", "denied", "Financial report"],
    [1, "12:30", "santos", "sign_in", "Session"],
    [1, "12:34", "santos", "view", "Clinical notes", other.id],
    [1, "12:51", "santos", "timed_out", "Session"],
    [0, "06:40", "parent", "sign_in", "Session"],
    [0, "06:41", "parent", "view", "Treatment plan", child.id],
    [0, "06:43", "parent", "view", "Invoices", child.id],
    [0, "06:45", "parent", "sign_out", "Session"],
  ];
  return rows.map(([daysAgo, time, actor, action, record, patientId], i) => {
    const [h, m] = time.split(":").map(Number);
    const at = addMinutes(setHours(startOfDay(subDays(new Date(), daysAgo)), h), m);
    return { id: `audit_seed_${i}`, clinicId: CLINIC_ID, at: at.toISOString(), ...actors[actor], action, record, patientId };
  });
}

/** Filipino pet names, the kind parents give at home. Index-chosen, so some children have one and most don't. */
const NICKNAMES = ["Bea", "Migs", "Pia", "Jojo", "Kaye", "Bong", "Tin", "Luke", "Gab", "Nikki"];
const SCHOOLS = ["St. Paul College, Imus", "Imus Pilot Elementary School", "Little Einstein Learning Center", "De La Salle Dasmariñas"];
const HMOS = ["Maxicare · 1203-4471-55", "Intellicare · IC-778201", "PhilCare · 55-0193-22"];
const DOCTORS = ["Dr. Celia Ramos (pediatrician)", "Dr. Paolo Lim (pediatrician)"];
const REFERRALS = ["Another parent", "Facebook page", "Dr. Celia Ramos", "Walk-in"];

/**
 * Patient numbers in registration order, plus nicknames, tags and profile details on some children so the
 * record shows both the filled and the empty state. Index-based, with no faker calls: adding it changes
 * no other seeded record.
 */
function seedProfiles(patients: Patient[]): Patient[] {
  const byCreated = [...patients].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const numberOf = new Map(byCreated.map((p, i) => [p.id, formatPatientNo(i + 1)]));
  return patients.map((p, i) => {
    const nickname = NICKNAMES[(i / 3) % NICKNAMES.length];
    return {
      ...p,
      patientNo: numberOf.get(p.id)!,
      ...(i % 3 === 0 && nickname !== p.firstName && { nickname }),
      ...(i % 4 === 1 && { tags: i % 8 === 1 ? ["Anxious"] : ["HMO", "Prefers Filipino"] }),
      ...(i % 2 === 0 && {
        profile: {
          school: SCHOOLS[i % SCHOOLS.length],
          ...(i % 4 === 0 && { hmo: HMOS[i % HMOS.length], bloodType: (["O+", "A+", "B+", "AB+"] as const)[(i / 4) % 4] }),
          ...(i % 6 === 0 && { familyDoctor: DOCTORS[i % DOCTORS.length] }),
          referredBy: REFERRALS[i % REFERRALS.length],
          ...(i % 4 === 2 && { diet: "Sweet drinks most days; juice at bedtime", brushing: "Twice a day, parent helps at night" }),
          ...(i % 8 === 0 && {
            badDentalExperience: "Cried through an extraction at another clinic (2024)",
            fluorideHistory: "Varnish every 6 months since age 3",
          }),
        },
      }),
    };
  });
}

/** Bite, TMJ and gum findings on some seeded oral exams, by index (no faker calls), so note cards show the sections. */
function seedExamFindings(notes: ClinicalNote[]): ClinicalNote[] {
  let exam = 0;
  return notes.map((n) => {
    if (n.templateId !== "tpl_oral_exam") return n;
    const i = exam++;
    return {
      ...n,
      values: {
        ...n.values,
        ...(i % 3 === 0 && { molar_class: "Class I" }),
        ...(i % 5 === 0 && { gingivitis: "Mild", periodontitis: "None" }),
        ...(i % 7 === 0 && { crossbite: true, tmj_clicking: true }),
      },
    };
  });
}

