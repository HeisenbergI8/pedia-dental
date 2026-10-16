import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Injectable, type NestMiddleware } from "@nestjs/common";
import { requestContext } from "./request-context";

/** A proxy's id is kept only if it looks like one, so a header can't inject text into every log line. */
const WELL_FORMED = /^[\w-]{8,64}$/;

/**
 * The request id: `req.id` if already set, else a well-formed incoming `x-request-id`, else a new UUID.
 * Stored on `req.id` and echoed in the response header. Also pino-http's `genReqId` (src/logging/logger.ts).
 */
export function requestIdOf(req: IncomingMessage & { id?: unknown }, res: ServerResponse): string {
  if (typeof req.id === "string") return req.id;
  const incoming = req.headers["x-request-id"];
  const id = typeof incoming === "string" && WELL_FORMED.test(incoming) ? incoming : randomUUID();
  req.id = id;
  res.setHeader("x-request-id", id);
  return id;
}

/** Opens the request context. B2's session guard fills in clinic, branch and user with `requestContext.assign`. */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: IncomingMessage, res: ServerResponse, next: () => void) {
    requestContext.run({ requestId: requestIdOf(req, res), operator: false }, next);
  }
}
