import { describe, expect, it } from "vitest";
import { filesMatching, read } from "./source";

const CSS = read("app/globals.css");

/** `--color-x: #rrggbb` inside the block that opens at `marker` (neither block nests braces). */
function block(marker: string): Record<string, string> {
  const start = CSS.indexOf(marker);
  if (start < 0) throw new Error(`globals.css has no block "${marker}"`);
  const body = CSS.slice(start, CSS.indexOf("}", start));
  return Object.fromEntries([...body.matchAll(/--color-([\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, k, v]) => [k, v.toLowerCase()]));
}

const LIGHT = block("@theme {");
const DARK = { ...LIGHT, ...block(':root[data-theme="dark"] {') };

const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [foreground, background, minimum]: text 4.5:1 (WCAG 1.4.3), UI parts and chart marks 3:1 (1.4.11). */
const PAIRS: [string, string, number][] = [
  ["ink", "ground", 4.5],
  ["ink", "surface", 4.5],
  ["ink", "selected", 4.5],
  ["ink-muted", "ground", 4.5],
  ["ink-muted", "surface", 4.5],
  ["ink-muted", "surface-raised", 4.5],
  ["ink-muted", "selected", 4.5],
  ["ink-muted", "track", 4.5],
  ["brand", "surface", 4.5],
  ["brand", "ground", 4.5],
  ["brand", "selected", 4.5],
  ["brand", "brand-subtle", 4.5],
  ["brand-ink", "brand", 4.5],
  ["brand-tint-ink", "brand-subtle", 4.5],
  ["on-deep", "brand-deep", 4.5],
  ["on-deep-muted", "brand-deep", 4.5],
  ["on-deep-label", "brand-deep", 4.5],
  ["second", "second-bg", 4.5],
  ["second", "surface", 4.5],
  ["ink-muted", "second-bg", 4.5],
  ["ink-muted", "brand-subtle", 4.5],
  ["ink", "sunny", 4.5],
  ["ink-muted", "sunny", 4.5],
  ["input-border", "surface", 3],
  ["chart-bar", "surface", 3],
  ["chart-returning", "surface", 3],
  ["chart-new", "surface", 3],
  ...(["success", "info", "warning", "danger", "alert"] as const).map((s): [string, string, number] => [s, `${s}-bg`, 4.5]),
];

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
] as const)("%s theme contrast", (_, t) => {
  it.each(PAIRS)("%s on %s reaches %s:1", (fg, bg, min) => {
    expect(t[fg], `--color-${fg} is missing or not #rrggbb`).toBeDefined();
    expect(t[bg], `--color-${bg} is missing or not #rrggbb`).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });
  it("the stacked series differ in lightness, not hue alone", () => {
    expect(ratio(t["chart-returning"], t["chart-new"])).toBeGreaterThanOrEqual(1.3);
  });
});

describe("token hygiene", () => {
  it("no file uses a retired token", () => {
    expect(filesMatching(/\b(brand-soft|plum-bg|(?:bg|text|border|ring|fill|stroke)-plum)\b|--color-plum/)).toEqual([]);
  });
  it("raw hex lives only in the token file, the PDF, the manifest and the seeded brand colours (data, not styling)", () => {
    expect(filesMatching(/#[0-9a-fA-F]{6}\b/)).toEqual([
      "app/globals.css",
      "app/manifest.ts",
      "features/documents/components/document-pdf.tsx",
    ]);
  });
});
