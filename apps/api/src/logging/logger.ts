import type { Params } from "nestjs-pino";
import type { DestinationStream, LoggerOptions } from "pino";
import { currentContext } from "../common/request-context";
import { requestIdOf } from "../common/request-context.middleware";
import type { Env } from "../config/env";

/**
 * Never log patient data (CONVENTIONS → Observability): log ids. This list is the safety net, not the rule.
 * pino's `*` matches exactly one level, so each field is listed at the top and one level down
 * (`{ patient: { firstName } }`). Deeper objects are NOT covered: don't log whole records.
 */
export const PERSONAL_FIELDS = [
  "firstName", "middleName", "lastName", "fullName", "name", "nickname", "birthDate",
  "phone", "email", "address", "guardians", "emergencyContact", "allergies", "alerts",
  "notes", "note", "body", "password", "pin", "token",
] as const;

export const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  'res.headers["set-cookie"]',
  ...PERSONAL_FIELDS,
  ...PERSONAL_FIELDS.map((field) => `*.${field}`),
];

/** pino options shared by the HTTP logger and the tests: level, redaction, and the request id on every line. */
export function pinoOptions(env: Pick<Env, "LOG_LEVEL">): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    mixin: () => {
      const requestId = currentContext()?.requestId;
      return requestId ? { requestId } : {};
    },
  };
}

/** The path only: a query string can carry a search or a child's name and birth date (B4). Never logged. */
export const pathOnly = (url: string | undefined) => url?.split("?")[0];

/** For `LoggerModule.forRoot`. `stream` lets tests read the lines; production writes JSON to stdout. */
export function loggerParams(env: Pick<Env, "LOG_LEVEL">, stream?: DestinationStream): Params {
  const options = {
    ...pinoOptions(env),
    genReqId: requestIdOf,
    // pino-http hands this pino's standard request object; keep it, minus the query.
    serializers: { req: (req: { url?: string; query?: unknown }) => ({ ...req, url: pathOnly(req.url), query: undefined }) },
  };
  return { pinoHttp: stream ? [options, stream] : options };
}
