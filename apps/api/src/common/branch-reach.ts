import { rolesCan, type Branch, type Role } from "@pedia/shared";

/** Who is asking, as far as branches go: the session's roles and the branches it may work at (`identity.branches`). */
export type BranchCaller = { user: { roles: readonly Role[] }; branches: readonly Pick<Branch, "id">[] };

/**
 * May this caller change a branch-level record (an appointment, a bill) by its id? The Owner (`branches.all`) anywhere,
 * anyone else only at a branch they work at (a parent's usable branches are every open one). A record out of reach
 * answers as if it weren't there (404), the way every other scoping answers. Paying and applying credit stay open
 * across branches on purpose: a payment goes to its bill's branch wherever it's paid (CONVENTIONS).
 */
export const reachesBranch = (who: BranchCaller, branchId: string): boolean =>
  rolesCan(who.user.roles, "branches.all") || who.branches.some((b) => b.id === branchId);
