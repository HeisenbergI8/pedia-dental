import { http, HttpResponse, delay } from "msw";
import {
  AddStaffInput,
  BranchInput,
  SavePrivacyNoticeInput,
  TIER_LIMITS,
  UpdateBrandingInput,
  UpdateClinicProfileInput,
  accountUsage,
  archiveProblem,
  brandColorProblem,
  canAddUnder,
  isStaffRole,
  limitMessage,
  LOGO_RULES,
  manilaMonth,
  logoProblem,
  rolesCan,
  suggestBrandColor,
  type AddStaffResult,
  type Appointment,
  type Branch,
  type ClinicAccount,
  type ClinicContext,
  type ClinicUsage,
  type StaffMember,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { branchOf, sessionOf, usableBranchesOf } from "@/mocks/access";
import { deleteBlob, getBlob, putBlob } from "@/mocks/blob-store";
import { currentAccount, currentClinicId, db, persist } from "@/mocks/db";
import { emailTaken, newPin, staffEmail, temporaryPassword } from "@/mocks/demo-accounts";
import { currentNotice, noticeView } from "@/mocks/privacy";
import { subscriptionView } from "@/mocks/subscriptions";
import { today } from "@/mocks/clock";

const url = (p: string) => `${env.apiUrl}${p}`;
const refuse = (status: 400 | 403 | 404 | 409 | 413, message: string) => new HttpResponse(message, { status });

/** Seeded logos are static files under public/demo; uploaded ones live in the blob store and are served below. */
const DEMO_LOGO = /^demo\//;
/** Where the app loads the logo from. `?v=` is the blob key, so each upload is a new URL and caches never go stale. */
const logoUrlOf = ({ logoRef }: ClinicAccount): string | null =>
  !logoRef ? null : DEMO_LOGO.test(logoRef) ? `/${logoRef}` : url(`/clinic/logo?v=${encodeURIComponent(logoRef)}`);

/** Decisions #8–#10: open branches and active logins against the tier. `null` limit = unlimited. */
function usage(): ClinicUsage {
  const { tier } = currentAccount();
  const inUse = accountUsage(db);
  return {
    tier,
    branches: { inUse: inUse.branches, limit: TIER_LIMITS[tier].branches },
    staffLogins: { inUse: inUse.staffLogins, limit: TIER_LIMITS[tier].staffLogins },
    // B12 Step 1.1 stopgap: the real counts come with Step 2.5 (mocks/allowances.ts).
    storage: { inUse: 0, limit: TIER_LIMITS[tier].storageBytes },
    texts: { inUse: 0, limit: TIER_LIMITS[tier].textParts },
    month: manilaMonth(today()),
  };
}

/** 409 with the limit's wording when one more would go over it. Only ever blocks the next one (decision #9). */
function atLimit(limit: "branches" | "staffLogins") {
  const { tier } = currentAccount();
  return canAddUnder(tier, limit, accountUsage(db)[limit]) ? undefined : refuse(409, limitMessage(tier, limit));
}


/** Still to happen at the branch: what archiving would strand. Today's arrived and in-chair visits count too. */
const UPCOMING: Appointment["status"][] = ["booked", "confirmed", "arrived", "in_chair"];
const upcomingAt = (branchId: string) =>
  db.appointments.filter((a) => a.branchId === branchId && UPCOMING.includes(a.status) && Date.parse(a.startsAt) >= Date.now()).length;

const findBranch = (id: unknown): Branch | undefined => db.branches.find((b) => b.id === id);
const findStaff = (id: unknown): StaffMember | undefined => db.staff.find((s) => s.id === id);

/**
 * API contract for the clinic account and its reference data (branches, staff, chairs, procedures), and the Owner's
 * settings: profile, branding, logo, branches and staff logins. Limits are checked here as well as in the UI.
 */
export const clinicHandlers = [
  // Everyone signed in, parents included (clinic.view): the name and hours every screen shows.
  http.get(url("/clinic"), async ({ request }) => {
    await delay(100);
    const session = sessionOf(request)!; // behind the access gate
    const account = currentAccount();
    const context: ClinicContext = { account, branches: usableBranchesOf(session), activeBranchId: branchOf(session).id, logoUrl: logoUrlOf(account) };
    return HttpResponse.json(context);
  }),

  http.get(url("/clinic/usage"), async () => {
    await delay(100);
    return HttpResponse.json(usage());
  }),

  // Billing #31, S8: the Owner's own Primolar bill. Platform data, found by this account's id.
  http.get(url("/clinic/subscription"), async () => {
    await delay(100);
    return HttpResponse.json(subscriptionView(currentClinicId()));
  }),

  // Privacy #19, #22: the clinic's notice and privacy contact. Everyone signed in may read it; it is public anyway.
  http.get(url("/clinic/privacy-notice"), () => HttpResponse.json(noticeView(currentClinicId()))),

  // The Owner's edit makes a new version, so consents and acknowledgements stay tied to what was read (#20).
  http.put(url("/clinic/privacy-notice"), async ({ request }) => {
    const parsed = SavePrivacyNoticeInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const session = sessionOf(request)!;
    db.privacyNotices.push({ ...parsed.data, clinicId: currentClinicId(), version: currentNotice(db).version + 1, savedByName: session.name, at: new Date().toISOString() });
    persist();
    return HttpResponse.json(noticeView(currentClinicId()));
  }),

  http.put(url("/clinic"), async ({ request }) => {
    const parsed = UpdateClinicProfileInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const account = Object.assign(currentAccount(), parsed.data);
    persist();
    return HttpResponse.json(account);
  }),

  // Refuses a colour below AA with the nearest that passes (decision #29). The font is on every plan (billing #8).
  http.put(url("/clinic/branding"), async ({ request }) => {
    const parsed = UpdateBrandingInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { brandColor, headingFont } = parsed.data;
    const problem = brandColorProblem(brandColor);
    if (problem) return refuse(400, `${problem} Try ${suggestBrandColor(brandColor)}.`);
    const account = currentAccount();
    account.brandColor = brandColor;
    if (headingFont) account.headingFont = headingFont;
    else delete account.headingFont;
    persist();
    return HttpResponse.json(account);
  }),

  // The uploaded logo. Served with a CSP that runs nothing: an SVG opened on its own would otherwise run script in the
  // app's origin. The app only ever shows it through <img>, where SVG script never runs.
  http.get(url("/clinic/logo"), async () => {
    const ref = currentAccount().logoRef;
    const blob = ref && !DEMO_LOGO.test(ref) ? await getBlob(ref) : undefined;
    if (!blob) return refuse(404, "This clinic has no uploaded logo");
    return new HttpResponse(blob, {
      headers: { "Content-Type": blob.type, "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "X-Content-Type-Options": "nosniff" },
    });
  }),

  // multipart/form-data with `file`: PNG, JPG or SVG up to 1 MB (decision #28). Stored like clinical photos.
  http.put(url("/clinic/logo"), async ({ request }) => {
    const file = (await request.formData()).get("file");
    if (!(file instanceof Blob)) return refuse(400, "Attach the logo file");
    const problem = logoProblem(file);
    if (problem) return refuse(file.size > LOGO_RULES.maxBytes ? 413 : 400, problem);
    const account = currentAccount();
    const old = account.logoRef;
    const key = `logo_${currentClinicId()}_${crypto.randomUUID()}`;
    await putBlob(key, file);
    account.logoRef = key;
    persist();
    if (old && !DEMO_LOGO.test(old)) await deleteBlob(old);
    return HttpResponse.json(account);
  }),

  // Back to no logo: the name in the heading font (decision #31). A seeded demo logo is just unlinked.
  http.delete(url("/clinic/logo"), async () => {
    const account = currentAccount();
    const old = account.logoRef;
    delete account.logoRef;
    persist();
    if (old && !DEMO_LOGO.test(old)) await deleteBlob(old);
    return HttpResponse.json(account);
  }),

  // Every branch, archived ones too (decision #22: their history stays). /clinic lists only the usable ones.
  http.get(url("/branches"), async () => {
    await delay(100);
    return HttpResponse.json(db.branches);
  }),

  http.post(url("/branches"), async ({ request }) => {
    const full = atLimit("branches");
    if (full) return full;
    const parsed = BranchInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const branch: Branch = { ...parsed.data, id: `branch_${crypto.randomUUID()}`, clinicId: currentClinicId(), archived: false };
    db.branches.push(branch);
    persist();
    return HttpResponse.json(branch, { status: 201 });
  }),

  http.put(url("/branches/:id"), async ({ params, request }) => {
    const branch = findBranch(params.id);
    if (!branch) return refuse(404, "Branch not found");
    const parsed = BranchInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    Object.assign(branch, parsed.data);
    persist();
    return HttpResponse.json(branch);
  }),

  // Archive, never delete (decision #22). Frees a branch slot (decision #10).
  http.post(url("/branches/:id/archive"), async ({ params }) => {
    const branch = findBranch(params.id);
    if (!branch) return refuse(404, "Branch not found");
    if (branch.archived) return HttpResponse.json(branch);
    const problem = archiveProblem(branch, { branches: db.branches, staff: db.staff, upcoming: upcomingAt(branch.id) });
    if (problem) return refuse(409, problem);
    branch.archived = true;
    persist();
    return HttpResponse.json(branch);
  }),

  http.post(url("/branches/:id/reopen"), async ({ params }) => {
    const branch = findBranch(params.id);
    if (!branch) return refuse(404, "Branch not found");
    if (!branch.archived) return HttpResponse.json(branch);
    const full = atLimit("branches");
    if (full) return full;
    branch.archived = false;
    persist();
    return HttpResponse.json(branch);
  }),

  // Deactivated ones too: their names stay on what they recorded (decision #23). Sign-in emails are the Owner's to see,
  // and who was deactivated is staff business: parents get names, roles and licences only.
  http.get(url("/staff"), async ({ request }) => {
    await delay(100);
    const { role, roles } = sessionOf(request)!;
    const owner = rolesCan(roles, "clinic.manage");
    const staffSide = isStaffRole(role);
    return HttpResponse.json(
      db.staff.map(({ email, deactivatedAt, ...s }) => ({ ...s, ...(owner && email ? { email } : {}), ...(staffSide && deactivatedAt ? { deactivatedAt } : {}) })),
    );
  }),

  // Decision #21: the login, with a temporary password and PIN returned this once. The limit is checked first, so a
  // full account says so whatever was typed.
  http.post(url("/staff"), async ({ request }) => {
    const full = atLimit("staffLogins");
    if (full) return full;
    const parsed = AddStaffInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { email, alsoRoles, licenseNo, ...input } = parsed.data;
    if (emailTaken(db, email)) return refuse(409, `${email} already signs in to ${currentAccount().name}`);
    if (!input.branchIds.every((id) => findBranch(id) && !findBranch(id)!.archived)) return refuse(400, "Choose branches that are open");
    const second = alsoRoles?.filter((r) => r !== input.role);
    const staff: StaffMember = {
      ...input,
      id: `staff_${crypto.randomUUID()}`,
      clinicId: currentClinicId(),
      email,
      ...(second?.length ? { alsoRoles: second } : {}),
      ...(licenseNo ? { licenseNo } : {}),
    };
    const result: AddStaffResult = { staff, temporaryPassword: temporaryPassword(), pin: newPin() };
    db.staff.push(staff);
    db.staffCredentials.push({ clinicId: staff.clinicId, staffId: staff.id, password: result.temporaryPassword, mustChange: true });
    db.staffPins.push({ clinicId: staff.clinicId, staffId: staff.id, pin: result.pin, failedAt: [] });
    persist();
    return HttpResponse.json(result, { status: 201 });
  }),

  // Decision #23: no sign-in from now on (their live session ends on its next request), name kept. Never the Owner
  // (#13: only the operator transfers ownership) and never yourself.
  http.post(url("/staff/:id/deactivate"), async ({ params, request }) => {
    const staff = findStaff(params.id);
    if (!staff) return refuse(404, "Staff member not found");
    if (staff.isOwner) return refuse(400, "The Owner's login can't be deactivated. Contact Primolar to transfer ownership first.");
    if (staff.id === sessionOf(request)!.staffId) return refuse(400, "You can't deactivate your own login");
    staff.deactivatedAt ??= new Date().toISOString();
    persist();
    return HttpResponse.json(staff);
  }),

  http.post(url("/staff/:id/reactivate"), async ({ params }) => {
    const staff = findStaff(params.id);
    if (!staff) return refuse(404, "Staff member not found");
    if (!staff.deactivatedAt) return HttpResponse.json(staff);
    const email = staffEmail(staff);
    if (emailTaken(db, email, staff.id)) return refuse(409, `${email} is now another login's email. Reactivating would give two logins one email.`);
    const full = atLimit("staffLogins");
    if (full) return full;
    delete staff.deactivatedAt;
    persist();
    return HttpResponse.json(staff);
  }),

  http.get(url("/chairs"), async () => {
    await delay(100);
    return HttpResponse.json(db.chairs);
  }),

  http.get(url("/procedures"), async () => {
    await delay(100);
    return HttpResponse.json(db.procedures);
  }),
];
