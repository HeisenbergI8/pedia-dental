# Implementation log: chunk 22 (sign-ups, branding choices and approval)

## Phase 1: Shared contract — 2026-10-13

**Steps completed:** 1.1, 1.2, 1.3, 1.4
**Files changed:** `packages/shared/src/schemas/signup.ts` (new), `packages/shared/src/domain/signup.ts` (new),
`packages/shared/src/domain/signup.test.ts` (new), `packages/shared/src/index.ts`, `packages/shared/src/domain/tenancy.ts`,
`packages/shared/src/domain/tenancy.test.ts`, `packages/shared/src/schemas/tenancy.ts`, `apps/web/src/features/clinic/mocks.ts`,
`apps/web/src/features/clinic/components/branding-form.tsx`, `apps/web/src/features/clinic/components/plan-panel.tsx`,
`apps/web/src/mocks/owner-settings.test.ts`
**Deviations from plan:** `RecordPaymentInput` is named `RecordUpfrontPaymentInput`: `schemas/billing.ts` already exports a
`RecordPaymentInput` (patient payments), and the barrel re-export clashed (TS2308). Every later use in the plan takes the
new name. `sameClinicName` is added to shared here; the operator mocks' private `sameName` is swapped for it in Phase 2,
where that file is rewritten anyway.
**Gate:** `pnpm run check -- domain/signup` green (shared 5/5 in the new file); `pnpm run check -- owner-settings` green
(web 20/20); shared full suite 169/169.
**Notes:** `TierLimits` no longer has `headingFont`; a grep for `limits.headingFont` / `TIER_LIMITS[..].headingFont` is empty.

## Phase 2: Mock API — 2026-10-13

**Steps completed:** 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
**Files changed:** new `apps/web/src/mocks/seed-signups.ts`, `apps/web/src/mocks/signups.ts`, `apps/web/src/mocks/signups.test.ts`,
`apps/web/src/mocks/operator-signups.test.ts`, `apps/web/src/features/signup/form-data.ts`, `apps/web/src/features/signup/mocks.ts`,
`apps/web/src/features/operator/signup-mocks.ts`; changed `apps/web/src/mocks/db.ts` (Platform `signups` + `prices`, key v26),
`apps/web/src/mocks/seed.test.ts`, `apps/web/src/mocks/access.ts` (PUBLIC_RULES, new OPERATOR_RULES), `apps/web/src/mocks/handlers.ts`,
`apps/web/src/mocks/operator.test.ts` (multipart create, email/waiting duplicates, widened source guard),
`packages/shared/src/schemas/operator.ts` (CreateAccountInput = SignupInput + payment; AccountOverview.design),
`apps/web/src/features/operator/mocks.ts` (create through `createClinic`, private `sameName` removed, Set branding route),
`apps/web/src/features/operator/api.ts` (multipart `useCreateAccount`), `apps/web/src/features/operator/components/create-account-dialog.tsx` (interim defaults).
**Deviations from plan:** `RecordUpfrontPaymentInput` throughout (see Phase 1). `readSignupForm` filters reference parts with
`(f): f is File => typeof f !== "string"`: the plan's `f is Blob` predicate doesn't typecheck against `FormDataEntryValue`
(TS2677). The public test's raw fetch builds its URL from `env.apiUrl`, as the plan's note asked. The plan's colour pair
(`#9fe3d0` refused, `#0f766e` accepted) held, so no substitution.
**Gate:** `pnpm run typecheck` green; `pnpm run check -- src/mocks` green (web 8 files, 183/183); eslint on the touched folders clean.
**Notes:** The console dialog still sends the default look and a bank transfer dated today until Step 4.6.

## Phase 3: Shared form pieces and the public pages — 2026-10-13

**Steps completed:** 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
**Files changed:** new `apps/web/src/features/clinic/components/brand-fields.tsx`, `opening-hours-fields.tsx`,
`apps/web/src/features/signup/api.ts`, `features/signup/components/{signup-fields,signup-frame,get-started-screen,signup-status-screen}.tsx`,
`apps/web/src/app/get-started/page.tsx`, `apps/web/src/app/get-started/[reference]/page.tsx`; changed
`features/clinic/components/branding-form.tsx` (uses BrandColorField / HeadingFontSelect; BrandPreview moved),
`features/clinic/components/branches-panel.tsx` (uses OpeningHoursFields), `features/auth/components/login-screen.tsx`
("New clinic? Get started with Primolar"), `design/design-branding.test.ts` (signup-frame admitted for PrimolarLogo).
**Deviations from plan:** `conflictField` is typed with an explicit return union instead of an `as const` on a ternary
(TS1355). No other change; the RHF union paths type-checked without the Controller fallback.
**Gate:** `pnpm run typecheck` green; `pnpm run check -- design` green (web 6 files, 100/100); eslint 0 errors (the old
`LogoutInput` warning in features/auth/api.ts only).
**Notes:** Not yet looked at in a browser; the Phase 5 headless walk covers the screens.

## Phase 4: Operator console — 2026-10-13

**Steps completed:** 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8
**Files changed:** new `app/operator/(console)/signups/page.tsx`, `signups/[id]/page.tsx`, `prices/page.tsx`,
`features/operator/components/{signups-screen,signup-badge,owner-password,signup-detail,payment-fields,price-list-screen,set-branding-dialog}.tsx`;
changed `features/operator/api.ts` (sign-up, price and Set branding hooks; `signupFileUrl`), `components/operator-shell.tsx`
(header nav with aria-current), `components/create-account-dialog.tsx` (SignupFields + PaymentFields + amount due;
OwnerPassword moved out), `components/account-detail.tsx` (Design it for me card; Plan card copy).
**Deviations from plan:** `RecordUpfrontPaymentInput` (Phase 1). `owner-password.tsx` in the plan was a placeholder
("existing body, unchanged"); the chunk 21 body was moved in verbatim. `signup-detail.tsx` was missing its
`PaymentFields` import and carried unused `UpfrontMethod`, `Input` and `Select*` imports (left from before PaymentFields
was split out); fixed. `price-list-screen.tsx` uses the plan's own fallback, `useForm<z.input<typeof PriceForm>, unknown, PriceForm>`,
because `z.coerce` makes the resolver's input type `unknown`. `multipleOf(0.01)` kept; the walk tests a centavo amount.
**Gate:** `pnpm run typecheck` green; `pnpm run check -- src/design` green (100/100); full web suite 318/318; eslint 0 errors
(the old `LogoutInput` warning only).
**Notes:** Not yet seen in a browser; Step 5.4 walks it.

## Phase 5: Conventions, roadmap and close — 2026-10-13

**Steps completed:** 5.1, 5.2, 5.3, 5.4
**Files changed:** `CONVENTIONS.md` (sign-up rows, publicRefusal, font on every plan, sign-up money, v26, Platform shape,
guard and multipart notes), `ROADMAP.md` (chunk 22 marked done, built 2026-10-13), `apps/web/src/app/globals.css`
(token comment said the heading font was Big's; now "any plan").
**Deviations from plan:** the globals.css comment fix is extra (a stale "Big --font-title" line found during the walk).
**Gate (5.3):** `pnpm run check` green: shared 169/169, web 318/318. `npx eslint src` 0 errors (2 old warnings).
`pnpm --filter web lint` reports 1,176 errors, all inside `apps/web/.next-build/` (the gitignored production build from
chunk 18's deploy check), which `eslint.config.mjs` doesn't ignore. Not changed here; flagged.
**Walk (5.4):** `scratchpad/walk-chunk22.mjs` against the running dev server on :3150, demo data cleared before and after.
1 PASS each branding choice submits (thank-you + "Includes VAT"); 2 PASS duplicate name refused under "Clinic name" with
"Contact Primolar"; 3 PASS operator sees the sign-up logo (naturalWidth 240), records payment ("Paid, ready to approve"),
approves (one-time password) for Own and Plain; 4 PASS Own Owner: --color-brand #1e5fb4, --font-title Lexend, logo loads;
Plain Owner: #5b3fa8, no logo img, clinic name shown; 5 PASS rejected page shows heading and reason, also via
"Check sign-up"; 6 PASS Hagikgik approved → Design in progress → Set branding → Delivered, Owner sees #0f766e and logo;
7 PASS Ngiti (Small) font select enabled, Nunito saved (--font-title Nunito); 8 PASS Mid setup ₱11,000.50 shows on the
form with total ₱16,000.50; 9 PASS /get-started and /operator/signups at 375 px dark: scrollWidth 375.
Only console error: the expected 409 from clause 2. The first runs failed on three walk-script selector/timing bugs,
fixed in the script; no app change was needed.

## Review fixes (tester + auditor) — 2026-10-13

Tester: done-when met, 4 issues. Auditor: 82/100, all 29 steps delivered, plus 1 high finding.
- **High, underpaid approval:** Fix re-quoted a paid sign-up and Approve went through on the old payment. Now
  `PUT /operator/signups/:id` refuses a plan or look change once paid (409 `PAID_PLAN_LOCKED`), and the Fix dialog shows
  why and disables Save. New test in `operator-signups.test.ts`.
- Duplicate refusals map to their field only for the two duplicate messages (`duplicateField` in shared,
  `showDuplicate` in `signup-fields.tsx`); any other 409 shows on the form's error line (all three forms).
- **Set branding re-send:** `AccountOverview.look` (with `design` only) carries the current colour, font and whether a
  logo exists; the dialog starts from it and asks for a logo when the Owner has removed it.
- **Blank price saved as ₱0:** the peso rule now refuses blank (`z.coerce.string().trim().min(1).pipe(...)`).
- **Too many reference images:** the picker keeps what fits and says so; removing a file clears the note.
- "Rejected" twice: the card is now "Reason sent to the client".
- Comments: merged JSDoc on `TierLimits`; `layout.tsx` font comment; CONVENTIONS data-flow line names `*-mocks.ts`.
**Gate:** `pnpm run check` green: shared 170/170, web 319/319; `npx eslint src` 0 errors.
**Browser:** scratchpad/fixes22.mjs 6/6 PASS (picker, blank price, locked Fix, Set branding prefill); walk-chunk22.mjs
9/9 PASS again.
