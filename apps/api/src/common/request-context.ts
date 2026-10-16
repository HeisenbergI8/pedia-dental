import { AsyncLocalStorage } from "node:async_hooks";
import type { Role } from "@pedia/shared";

/** Who is calling, and for which clinic. One per request. Services read it; nothing passes `clinicId` by hand. */
export type RequestContext = {
  requestId: string;
  /** The tenant. Absent for the operator, sign-up and signed-out routes: tenant models then refuse every query. */
  clinicId?: string;
  /** The branch this device works at (the `pd_branch` cookie, validated by B2). */
  branchId?: string;
  /** The signed-in clinic user (B2 fills it from the session). `role` is the highest held, as in the mock. */
  user?: { id: string; name: string; role: Role; roles: Role[] };
  /** A Primolar operator. Never selects a tenant (decision #25). */
  operator: boolean;
  /** The signed-in operator (pd_operator), for /operator/auth/me and the operator's audit (B12). */
  operatorId?: string;
};

const storage = new AsyncLocalStorage<RequestContext>();

/** The current context, or undefined outside one (startup, a worker before `run`). */
export const currentContext = (): RequestContext | undefined => storage.getStore();

/** The current context. Throws outside one: code that needs a request must not run without one. */
export function requireContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("No request context: wrap this call in requestContext.run(...).");
  return ctx;
}

export const requestContext = {
  /** Runs `fn` inside `ctx`: the middleware per request; workers, the seed and tests per unit of work. */
  run: <T>(ctx: RequestContext, fn: () => T): T => storage.run(ctx, fn),
  current: currentContext,
  /** Fills in what a later step learns (B2's session guard: clinic, branch, user). Only this request sees it. */
  assign(patch: Partial<Omit<RequestContext, "requestId">>): void {
    Object.assign(requireContext(), patch);
  },
  /**
   * Runs `fn` as this request with `patch` applied, then returns to it: sign-in reading or auditing in a clinic it
   * hasn't chosen yet. Awaited inside, because Prisma queries are lazy (CONVENTIONS → Traps).
   */
  within<T>(patch: Partial<Omit<RequestContext, "requestId">>, fn: () => Promise<T>): Promise<T> {
    return storage.run({ ...requireContext(), ...patch }, async () => await fn());
  },
};
