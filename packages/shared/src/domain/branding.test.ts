import { describe, expect, it } from "vitest";
import {
  AA_TEXT,
  BRAND_BACKGROUNDS,
  DEFAULT_BRAND_COLOR,
  brandColorProblem,
  contrastRatio,
  deriveBrandPalette,
  logoProblem,
  paletteFailures,
  suggestBrandColor,
} from "./branding";

const hex = (n: number) => n.toString(16).padStart(2, "0");
/** 216 colours: every 51st step of each channel, the web-safe cube. Fast (well under a second) and covers every hue. */
const CUBE = [0, 51, 102, 153, 204, 255].flatMap((r) => [0, 51, 102, 153, 204, 255].flatMap((g) => [0, 51, 102, 153, 204, 255].map((b) => `#${hex(r)}${hex(g)}${hex(b)}`)));

describe("contrast", () => {
  it("matches WCAG's endpoints", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });
});

describe("brand colour check (decision #29)", () => {
  it("accepts Primolar's plum and both demo colours", () => {
    for (const c of [DEFAULT_BRAND_COLOR, "#b0245e", "#1e5fb4"]) expect(brandColorProblem(c), c).toBeUndefined();
  });

  it("refuses a low-contrast colour, saying how far off it is", () => {
    expect(brandColorProblem("#e07a48")).toBe("This colour is too light for text and buttons: 2.6:1 against the page, and it needs 4.5:1.");
    expect(brandColorProblem("#ffffff")).toMatch(/1\.0:1/);
    expect(brandColorProblem("orange")).toBe("Enter a colour as # and six letters or digits");
  });

  it("suggests the nearest passing colour: the same hue, only just dark enough", () => {
    const s = suggestBrandColor("#e07a48");
    expect(brandColorProblem(s)).toBeUndefined();
    const onSelected = contrastRatio(s, BRAND_BACKGROUNDS.light.selected);
    expect(onSelected).toBeGreaterThanOrEqual(AA_TEXT);
    expect(onSelected).toBeLessThan(5); // nearest, not "make it black"
    const [r, , b] = [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b!); // still an orange
    expect(suggestBrandColor("#5B3FA8")).toBe("#5b3fa8"); // a passing colour comes back as itself
  });
});

describe("derived palette", () => {
  it("derives Primolar's plum without a failing pair, close to the hand-tuned tokens", () => {
    const p = deriveBrandPalette(DEFAULT_BRAND_COLOR);
    expect(paletteFailures(p)).toEqual([]);
    expect(p.light.brand).toBe(DEFAULT_BRAND_COLOR);
    expect(p.light["brand-ink"]).toBe("#ffffff");
    expect(contrastRatio(p.dark.brand, BRAND_BACKGROUNDS.dark.surface)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("never derives a failing pair, for any colour the check accepts or suggests (216-colour sweep)", () => {
    const failures = CUBE.flatMap((c) => {
      const used = brandColorProblem(c) ? suggestBrandColor(c) : c;
      if (brandColorProblem(used)) return [`${c}: suggestion ${used} still fails`];
      return paletteFailures(deriveBrandPalette(used)).map((f) => `${c}: ${f}`);
    });
    expect(failures).toEqual([]);
  });
});

describe("logo files (decision #28)", () => {
  it("takes PNG, JPG and SVG up to 1 MB", () => {
    expect(logoProblem({ type: "image/svg+xml", size: 4_000 })).toBeUndefined();
    expect(logoProblem({ type: "image/png", size: 1024 * 1024 })).toBeUndefined();
    expect(logoProblem({ type: "image/png", size: 1024 * 1024 + 1 })).toBe("Logos must be 1 MB or smaller");
    expect(logoProblem({ type: "image/gif", size: 10 })).toBe("Choose a PNG, JPG or SVG file");
  });
});
