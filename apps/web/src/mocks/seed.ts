import { faker } from "@faker-js/faker";
import { addDays, addMinutes, setHours, startOfDay } from "date-fns";
import { pesos, type Appointment, type Chair, type Patient, type Procedure, type StaffMember, type Visit } from "@pedia/shared";
import type { Db } from "./db";

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

  return { patients, staff: STAFF, chairs: CHAIRS, procedures: PROCEDURES, visits, appointments: seedAppointments(patients), photos: [] };
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
