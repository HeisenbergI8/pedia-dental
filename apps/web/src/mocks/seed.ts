import { faker } from "@faker-js/faker";
import { addDays, addMinutes, differenceInYears, parseISO, setHours, startOfDay } from "date-fns";
import {
  PERMANENT_TEETH,
  PRIMARY_TEETH,
  isAnterior,
  pesos,
  surfacesFor,
  type Appointment,
  type Chair,
  type ChartEntry,
  type ClinicalNote,
  type Patient,
  type PlanItem,
  type Procedure,
  type StaffMember,
  type Visit,
} from "@pedia/shared";
import type { Db } from "./db";
import { NOTE_TEMPLATES } from "./note-templates";

export const CLINIC_ID = "clinic_demo";

/** Fixed ids, so appointments and visits seeded later can point at them. */
const STAFF: StaffMember[] = [
  { id: "staff_reyes", clinicId: CLINIC_ID, fullName: "Dr. Ana Reyes", role: "dentist", licenseNo: "0045821" },
  { id: "staff_santos", clinicId: CLINIC_ID, fullName: "Dr. Miguel Santos", role: "dentist", licenseNo: "0051377" },
  { id: "staff_cruz", clinicId: CLINIC_ID, fullName: "Liza Cruz", role: "front_desk" },
  { id: "staff_delacruz", clinicId: CLINIC_ID, fullName: "Carmen Dela Cruz", role: "admin" },
];

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

export function seed(): Db {
  faker.seed(42); // same fake data on every machine
  const patients: Patient[] = Array.from({ length: 24 }, () => {
    const lastName = faker.person.lastName();
    const sex = faker.helpers.arrayElement(["male", "female"] as const);
    const guardianId = faker.string.uuid();
    const createdAt = faker.date.past({ years: 2 }).toISOString();
    return {
      id: faker.string.uuid(),
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

  return {
    patients,
    staff: STAFF,
    chairs: CHAIRS,
    procedures: PROCEDURES,
    visits,
    chartEntries: [...chartEntries, ...example.chartEntries],
    noteTemplates: NOTE_TEMPLATES,
    notes: [...notes, ...example.notes],
    growth: [],
    planItems: example.planItems,
    appointments: seedAppointments(patients),
    photos: [],
  };
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
          status,
          ...(status === "cancelled" && { cancelReason: "Child is sick" }),
        });
      }
    }
  }
  return rows;
}
