import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { clearAllDrafts, clearDraft, draftKey, readDraft, writeDraft } from "./form-draft";

// The node test environment has no sessionStorage: a Map-backed stand-in with the Storage methods we use.
function memoryStorage() {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

beforeEach(() => vi.stubGlobal("sessionStorage", memoryStorage()));
afterEach(() => vi.unstubAllGlobals());

const key = draftKey("new-patient", "acct_front_desk");

it("keeps a draft for the tab and gives it back with when it was saved", () => {
  writeDraft(key, { firstName: "Bea" });
  expect(readDraft<{ firstName: string }>(key)).toMatchObject({ values: { firstName: "Bea" }, savedAt: expect.any(String) });
  clearDraft(key);
  expect(readDraft(key)).toBeUndefined();
});

it("signing in or out clears every draft and nothing else", () => {
  writeDraft(key, { firstName: "Bea" });
  writeDraft(draftKey("new-patient", "acct_admin"), { firstName: "Ana" });
  sessionStorage.setItem("unrelated", "keep");
  clearAllDrafts();
  expect(sessionStorage.length).toBe(1);
  expect(sessionStorage.getItem("unrelated")).toBe("keep");
});

it("fails quietly when storage is unavailable", () => {
  vi.stubGlobal("sessionStorage", undefined);
  expect(readDraft(key)).toBeUndefined();
  expect(() => writeDraft(key, {})).not.toThrow();
  expect(() => clearAllDrafts()).not.toThrow();
});
