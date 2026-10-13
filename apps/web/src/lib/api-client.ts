import type { z } from "zod";
import { env } from "./env";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The only way features talk to the backend. Every response is parsed with
 * a shared Zod schema, so a mismatch between mock, API and UI fails loudly.
 */
export async function api<T extends z.ZodType>(
  path: string,
  schema: T,
  init?: RequestInit,
): Promise<z.infer<T>> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    // A FormData body (file upload) sets its own multipart Content-Type and boundary.
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, readableError(await res.text()));
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new ApiError(res.status, UNREACHABLE); // a web page where JSON belongs: the request never reached the API
  }
  return schema.parse(body);
}

/** Shown when the reply is a web page or empty, never the page's own markup. */
export const UNREACHABLE = "Couldn't reach Primolar. Check your connection and try again.";

/** A 400 carries Zod issues as JSON; show their messages, not the raw JSON. */
export function readableError(body: string): string {
  try {
    const issues: unknown = JSON.parse(body);
    if (Array.isArray(issues)) return issues.map((i: { message?: string }) => i.message).filter(Boolean).join(". ") || body;
  } catch {
    // plain-text error
  }
  // An HTML error page (a request that missed the API, a host's 404 or 500) or nothing at all.
  if (!body.trim() || /^\s*</.test(body)) return UNREACHABLE;
  return body;
}
