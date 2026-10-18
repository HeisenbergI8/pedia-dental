/**
 * B13c1 E7: "ported" (CONVENTIONS → Reporting rules) as data. Every case in the web's handler tests
 * (apps/web/src/mocks/*.test.ts; passthrough.test.ts is the web's own) is proven against the API by one of:
 *  - an API test with the very same title, anywhere under apps/api/src or apps/api/test (no entry needed);
 *  - an entry naming the API test that proves the same behaviour: "<path from apps/api> › <its title>";
 *  - an entry saying why it can't apply to the API, from NOT_APPLICABLE, with the reason spelled out.
 * port-ledger.test.ts holds the entries to both sides: a web case with neither, an API title that doesn't exist, or an
 * entry whose web case was renamed fails `pnpm run check`. Whether the API test passes is `test:int`'s (CI).
 */
export const NOT_APPLICABLE = {
  /** MSW's own machinery: localStorage, the blob store, the demo clock, the hybrid bridge cookie. */
  msw: "MSW only",
  /** The API decided otherwise in a recorded decision (B4 decision: lists aren't audited). Cite it in `why`. */
  decided: "Decided otherwise for the API",
  /** How the web renders an answer the API gives the same (readableError on a 400's issues). */
  web: "Web rendering",
} as const;
export type NotApplicable = keyof typeof NOT_APPLICABLE;

export type Ported = { api: `test/${string}.test.ts › ${string}` | `src/${string}.test.ts › ${string}` } | { na: NotApplicable; why: string };

/** The web files whose every case must be ported. Grows by phase (B13c1 Phases 1–3) until it is all 13. */
export const ENFORCED: readonly string[] = [
  // Step 1.2 adds the five small files once their ledger lines are confirmed against the test bodies.
];

/** web file → web case title → where the API proves it. Only cases without a same-titled API test need a line. */
export const PORT_LEDGER: Readonly<Record<string, Readonly<Record<string, Ported>>>> = {
  // Step 1.2 fills these five; Steps 2.1 and 3.1 add the other eight files.
};
