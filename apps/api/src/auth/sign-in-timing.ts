/**
 * Security review #20: a failed sign-in takes at least this long, whatever failed (an unknown login, a wrong
 * password, a locked login, a missing two-step code), so its timing says nothing about which logins exist. Comfortably
 * above an argon2id check plus sign-in's lookups. Real elapsed time, not `Clock`: this is about the wire, not the date.
 */
export const SIGN_IN_FLOOR_MS = 400;

/** Runs `work`; if it throws, waits until `floorMs` have passed since the start, then throws the same error. */
export async function failNoSoonerThan<T>(floorMs: number, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await work();
  } catch (error) {
    const left = floorMs - (performance.now() - started);
    if (left > 0) await new Promise((resolve) => setTimeout(resolve, left));
    throw error;
  }
}
