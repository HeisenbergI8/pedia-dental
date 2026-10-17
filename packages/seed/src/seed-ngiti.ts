import { faker } from "@faker-js/faker";
import { addDays, setHours, startOfDay } from "date-fns";
import { DEFAULT_OPENING_HOURS, formatPatientNo, type Appointment, type Branch, type ClinicAccount, type StaffMember } from "@pedia/shared";
import type { Db } from "./platform";
import { defaultMessageTemplates } from "./message-templates";
import { NOTE_TEMPLATES } from "./note-templates";
import { PROCEDURES, seedPatient } from "./seed";
import { firstNotice, staffAcknowledged, withConsent } from "./seed-privacy";

/**
 * The second demo account (decision #33): Small tier, one branch, a handful of patients. It exists to prove that each
 * account sees only its own data. Ids are prefixed `ngiti_` so a test failure names the account at a glance.
 */
export const NGITI_ID = "clinic_ngiti";

export const NGITI_ACCOUNT: ClinicAccount = {
  id: NGITI_ID,
  name: "Ngiti Kids Dental",
  contactEmail: "hello@ngiti.demo",
  tin: "234-567-890-000",
  tier: "small",
  status: "active",
  brandColor: "#1e5fb4", // blue, 6.3:1 on white
  logoRef: "demo/ngiti-logo.svg",
};

const BRANCH: Branch = {
  clinicId: NGITI_ID,
  id: "branch_ngiti_bacoor",
  name: "Bacoor",
  address: "88 Aguinaldo Highway, Bacoor, Cavite",
  phone: "(046) 417 0088",
  openingHours: DEFAULT_OPENING_HOURS,
  archived: false,
};

/**
 * Dr. Ana Reyes also works here, as her own login with the same email: that is what shows the clinic chooser.
 * Five logins, the Owner included: exactly Small's limit (decision #5), so adding a sixth is refused on the first try.
 */
const STAFF: StaffMember[] = [
  { id: "ngiti_staff_lim", clinicId: NGITI_ID, fullName: "Dr. Bea Lim", role: "dentist", licenseNo: "0062214", isOwner: true, branchIds: [BRANCH.id] },
  { id: "ngiti_staff_reyes", clinicId: NGITI_ID, fullName: "Dr. Ana Reyes", role: "dentist", licenseNo: "0045821", branchIds: [BRANCH.id] },
  { id: "ngiti_staff_tan", clinicId: NGITI_ID, fullName: "Joy Tan", role: "front_desk", branchIds: [BRANCH.id] },
  { id: "ngiti_staff_bautista", clinicId: NGITI_ID, fullName: "Dr. Rico Bautista", role: "dentist", licenseNo: "0058812", branchIds: [BRANCH.id] },
  { id: "ngiti_staff_dizon", clinicId: NGITI_ID, fullName: "Mae Dizon", role: "front_desk", branchIds: [BRANCH.id] },
];
const PINS: Record<string, string> = {
  ngiti_staff_lim: "4826",
  ngiti_staff_reyes: "3691",
  ngiti_staff_tan: "5173",
  ngiti_staff_bautista: "2958",
  ngiti_staff_dizon: "6407",
};

export function seedNgiti(): Db {
  faker.seed(7); // its own sequence: the demo clinic's records never shift because of this account
  const patients = Array.from({ length: 4 }, (_, i) => ({
    ...seedPatient(),
    id: `ngiti_patient_${i + 1}`,
    clinicId: NGITI_ID,
    patientNo: formatPatientNo(i + 1),
  }));
  let day = addDays(startOfDay(new Date()), 1);
  if (BRANCH.openingHours.closedWeekdays.includes(day.getDay())) day = addDays(day, 1);
  const exam = PROCEDURES.find((p) => p.code === "oral_exam")!;
  const appointments: Appointment[] = patients.slice(0, 2).map((p, i) => ({
    id: `ngiti_appointment_${i + 1}`,
    clinicId: NGITI_ID,
    branchId: BRANCH.id,
    patientId: p.id,
    dentistId: "ngiti_staff_lim",
    chairId: "ngiti_chair_1",
    startsAt: setHours(day, 9 + i).toISOString(),
    durationMin: exam.defaultDurationMin,
    reason: exam.name,
    procedureCode: exam.code,
    status: "booked",
  }));
  return {
    branches: [BRANCH],
    patients: withConsent(patients, STAFF.find((s) => s.id === "ngiti_staff_tan")!),
    staff: STAFF,
    chairs: [1, 2].map((n) => ({ id: `ngiti_chair_${n}`, clinicId: NGITI_ID, branchId: BRANCH.id, name: `Chair ${n}` })),
    procedures: PROCEDURES.map((p) => ({ ...p, clinicId: NGITI_ID })),
    visits: [],
    chartEntries: [],
    noteTemplates: NOTE_TEMPLATES,
    notes: [],
    growth: [],
    planItems: [],
    appointments,
    photos: [],
    dueItems: [],
    invoices: [],
    payments: [],
    messageTemplates: defaultMessageTemplates(NGITI_ID, new Date().toISOString()),
    messages: [],
    documents: [],
    appointmentRequests: [],
    auditEvents: [],
    staffPins: STAFF.map((s) => ({ clinicId: NGITI_ID, staffId: s.id, pin: PINS[s.id]!, failedAt: [] })),
    staffCredentials: [],
    privacyNotices: [firstNotice(NGITI_ID, NGITI_ACCOUNT.name, "Dr. Bea Lim", NGITI_ACCOUNT.contactEmail)],
    acknowledgements: staffAcknowledged(NGITI_ID, STAFF),
    portalAccounts: [], // filled by seedPlatform (B11)
  };
}
