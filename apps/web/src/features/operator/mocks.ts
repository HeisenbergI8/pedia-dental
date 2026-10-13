import { http, HttpResponse } from "msw";
import {
  ChangeTierInput,
  CreateAccountInput,
  DEFAULT_BRAND_COLOR,
  DEFAULT_OPENING_HOURS,
  OperatorLoginInput,
  TransferOwnershipInput,
  accountUsage,
  isActiveStaff,
  rolesOf,
  transferProblem,
  type AccountOverview,
  type AccountStatus,
  type Branch,
  type ClinicAccount,
  type CreateAccountResult,
  type OperatorSession,
  type OwnerCandidate,
  type StaffMember,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { operatorOf } from "@/mocks/access";
import { accountById, emptyDb, persist, platform } from "@/mocks/db";
import { newPin, staffEmail, temporaryPassword } from "@/mocks/demo-accounts";
import { defaultMessageTemplates } from "@/mocks/message-templates";
import { NOTE_TEMPLATES } from "@/mocks/note-templates";
import { PROCEDURES } from "@/mocks/seed";
import { OPERATORS, operatorPasswordOpens, operatorToken } from "@/mocks/operator";

const url = (p: string) => `${env.apiUrl}${p}`;
const refuse = (status: 400 | 401 | 404 | 409, message: string) => new HttpResponse(message, { status });

/**
 * One account's row for the console: counts only, never a record (decision #25). Reads the tenant straight from
 * `platform`. This file never touches the per-request tenant binding or the clinic session: the operator is in no
 * tenant, and mocks/operator.test.ts fails if that changes.
 */
export function overviewOf(clinicId: string): AccountOverview {
  const { id, name, contactEmail, tier, status } = accountById(clinicId)!;
  const tenant = platform.tenants[clinicId]!;
  const owner = tenant.staff.find((s) => s.isOwner);
  const { branches, staffLogins } = accountUsage(tenant);
  return {
    account: { id, name, contactEmail, tier, status },
    owner: owner ? { staffId: owner.id, name: owner.fullName, email: staffEmail(owner) } : null,
    usage: { branches, staffLogins, patients: tenant.patients.length },
  };
}

/**
 * The account and its data, or undefined. One lookup for every route: an id is only ever matched against the account
 * list, so a key like `__proto__` is "not found" rather than an object off the prototype chain.
 */
function findAccount(id: unknown) {
  const account = typeof id === "string" ? accountById(id) : undefined;
  return account && Object.hasOwn(platform.tenants, account.id) ? { account, tenant: platform.tenants[account.id]! } : undefined;
}
const notFound = () => refuse(404, "Clinic account not found");
/** "Bulilit  Smiles " and "bulilit smiles" are one clinic: spaces collapsed, case ignored (decision #63). */
const sameName = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Decisions #26, #41: suspended staff are refused at sign-in and on their very next request (the clinic gate reads
 * the status on every request); parents keep read-only access (#44). Nothing is deleted, so reactivating restores it all.
 */
function setStatus(id: unknown, status: AccountStatus) {
  const found = findAccount(id);
  if (!found) return notFound();
  const { account } = found;
  account.status = status;
  persist();
  return HttpResponse.json(overviewOf(account.id));
}

/** API contract for apps/api's OperatorController: Primolar's console, outside every clinic account. */
export const operatorHandlers = [
  // One message for a wrong password and an unknown email, as the clinic sign-in.
  http.post(url("/operator/auth/login"), async ({ request }) => {
    const parsed = OperatorLoginInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const operator = OPERATORS.find((o) => o.email === parsed.data.email);
    if (!operator || !operatorPasswordOpens(parsed.data.password)) return refuse(401, "That email and password don't match a Primolar operator");
    const session: OperatorSession = { token: operatorToken(operator), operator };
    return HttpResponse.json(session);
  }),

  http.get(url("/operator/auth/me"), ({ request }) => {
    const operator = operatorOf(request);
    return operator ? HttpResponse.json(operator) : refuse(401, "Sign in to the Primolar console to continue");
  }),

  // Nothing to revoke: the token names the operator. NestJS clears its cookie here.
  http.post(url("/operator/auth/logout"), () => HttpResponse.json({})),

  // Every clinic account, by name (decision #25).
  http.get(url("/operator/accounts"), () =>
    HttpResponse.json([...platform.accounts].sort((a, b) => a.name.localeCompare(b.name)).map((a) => overviewOf(a.id))),
  ),

  /**
   * Decision #3: a new clinic account, its first branch and its Owner, who signs in with the temporary password shown
   * here once and must choose their own (decision #21). Starts with Primolar's brand colour, the default opening
   * hours, one chair and the standard price list and templates; the Owner changes all of it in Settings.
   */
  http.post(url("/operator/accounts"), async ({ request }) => {
    const parsed = CreateAccountInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { account: details, branch: place, owner: person } = parsed.data;
    // A double-click or a repeat must not make two copies of one clinic.
    if (platform.accounts.some((a) => sameName(a.name, details.name))) {
      return refuse(409, `There is already a clinic account called ${details.name}`);
    }
    const key = crypto.randomUUID().replaceAll("-", "").slice(0, 12); // no dots: tokens are demo.<clinicId>.<accountId>
    const clinicId = `clinic_${key}`;
    const account: ClinicAccount = { id: clinicId, ...details, status: "active", brandColor: DEFAULT_BRAND_COLOR };
    const branch: Branch = { clinicId, id: `branch_${key}`, ...place, openingHours: DEFAULT_OPENING_HOURS, archived: false };
    const owner: StaffMember = { clinicId, id: `staff_${key}`, fullName: person.fullName, email: person.email, role: person.role, isOwner: true, branchIds: [branch.id] };
    const password = temporaryPassword();
    const pin = newPin();
    platform.accounts.push(account);
    platform.tenants[clinicId] = {
      ...emptyDb(),
      branches: [branch],
      staff: [owner],
      chairs: [{ id: `chair_${key}_1`, clinicId, branchId: branch.id, name: "Chair 1" }],
      procedures: PROCEDURES.map((p) => ({ ...p, clinicId })),
      noteTemplates: NOTE_TEMPLATES,
      messageTemplates: defaultMessageTemplates(clinicId, new Date().toISOString()),
      staffPins: [{ clinicId, staffId: owner.id, pin, failedAt: [] }],
      staffCredentials: [{ clinicId, staffId: owner.id, password, mustChange: true }],
    };
    persist();
    const result: CreateAccountResult = { overview: overviewOf(clinicId), temporaryPassword: password, pin };
    return HttpResponse.json(result, { status: 201 });
  }),

  // Decisions #4, #9: set by hand; a downgrade disables nothing. Branches and logins over the new limit stay usable,
  // and canAddUnder refuses only the next addition. A Big account's heading font stays (#50).
  http.put(url("/operator/accounts/:id/tier"), async ({ params, request }) => {
    const found = findAccount(params.id);
    if (!found) return notFound();
    const { account } = found;
    const parsed = ChangeTierInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    account.tier = parsed.data.tier;
    persist();
    return HttpResponse.json(overviewOf(account.id));
  }),

  http.post(url("/operator/accounts/:id/suspend"), ({ params }) => setStatus(params.id, "suspended")),
  http.post(url("/operator/accounts/:id/reactivate"), ({ params }) => setStatus(params.id, "active")),

  // Who ownership may go to (decision #13): the account's active staff logins, the Owner left out. Names, emails and
  // roles: staff details, never patient data (#25).
  http.get(url("/operator/accounts/:id/staff"), ({ params }) => {
    const found = findAccount(params.id);
    if (!found) return notFound();
    const candidates: OwnerCandidate[] = found.tenant.staff
      .filter((s) => isActiveStaff(s) && !s.isOwner)
      .map((s) => ({ staffId: s.id, name: s.fullName, email: staffEmail(s), roles: rolesOf(s) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return HttpResponse.json(candidates);
  }),

  /**
   * Decision #13: only the operator moves ownership, only to an active staff login of the same account. The old Owner
   * keeps their job role, any second role and their branches; they lose only `isOwner` (and with it branches.all and
   * clinic.manage, from ROLE_PERMISSIONS). Seats are unchanged: both were already logins (#37). Live sessions pick up
   * the new roles on their next request: the clinic gate rebuilds roles from the staff record every time.
   * One exception to keeping their branches (#62): an Owner works everywhere, so their recorded branches may all be
   * archived by now. Then they get every open branch, so they still have somewhere to work rather than no screen at all.
   */
  http.post(url("/operator/accounts/:id/owner"), async ({ params, request }) => {
    const found = findAccount(params.id);
    if (!found) return notFound();
    const { account, tenant } = found;
    const parsed = TransferOwnershipInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const problem = transferProblem(tenant.staff, parsed.data.staffId);
    if (problem) return refuse(400, problem);
    const from = tenant.staff.find((s) => s.isOwner);
    if (from) {
      delete from.isOwner;
      const open = tenant.branches.filter((b) => !b.archived).map((b) => b.id);
      if (!from.branchIds.some((id) => open.includes(id))) from.branchIds = open;
    }
    tenant.staff.find((s) => s.id === parsed.data.staffId)!.isOwner = true;
    persist();
    return HttpResponse.json(overviewOf(account.id));
  }),
];
