# Implementation log: B11 parent portal

## Phase 1: The shared contract — 2026-10-17

**Steps completed:** 1.1, 1.2, 1.3
**Files changed:** `packages/shared/src/domain/portal.ts` (+test), `schemas/portal.ts`, `schemas/auth.ts` (+test), `schemas/message.ts`, `domain/permissions.ts` (+test), `domain/patient-list.ts` (+test), `domain/messages.ts`, `index.ts`; `apps/web/src/features/messages/api.ts`; `apps/web/e2e/{owner,access-control}.spec.ts` (new refine words); `apps/api/src/message-queue/message.rows.ts`
**Deviations from plan:**
- The reset text puts the link last ("... Didn't ask? Ignore this text. [link]"), as the plan's own rule says; the test checks both texts end with the link.
- `MessageEvent.kind` stays `MessageKind` (a parent message is always a template kind), so `queue` keeps reading templates by kind.
- `CARE_KINDS` is typed `LoggedMessageKind[]` (the portal filters log rows with it).
- `messageData` casts `kind` to Prisma's enum until Phase 5 widens the column.
**Gate:** `pnpm run check`: green.
