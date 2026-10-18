import { DEFAULT_BRAND_COLOR, DEFAULT_OPENING_HOURS, type Branch, type ClinicAccount, type StaffMember } from "@pedia/shared";
import type { Db } from "./platform";
import { defaultMessageTemplates } from "./message-templates";
import { NOTE_TEMPLATES } from "./note-templates";
import { PROCEDURES } from "./seed";
import { firstNotice, staffAcknowledged } from "./seed-privacy";

/**
 * Billing #34, S11: the clinic in its grace period. Small, one branch, its Owner only, no patients: it exists to show the
 * overdue banner and then the automatic pause. Its Owner signs in as owner@ipin.demo with the demo password (S16).
 */
export const IPIN_ID = "clinic_ipin";

export const IPIN_ACCOUNT: ClinicAccount = {
  id: IPIN_ID,
  name: "Ipin Kids Dental",
  contactEmail: "hello@ipin.demo",
  tin: "345-678-901",
  tier: "small",
  status: "active",
  brandColor: DEFAULT_BRAND_COLOR, // the default look (billing #7)
};

const BRANCH: Branch = {
  clinicId: IPIN_ID,
  id: "branch_ipin_imus",
  name: "Imus",
  address: "12 Nueno Avenue, Imus, Cavite",
  phone: "(046) 471 1234",
  openingHours: DEFAULT_OPENING_HOURS,
  archived: false,
};

const OWNER: StaffMember = {
  clinicId: IPIN_ID,
  id: "ipin_staff_santiago",
  fullName: "Dr. Lara Santiago",
  email: "owner@ipin.demo",
  role: "dentist",
  isOwner: true,
  branchIds: [BRANCH.id],
};

export function seedIpin(): Db {
  return {
    branches: [BRANCH],
    patients: [],
    staff: [OWNER],
    chairs: [{ id: "chair_ipin_1", clinicId: IPIN_ID, branchId: BRANCH.id, name: "Chair 1" }],
    procedures: PROCEDURES.map((p) => ({ ...p, clinicId: IPIN_ID })),
    visits: [],
    chartEntries: [],
    noteTemplates: NOTE_TEMPLATES,
    notes: [],
    growth: [],
    planItems: [],
    appointments: [],
    photos: [],
    dueItems: [],
    invoices: [],
    payments: [],
    messageTemplates: defaultMessageTemplates(IPIN_ID, new Date().toISOString()),
    messages: [],
    documents: [],
    appointmentRequests: [],
    auditEvents: [],
    staffPins: [{ clinicId: IPIN_ID, staffId: OWNER.id, pin: "2468", failedAt: [] }],
    staffCredentials: [], // a seeded login: the demo password
    privacyNotices: [firstNotice(IPIN_ID, IPIN_ACCOUNT.name, OWNER.fullName, IPIN_ACCOUNT.contactEmail)],
    acknowledgements: staffAcknowledged(IPIN_ID, [OWNER]),
    portalAccounts: [], // filled by seedPlatform (B11)
    storedFiles: [], // filled by seedPlatform (B12)
  };
}
