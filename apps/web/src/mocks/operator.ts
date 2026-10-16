import type { OperatorUser } from "@pedia/shared";
import { OPERATORS as SEED_OPERATORS } from "@pedia/seed";
import { DEMO_PASSWORD } from "./demo-accounts";

/** Primolar's own staff (decisions #3, #25), from packages/seed so the API seeds the same operator. */
export const OPERATORS: OperatorUser[] = SEED_OPERATORS;

/** The operator console's cookie (lib/session-cookies.ts). Never `pd_session`. Kept here for the mock tests. */
export { OPERATOR_COOKIE } from "@/lib/session-cookies";

/** `operator.<operator id>`: a shape no clinic token has (those are `demo.<clinic id>.<account id>`). */
export const operatorToken = (operator: Pick<OperatorUser, "id">) => `operator.${operator.id}`;
const TOKEN = /^operator\.([^.]+)$/;

/** Who an operator token names. Undefined for anything else, a clinic token included. */
export function operatorForToken(token: string | undefined): OperatorUser | undefined {
  const [, id] = token?.match(TOKEN) ?? [];
  return id ? OPERATORS.find((o) => o.id === id) : undefined;
}

/** Prototype: the demo password. NestJS: its own operator identity provider, never the clinics' user table. */
export const operatorPasswordOpens = (password: string) => password === DEMO_PASSWORD;
