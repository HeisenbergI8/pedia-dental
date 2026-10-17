"use client";
import { useRef } from "react";
import { IDEMPOTENCY_HEADER } from "@pedia/shared";
import { ApiError, UNREACHABLE } from "./api-client";

/** A fresh key. randomUUID needs a secure context; a clinic on plain-http LAN falls back to getRandomValues. */
export const newKey = (): string =>
  globalThis.crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");

/** The header for one money-moving request (B8 E2). */
export const idempotent = (key: string) => ({ [IDEMPOTENCY_HEADER]: key });

/**
 * After a 4xx the server answered (or refused) this attempt, so the next submit is a new request with a new key.
 * After a network failure, a 5xx or a page instead of JSON the outcome is unknown: a retry keeps the key.
 */
export function outcomeKnown(error: unknown): boolean {
  return error instanceof ApiError && error.status >= 400 && error.status < 500 && error.message !== UNREACHABLE;
}

/** One key per form: kept across retries of one attempt, replaced after a success or a known refusal. */
export function useIdempotencyKey() {
  const key = useRef(newKey());
  return {
    get current() {
      return key.current;
    },
    settle(error?: unknown) {
      if (!error || outcomeKnown(error)) key.current = newKey();
    },
  };
}
