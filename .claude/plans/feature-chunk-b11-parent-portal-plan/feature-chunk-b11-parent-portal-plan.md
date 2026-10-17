# Plan: Chunk B11: parent portal and real parent accounts

## 1. Plan Overview

- **Plan Type:** feature
- **Description:** Parents stop being "every guardian signs in with pass123" and become real accounts. Front desk, the
  Owner and admins invite a guardian from the child's Overview (decisions 2, 16, 17); the invite is an SMS through the
  B9 queue (decision 3), sent at any hour and even when the family declined reminders (12, 20), carrying a single-use
  link valid 72 hours that a resend cancels (5). The parent opens it, chooses a password with the staff rules (8),
  acknowledges the clinic's privacy notice (22) and lands in the portal. They sign in with their mobile number or email
  in one box (4), reset a forgotten password with a 30-minute SMS link, at most 3 texts per number per hour, without
  the screen ever saying whether an account exists (6, 19), and change it inside the portal (7). Staff can turn one
  guardian's access off (18); a number change ends the parent's sessions (15); a guardian removed from a child loses
  that child at once (10). Every portal route a parent can call is owner-checked and proven 403 for another family's
  child, in the mock and against MySQL. The mock (MSW) changes first, as the spec; then the web; then the API; then
  the cut-over (`API_ROUTES`, `e2e/api-portal.spec.ts`, both CONVENTIONS, CHUNKS ✅).
- **Date:** 2026-10-17

### Starting state

Branch `feature/b11-parent-portal`, B1–B10 merged, `decisions.md` settled (22 decisions). Verified in code
(references in `references/`):

- Sign-in is `POST /auth/login` with `LoginInput { email, password, clinicId? }` (`packages/shared/src/schemas/auth.ts:73-78`);
  the mock matches `accountsByEmail` (`apps/web/src/features/auth/mocks.ts:47-80`), the API `IdentityService.loginsByEmail`
  (`apps/api/src/auth/identity.service.ts:166-184`). Several clinics → `{ choices }` (#27).
- Every guardian on any patient is a login `guardian.<guardianId>` on the demo password, with a **generated** email
  (`handle@parent.demo`, `parent@gmail.com` for the sibling family), never `Guardian.email`
  (`packages/seed/src/logins.ts:72-86`). The API seed writes one `Credential` per `allAccounts` row
  (`apps/api/src/seed/seed-database.ts:67-80`). Nothing else creates a parent credential.
- `POST /auth/password` is staff-only in both (`auth/mocks.ts:101-119`, `auth.service.ts:230-243`). The parent's notice
  step exists (`IdentityService.pendingAcknowledgement`, `mocks/privacy.ts`).
- Ownership: the mock's `refusal` (`mocks/access.ts:341-350`), the API's `clinicRefusal` (`access-rules.ts:196-203`) and
  `RecordOwners` (`record-owners.ts`). Parent-reachable `record` routes are `/appointments/:id/status` and
  `/photos/:id/file`, both registered (`appointments.service.ts:51`, `photos.service.ts:49`).
- Every portal **read** already passes through in `hybrid` (`mocks/passthrough.ts:12-125`).
- `Message` is the B9 log, one row per child (`patientId` required), written only by `MessageQueueService`; its `queue`
  drops a family that declined reminders and defers to 8 AM (`message-queue.service.ts:31-52`); the send handler defers
  outside hours before it reads the row (`message-send.handler.ts:161-165`). `MessageKind` is also the template key
  (`Record<MessageKind, …>` in `packages/seed/src/message-templates.ts:4`).
- Rate limits: fixed windows in `RateLimitCounter`, `RATE_LIMITS = { login, auth }` per address (`rate-limit.ts:294-297`).
- Mock db key `pedia-dental:mock-db:v29` (`mocks/db.ts:10`).

### Sub-chunks (each phase ends with `pnpm run check` green; from Phase 5 on also `pnpm --filter api test:int`)

| Sub-chunk | Phases | What it delivers |
| --- | --- | --- |
| **B11a** Contract, seed and the mock | 1–3 | Shared schemas and rules, `portal.manage`, sign-in by mobile or email; seeded portal accounts; the MSW routes (the spec) |
| **B11b** Web | 4 | Portal status, Invite / Resend / Turn off on the Overview; set-password, forgot-password and the portal's change password |
| **B11c** API | 5–8 | Tables and migration; sign-in by mobile; the portal module, links minted at send time; number changes, ownership proofs |
| **B11d** Cut-over | 9 | `API_ROUTES`, `e2e/api-portal.spec.ts`, both CONVENTIONS, CHUNKS ✅ |

### Product decisions (settled in `decisions.md`, 2026-10-17; not re-asked)

1 any guardian with a mobile, once invited · 2 staff click "Invite to portal" on the Overview; registering sends
nothing · 3 SMS only, B9 queue · 4 mobile or email in one box · 5 single use, 72 h, a resend cancels the older link ·
6 SMS reset link, 30 min, single use · 7 change password in the portal · 8 staff password rules · 9 one account per
clinic, the chooser · 10 removed from a child = that child gone at once; the account stays while other children
remain · 11 suspended clinic: parents read-only · 12 invites and resets at any hour · 13 seeded parents keep pass123 in
dev and tests · 14 one mobile (or email) = one sign-in per clinic; a second guardian's invite with the same number is
refused; a shared email → that guardian signs in with their number · 15 number changed by staff: sign-in follows, the
parent's sessions end · 16 front desk, Owner, admin invite · 17 Overview shows Not invited / Invited on … / Active,
with Resend · 18 Turn off one guardian (signs them out; can be invited again) · 19 the reset screen never reveals an
account; ≤ 3 reset texts per number per hour · 20 invites go even when reminders were declined · 21 invite and reset
texts count in SMS usage · 22 after the password, the privacy notice, then the portal.

### Engineering decisions (recorded; open ones are in Follow Ups → Questions)

- **E1. The contract.** Staff: `GET /patients/:id/portal-access` → `PortalAccess[]` (one per guardian of the child);
  `POST /patients/:id/guardians/:guardianId/portal-invite` (invite or resend) and `…/portal-off` → `PortalAccess`, both
  200. Signed out, under `/auth/*` (self-checked, rate-limited like the rest of `/auth`): `POST /auth/password-link`
  `{ token }` → `PasswordLink` (what the link is for, 410 when unusable); `POST /auth/password-link/accept`
  `{ token, password }` → `Session` (signed in, `mustAcknowledge: "notice"` on a first sign-in); `POST /auth/password-reset`
  `{ login }` → 202 `{}` whatever happened (decision 19), 429 past 3 per number per hour; `GET /auth/demo-texts` (demo
  deployments only, as `/auth/demo-accounts`). `POST /auth/password` now serves parents (decision 7). Tokens travel in
  bodies, never paths (B4: paths are logged); the SMS link carries the token in the URL **fragment**
  (`/set-password#t=…`), which no server or proxy log sees.
- **E2. A new permission, `portal.manage`** (decision 16): front desk explicitly; the Owner and admins through
  `STAFF_PERMISSIONS`; never dentists or parents. "Those who edit a family's contact details" is `patients.contact`, but
  a parent holds that at `own`, and the root CONVENTIONS rule is a new `Permission`, never a role check.
- **E3. Sign-in takes a mobile number or an email in the existing `email` field.** `LoginId` normalises a Philippine
  mobile to `smsNumber` (`639XXXXXXXXX`) and an email to lowercase, so the mock, the web form and the API compare one
  form. The wire key stays `email` (22 call sites, B2's contract); Questions 1 proposes the rename.
- **E4. Account texts go through the B9 log, not a second table** (decisions 3, 21). `LoggedMessageKind` =
  `MessageKind` + `portal_invite`, `password_reset`: the log, `sentIn` and the web's labels see them, while templates
  stay `MessageKind` only (fixed wording in `accountText`, never Owner-editable: an edit could drop the link).
  `MessageQueueService.queueAccountText` writes them: no consent check (20), `sendAt` now (12), the guardian's own
  number (not the primary's), the stored body with the link as `[link]`. `hasNoContact` and `lastTried` ignore them, so
  a failed invite to a second guardian never flags the child "no contact".
- **E5. The link's token is made when the text is sent, and never stored (new pattern, flagged).** A `PortalLink` row
  is created with the invite or reset, without a token. The send handler, inside its exactly-once claim (B9 E3), asks
  the `AccountLinks` registry to mint: the portal module locks the link, refuses a used, cancelled or expired one,
  draws 24 random bytes, stores only their SHA-256 (`tokenHash`, unique) and returns the URL; the handler swaps it for
  `[link]` and sends. The real body exists only in memory between the claim and the provider. A definite failure
  releases the claim and the retry mints a new token, so only the last text's link works. Why not a token made at
  request time: it would have to sit somewhere (the body, the outbox payload, or an encryption key in env) until the
  worker sends; this way the database never holds a usable link and no new secret exists. `AccountLinks` follows
  `RecordOwners` / `OutboxHandlers`: the owner registers a callback, so `MessageQueueModule` stays a leaf.
- **E6. Demo and e2e see links only on demo deployments.** With `DEMO_LOGINS=true` the minter also keeps the token in
  `PortalLink.demoToken`, and `GET /auth/demo-texts` lists the live ones (anyone can sign in as anyone there anyway).
  The mock keeps tokens as typed (the prototype's deferral) and serves the same route; the sign-in page lists them under
  "Demo texts" in `enabled` and `hybrid`. Elsewhere the route is a 404 and `demoToken` stays null.
- **E7. State per guardian per clinic: `PortalAccount { state: invited | active | off, invitedAt, invitedBy,
  activatedAt, turnedOffAt }`.** No row = not invited. `active` means a parent `Credential` exists; turning off deletes
  it (and the sessions), so a re-invite starts clean (decision 18).
- **E8. One number, one sign-in, under the clinic's lock** (decision 14). Invite and accept take `lockAccount(tx)` first
  (B3's rule for checks before a write), then count active logins (`Credential.phone`) and live invites for that
  number; `@@unique([clinicId, phone])` on `Credential` is the backstop (409 on P2002). A shared email isn't refused:
  that guardian's login simply gets no email (`email` null).
- **E9. Lock order: `Message` → `PortalLink`.** The handler holds its `Message` row when it mints. A resend or turn-off
  therefore withdraws the old texts first, then cancels the old links (both under the clinic's lock). Accept takes
  account → link.
- **E10. Sessions end after the commit** (`SessionService.closeAllFor`), as `changePassword` does: on turn-off, reset
  and a number change (decision 15). Separately, a guardian with no children left gets no identity
  (`IdentityService.forSession` → undefined, so the guard closes the session): decision 10 holds with no write.
- **E11. The mock can't end a session** (its token is the account id, a recorded deferral); turning off removes the
  account from `allAccounts`, which ends it in effect. Number changes don't sign a demo parent out.
- **E12. Ownership is proven by sweeping the route map, not by a hand list.** Unit: every `CLINIC_RULES` entry whose
  permission a parent holds at `own` has an owner, and every such `record` rule has a registered lookup. Integration:
  each of those routes, called by a seeded parent with another family's child (or that child's record), answers 403
  "This isn't one of your children's records"; with their own, never 403. The mock gets the same sweep.

## 2. Comprehensive Plan by Phases

## B11a: Contract, seed and the mock

### Phase 1: The shared contract

#### Step 1.1: Portal rules in `@pedia/shared`

**File:** `packages/shared/src/domain/portal.ts` (new), `packages/shared/src/domain/portal.test.ts` (new), `packages/shared/src/index.ts`
**Verify:** `pnpm run check -- domain/portal`

Adds `loginIdOf`, `maskedNumber`, `accountText` and the link lifetimes as data. The schemas that use them follow in
Step 1.2 (they need `LoginId` and `NewPassword`).

```ts
// packages/shared/src/domain/portal.ts (new)
import { smsNumber } from "./sending";

/** Decisions 5 and 6: how long a link works, from when it was made. Data, not `if` statements. */
export const PORTAL_LINK_LIFETIME_MS = { invite: 72 * 60 * 60_000, reset: 30 * 60_000 } as const;
export type PortalLinkPurpose = keyof typeof PORTAL_LINK_LIFETIME_MS;
/** Decision 19: reset texts per number (or email) per hour. */
export const RESET_TEXTS_PER_HOUR = 3;
/** Where the link sits in a logged account text. The real link is put in only by the sender (B11 E5). */
export const LINK_MARK = "[link]";
/** The web page a link opens; the token rides in the fragment, which no server log sees (E1). */
export const SET_PASSWORD_PATH = "/set-password";
export const linkPath = (token: string) => `${SET_PASSWORD_PATH}#t=${token}`;

/**
 * What a sign-in box holds, in the one form every side compares (decision 4, E3): a Philippine mobile as `smsNumber`
 * gives it (639XXXXXXXXX), an email lowercased. Undefined for anything else.
 */
export function loginIdOf(raw: string): { kind: "phone" | "email"; value: string } | undefined {
  const s = raw.trim();
  if (s.includes("@")) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? { kind: "email", value: s.toLowerCase() } : undefined;
  const phone = smsNumber(s);
  return phone ? { kind: "phone", value: phone } : undefined;
}

/** "0917 ••• 4567": enough for a parent to recognise their number, too little to learn someone else's. */
export function maskedNumber(phone: string | undefined): string {
  const n = smsNumber(phone);
  return n ? `0${n.slice(2, 5)} ••• ${n.slice(-4)}` : "your number";
}

/** Account texts aren't clinic templates (E4): fixed words, the link last so a split text keeps it whole. */
export function accountText(purpose: PortalLinkPurpose, v: { clinicName: string; childName?: string }, link = LINK_MARK): string {
  return purpose === "invite"
    ? `${v.clinicName}: You're invited to the parent portal${v.childName ? ` for ${v.childName}` : ""}. Set your password within 72 hours: ${link}`
    : `${v.clinicName}: Reset your parent portal password within 30 minutes: ${link} Didn't ask? Ignore this text.`;
}

export const ACCOUNT_TEXT_KINDS = ["portal_invite", "password_reset"] as const;
export const isAccountText = (kind: string | undefined) => (ACCOUNT_TEXT_KINDS as readonly string[]).includes(kind ?? "");
```

```ts
// packages/shared/src/domain/portal.test.ts (new)
import { describe, expect, it } from "vitest";
import { LINK_MARK, PORTAL_LINK_LIFETIME_MS, accountText, isAccountText, linkPath, loginIdOf, maskedNumber } from "./portal";
import { smsSegments } from "./sending";

describe("loginIdOf (decision 4)", () => {
  it("reads every way a parent types a mobile as one number, and an email in lowercase", () => {
    for (const typed of ["0917 123 4567", "09171234567", "+63 917-123-4567", "639171234567", "9171234567"]) {
      expect(loginIdOf(typed), typed).toEqual({ kind: "phone", value: "639171234567" });
    }
    expect(loginIdOf("  Rosa@Example.COM ")).toEqual({ kind: "email", value: "rosa@example.com" });
  });
  it("refuses a landline, a short number and a broken email", () => {
    for (const typed of ["(046) 471 2580", "0917123", "rosa@", "rosa", ""]) expect(loginIdOf(typed), typed).toBeUndefined();
  });
});

describe("account texts (E4)", () => {
  it("masks a number to its prefix and last four", () => {
    expect(maskedNumber("0917 123 4567")).toBe("0917 ••• 4567");
    expect(maskedNumber("not a mobile")).toBe("your number");
  });
  it("keeps the link last, and an invite with a long clinic name to two texts", () => {
    const body = accountText("invite", { clinicName: "Kiddie Smiles Pediatric Dental Clinic", childName: "Bea" }, `https://app.primolar.ph${linkPath("x".repeat(32))}`);
    expect(body.endsWith(`#t=${"x".repeat(32)}`)).toBe(true);
    expect(smsSegments(body)).toBeLessThanOrEqual(2);
    expect(accountText("reset", { clinicName: "Ngiti" })).toContain(LINK_MARK);
  });
  it("lasts 72 hours for an invite and 30 minutes for a reset (decisions 5, 6)", () => {
    expect(PORTAL_LINK_LIFETIME_MS).toEqual({ invite: 259_200_000, reset: 1_800_000 });
  });
  it("tells account texts from parent messages", () => {
    expect([isAccountText("portal_invite"), isAccountText("password_reset"), isAccountText("recall")]).toEqual([true, true, false]);
  });
});
```

In `index.ts`, add `export * from "./domain/portal";` after `./domain/legal`.

#### Step 1.2: Sign-in by mobile or email, one password rule, and the portal schemas

**File:** `packages/shared/src/schemas/auth.ts`, `packages/shared/src/schemas/portal.ts` (new), `packages/shared/src/schemas/auth.test.ts` (new), `packages/shared/src/index.ts`
**Verify:** `pnpm run check -- schemas/auth`

`LoginInput.email` becomes `LoginId`; `NewPassword` is the staff rule, shared by change, set and reset.

```diff
// packages/shared/src/schemas/auth.ts
 import { z } from "zod";
 import { ClinicScoped, Id, IsoDateTime, Role } from "./common";
 import { AcknowledgementKind } from "./legal";
+import { loginIdOf } from "../domain/portal";
@@
+/**
+ * A sign-in box (decision 4): a Philippine mobile or an email, normalised by `loginIdOf` so the mock, the form and the
+ * API compare one form. Parsing it twice gives the same value (the web sends the parsed form).
+ */
+export const LoginId = z
+  .string()
+  .trim()
+  .min(1, "Enter your mobile number or email")
+  .transform((s, ctx) => {
+    const id = loginIdOf(s);
+    if (id) return id.value;
+    ctx.addIssue({ code: "custom", message: "Enter a mobile number like 0917 123 4567, or an email address" });
+    return z.NEVER;
+  });
+
+/** Decision 8: every password a person chooses follows the staff rule (B2). */
+export const NewPassword = z.string().min(8, "Use at least 8 characters");
+
 export const LoginInput = z.object({
-  email: z.string().trim().toLowerCase().email("Enter your email address, like name@example.com"),
+  // Still called `email` on the wire (B2's contract, E3): it carries an email or a mobile number (B11).
+  email: LoginId,
   password: z.string().min(1, "Enter your password"),
   clinicId: Id.optional(), // sent on the second step, once the person has picked a clinic
 });
@@
 export const ChangePasswordInput = z
   .object({
     current: z.string().min(1, "Enter your current password"),
-    next: z.string().min(8, "Use at least 8 characters"),
+    next: NewPassword,
   })
-  .refine((p) => p.next !== p.current, { message: "Choose a password different from the temporary one", path: ["next"] });
+  // Parents use it too since B11 (decision 7), so the words no longer assume a temporary password.
+  .refine((p) => p.next !== p.current, { message: "Choose a new password, not the one you use now", path: ["next"] });
```

`domain/portal.ts` imports only `./sending`, so `schemas/auth.ts → domain/portal` adds no cycle (`schemas/portal.ts`
imports `./auth`, not the other way round). Grep the old refine message (`grep -rn "different from the temporary one"
apps packages`) and update every assertion that quotes it.

```ts
// packages/shared/src/schemas/portal.ts (new)
import { z } from "zod";
import { ClinicScoped, Id, IsoDateTime } from "./common";
import { LoginId, NewPassword } from "./auth";

/** No row = not_invited. `off`: staff turned it off; they can invite again (decision 18). */
export const PortalState = z.enum(["not_invited", "invited", "active", "off"]);
export type PortalState = z.infer<typeof PortalState>;

/** One guardian's portal access on GET /patients/:id/portal-access (decision 17). Staff with portal.manage only. */
export const PortalAccess = z.object({
  guardianId: Id,
  state: PortalState,
  invitedAt: IsoDateTime.optional(), // the latest invite
  inviteExpiresAt: IsoDateTime.optional(), // invited only: past it, the card says "Invite expired" and offers Resend
  activatedAt: IsoDateTime.optional(),
  turnedOffAt: IsoDateTime.optional(),
  /** Why Invite can't work now, in staff words ("Add a mobile number…", "0917 ••• 4567 already signs in as …"). */
  blocked: z.string().optional(),
});
export type PortalAccess = z.infer<typeof PortalAccess>;

/** The token from the link's fragment: 24 random bytes, base64url (32 characters). */
const Token = z.string().regex(/^[\w-]{32}$/, "This link isn't complete. Open it again from the text.");
export const PasswordLinkInput = z.object({ token: Token });
export type PasswordLinkInput = z.infer<typeof PasswordLinkInput>;

/** POST /auth/password-link: what a working link is for. Nothing about the family beyond the parent's own name. */
export const PasswordLink = z.object({
  purpose: z.enum(["invite", "reset"]),
  name: z.string(), // the guardian's full name
  clinicName: z.string(),
  login: z.string(), // maskedNumber: how they will sign in
});
export type PasswordLink = z.infer<typeof PasswordLink>;

export const SetPasswordInput = PasswordLinkInput.extend({ password: NewPassword });
export type SetPasswordInput = z.infer<typeof SetPasswordInput>;

/** POST /auth/password-reset (decision 19): the answer is the same whether or not an account exists. */
export const PasswordResetInput = z.object({ login: LoginId });
export type PasswordResetInput = z.infer<typeof PasswordResetInput>;

/**
 * The mock's stored record per guardian (E7), like StaffCredential: never served. `email` is the sign-in email chosen
 * when the account opened (the guardian's, when no other login has it; a seeded parent's demo address). The mobile
 * sign-in is read live from the guardian, so it follows a number change (decision 15). The prototype keeps the password
 * and the link tokens as typed (CONVENTIONS → deferrals); the API keeps an argon2id hash and only a token's SHA-256.
 */
export const PortalLinkRecord = z.object({
  token: z.string(),
  purpose: z.enum(["invite", "reset"]),
  createdAt: IsoDateTime,
  expiresAt: IsoDateTime,
  usedAt: IsoDateTime.optional(),
  cancelledAt: IsoDateTime.optional(),
});
export type PortalLinkRecord = z.infer<typeof PortalLinkRecord>;
export const PortalAccount = ClinicScoped.extend({
  guardianId: Id,
  state: PortalState.exclude(["not_invited"]),
  invitedAt: IsoDateTime.optional(),
  invitedBy: z.string().optional(),
  activatedAt: IsoDateTime.optional(),
  turnedOffAt: IsoDateTime.optional(),
  email: z.string().optional(),
  password: z.string().optional(), // none: a seeded parent, on the demo password (decision 13)
  links: z.array(PortalLinkRecord),
});
export type PortalAccount = z.infer<typeof PortalAccount>;

/** Prototype and demo deployments only (E6): the links the demo would have texted. Never served elsewhere. */
export const DemoTexts = z.object({
  texts: z.array(z.object({ name: z.string(), purpose: z.enum(["invite", "reset"]), link: z.string(), expiresAt: IsoDateTime })),
});
export type DemoTexts = z.infer<typeof DemoTexts>;
```

In `index.ts`, add `export * from "./schemas/portal";` after `./schemas/legal`.

```ts
// packages/shared/src/schemas/auth.test.ts (new)
import { describe, expect, it } from "vitest";
import { ChangePasswordInput, LoginInput } from "./auth";

describe("LoginInput (decision 4)", () => {
  it("takes a mobile in any common form, or an email, and gives the same value parsed again", () => {
    const once = LoginInput.parse({ email: "0917 123 4567", password: "x" });
    expect(once.email).toBe("639171234567");
    expect(LoginInput.parse(once).email).toBe("639171234567");
    expect(LoginInput.parse({ email: "Rosa@Example.com", password: "x" }).email).toBe("rosa@example.com");
  });
  it("says what to type when it is neither", () => {
    const r = LoginInput.safeParse({ email: "046 471 2580", password: "x" });
    expect(r.success ? "" : r.error.issues[0]!.message).toBe("Enter a mobile number like 0917 123 4567, or an email address");
  });
});

describe("ChangePasswordInput (decision 8)", () => {
  it("keeps the staff rule: 8 characters, and a different password", () => {
    expect(ChangePasswordInput.safeParse({ current: "pass1234", next: "short" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ current: "pass1234", next: "pass1234" }).success).toBe(false);
    expect(ChangePasswordInput.safeParse({ current: "pass1234", next: "new-pass-1" }).success).toBe(true);
  });
});
```

#### Step 1.3: `portal.manage`, logged kinds, and "no contact" ignoring account texts

**File:** `packages/shared/src/schemas/auth.ts`, `packages/shared/src/domain/permissions.ts`, `packages/shared/src/domain/permissions.test.ts`, `packages/shared/src/schemas/message.ts`, `packages/shared/src/domain/patient-list.ts`, `packages/shared/src/domain/patient-list.test.ts`, `apps/web/src/features/messages/api.ts`
**Verify:** `pnpm run check -- domain/permissions`

The permission (E2), `LoggedMessageKind` on `Message.kind` (E4), and `hasNoContact` skipping account texts.

```diff
// packages/shared/src/schemas/auth.ts (Permission)
   "consents.manage", // privacy #15 (P16): switch a child's optional consents (photos, reminders). A parent: their own
+  "portal.manage", // B11 decision 16: invite a guardian to the portal, resend, turn off. Front desk, the Owner, admins
 ]);
```

```diff
// packages/shared/src/domain/permissions.ts (front_desk's grant; the Owner and admins get it through STAFF_PERMISSIONS)
     "documents.issue",
     "clinic.view",
     "settings.view",
     "session.switch",
+    "portal.manage", // decision 16: they edit a family's contact details
   ),
```

Check `dentist`'s explicit list does **not** gain it.

```diff
// packages/shared/src/domain/permissions.test.ts (new case after "shows today at a glance…")
+  it("lets front desk, the Owner and admins invite parents to the portal, never a dentist or a parent (B11 decision 16)", () => {
+    expect(Role.options.filter((r) => roleCan(r, "portal.manage"))).toEqual(["owner", "admin", "front_desk"]);
+  });
```

```diff
// packages/shared/src/schemas/message.ts
 export type MessageKind = z.infer<typeof MessageKind>;
 
+/**
+ * What the log holds: the parent messages above (each a template) and the account texts (B11 E4), whose words are fixed
+ * (`accountText`) and never a template.
+ */
+export const LoggedMessageKind = z.enum([...MessageKind.options, "portal_invite", "password_reset"]);
+export type LoggedMessageKind = z.infer<typeof LoggedMessageKind>;
@@
 export const Message = ClinicScoped.extend({
   id: Id,
   patientId: Id,
-  kind: MessageKind,
+  kind: LoggedMessageKind,
   channel: MessageChannel,
-  to: z.string(), // the primary guardian's phone
+  to: z.string(), // the primary guardian's phone; an account text's own guardian (B11)
```

Add `satisfies readonly LoggedMessageKind[]` to `ACCOUNT_TEXT_KINDS` in `domain/portal.ts` only if it imports the type
without a cycle (`import type` from `../schemas/message` is safe); otherwise leave the test in Step 1.1 as the guard.

```diff
// packages/shared/src/domain/patient-list.ts
-export function hasNoContact(patientId: string, messages: Pick<Message, "patientId" | "status" | "sendAt">[]): boolean {
+/** An account text (an invite, a reset: B11) goes to one guardian about their login, so it never decides "no contact". */
+export function hasNoContact(patientId: string, messages: (Pick<Message, "patientId" | "status" | "sendAt"> & { kind?: Message["kind"] })[]): boolean {
   const tried = messages
-    .filter((m) => m.patientId === patientId && (m.status === "sent" || m.status === "failed"))
+    .filter((m) => m.patientId === patientId && !isAccountText(m.kind) && (m.status === "sent" || m.status === "failed"))
```

with `import { isAccountText } from "./portal";`. `kind` is optional so the API's `lastTried` rows (no `kind`, already
filtered in SQL from Step 7.1) still type-check.

```diff
// packages/shared/src/domain/patient-list.test.ts (inside the hasNoContact case)
+    // B11: a failed invite to a second guardian isn't the family going unreached.
+    expect(hasNoContact("p", [m("2026-09-05", "sent"), { ...m("2026-09-06", "failed"), kind: "portal_invite" as const }])).toBe(false);
```

```diff
// apps/web/src/features/messages/api.ts
-export const KIND_LABEL: Record<MessageKind, string> = {
+export const KIND_LABEL: Record<LoggedMessageKind, string> = {
@@
   birthday: "Birthday greeting",
+  portal_invite: "Portal invitation",
+  password_reset: "Password reset link",
 };
```

(import `LoggedMessageKind` instead of `MessageKind` there if nothing else in the file uses the latter).

#### Phase 1 — Potential Issues

- `LoginId` changes `LoginInput`'s output only in form: an email still lowercases; a phone becomes `639…`. The API's
  `loginsByEmail(email)` keeps working for emails until Phase 6; a phone simply matches nothing until then.
- Widening `Message.kind` breaks any exhaustive `switch`/`Record<MessageKind>` over a **message's** kind: only
  `KIND_LABEL` (`grep -rn "Record<MessageKind" apps packages` → it and the seed's templates, which stay `MessageKind`).
  The API's `toMessage` returns Prisma's `MessageKind`, a subset: assignable.
- A new `Permission` changes `Permission.options`: any snapshot of the matrix fails loudly; update it deliberately.
- New pattern: none (schemas plus pure rules, as every chunk).

**Issues identified:** the refine message change touches the staff first-sign-in screen's wording (intended).

### Phase 2: Seeded portal accounts (`@pedia/seed`, the mock db key)

#### Step 2.1: `Db.portalAccounts`, seeded active parents, sign-in lookups by mobile or email

**File:** `packages/seed/src/platform.ts`, `packages/seed/src/logins.ts`, `packages/seed/src/seed.ts`, `packages/seed/src/seed-ngiti.ts`, `packages/seed/src/seed-ipin.ts`, `packages/seed/src/seed.test.ts`, `apps/web/src/mocks/db.ts`, `apps/web/src/mocks/demo-accounts.ts`
**Verify:** `pnpm run check -- seed.test`

Every seeded guardian gets an active account on the demo password (decision 13); parents are logins only while active.

```diff
// packages/seed/src/platform.ts
   acknowledgements: Acknowledgement[]; // privacy #20, #21: who read which notice or confidentiality version, when
+  portalAccounts: PortalAccount[]; // B11: each guardian's portal access; never served (a parent is a login only while active)
 };
@@ emptyDb
-  staffCredentials: [], privacyNotices: [], acknowledgements: [],
+  staffCredentials: [], privacyNotices: [], acknowledgements: [], portalAccounts: [],
 });
@@ seedPlatform
   const tenants = { [DEMO_ACCOUNT.id]: seed(), [NGITI_ACCOUNT.id]: seedNgiti(), [IPIN_ACCOUNT.id]: seedIpin() };
+  // B11 decision 13: every seeded guardian already uses the portal, on the demo password. No faker: nothing re-rolls.
+  for (const db of Object.values(tenants)) db.portalAccounts = seedPortalAccounts(db);
   const subscriptions = seedSubscriptions();
```

Import `PortalAccount` (type) from `@pedia/shared` and `seedPortalAccounts` from `./logins` (logins imports only types
from `./platform`: no runtime cycle). In `seed.ts:288`, `seed-ngiti.ts:105` and `seed-ipin.ts:70` add
`portalAccounts: [],` after `acknowledgements` (filled by `seedPlatform`).

```diff
// packages/seed/src/logins.ts
-import { Role, accountSummary, isActiveStaff, rolesOf, type Appointment, type DemoAccount, type Guardian, type OperatorUser, type Patient, type StaffMember, type StaffRole } from "@pedia/shared";
+import { Role, accountSummary, isActiveStaff, rolesOf, smsNumber, type Appointment, type DemoAccount, type Guardian, type OperatorUser, type Patient, type PortalAccount, type StaffMember, type StaffRole } from "@pedia/shared";
@@
-export type DemoAccountRecord = DemoAccount & { staffId?: string; guardianId?: string; roles: Role[] };
+/** `phone`: a parent's mobile sign-in (smsNumber form), when no other parent of the account signs in with it (decision 14). */
+export type DemoAccountRecord = DemoAccount & { staffId?: string; guardianId?: string; phone?: string; roles: Role[] };
@@
-const parentAccount = (db: Db, g: Guardian, summary: string): DemoAccountRecord => ({
+/** The address a seeded parent signs in with: parent@gmail.com for the sibling family, else a generated one. */
+const demoEmail = (db: Db, g: Guardian) => (g.id === loginFamily(db)?.id ? PARENT_LOGIN.email : `${handle(g.fullName)}@parent.demo`);
+export const portalAccountOf = (db: Db, guardianId: string | undefined) =>
+  guardianId ? db.portalAccounts.find((a) => a.guardianId === guardianId) : undefined;
+
+const parentAccount = (db: Db, g: Guardian, summary: string, phone?: string): DemoAccountRecord => ({
   id: `guardian.${g.id}`,
   role: "parent",
   name: g.fullName,
-  email: g.id === loginFamily(db)?.id ? PARENT_LOGIN.email : `${handle(g.fullName)}@parent.demo`,
+  email: portalAccountOf(db, g.id)?.email ?? "", // "": signs in with their number only (decision 14)
+  phone,
   summary,
   guardianId: g.id,
   roles: ["parent"],
 });
 
-/** Everyone who can sign in: active staff (decision #23) and every guardian on any patient. */
+/**
+ * Everyone who can sign in: active staff (decision #23) and, since B11, every guardian on a patient whose portal
+ * account is active. A guardian on no child any more isn't listed (decision 10). Their mobile is read live from the
+ * guardian (decision 15); a number another parent already signs in with goes to the first only (decision 14).
+ */
 export function allAccounts(db: Db): DemoAccountRecord[] {
   const guardians = new Map(db.patients.flatMap((p) => p.guardians).map((g) => [g.id, g]));
-  return [...db.staff.filter(isActiveStaff).map((s) => staffAccount(s)), ...[...guardians.values()].map((g) => parentAccount(db, g, ""))];
+  const taken = new Set<string>();
+  const parents = [...guardians.values()]
+    .filter((g) => portalAccountOf(db, g.id)?.state === "active")
+    .map((g) => {
+      const n = smsNumber(g.phone);
+      const phone = n && !taken.has(n) ? (taken.add(n), n) : undefined;
+      return parentAccount(db, g, "", phone);
+    });
+  return [...db.staff.filter(isActiveStaff).map((s) => staffAccount(s)), ...parents];
 }
@@
-/** Every login with this email, in every clinic account. Each account keeps its own logins (decision #27). */
-export const accountsByEmail = (platform: Platform, email: string): AccountMatch[] =>
+/** Every login with this email or mobile (LoginId's form), in every clinic account (decision #27; B11 decision 4). */
+export const accountsByLogin = (platform: Platform, login: string): AccountMatch[] =>
   platform.accounts.flatMap(({ id }) =>
-    allAccounts(platform.tenants[id]!).filter((a) => a.email === email).map((account) => ({ clinicId: id, account })),
+    allAccounts(platform.tenants[id]!).filter((a) => a.email === login || a.phone === login).map((account) => ({ clinicId: id, account })),
   );
+
+/**
+ * B11 decision 13: one active account per guardian, on the demo password, with today's generated demo address. Dated
+ * by the guardian's first child's registration, so it is the same on every load.
+ */
+export function seedPortalAccounts(db: Db): PortalAccount[] {
+  const firsts = new Map<string, { g: Guardian; at: string; clinicId: string }>();
+  for (const p of db.patients) for (const g of p.guardians) if (!firsts.has(g.id)) firsts.set(g.id, { g, at: p.createdAt, clinicId: p.clinicId });
+  return [...firsts.values()].map(({ g, at, clinicId }) => ({ clinicId, guardianId: g.id, state: "active", activatedAt: at, email: demoEmail(db, g), links: [] }));
+}
```

`demoLogins` calls `accountsByEmail(platform, email)`: rename to `accountsByLogin`. `grep -rn accountsByEmail apps packages`
finds the rest (`apps/web/src/mocks/demo-accounts.ts` re-export, `features/auth/mocks.ts`); rename each (Step 3.2 rewrites
the login handler anyway). `p.createdAt` exists on seeded patients (`seed.ts:132`); if a seed file's patients lack it,
use that seed's fixed date.

```diff
// apps/web/src/mocks/db.ts
 // v29: B10 seeds photos and issued documents (photo_seed_*, doc_seed_*).
-const KEY = "pedia-dental:mock-db:v29";
+// v30: B11: each Db gains `portalAccounts` (every seeded guardian active); parents sign in only while active.
+const KEY = "pedia-dental:mock-db:v30";
```

```diff
// apps/web/src/mocks/demo-accounts.ts
-export {
-  DEMO_PASSWORD, accountsByEmail, allAccounts, childrenOf, demoAccounts, demoLogins, handle, staffEmail,
+import { portalAccountOf } from "@pedia/seed";
+export {
+  DEMO_PASSWORD, accountsByLogin, allAccounts, childrenOf, demoAccounts, demoLogins, handle, portalAccountOf, staffEmail,
   type AccountMatch, type DemoAccountRecord,
 } from "@pedia/seed";
@@
-/** Does this password open this login? Its own password once it has one (an added or changed login), else the demo one. */
-export const passwordOpens = (db: Db, account: Pick<DemoAccountRecord, "staffId">, password: string) =>
-  (credentialOf(db, account.staffId)?.password ?? DEMO_PASSWORD) === password;
+/**
+ * Does this password open this login? Its own once it has one (a staff login the Owner added or that changed it; a
+ * parent who set one from a link, B11), else the demo password.
+ */
+export const passwordOpens = (db: Db, account: Pick<DemoAccountRecord, "staffId" | "guardianId">, password: string) =>
+  ((account.staffId ? credentialOf(db, account.staffId)?.password : portalAccountOf(db, account.guardianId)?.password) ?? DEMO_PASSWORD) === password;
```

(merge the `portalAccountOf` import into the file's existing `@pedia/seed` import line.)

```ts
// packages/seed/src/seed.test.ts (new describe at the end)
describe("portal accounts (B11)", () => {
  const platform = seedPlatform();
  it("gives every seeded guardian an active account on the demo password (decision 13)", () => {
    for (const db of Object.values(platform.tenants)) {
      const guardians = new Set(db.patients.flatMap((p) => p.guardians.map((g) => g.id)));
      expect(db.portalAccounts.map((a) => a.guardianId).sort()).toEqual([...guardians].sort());
      expect(db.portalAccounts.every((a) => a.state === "active" && !a.password && a.links.length === 0)).toBe(true);
    }
  });
  it("never gives two parents of one clinic the same mobile sign-in (decision 14)", () => {
    for (const db of Object.values(platform.tenants)) {
      const phones = allAccounts(db).flatMap((a) => (a.phone ? [a.phone] : []));
      expect(new Set(phones).size).toBe(phones.length);
    }
  });
  it("still signs the sibling family in as parent@gmail.com, and by their number", () => {
    const [byEmail] = accountsByLogin(platform, "parent@gmail.com");
    expect(byEmail?.account.role).toBe("parent");
    expect(accountsByLogin(platform, byEmail!.account.phone!).map((m) => m.account.id)).toContain(byEmail!.account.id);
  });
  it("drops a guardian whose access is off from the logins", () => {
    const db = structuredClone(platform.tenants[DEMO_CLINIC_ID]!);
    db.portalAccounts[0]!.state = "off";
    expect(allAccounts(db).some((a) => a.guardianId === db.portalAccounts[0]!.guardianId)).toBe(false);
  });
});
```

(import `accountsByLogin`, `allAccounts`, `DEMO_CLINIC_ID` if the test file doesn't already.)

#### Phase 2 — Potential Issues

- **API seed in this phase:** `seedDatabase` maps `allAccounts(db)` to `Credential` rows and its `email` (now `""` for a
  parent with none; every seeded parent has one) still compiles. The `phone` column arrives in Phase 5 (Step 5.2).
- **Phone collisions in the seed** are possible (`09` + 9 random digits): the first guardian keeps the sign-in, the
  test proves uniqueness, and nothing re-rolls (no faker call added).
- **Browser data:** the v30 key throws away every saved demo change (as each bump does).
- **`demoAccounts`'s picked parents** are active by construction (every seeded guardian is).

**Issues identified:** none beyond the rename's call sites.

### Phase 3: The mock (the spec)

#### Step 3.1: Staff routes: status, invite, resend, turn off

**File:** `apps/web/src/features/portal/mocks.ts` (new), `apps/web/src/mocks/handlers.ts`, `apps/web/src/mocks/access.ts`, `apps/web/src/mocks/portal.test.ts` (new)
**Verify:** `pnpm run check -- mocks/portal.test`

The portal feature's handlers (feature name = the API module's, `portal`). This step writes the file's helpers and the
three staff routes; Step 3.2 appends the signed-out ones to the same array.

```ts
// apps/web/src/features/portal/mocks.ts (new)
import { http, HttpResponse } from "msw";
import {
  PORTAL_LINK_LIFETIME_MS, accountText, isAccountText, maskedNumber, smsNumber,
  type Guardian, type PortalAccess, type PortalAccount, type PortalLinkRecord,
} from "@pedia/shared";
import { env } from "@/lib/env";
import { sessionOf } from "@/mocks/access";
import { currentAccount, currentClinicId, db, persist } from "@/mocks/db";
import { portalAccountOf } from "@/mocks/demo-accounts";

const url = (p: string) => `${env.apiUrl}${p}`;
const stamp = () => new Date().toISOString();

/** 24 random bytes, base64url: the 32 characters PasswordLinkInput takes. */
export const newToken = () =>
  btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, "-").replace(/\//g, "_");

const guardianOf = (guardianId: string): Guardian | undefined => db.patients.flatMap((p) => p.guardians).find((g) => g.id === guardianId);
export const liveLink = (l: PortalLinkRecord) => !l.usedAt && !l.cancelledAt && Date.parse(l.expiresAt) > Date.now();

/** Decision 14: another guardian of this account who signs in with, or was invited on, this number. */
function numberHolder(number: string, exceptGuardianId: string, states: PortalAccount["state"][] = ["active", "invited"]) {
  return db.portalAccounts
    .filter((a) => a.guardianId !== exceptGuardianId && states.includes(a.state))
    .map((a) => guardianOf(a.guardianId))
    .find((g) => g && smsNumber(g.phone) === number);
}
const clashText = (g: Pick<Guardian, "phone">, holder: Guardian) =>
  `${maskedNumber(g.phone)} already signs in to the portal as ${holder.fullName}. Each parent needs their own mobile number.`;

/** Why this guardian can't be invited now (decisions 1, 14), in the words the Overview shows. */
function blockedReason(g: Guardian): string | undefined {
  const n = smsNumber(g.phone);
  if (!n) return `Add a mobile number for ${g.fullName} to invite them`;
  const holder = numberHolder(n, g.id);
  return holder && clashText(g, holder);
}

/**
 * Decision 14 on a contact edit (Step 3.3): a guardian with portal access (invited or active) can't move to a number
 * another parent of the account signs in with. Undefined when the edit may go ahead.
 */
export function portalNumberClash(g: Pick<Guardian, "id" | "phone">): string | undefined {
  const mine = portalAccountOf(db, g.id);
  const n = smsNumber(g.phone);
  if (!n || !mine || mine.state === "off") return undefined;
  const holder = numberHolder(n, g.id);
  return holder && clashText(g, holder);
}

export function portalAccessOf(g: Guardian): PortalAccess {
  const a = portalAccountOf(db, g.id);
  const invite = a?.links.filter((l) => l.purpose === "invite" && !l.cancelledAt).at(-1);
  return {
    guardianId: g.id,
    state: a?.state ?? "not_invited",
    invitedAt: a?.invitedAt,
    inviteExpiresAt: a?.state === "invited" ? invite?.expiresAt : undefined,
    activatedAt: a?.state === "active" ? a.activatedAt : undefined,
    turnedOffAt: a?.state === "off" ? a.turnedOffAt : undefined,
    blocked: a?.state === "active" ? undefined : blockedReason(g),
  };
}

/** A new link of this purpose; the older live ones are cancelled (decision 5: a resend cancels the older link). */
export function newLink(a: PortalAccount, purpose: PortalLinkRecord["purpose"]): void {
  const at = new Date();
  for (const l of a.links) if (l.purpose === purpose && liveLink(l)) l.cancelledAt = at.toISOString();
  a.links.push({ token: newToken(), purpose, createdAt: at.toISOString(), expiresAt: new Date(at.getTime() + PORTAL_LINK_LIFETIME_MS[purpose]).toISOString() });
}

/** Withdraws this guardian's waiting account texts (the API matches them by link id; the mock never sends anyway). */
const withdrawTexts = (g: Guardian, kind?: "portal_invite") => {
  for (const m of db.messages) if (isAccountText(m.kind) && (!kind || m.kind === kind) && m.to === g.phone && m.status === "queued") m.status = "cancelled";
};

/** E4: the log's row for an account text: this guardian's own number, now, whatever the consents, the link as [link]. */
export function logAccountText(kind: "portal_invite" | "password_reset", g: Guardian, patientId: string, childName?: string) {
  const at = stamp();
  const body = accountText(kind === "portal_invite" ? "invite" : "reset", { clinicName: currentAccount().name, childName });
  db.messages.push({ id: crypto.randomUUID(), clinicId: currentClinicId(), patientId, kind, channel: "sms", to: g.phone, recipientName: g.fullName, body, status: "queued", sendAt: at, createdAt: at });
}

/** The child and the guardian a staff route names: 404s as the API words them. */
function familyOf(params: Record<string, string | readonly string[] | undefined>) {
  const patient = db.patients.find((p) => p.id === params.id);
  if (!patient) return new HttpResponse("Patient not found", { status: 404 });
  const guardian = patient.guardians.find((g) => g.id === params.guardianId);
  if (!guardian) return new HttpResponse(`This guardian isn't on ${patient.firstName}'s record`, { status: 404 });
  return { patient, guardian };
}

/** API contract for apps/api's PortalAccessController and PasswordLinksController (B11). */
export const portalHandlers = [
  // Staff with portal.manage (mocks/access.ts): each guardian's portal status, on the child's Overview (decision 17).
  http.get(url("/patients/:id/portal-access"), ({ params }) => {
    const patient = db.patients.find((p) => p.id === params.id);
    if (!patient) return new HttpResponse("Patient not found", { status: 404 });
    return HttpResponse.json(patient.guardians.map(portalAccessOf));
  }),

  // Invite or resend (decisions 1, 2, 5, 14, 20): any guardian of this child with a mobile no other parent uses.
  http.post(url("/patients/:id/guardians/:guardianId/portal-invite"), ({ params, request }) => {
    const found = familyOf(params);
    if (found instanceof Response) return found;
    const { patient, guardian: g } = found;
    let a = portalAccountOf(db, g.id);
    if (a?.state === "active") return new HttpResponse(`${g.fullName} already uses the portal`, { status: 409 });
    const blocked = blockedReason(g);
    if (blocked) return new HttpResponse(blocked, { status: 409 });
    if (!a) db.portalAccounts.push((a = { clinicId: currentClinicId(), guardianId: g.id, state: "invited", links: [] }));
    Object.assign(a, { state: "invited", invitedAt: stamp(), invitedBy: sessionOf(request)!.name, turnedOffAt: undefined });
    withdrawTexts(g, "portal_invite");
    newLink(a, "invite");
    logAccountText("portal_invite", g, patient.id, patient.firstName);
    persist();
    return HttpResponse.json(portalAccessOf(g));
  }),

  // Turn off (decision 18): no longer a login (allAccounts), links cancelled; they can be invited again.
  http.post(url("/patients/:id/guardians/:guardianId/portal-off"), ({ params }) => {
    const found = familyOf(params);
    if (found instanceof Response) return found;
    const { guardian: g } = found;
    const a = portalAccountOf(db, g.id);
    if (!a || a.state === "off") return new HttpResponse(`${g.fullName} doesn't have portal access`, { status: 409 });
    withdrawTexts(g);
    for (const l of a.links) if (liveLink(l)) l.cancelledAt = stamp();
    Object.assign(a, { state: "off", turnedOffAt: stamp(), password: undefined, email: undefined });
    persist();
    return HttpResponse.json(portalAccessOf(g));
  }),
];
```

```diff
// apps/web/src/mocks/access.ts (RULES, after the Patients block)
   { method: "DELETE", path: "/patients/:id/photo", permission: "patients.write", audit: "Patient photo", action: "update" },
+  // B11: portal invitations (decisions 2, 16–18): front desk, the Owner and admins. Parents hold nothing here.
+  { method: "GET", path: "/patients/:id/portal-access", permission: "portal.manage", audit: "Portal access" },
+  { method: "POST", path: "/patients/:id/guardians/:guardianId/portal-invite", permission: "portal.manage", audit: "Portal invitation" },
+  { method: "POST", path: "/patients/:id/guardians/:guardianId/portal-off", permission: "portal.manage", audit: "Portal access (turned off)", action: "update" },
```

```diff
// apps/web/src/mocks/handlers.ts
+import { portalHandlers } from "@/features/portal/mocks";
@@
   ...authHandlers,
+  ...portalHandlers,
```

```ts
// apps/web/src/mocks/portal.test.ts (new): staff routes. Signed in by cookie, as handlers.test.ts.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { DemoTexts, Message, Patient, PortalAccess, type RegisterPatientInput } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { IDEMPOTENCY_HEADER } from "@/lib/idempotency";
import { db } from "./db";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const FRONT_DESK = "demo.clinic_demo.staff_cruz";
const signIn = (token: string | null) => vi.stubGlobal("document", { cookie: token ? `pd_session=${token}` : "" });
beforeAll(() => {
  signIn(FRONT_DESK);
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
const post = (body: unknown = {}) => ({ method: "POST", body: JSON.stringify(body), headers: { [IDEMPOTENCY_HEADER]: crypto.randomUUID() } });

/** A new child with two guardians: a mother on `phone` (reminders `reminders`) and a father on a landline. */
async function family(name: string, phone: string, reminders = true) {
  const input: RegisterPatientInput = {
    firstName: name, lastName: "Portal", birthDate: "2019-03-14", sex: "female", address: "",
    guardians: [
      { id: `g_m_${name}`, fullName: `Rosa ${name}`, relationship: "Mother", phone, isPrimary: true },
      { id: `g_f_${name}`, fullName: `Jun ${name}`, relationship: "Father", phone: "(046) 471 2580", isPrimary: false },
    ],
    emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
    privacyConsent: { guardianId: `g_m_${name}`, photos: true, reminders, confirmed: true },
  };
  return api("/patients", Patient, post(input));
}
const access = (id: string) => api(`/patients/${id}/portal-access`, z.array(PortalAccess));
const invite = (id: string, g: string) => api(`/patients/${id}/guardians/${g}/portal-invite`, PortalAccess, post());

describe("portal invitations (B11)", () => {
  it("shows a new family as not invited, the landline as blocked, and a seeded parent as active (decisions 1, 13, 17)", async () => {
    const kid = await family("Ana", "09170000001");
    expect(await access(kid.id)).toMatchObject([
      { state: "not_invited", blocked: undefined },
      { state: "not_invited", blocked: "Add a mobile number for Jun Ana to invite them" },
    ]);
    const seeded = db.patients.find((p) => p.id === "patient_sibling")!;
    expect((await access(seeded.id))[0]).toMatchObject({ state: "active" });
  });

  it("invites by text even when the family declined reminders, with the link kept out of the log (decisions 3, 20, E4)", async () => {
    const kid = await family("Bo", "09170000002", false);
    const before = Date.now();
    const status = await invite(kid.id, "g_m_Bo");
    expect(status.state).toBe("invited");
    expect(Date.parse(status.inviteExpiresAt!) - before).toBeGreaterThanOrEqual(72 * 3_600_000 - 1000);
    const [text] = await api(`/messages?patientId=${kid.id}`, z.array(Message));
    expect(text).toMatchObject({ kind: "portal_invite", to: "09170000002", status: "queued" });
    expect(text!.body).toContain("[link]");
  });

  it("cancels the older link on a resend (decision 5)", async () => {
    const kid = await family("Cy", "09170000003");
    await invite(kid.id, "g_m_Cy");
    await invite(kid.id, "g_m_Cy");
    const live = (await api("/auth/demo-texts", DemoTexts)).texts.filter((t) => t.name === "Rosa Cy");
    expect(live).toHaveLength(1);
  });

  it("refuses a second guardian on a number another parent uses, and a parent already active (decision 14)", async () => {
    const one = await family("Di", "09170000004");
    const two = await family("Ed", "0917 000 0004");
    await invite(one.id, "g_m_Di");
    await expect(invite(two.id, "g_m_Ed")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("already signs in to the portal as Rosa Di") });
    expect((await access(two.id))[0]!.blocked).toContain("Rosa Di");
    const seeded = db.patients.find((p) => p.id === "patient_sibling")!;
    await expect(invite(seeded.id, seeded.guardians[0]!.id)).rejects.toMatchObject({ status: 409 });
  });

  it("turns access off and can invite again (decision 18)", async () => {
    const kid = await family("Fe", "09170000005");
    await invite(kid.id, "g_m_Fe");
    const off = await api(`/patients/${kid.id}/guardians/g_m_Fe/portal-off`, PortalAccess, post());
    expect(off).toMatchObject({ state: "off" });
    await expect(api(`/patients/${kid.id}/guardians/g_m_Fe/portal-off`, PortalAccess, post())).rejects.toMatchObject({ status: 409 });
    expect((await invite(kid.id, "g_m_Fe")).state).toBe("invited");
  });

  it("is front desk's, the Owner's and admins': a dentist and a parent get 403 (decision 16)", async () => {
    const kid = await family("Gi", "09170000006");
    for (const token of ["demo.clinic_demo.staff_reyes", `demo.clinic_demo.guardian.${db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id}`]) {
      signIn(token);
      await expect(access(kid.id)).rejects.toMatchObject({ status: 403 });
      await expect(invite(kid.id, "g_m_Gi")).rejects.toMatchObject({ status: 403 });
    }
    signIn(FRONT_DESK);
  });
});
```

`ApiError.message` carries the plain-text body (check `lib/api-client.ts`; if the field differs, match on it). The
`/auth/demo-texts` call above is served from Step 3.2: write that handler before running this file, or move the resend
case into `portal-auth.test.ts`.

#### Step 3.2: Signed-out routes, sign-in by mobile, parents' password change

**File:** `apps/web/src/features/portal/mocks.ts`, `apps/web/src/features/auth/mocks.ts`, `apps/web/src/mocks/demo-accounts.ts`, `apps/web/src/mocks/portal-auth.test.ts` (new)
**Verify:** `pnpm run check -- mocks/portal-auth`

Because the resend case in Step 3.1 reads `/auth/demo-texts`, implement 3.1 and 3.2 before running either test file;
each step's own command still proves its own file.

```diff
// apps/web/src/features/auth/mocks.ts
-const userOf = (account: DemoAccountRecord, clinicId: string): SessionUser => {
+export const userOf = (account: DemoAccountRecord, clinicId: string): SessionUser => {
@@ POST /auth/login
-    const matches = accountsByEmail(platform, email);
+    const matches = accountsByLogin(platform, email); // `email` holds a mobile or an email (LoginId, B11 decision 4)
@@
-      return new HttpResponse("That email and password don't match a demo account", { status: 401 });
+      return new HttpResponse("That mobile number or email and password don't match a demo account", { status: 401 });
@@ POST /auth/password
   /**
-   * Changes the signed-in staff member's password: at first sign-in with the temporary one (decision #21), or any time
-   * after. Only for logins the Owner added: seeded demo logins keep the demo password.
+   * Changes the signed-in person's password: a staff login at first sign-in with the temporary one (decision #21) or
+   * any time after; a parent any time (B11 decision 7). Seeded demo logins keep the demo password.
@@
   http.post(url("/auth/password"), async ({ request }) => {
     const session = sessionOf(request);
-    if (!session?.staffId) return new HttpResponse("Sign in with your staff login to change its password", { status: 401 });
+    if (!session) return new HttpResponse("Sign in to change your password", { status: 401 });
     // Seeded demo logins keep the password the login screen shows; only logins the Owner added have their own.
-    if (!credentialOf(db, session.staffId)) return new HttpResponse(`Demo logins keep the demo password (${DEMO_PASSWORD})`, { status: 403 });
+    const staffOwn = session.staffId ? credentialOf(db, session.staffId) : undefined;
+    const parentOwn = session.guardianId ? portalAccountOf(db, session.guardianId) : undefined;
+    if (!staffOwn && !parentOwn?.password) return new HttpResponse(`Demo logins keep the demo password (${DEMO_PASSWORD})`, { status: 403 });
     const parsed = ChangePasswordInput.safeParse(await request.json());
     if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
     if (!passwordOpens(db, session, parsed.data.current)) {
       recordAudit(session, "denied", "Password");
       return new HttpResponse("That isn't your current password", { status: 400 });
     }
-    const own = credentialOf(db, session.staffId);
-    if (own) Object.assign(own, { password: parsed.data.next, mustChange: false });
-    else db.staffCredentials.push({ clinicId: session.clinicId, staffId: session.staffId, password: parsed.data.next, mustChange: false });
+    if (staffOwn) Object.assign(staffOwn, { password: parsed.data.next, mustChange: false });
+    else parentOwn!.password = parsed.data.next;
     persist();
```

Import `accountsByLogin` and `portalAccountOf` from `@/mocks/demo-accounts` (drop `accountsByEmail`). Then grep the old
sign-in words (`grep -rn "don't match a demo account" apps/web`) and update each assertion.

```ts
// apps/web/src/features/portal/mocks.ts (additions: imports, then appended to portalHandlers)
import { DEMO_CLINIC_ID } from "@pedia/seed";
import { DemoTexts, PasswordLinkInput, PasswordResetInput, RESET_TEXTS_PER_HOUR, SetPasswordInput, linkPath, type Session } from "@pedia/shared";
import { recordAudit } from "@/mocks/access";
import { platform, selectTenant } from "@/mocks/db";
import { accountsByLogin, allAccounts, emailTaken, tokenFor } from "@/mocks/demo-accounts";
import { userOf } from "@/features/auth/mocks";

/** The link a token names, in whichever account holds it; points `db` at that account. */
function linkOf(token: string) {
  for (const { id } of platform.accounts) {
    for (const account of platform.tenants[id]!.portalAccounts) {
      const link = account.links.find((l) => l.token === token);
      if (link) return { clinicId: id, account, link, tenant: selectTenant(id)! };
    }
  }
}
/** Usable: live, and the account in the state the purpose needs (an invite: invited; a reset: active). */
function usableLink(token: string) {
  const hit = linkOf(token);
  const guardian = hit && guardianOf(hit.account.guardianId);
  const wanted = hit?.link.purpose === "invite" ? "invited" : "active";
  return hit && guardian && liveLink(hit.link) && hit.account.state === wanted ? { ...hit, guardian } : undefined;
}
const GONE = () => new HttpResponse("This link has expired or was already used.", { status: 410 });

/** Decision 19: reset texts per sign-in value in the last hour, counted whether or not an account exists. In memory, like the demo's Idempotency-Keys (B8 E12). */
const resetTexts = new Map<string, number[]>();

  // …appended to portalHandlers:

  // Signed out (/auth/*: outside the gate). What a link is for; one 410 for unknown, used, cancelled and expired (E1).
  http.post(url("/auth/password-link"), async ({ request }) => {
    const parsed = PasswordLinkInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const hit = usableLink(parsed.data.token);
    if (!hit) return GONE();
    return HttpResponse.json({ purpose: hit.link.purpose, name: hit.guardian.fullName, clinicName: currentAccount().name, login: maskedNumber(hit.guardian.phone) });
  }),

  // Sets the password and signs in (decisions 5, 6, 8, 22). Single use. A first sign-in comes back with mustAcknowledge "notice".
  http.post(url("/auth/password-link/accept"), async ({ request }) => {
    const parsed = SetPasswordInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const hit = usableLink(parsed.data.token);
    if (!hit) return GONE();
    const { account: a, link, guardian: g, clinicId } = hit;
    if (link.purpose === "invite") {
      const n = smsNumber(g.phone);
      const holder = n && numberHolder(n, g.id, ["active"]);
      if (!n) return new HttpResponse("Your clinic needs your mobile number first. Ask them to add it and send a new invite.", { status: 409 });
      if (holder) return new HttpResponse(clashText(g, holder), { status: 409 });
      const email = g.email?.toLowerCase();
      // Decision 14: a shared email isn't refused; this parent then signs in with their number only.
      Object.assign(a, { state: "active", activatedAt: stamp(), email: email && !emailTaken(db, email) ? email : undefined });
    }
    a.password = parsed.data.password; // as typed: the prototype's deferral (the API stores argon2id)
    link.usedAt = stamp();
    for (const l of a.links) if (l.purpose === link.purpose && liveLink(l)) l.cancelledAt = stamp();
    persist();
    const login = allAccounts(db).find((x) => x.guardianId === g.id)!;
    recordAudit(login, "update", link.purpose === "invite" ? "Portal access (activated)" : "Password (reset)");
    const session: Session = { token: tokenFor(clinicId, login), user: userOf(login, clinicId) };
    return HttpResponse.json(session);
  }),

  // Forgot password (decisions 6, 19): 202 {} whether or not an account exists; counted first, so 429 says nothing either.
  http.post(url("/auth/password-reset"), async ({ request }) => {
    const parsed = PasswordResetInput.safeParse(await request.json());
    if (!parsed.success) return HttpResponse.json(parsed.error.issues, { status: 400 });
    const { login } = parsed.data;
    const recent = (resetTexts.get(login) ?? []).filter((t) => t > Date.now() - 3_600_000);
    if (recent.length >= RESET_TEXTS_PER_HOUR) return new HttpResponse("Too many reset texts for this number. Try again later.", { status: 429 });
    resetTexts.set(login, [...recent, Date.now()]);
    for (const m of accountsByLogin(platform, login)) {
      if (!m.account.guardianId) continue; // parents only (decision 6): staff ask their Owner
      selectTenant(m.clinicId);
      const a = portalAccountOf(db, m.account.guardianId)!;
      const g = guardianOf(a.guardianId)!;
      if (!smsNumber(g.phone)) continue;
      withdrawTexts(g); // only the newest reset text matters
      newLink(a, "reset");
      logAccountText("password_reset", g, db.patients.find((p) => p.guardians.some((x) => x.id === g.id))!.id);
      recordAudit(m.account, "create", "Password reset (requested)");
    }
    persist();
    return HttpResponse.json({}, { status: 202 });
  }),

  // Prototype and demo deployments only (E6): the live links the demo would have texted, newest first, at most 5.
  http.get(url("/auth/demo-texts"), ({ request }) => {
    if (!sessionOf(request)) selectTenant(DEMO_CLINIC_ID);
    const texts = db.portalAccounts
      .flatMap((a) => a.links.filter(liveLink).map((l) => ({ name: guardianOf(a.guardianId)?.fullName ?? "A parent", purpose: l.purpose, link: linkPath(l.token), expiresAt: l.expiresAt, at: l.createdAt })))
      .sort((x, y) => y.at.localeCompare(x.at))
      .slice(0, 5)
      .map(({ at: _at, ...t }) => t);
    return HttpResponse.json(DemoTexts.parse({ texts }));
  }),
```

Merge the new imports with the Step 3.1 ones.

```ts
// apps/web/src/mocks/portal-auth.test.ts (new): signed-out routes, sign-in by mobile, parents' passwords.
// Same server, `signIn`, `post` and `family` helpers as portal.test.ts (copy them; no shared test util exists).
import { DEMO_PASSWORD, DemoTexts, LoginResult, PasswordLink, PortalAccess, Session } from "@pedia/shared";
// …

/** Obviously fake test passwords (8+ characters, the staff rule). */
const pw = (n: number) => `fake-pw-${n}-EXAMPLE`;
const tokenOf = async (name: string) => (await api("/auth/demo-texts", DemoTexts)).texts.find((t) => t.name === name)!.link.split("#t=")[1]!;
const login = (email: string, secret: string) => api("/auth/login", LoginResult, post({ email, password: secret }));
const accept = (token: string, secret: string) => api("/auth/password-link/accept", Session, post({ token, password: secret }));

describe("sign-in by mobile or email (decision 4)", () => {
  it("signs a seeded parent in by their number, in any common form, on the demo password (decision 13)", async () => {
    const g = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!;
    const r = await login(g.phone.replace(/^0/, "+63 "), DEMO_PASSWORD);
    expect("user" in r && r.user.guardianId).toBe(g.id);
    expect("user" in (await login("parent@gmail.com", DEMO_PASSWORD))).toBe(true);
  });
  it("refuses a wrong password", async () => {
    await expect(login("09999999999", pw(0))).rejects.toMatchObject({ status: 401 });
  });
});

describe("an invited parent's first sign-in (CHUNKS B11 done-when)", () => {
  it("checks the link, sets a password, signs in with the notice step waiting, and the link works once (decisions 5, 22)", async () => {
    signIn(FRONT_DESK);
    const kid = await family("Ha", "09170000011");
    await api(`/patients/${kid.id}/guardians/g_m_Ha/portal-invite`, PortalAccess, post());
    const token = await tokenOf("Rosa Ha");
    signIn(null);
    expect(await api("/auth/password-link", PasswordLink, post({ token }))).toEqual({ purpose: "invite", name: "Rosa Ha", clinicName: expect.any(String), login: "0917 ••• 0011" });
    expect((await accept(token, pw(1))).user).toMatchObject({ role: "parent", mustAcknowledge: "notice" });
    await expect(accept(token, pw(2))).rejects.toMatchObject({ status: 410 });
    expect("user" in (await login("0917 000 0011", pw(1)))).toBe(true);
    await expect(login("0917 000 0011", DEMO_PASSWORD)).rejects.toMatchObject({ status: 401 });
  });
  it("refuses an expired invite (decision 5)", async () => {
    signIn(FRONT_DESK);
    const kid = await family("Io", "09170000012");
    await api(`/patients/${kid.id}/guardians/g_m_Io/portal-invite`, PortalAccess, post());
    const token = await tokenOf("Rosa Io");
    db.portalAccounts.find((a) => a.guardianId === "g_m_Io")!.links.at(-1)!.expiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(api("/auth/password-link", PasswordLink, post({ token }))).rejects.toMatchObject({ status: 410 });
  });
  it("gives a parent sharing another login's email a number-only sign-in (decision 14)", async () => {
    signIn(FRONT_DESK);
    const kid = await family("Jo", "09170000013");
    db.patients.find((p) => p.id === kid.id)!.guardians[0]!.email = "parent@gmail.com"; // the seeded sibling family's address
    await api(`/patients/${kid.id}/guardians/g_m_Jo/portal-invite`, PortalAccess, post());
    expect((await accept(await tokenOf("Rosa Jo"), pw(3))).user.email).toBe("");
  });
});

describe("forgot password (decisions 6, 19)", () => {
  it("answers 202 for an unknown number and texts a known one; the link resets the password once", async () => {
    signIn(null);
    const before = db.messages.length;
    await api("/auth/password-reset", z.object({}), post({ login: "09175550000" }));
    expect(db.messages.length).toBe(before); // nothing to send, and nothing said
    await api("/auth/password-reset", z.object({}), post({ login: "0917 000 0011" })); // Rosa Ha, active since the invite case
    expect(db.messages.at(-1)).toMatchObject({ kind: "password_reset", to: "09170000011", status: "queued" });
    const token = await tokenOf("Rosa Ha");
    expect((await api("/auth/password-link", PasswordLink, post({ token }))).purpose).toBe("reset");
    await accept(token, pw(4));
    expect("user" in (await login("09170000011", pw(4)))).toBe(true);
  });
  it("allows 3 texts per number per hour, for unknown numbers too", async () => {
    for (let i = 0; i < 3; i++) await api("/auth/password-reset", z.object({}), post({ login: "09175550001" }));
    await expect(api("/auth/password-reset", z.object({}), post({ login: "09175550001" }))).rejects.toMatchObject({ status: 429 });
  });
});

describe("a parent's own password (decision 7)", () => {
  it("keeps a seeded parent on the demo password, and lets a parent with their own change it", async () => {
    signIn(`demo.clinic_demo.guardian.${db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id}`);
    await expect(api("/auth/password", Session, post({ current: DEMO_PASSWORD, next: pw(5) }))).rejects.toMatchObject({ status: 403 });
    signIn("demo.clinic_demo.guardian.g_m_Ha");
    await api("/auth/password", Session, post({ current: pw(4), next: pw(6) }));
    expect("user" in (await login("09170000011", pw(6)))).toBe(true);
  });
});
```

The `describe` blocks share one seeded db in order (as `handlers.test.ts`): keep them in this order. `/api` responses
with an empty `{}` body parse with `z.object({})`; a 202 with a body is what the API sends too (Step 7.2).

#### Step 3.3: Guardian edits keep one number per sign-in; the ownership sweep

**File:** `apps/web/src/features/patients/mocks.ts`, `apps/web/src/mocks/access.ts`, `apps/web/src/mocks/handlers.test.ts`
**Verify:** `pnpm run check -- mocks/handlers`

```diff
// apps/web/src/features/patients/mocks.ts (PUT /patients/:id, after the consenter check)
     if (current.consents.some((c) => !guardianIds.has(c.guardianId)) || (consenter && !guardianIds.has(consenter))) {
       return new HttpResponse("A guardian who signed a consent can't be removed", { status: 409 });
     }
+    // B11 decision 14: a parent with portal access can't move to a number another parent signs in with.
+    const clash = input.guardians.map(portalNumberClash).find(Boolean);
+    if (clash) return new HttpResponse(clash, { status: 409 });
@@ PATCH /patients/:id
       const primary = patient.guardians.find((g) => g.isPrimary) ?? patient.guardians[0];
+      const clash = portalNumberClash({ id: primary.id, phone });
+      if (clash) return new HttpResponse(clash, { status: 409 });
       // One guardian, one phone: siblings share the guardian id, so they all get the new number.
```

with `import { portalNumberClash } from "@/features/portal/mocks";`. The demo's sign-in follows the new number by
itself (`allAccounts` reads the guardian's phone), and can't sign the parent out (E11).

```diff
// apps/web/src/mocks/access.ts
-/** For the separation test (mocks/operator.test.ts): every clinic route, which an operator token must never pass. */
-export const ACCESS_RULES: readonly Pick<Rule, "method" | "path">[] = RULES;
+/** Every clinic route: the operator separation test, and B11's ownership sweep (handlers.test.ts "parent portal"). */
+export const ACCESS_RULES: readonly Pick<Rule, "method" | "path" | "permission" | "owner">[] = RULES;
```

```ts
// apps/web/src/mocks/handlers.test.ts, inside describe("parent portal"), after the Chunk 17 case
  it("refuses another family's child on every route a parent can pass, swept from RULES (B11 E12)", async () => {
    const { mine, other } = await signInAsFamily();
    const ours = new Set(mine.map((p) => p.id));
    const parentRoutes = ACCESS_RULES.filter((r) => [r.permission].flat().some((p) => permissionScopeFor(["parent"], p) === "own"));
    expect(parentRoutes.filter((r) => !r.owner).map((r) => `${r.method} ${r.path}`)).toEqual([]); // fail closed
    // A record route needs another family's record; a new one without a fixture here fails the test, not passes it.
    const recordOf: Record<string, string | undefined> = {
      "/appointments/:id/status": db.appointments.find((a) => !ours.has(a.patientId))?.id,
      "/photos/:id/file": db.photos.find((p) => !ours.has(p.patientId))?.id,
    };
    for (const r of parentRoutes.filter((x) => x.owner !== "filtered")) {
      const id = r.path.startsWith("/patients/:id") ? other.id : r.path === "/messages" ? "" : recordOf[r.path];
      expect(id, `${r.method} ${r.path}: add a fixture`).toBeDefined();
      const path = r.path === "/messages" ? `/messages?patientId=${other.id}` : r.path.replace(":id", id!);
      await expect(api(path, z.unknown(), r.method === "GET" ? undefined : send(r.method, {})), `${r.method} ${r.path}`).rejects.toMatchObject({
        status: 403,
        message: "This isn't one of your children's records",
      });
    }
  });

  it("drops a guardian taken off their only child from the logins at once (decision 10)", async () => {
    signIn(ADMIN);
    const kid = await api("/patients", Patient, send("POST", { ...newPatient, firstName: "Lone", guardians: [{ ...newPatient.guardians[0]!, id: "g_lone", phone: "09170000021" }], privacyConsent: { ...newPatient.privacyConsent, guardianId: "g_lone" } }));
    db.portalAccounts.push({ clinicId: "clinic_demo", guardianId: "g_lone", state: "active", activatedAt: new Date().toISOString(), links: [] });
    signIn("demo.clinic_demo.guardian.g_lone");
    expect((await api("/patients", z.array(Patient))).map((p) => p.id)).toEqual([kid.id]);
    db.patients.find((p) => p.id === kid.id)!.guardians[0]!.id = "g_someone_else"; // what a PUT replacing the guardian leaves
    await expect(api("/patients", z.array(Patient))).rejects.toMatchObject({ status: 401 });
  });

  it("refuses a contact edit onto a number another parent signs in with (decision 14)", async () => {
    signIn(ADMIN);
    const sibling = db.patients.find((p) => p.id === "patient_sibling")!;
    const kid = await api("/patients", Patient, send("POST", { ...newPatient, firstName: "Clash", guardians: [{ ...newPatient.guardians[0]!, id: "g_clash", phone: "09170000022" }], privacyConsent: { ...newPatient.privacyConsent, guardianId: "g_clash" } }));
    db.portalAccounts.push({ clinicId: "clinic_demo", guardianId: "g_clash", state: "active", activatedAt: new Date().toISOString(), links: [] });
    await expect(api(`/patients/${kid.id}`, Patient, send("PATCH", { phone: sibling.guardians[0]!.phone, nickname: "", tags: [], alerts: [] }))).rejects.toMatchObject({ status: 409 });
  });
```

`ACCESS_RULES` and `permissionScopeFor` join the file's imports; `ApiError.message` is the plain-text body
(`lib/api-client.ts`: confirm the field). The `describe("parent portal")` block stays last (CONVENTIONS → Traps).

#### Phase 3 — Potential Issues

- **Contract shape is the API's to match**: status codes (200 for invite/off, 202 for reset, 410 for a dead link, 409
  for every refusal with a reason), the words, and `PortalAccess` absent fields (`undefined`, never `null`).
- **The demo-texts route is unauthenticated** in the mock, like `/auth/demo-accounts`. Both are prototype-only.
- **Rate-limit memory** (`resetTexts`) survives across tests in one file; each test uses its own numbers.
- **`withdrawTexts` matches by `to`**: two guardians can't share a number with portal access (decision 14), so the
  match is exact enough for a mock that never sends.
- **Layering:** the patients mock imports `portalNumberClash` from the portal mock (feature to feature, both
  `mocks.ts`): allowed by the root CONVENTIONS (`@/mocks/*` from feature code is what's banned).
- **No new pattern** in the mock.

**Issues identified:** E11 (a number change can't sign a demo parent out) is a recorded deferral, not a gap.

## B11b: Web

### Phase 4: Screens

#### Step 4.1: Hooks

**File:** `apps/web/src/features/portal/api.ts` (new)
**Verify:** `pnpm run typecheck`

#### Step 4.2: Portal status on the child's Overview

**File:** `apps/web/src/features/patients/components/guardian-portal.tsx` (new), `apps/web/src/features/patients/components/patient-overview.tsx`
**Verify:** `pnpm run check -- design`

#### Step 4.3: Set a password from a link; forgot password; the sign-in box

**File:** `apps/web/src/features/auth/components/set-password-screen.tsx` (new), `apps/web/src/features/auth/components/forgot-password-screen.tsx` (new), `apps/web/src/app/set-password/page.tsx` (new), `apps/web/src/app/forgot-password/page.tsx` (new), `apps/web/src/features/auth/components/login-screen.tsx`
**Verify:** `test -f apps/web/src/app/set-password/page.tsx`

#### Step 4.4: Change password in the portal

**File:** `apps/web/src/features/portal/components/portal-password.tsx` (new), `apps/web/src/app/(portal)/portal/account/page.tsx` (new), `apps/web/src/features/auth/components/account-menu.tsx`
**Verify:** `test -f "apps/web/src/app/(portal)/portal/account/page.tsx"`

**Phase 4 spec (condensed; diffs to be written by the implementer from this and the ui-ux-design skill):**
- 4.1 `features/portal/api.ts`: `portalKeys`; `usePortalAccess(patientId, enabled)` (`GET …/portal-access`, `z.array(PortalAccess)`);
  `useInvite(patientId)` / `useTurnOff(patientId)` (POST, invalidate `portalKeys` and `messageKeys` for the child);
  `usePasswordLink(token)` (POST check, `retry: false`); `useSetPassword()` (accept → `useSessionStore.signIn`, drop
  cached queries as `useSignIn`, `router.replace("/portal")`; the existing RequireSession shows the notice step, decision 22);
  `useRequestReset()`; `useDemoTexts()` (only when `env.apiMocking`).
- 4.2 `GuardianPortal` per guardian row inside the Overview's Guardians card, wrapped in `<Can permission="portal.manage">`:
  status as icon + text (never colour alone): "Not invited", "Invited on 17 Oct · expires 20 Oct" / "Invite expired",
  "Active since …", "Access turned off on …"; actions "Invite to portal" (not_invited/off), "Resend invite" (invited),
  "Turn off access" (invited/active) behind a specific Dialog ("Turn off Rosa Santos's portal access?" — "She'll be signed
  out and won't see Bea's records until you invite her again." — "Turn off access" / "Keep access"). `blocked` shows as
  muted inline text in place of Invite. Success: toast "Invite sent to 0917 ••• 4567". 44 px targets.
- 4.3 `/set-password` (reads `location.hash` `t=`, then `history.replaceState` to drop it; checks the link; heading
  "Welcome, Rosa" + "Choose your password for {clinic}'s parent portal" (invite) or "Choose a new password" (reset); one
  "New password" field with show toggle, hint "At least 8 characters"; 410 → "This link has expired or was already used"
  with "Get a new reset link" (/forgot-password) and "Ask your clinic for a new invite"). `/forgot-password` ("Mobile number
  or email" → always the same confirmation: "If that number has a portal account, we've texted a link. It works for 30
  minutes."; 429 inline). Login screen: label "Mobile number or email", `type="text" autoComplete="username"`, a
  "Forgot password?" link, and a "Demo texts" list under Demo logins when `env.apiMocking`. **No `PrimolarLogo`,
  `brand-strip` or `font-display` on the new pages** (design guards allowlist only the login screen); mirror
  `ChangePasswordScreen`'s card.
- 4.4 `/portal/account`: `PortalPassword` (ChangePasswordInput, labels "Current password"/"New password"; a seeded demo
  parent sees the 403 words inline); account menu "Change password" item for `role === "parent"`.

#### Phase 4 — Potential Issues

- Public pages sit outside `(clinic)`/`(portal)`, so no access gate; they must not render a signed-in shell.
- The token must never reach a server log: fragment only, cleared after reading; never put it in a query key that is
  persisted (it isn't: TanStack keeps memory only).
- 4.1/4.2 are checked by typecheck and the design guards only; the e2e (Step 9.2) is the behavioural proof.

**Issues identified:** none.

## B11c: API

### Phase 5: Tables, migration and the API seed

#### Step 5.1: Schema, migration, scopes

**File:** `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/<timestamp>_portal_accounts/migration.sql` (new), `apps/api/src/prisma/model-scope.ts`, `apps/api/src/prisma/tenant-scope.test.ts`, `apps/api/src/message-queue/message.rows.ts`, `apps/api/src/auth/identity.service.ts`
**Verify:** `pnpm run check -- tenant-scope`

#### Step 5.2: The API seed writes portal accounts and mobile sign-ins

**File:** `apps/api/src/seed/seed-database.ts`, `apps/api/test/int/seed.int.test.ts`
**Verify:** `pnpm run typecheck`

**Phase 5 spec (condensed):**
- `Credential`: `email String?` (expand: nullable), `phone String? @db.VarChar(16)` (smsNumber form), `@@unique([clinicId, phone])`.
- `enum PortalAccountState { invited active off }`; `model PortalAccount { clinicId, guardianId @db.VarChar(64), state,
  invitedAt?, invitedBy?, activatedAt?, turnedOffAt?, @@id([clinicId, guardianId]) }` → `MODEL_SCOPE: "clinic"`.
- `enum PortalLinkPurpose { invite reset }`; `model PortalLink { id cuid, clinicId, guardianId, purpose, tokenHash String?
  @unique @db.Char(64), demoToken String? @db.VarChar(64), createdAt, expiresAt, usedAt?, cancelledAt?,
  @@index([clinicId, guardianId, purpose]), @@index([expiresAt]) }` → `"platform"` (read by the public accept route
  before a clinic is known; every query names `clinicId`, as `Credential`).
- `enum LoggedMessageKind` (the 10 + `portal_invite`, `password_reset`) on `Message.kind`; `Message.linkId String?`.
  `tenant-scope.test.ts` gains `expect(Object.values($Enums.LoggedMessageKind)).toEqual(LoggedMessageKind.options)`.
- Migration by `prisma migrate diff … --script` (the unique index warns; CONVENTIONS trap), then `db:deploy`, `db:generate`.
- `IdentityService.forSession`: `email: cred.email ?? ""`.
- 5.2 seed: credentials get `phone: a.phone ?? null`, `email: a.email || null`; `portalAccount.createMany` from
  `db.portalAccounts` (state active, activatedAt) inside the clinic's context; `seed.int.test.ts` asserts one active
  `PortalAccount` and one phone credential per seeded guardian with a unique number.

#### Phase 5 — Potential Issues

- `email` nullable is backward-compatible; every reader is in `IdentityService` and the seed.
- A database seeded before B11 has no portal accounts: use a fresh one (as every chunk).

**Issues identified:** none.

### Phase 6: Identity: sign-in by mobile, parents' passwords, the reset limit

#### Step 6.1: `RATE_LIMITS.reset`; the auth module exports the limiter

**File:** `apps/api/src/auth/rate-limit.ts`, `apps/api/src/auth/rate-limit.test.ts`, `apps/api/src/auth/auth.module.ts`
**Verify:** `pnpm run check -- rate-limit`

#### Step 6.2: Lookups, parent logins, no children → no identity, `/auth/password` for parents

**File:** `apps/api/src/auth/identity.service.ts`, `apps/api/src/auth/auth.service.ts`, `apps/api/test/int/portal-sign-in.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/portal-sign-in.int.test.ts`

**Phase 6 spec (condensed):**
- 6.1 `RATE_LIMITS.reset = { hits: RESET_TEXTS_PER_HOUR, windowSeconds: 3600 }` (not bound to a route: `PortalService`
  calls `RateLimitService.hit(bucketOf("reset", login))`); the sweep's `LONGEST_WINDOW_MS` becomes an hour.
  `AuthModule` exports `RateLimitService` and `RateLimitMiddleware`. Test: the reset limit is 3 per hour.
- 6.2 `IdentityService.loginsBy(login)` (`where: login.includes("@") ? { email } : { phone }`), replacing `loginsByEmail`;
  candidates whose guardian has no children are dropped (decision 10). `forSession` returns undefined for a guardian
  credential with zero children. `createParentLogin(tx, …)`, `setParentPassword(tx, …)`, `removeParentLogin(tx, guardianId)`,
  `phoneHolder(tx, phone, exceptAccountId)`, `followPhone(tx, guardianId, phone|null)` (P2002 → 409). `AuthService.login`
  uses `loginsBy` and the mock's new 401 words; `changePassword` drops the staff-only check (`who` required; the
  `DEMO_LOGINS && current === DEMO_PASSWORD` 403 covers seeded parents). Int test: sign in by number in three forms and
  by email; a wrong password; a parent changes their password; a guardian removed from their only child gets 401.

#### Phase 6 — Potential Issues

- Update the int tests that assert the old 401 words or the staff-only `/auth/password` 401.

**Issues identified:** none.

### Phase 7: The portal module and account texts

#### Step 7.1: `queueAccountText`, `AccountLinks`, any-hour sending

**File:** `apps/api/src/message-queue/account-links.ts` (new), `apps/api/src/message-queue/account-links.test.ts` (new), `apps/api/src/message-queue/message-queue.service.ts`, `apps/api/src/message-queue/message-send.handler.ts`, `apps/api/src/message-queue/message-queue.module.ts`, `apps/api/src/config/env.ts`
**Verify:** `pnpm run check -- account-links`

#### Step 7.2: `PortalService`, both controllers, the module, the rules

**File:** `apps/api/src/portal/portal.service.ts` (new), `apps/api/src/portal/portal-access.controller.ts` (new), `apps/api/src/portal/password-links.controller.ts` (new), `apps/api/src/portal/portal.module.ts` (new), `apps/api/src/app.module.ts`, `apps/api/src/auth/access-rules.ts`
**Verify:** `pnpm run check -- access-rules`

#### Step 7.3: Every new route reaches a controller and the guard

**File:** `apps/api/test/portal-routes.test.ts` (new)
**Verify:** `pnpm run check -- portal-routes`

#### Step 7.4: The portal on MySQL: invite, accept, reset, turn off, races

**File:** `apps/api/test/int/portal.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/portal.int.test.ts`

**Phase 7 spec (condensed):**
- 7.1 `AccountLinks` registry (register once; `mint(tx, linkId)` throws when none registered). `queueAccountText(tx,
  { kind, patientId, guardian, linkId, body })`: no consent check, `sendAt` now, `to` = that guardian's phone, body with
  `[link]`, outbox `message.send` with `availableAt` now. Handler: the claim's `SELECT` adds `kind, linkId`; the
  sending-hours defer moves inside the claim and is skipped for account kinds (decision 12); with `linkId` it calls
  `mint` (undefined → message `cancelled`, skip) and sends `body.replace(LINK_MARK, url)` without storing it. `lastTried`
  adds `AND kind NOT IN ('portal_invite','password_reset')`. Env: `WEB_URL` (z.url, default `http://localhost:3000`).
  Unit test: register/mint/double-register.
- 7.2 `PortalService` (owns `PortalAccount`, `PortalLink`): `access(patientId)`, `invite(viewer, patientId, guardianId)`
  and `turnOff(…)` (lockAccount → lockPatient → checks → withdraw texts by `linkId` → cancel links (E9) → write →
  queue → audit "Portal invitation" / "Portal access (turned off)"; turn-off then `closeAllFor` after commit), `check(token)`,
  `accept(token, password)` (hash before the tx; lockAccount → link `FOR UPDATE` → E8 checks → credential → state → used →
  audit; after commit `closeAllFor` on a reset, then `AuthService.open`), `requestReset(login)` (count first, then 202),
  `demoTexts(who)` (404 unless `DEMO_LOGINS`), and the minter (onModuleInit; stores `tokenHash`, `demoToken` only with
  `DEMO_LOGINS`). `PortalAccessController` (`@Controller("patients")`, 200 on POSTs) and `PasswordLinksController`
  (`@Controller("auth")`, `@HttpCode(202)` on reset), `PortalModule` (imports AuthModule, AuditModule, PatientsModule,
  MessageQueueModule; applies `RateLimitMiddleware` to `PasswordLinksController`). `CLINIC_RULES` gains the three staff
  rules (the drift test proves the mock match); `SELF_CHECKED_RULES` gains the four `/auth/*` routes.
- 7.3 HTTP test: each new route reaches its controller (401 or self-checked), and `GET /auth/demo-texts` is 404 without
  `DEMO_LOGINS`.
- 7.4 Int: the mock's portal tests ported (Steps 3.1, 3.2), plus: the text is sent at 22:00 Manila and with reminders
  declined; the log body holds `[link]` and the provider got the real link (fake `SmsProvider`); a definite failure then
  a retry: only the second link works; parallel accepts of one link: one 200, one 410; parallel invites of two guardians
  on one number: one 200, one 409; turn-off signs the parent out (next request 401); 4th reset in an hour 429.

#### Phase 7 — Potential Issues

- E5 is a new pattern (token minted at send time, `AccountLinks` registry): justified in E5.
- Module cycle check: Portal → Auth, Patients, MessageQueue; none of them imports Portal.
- `runInTransaction` reruns on deadlock: the minter's random token is drawn inside the callback, so a rerun simply mints
  again (nothing has left the database yet).

**Issues identified:** none beyond Questions 2–4.

### Phase 8: Number changes and the ownership proof

#### Step 8.1: A guardian's new number moves the sign-in and ends the sessions

**File:** `apps/api/src/patients/patient-writes.service.ts`, `apps/api/src/patients/patients.module.ts`, `apps/api/test/int/portal-guardians.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/portal-guardians.int.test.ts`

#### Step 8.2: Every route a parent can pass has an owner

**File:** `apps/api/src/auth/record-owners.ts`, `apps/api/src/auth/access-rules.test.ts`
**Verify:** `pnpm run check -- access-rules`

#### Step 8.3: A parent gets 403 for another family on every one of them, on MySQL

**File:** `apps/api/test/int/parent-ownership.int.test.ts` (new)
**Verify:** `test -f apps/api/test/int/parent-ownership.int.test.ts`

**Phase 8 spec (condensed):**
- 8.1 `PatientWritesService.update` and `quickUpdate`: after the guardian rows are written, for each guardian whose
  phone changed and who holds a parent credential, `identity.followPhone(tx, …)` (409 with the mock's words when another
  login holds it); after commit `sessions.closeAllFor` for those guardians (decision 15). Int test: the number change
  moves sign-in to the new number, the old fails, the old session gets 401; a clash is 409 and changes nothing.
- 8.2 `RecordOwners.has(path)`; unit test: every `CLINIC_RULES` entry a parent holds at `own` has an owner, and each
  `record` one is in the list registered by the services (asserted in the int test with the real app).
- 8.3 Int: the E12 sweep against MySQL with a seeded parent: another family's child → 403 on every route, own → not 403;
  `GET /messages` without `patientId` → 403.

#### Phase 8 — Potential Issues

- Lock order stays account → patient; `followPhone` only touches `Credential` (no lock taken there besides the row).

**Issues identified:** none.

## B11d: Cut-over

### Phase 9: `hybrid`, the browser spec, the docs

#### Step 9.1: Serve the new routes in `hybrid`

**File:** `apps/web/src/mocks/passthrough.ts`, `apps/web/src/mocks/passthrough.test.ts`
**Verify:** `pnpm run check -- passthrough`

#### Step 9.2: `e2e/api-portal.spec.ts`

**File:** `apps/web/e2e/api-portal.spec.ts` (new)
**Verify:** `test -f apps/web/e2e/api-portal.spec.ts`

#### Step 9.3: Record B11 in both CONVENTIONS files and CHUNKS

**File:** `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`, `apps/api/src/auth/record-owners.ts`

**Phase 9 spec (condensed):**
- 9.1 `API_ROUTES` gains, under "B11": `GET /patients/:id/portal-access`, the two `POST …/portal-invite|portal-off`,
  `POST /auth/password-link`, `POST /auth/password-link/accept`, `POST /auth/password-reset`, `GET /auth/demo-texts`;
  `passthrough.test.ts` asserts each is served.
- 9.2 `e2e/api-portal.spec.ts` (header with start-up commands, `DEMO_LOGINS=true WEB_URL=http://localhost:3190`):
  front desk registers a child, invites the mother on the Overview (status "Invited on …"), reads the link from
  `/auth/demo-texts`, the parent opens it, sets a password, acknowledges the notice, sees only that child; a
  `page.request` for a seeded child is 403 from the API (`x-request-id`); signs out and in by mobile number; forgot
  password → demo text → new password; front desk turns access off → the parent's next request is 401. ~4 sign-ins.
- 9.3 Root CONVENTIONS: the hybrid line (B11), a Commands row for the e2e spec, the db key v30, Domain rules (portal
  accounts, one number per sign-in, account texts any hour), the reporting deferral (demo tokens can't be revoked).
  apps/api CONVENTIONS: Current phase B1–B11, Where-things-live row for `src/portal/`, `WEB_URL`, Traps (token minted at
  send, Message → PortalLink order, demo tokens only with `DEMO_LOGINS`), Decisions recorded (B11 summary). CHUNKS: B11 ✅
  with status and the done-when proofs. `record-owners.ts`'s "until B11" comment updated.

#### Phase 9 — Potential Issues

- Running the e2e beside other API specs can trip the sign-in limit: clear `RateLimitCounter` between them.

**Issues identified:** none.

## 3. Related Files

| File | Role in B11 |
| --- | --- |
| `.claude/plans/feature-chunk-b11-parent-portal-plan/decisions.md` | The 22 settled decisions |
| `apps/api/CHUNKS.md:349-363` | B11 goal and done-when |
| `packages/shared/src/schemas/{auth,message,patient}.ts`, `domain/{permissions,sending,patient-list}.ts` | Contract and rules changed |
| `packages/seed/src/{logins,platform}.ts` | Who signs in (`references/logins-review.ts`) |
| `apps/web/src/features/auth/mocks.ts`, `mocks/{access,demo-accounts,db,passthrough}.ts` | The spec (`references/auth-mocks-review.ts`, `references/access-review.ts`) |
| `apps/web/src/features/patients/{mocks.ts,components/patient-overview.tsx}` | Guardian edits; where status shows |
| `apps/api/src/auth/{auth.service,identity.service,access-rules,access.guard,rate-limit,record-owners}.ts` | Identity and access (`references/identity-review.ts`) |
| `apps/api/src/message-queue/{message-queue.service,message-send.handler}.ts` | B9 queue to extend (`references/message-queue-review.ts`) |
| `apps/api/src/patients/{patient-writes.service,family.service}.ts` | Number follows; children per request |
| `apps/api/src/seed/seed-database.ts`, `prisma/schema.prisma` | Seed and tables |

## 4. Follow Ups

### Questions / Clarifications

None re-asks `decisions.md`. Recommended answer in bold; the plan is written to it.

1. **The sign-in field keeps the wire name `email`** while carrying a mobile too (E3). **Recommended: keep for B11**;
   rename to `login` later in shared, mock, web and API together (22 call sites, mostly tests).
2. **A staff edit moving a guardian with portal access onto another parent's number** (decisions 14 + 15 collide).
   **Recommended: refuse with 409** and the clear message; alternative: allow and drop that guardian's mobile sign-in.
3. **Where a reset text shows in the message log**: `Message.patientId` is required, so it is logged under the
   guardian's first child. **Recommended: accept** (staff can confirm "we texted you"); alternative: make `patientId`
   optional in the contract (wider change).
4. **Sign-in email after acceptance is a snapshot** of the guardian's email (decision 15 covers the number only).
   **Recommended: snapshot in B11**; follow-the-email later if wanted.
5. **Demo texts route** (E6) exposes live links on demo deployments only. **Recommended: keep** (it's the only way to
   demo and e2e-test invites without SMS); alternative: e2e via a fake provider only, no demo flow.
6. **CHUNKS lists "documents" among portal reads**, but parents have no documents route (documents.issue is staff);
   the portal's documents are their own uploads (B10). **Recommended: no new route**; amend CHUNKS in Step 9.3.
7. **`WEB_URL` must be set in production** (the link host). **Recommended: required go-live item in B13.**
8. **Expired `PortalLink` rows** are never pruned in B11. **Recommended: a sweep in `auth.jobs.ts` later** (rows are tiny).
9. **Reset timing**: a known number does more work than an unknown one (a measurable delay). **Recommended: accept for
   B11** (the count and the 202 are identical); queue the work after the response later if wanted.

### Issues Found

| Phase | Issue | Severity | Status |
| --- | --- | --- | --- |
| — | Invite links in the stored log body would let staff (and other guardians, via `messages.view`) take over an account | High | Planned: `[link]` in the log, token minted at send (E4, E5) |
| — | `MessageQueueService.queue` drops declined families and defers to 8 AM: wrong for invites (decisions 12, 20) | High | Planned: `queueAccountText` + defer skipped by kind (Step 7.1) |
| — | A failed invite would mark a child "no contact" (`hasNoContact`, `lastTried`) | Medium | Planned (Steps 1.3, 7.1) |
| — | `MessageKind` is the template key; adding kinds would create Owner-editable invite templates | Medium | Planned: `LoggedMessageKind` (E4) |
| 2 | Seeded guardian phones are random and can collide | Low | Planned: first keeps the sign-in, tested |
| 3 | The demo can't end a session on a number change (stateless token) | Low | Deferral (E11) |
| 4 | Phases 4–9 are written as condensed specs, not paste-ready diffs (the planning run hit its turn limit) | Medium | Open: the implementer writes those diffs from the specs, or the architect fills them in a follow-up run |

### Verification notes

- `pnpm run check -- <filter>` passes when the filter matches no file (`--passWithNoTests`); for steps that create a
  test, the verifier counts files run (as B8–B10).
- `test:int` isn't on the allowlist: integration files are gated by `test -f`; the implementer runs
  `pnpm --filter api test:int` per phase from Phase 5 and records it in `implementation-log.md`.
- **Checks (2026-10-17): 14 discriminating, 3 tree gates, 7 `test -f`, 1 unverifiable (Step 9.3).** No command repeats
  within a phase (`access-rules` closes 7.2 and 8.2, in different phases).
