import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ENFORCED, PORT_LEDGER, type Ported } from "./port-ledger";

// A guard that reads source, like src/auth/access-rules.test.ts: the web's handler tests were the contract's tests.
const WEB_MOCKS = new URL("../../web/src/mocks/", import.meta.url);
const API_ROOT = new URL("../", import.meta.url); // apps/api/
const read = (url: URL) => readFileSync(url, "utf8");

/** `it("…")`, `test('…')`, `it.each(…)("…")`; the title may sit on the next line. Escapes are undone. */
const CASE = /^\s*(?:it|test)(?:\.each\([^)]*\))?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/gm;
const OPENER = /^\s*(?:it|test)(?:\.each\([^)]*\))?\(/gm;
export const caseTitles = (source: string): string[] => [...source.matchAll(CASE)].map((m) => m[2]!.replace(/\\(.)/g, "$1"));

const WEB_FILES = readdirSync(WEB_MOCKS).filter((f) => f.endsWith(".test.ts") && f !== "passthrough.test.ts").sort();
const webCases = new Map(WEB_FILES.map((f) => [f, caseTitles(read(new URL(f, WEB_MOCKS)))]));

/** Every API test file (unit and integration), by its path from apps/api. The generated client is skipped. */
function apiTestFiles(dir = "", out: string[] = []): string[] {
  for (const e of readdirSync(new URL(dir || ".", API_ROOT), { withFileTypes: true })) {
    const path = `${dir}${e.name}`;
    if (e.isDirectory() && !["node_modules", "generated", "dist"].includes(e.name)) apiTestFiles(`${path}/`, out);
    else if (e.isFile() && e.name.endsWith(".test.ts") && (path.startsWith("src/") || path.startsWith("test/"))) out.push(path);
  }
  return out;
}
const apiCases = new Map(["src/", "test/"].flatMap((d) => apiTestFiles(d)).map((p) => [p, new Set(caseTitles(read(new URL(p, API_ROOT))))]));
const anyApiTitle = new Set([...apiCases.values()].flatMap((s) => [...s]));

/** Why a web case isn't ported, or undefined when it is. */
function unported(file: string, title: string): string | undefined {
  if (anyApiTitle.has(title)) return undefined;
  const entry: Ported | undefined = PORT_LEDGER[file]?.[title];
  if (!entry) return `${file} › ${title}: no API test has this title and the ledger has no entry`;
  if ("na" in entry) return entry.why.trim().length >= 10 ? undefined : `${file} › ${title}: say why it can't apply`;
  const [path, apiTitle] = entry.api.split(" › ") as [string, string];
  if (!apiCases.has(path)) return `${file} › ${title}: ${path} is not an API test file`;
  return apiCases.get(path)!.has(apiTitle) ? undefined : `${file} › ${title}: ${path} has no case "${apiTitle}"`;
}

describe("the port ledger (B13c1 E7)", () => {
  it("reads every case of the web's 13 handler-test files, and nothing it can't parse", () => {
    expect(WEB_FILES).toHaveLength(13); // a new handler-test file must be added to the ledger and ENFORCED
    for (const f of WEB_FILES) {
      const source = read(new URL(f, WEB_MOCKS));
      expect(caseTitles(source), `${f}: a case title the parser can't read`).toHaveLength(source.match(OPENER)?.length ?? 0);
    }
  });

  it("names only real web files and current web cases (a renamed web case is caught)", () => {
    for (const f of [...ENFORCED, ...Object.keys(PORT_LEDGER)]) expect(WEB_FILES, f).toContain(f);
    const stale = Object.entries(PORT_LEDGER).flatMap(([f, entries]) => Object.keys(entries).filter((t) => !webCases.get(f)!.includes(t)).map((t) => `${f} › ${t}`));
    expect(stale).toEqual([]);
  });

  it.each(ENFORCED.map((f) => [f]))("ports every case of %s to an API test that exists", (file) => {
    expect(webCases.get(file)!.map((t) => unported(file, t)).filter(Boolean)).toEqual([]);
  });

  // Removed in Step 3.1, when ENFORCED is all 13.
  for (const f of WEB_FILES.filter((f) => !ENFORCED.includes(f))) it.todo(`ports every case of ${f} (pending, B13c1 Phase 2 or 3)`);
});
