/**
 * Audit #20: a password reset for a known parent does locked work and queues a text; for an unknown number it does
 * neither. Every request answers after at least RESET_ANSWER_MS, so the two can't be told apart by timing. Wall time
 * (not the injected Clock, which tests fix): this is about how long the answer takes, not what day it is.
 */
export const RESET_ANSWER_MS = 750;

/** Runs `work`, then waits out the rest of `ms` (on success and on failure alike). */
export async function atLeast<T>(ms: number, work: () => Promise<T>, now: () => number = () => performance.now()): Promise<T> {
  const started = now();
  try {
    return await work();
  } finally {
    const left = ms - (now() - started);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
  }
}
