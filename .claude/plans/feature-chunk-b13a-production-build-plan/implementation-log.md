# Implementation log: B13a production build, hardening and in-code operations

## Phases 1–2: Production-safe environment; HTTP hardening — 2026-10-18

**Steps completed:** 1.1, 1.2, 2.1, 2.2
**Files changed:** `apps/api/src/config/env.ts`, `src/config/env.test.ts`, `.env.example`, `src/http-setup.ts` (new), `src/main.ts`, `test/support/test-app.ts`, `test/int/support/int-app.ts`, `test/http-hardening.test.ts` (new), `test/app.test.ts`, `package.json` (helmet ^8, resolved 8.3.0)
**Deviations from plan:**
- `env.test.ts` already existed; extended rather than created (the defaults case now lists the new keys).
- `CORS_ORIGIN` uses `.transform(originsOf)` directly instead of `.pipe(z.transform(...))` (plan allowed either).
- `test/app.test.ts` passed `CORS_ORIGIN: ""`, which the new rule refuses; dropped it (the default applies).
**Gate:** `pnpm run check`: exit 0.
**Notes:** the trust-proxy test pins Express's rightmost-hop behaviour; the real hop count is B13b's Q3.
