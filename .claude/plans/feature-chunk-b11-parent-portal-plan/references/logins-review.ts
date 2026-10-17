// packages/seed/src/logins.ts: who signs in. Every guardian on any patient is a parent login today.
// IMPORTANT: parent emails are generated (handle@parent.demo; parent@gmail.com for patient_sibling), never Guardian.email.
const parentAccount = (db, g, summary) => ({ id: `guardian.${g.id}`, role: "parent", email: /* generated */ "", guardianId: g.id, roles: ["parent"] });
export function allAccounts(db) { /* active staff + every guardian (deduped by id) */ }
export const accountsByEmail = (platform, email) => /* every clinic's allAccounts filtered by email */ [];
// NOTE: B11 filters parents by an active PortalAccount and adds a live, deduped `phone` (Step 2.1).
