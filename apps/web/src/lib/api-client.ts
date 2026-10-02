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
    headers: { "Content-Type": "application/json", ...init?.headers },
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return schema.parse(await res.json());
}
