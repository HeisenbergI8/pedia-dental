# Implementation log: Chunk B2d — web cut-over of sign-in to the real API

## Phase 1: The cookie module — 2026-10-16
**Steps completed:** 1.1, 1.2
**Files changed:** `apps/web/src/lib/session-cookies.ts`, `apps/web/src/lib/session-cookies.test.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run typecheck`; `pnpm run check` (with Phase 2–3).

## Phase 2: Stores and MSW use it — 2026-10-16
**Steps completed:** 2.1, 2.2
**Files changed:** `apps/web/src/stores/{session-store,operator-session-store}.ts`, `apps/web/src/mocks/{access,operator}.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green (web 342).

## Phase 3: Fill `API_ROUTES` — 2026-10-16
**Steps completed:** 3.1
**Files changed:** `apps/web/src/mocks/{passthrough,passthrough.test}.ts`
**Deviations from plan:** none.
**Gate:** `pnpm run check` green.

## Phase 4: Sign-in against the API, through the UI — 2026-10-16
**Steps completed:** 4.1
**Files changed:** `apps/web/e2e/api-sign-in.spec.ts`, `apps/web/.gitignore` (`/.next-hybrid/`)
**Deviations from plan:**
- **The staff tests' clinic check** looked for the clinic name as text; the sidebar shows it as the logo image
  (alt "Bulilit Smiles Pediatric Dental"), so 4 of 10 failed though sign-in worked (screenshot: the Owner on the
  dashboard at Imus). It now accepts the logo's alt text or the name as text.
- **Run setup, not committed:** the container's Chromium (build 1194) is older than the installed Playwright expects,
  so the run used a temporary config (`launchOptions.executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome`,
  one worker), deleted afterwards. `prisma migrate reset` now refuses to run from an AI agent without the user's
  consent, so the API ran against a fresh database `pedia_dental_e2e` (`migrate deploy` + `db:seed`) instead of
  resetting `pedia_dental`. Rate-limit rows in that database were cleared between runs.
- `next dev` with `NEXT_DIST_DIR=.next-hybrid` rewrote `apps/web/tsconfig.json`; reverted (recorded as a trap).
**Gate:** `pnpm run typecheck` green. **By hand:** API on :4110 (`DATABASE_URL=…/pedia_dental_e2e DEMO_LOGINS=true
COOKIE_SECURE=false`), hybrid web on :3160 (`NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=hybrid
API_PROXY_TARGET=http://localhost:4110`), then `E2E_API=1 E2E_BASE_URL=http://localhost:3160 npx playwright test
e2e/api-sign-in.spec.ts --project=desktop`: **10 passed, exit 0** (owner, admin, front desk, Ngiti owner, the
dentist's chooser both ways, the parent, the Owner's branch switch across a reload, sign-out, the operator). Both
servers stopped by PID after confirming their cwd was this repo.

## Phase 5: Record it — 2026-10-16
**Steps completed:** 5.1, 5.2
**Files changed:** `CONVENTIONS.md`, `apps/api/CONVENTIONS.md`, `apps/api/CHUNKS.md`
**Deviations from plan:** also corrected the API CONVENTIONS claim that every `Session` query names `clinicId` (B2b
audit finding), and added the tsconfig trap.
**Gate:** prose. `pnpm run check` green at close.
