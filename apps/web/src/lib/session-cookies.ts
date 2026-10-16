import type { OperatorSession, Session, SessionUser } from "@pedia/shared";
import type { ApiMockingMode } from "./env";

/** The clinic session. Script-written only in `enabled` (the mock's token); otherwise the API's own httpOnly cookie. */
export const SESSION_COOKIE = "pd_session";
/** The operator's session (decision #25), split the same way as pd_session. */
export const OPERATOR_COOKIE = "pd_operator";
/** The device's branch. Script-written in every mode; the mock (`branchOf`) and the API (`branchFor`) both validate it. */
export const BRANCH_COOKIE = "pd_branch";
/**
 * `hybrid` only: who is signed in, for the routes MSW still answers. Not a secret: it names a login the API already
 * authenticated through pd_session, the API never reads it, and MSW is a prototype. Read by mocks/access.ts.
 */
export const MOCK_SESSION_COOKIE = "pd_mock_session";
export const MOCK_OPERATOR_COOKIE = "pd_mock_operator";

/**
 * The mock's token for a login the API signed in: `tokenFor` in mocks/demo-accounts.ts, built from the account-id rule in
 * packages/seed (logins.ts: staff by staff id, parents `guardian.<id>`), so it holds whatever the API puts in `user.id`.
 */
export const mockTokenOf = (user: Pick<SessionUser, "id" | "clinicId" | "staffId" | "guardianId">) =>
  `demo.${user.clinicId}.${user.guardianId ? `guardian.${user.guardianId}` : (user.staffId ?? user.id)}`;

/** The cookie MSW reads a clinic token from: the bridge in `hybrid` (pd_session is httpOnly there), else pd_session. */
export const clinicTokenCookie = (mode: ApiMockingMode) => (mode === "hybrid" ? MOCK_SESSION_COOKIE : SESSION_COOKIE);
export const operatorTokenCookie = (mode: ApiMockingMode) => (mode === "hybrid" ? MOCK_OPERATOR_COOKIE : OPERATOR_COOKIE);

export type CookieWrite = readonly [name: string, value: string | null];

/**
 * What the clinic store writes from script for this session (null: signed out). `enabled`: pd_session with the mock's
 * token, as before B2d. `hybrid`: the bridge only. `disabled`: nothing, since no MSW reads it.
 */
export function clinicSessionWrites(mode: ApiMockingMode, session: Session | null): CookieWrite[] {
  if (mode === "enabled") return [[SESSION_COOKIE, session?.token ?? null]];
  if (mode === "hybrid") return [[MOCK_SESSION_COOKIE, session ? mockTokenOf(session.user) : null]];
  return [];
}

/** The operator store's writes, by the same rule. The bridge is `operator.<id>`, as `operatorToken` (mocks/operator.ts). */
export function operatorSessionWrites(mode: ApiMockingMode, session: OperatorSession | null): CookieWrite[] {
  if (mode === "enabled") return [[OPERATOR_COOKIE, session?.token ?? null]];
  if (mode === "hybrid") return [[MOCK_OPERATOR_COOKIE, session ? `operator.${session.operator.id}` : null]];
  return [];
}

/** No expiry, so the browser drops it on quit; the stores write it again on rehydrate. Null deletes it. */
export function writeCookie(name: string, value: string | null): void {
  document.cookie = value ? `${name}=${value}; path=/; SameSite=Lax` : `${name}=; path=/; max-age=0`;
}
