/**
 * Unsaved form drafts, in sessionStorage only: a child's health details on a shared clinic computer. A draft lives as
 * long as the tab, survives a refresh, and never reaches another tab or the next person to open the browser. Cleared
 * on save, discard, sign-in and sign-out. Storage can be missing or full (private mode): every call fails quietly.
 */
const PREFIX = "pedia-dental:draft:";

export const draftKey = (form: string, userId: string) => `${PREFIX}${form}:${userId}`;

export function readDraft<T>(key: string): { savedAt: string; values: T } | undefined {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

export function writeDraft(key: string, values: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), values }));
  } catch {
    // no storage: the form still works, it just isn't kept
  }
}

export function clearDraft(key: string) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // nothing stored
  }
}

export function clearAllDrafts() {
  try {
    const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i));
    for (const k of keys) if (k?.startsWith(PREFIX)) sessionStorage.removeItem(k);
  } catch {
    // nothing stored
  }
}
