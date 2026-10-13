import type { OperatorUser } from "@pedia/shared";
import { DEMO_PASSWORD } from "./demo-accounts";

/**
 * Primolar's own staff (decisions #3, #25). Deliberately not in `Platform`: they aren't a clinic's data, so they are
 * never inside a tenant, never listed by `allAccounts`, and can't sign in on the clinic sign-in page. Prototype: one
 * operator, the demo password (a demo control, like every demo login; CONVENTIONS "Reporting rules").
 */
export const OPERATORS: OperatorUser[] = [{ id: "operator_primolar", name: "Primolar Support", email: "operator@primolar.demo" }];

/** The operator console's cookie, written by stores/operator-session-store.ts. Never `pd_session`. */
export const OPERATOR_COOKIE = "pd_operator";

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
