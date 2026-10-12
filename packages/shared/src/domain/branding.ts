/** One sRGB colour, each channel 0–1. */
type Rgb = [number, number, number];
type Lch = { l: number; c: number; h: number };

/** The tokens a clinic's one brand colour sets (globals.css names without `--color-`). Everything else stays Primolar's. */
export type BrandTokens = {
  brand: string;
  "brand-ink": string;
  "brand-subtle": string;
  "brand-ring": string;
  "brand-tint-ink": string;
  "brand-deep": string;
  "on-deep-muted": string;
  "on-deep-label": string;
};
export type BrandPalette = { light: BrandTokens; dark: BrandTokens };

/** Primolar's plum (`--color-brand` in globals.css): a new account's colour until the Owner picks one. */
export const DEFAULT_BRAND_COLOR = "#5b3fa8";
/** WCAG 2.2 AA for text (1.4.3), which buttons and links in the brand colour must meet. */
export const AA_TEXT = 4.5;

/**
 * The neutral tokens brand colours sit on, per theme. They mirror globals.css (design-branding.test.ts asserts it),
 * because the check runs here, in the mock API and later in NestJS, none of which can read CSS.
 */
export const BRAND_BACKGROUNDS = {
  light: { surface: "#ffffff", ground: "#f7f7f4", selected: "#f1f1ee", "ink-muted": "#56656a", "on-deep": "#ffffff" },
  dark: { surface: "#1a1c1b", ground: "#121413", selected: "#2a2d2c", "ink-muted": "#a9b0ad", "on-deep": "#ffffff" },
} as const;

/** Decision #28. The server and the form share it, like UPLOAD_RULES for photos. */
export const LOGO_RULES = { maxBytes: 1024 * 1024, types: ["image/png", "image/jpeg", "image/svg+xml"] };

/** Why this file can't be the clinic's logo, in plain words. Undefined when it can. */
export function logoProblem(file: { type: string; size: number }): string | undefined {
  if (!LOGO_RULES.types.includes(file.type)) return "Choose a PNG, JPG or SVG file";
  if (file.size > LOGO_RULES.maxBytes) return "Logos must be 1 MB or smaller";
  return undefined;
}

const HEX = /^#[0-9a-f]{6}$/i;
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as Rgb;
const toHex = (rgb: Rgb) => `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

/** WCAG 2.2 contrast ratio between two #rrggbb colours, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = toRgb(hex).map(lin) as Rgb;
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** sRGB → OKLCH (Björn Ottosson's OKLab): even lightness steps, so tints keep the colour's character. */
function toLch(hex: string): Lch {
  const [r, g, b] = toRgb(hex).map(lin) as Rgb;
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  return { l: L, c: Math.hypot(A, B), h: Math.atan2(B, A) };
}

function lchToRgb({ l, c, h }: Lch): Rgb {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m_ = (l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s_ = (l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ].map(gam) as Rgb;
}

/** The colour at this lightness and hue, with chroma reduced until it is a real sRGB colour. */
function fromLch(lch: Lch): string {
  const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -0.0005 && v <= 1.0005);
  let c = lch.c;
  while (c > 0 && !inGamut(lchToRgb({ ...lch, c }))) c -= 0.002;
  return toHex(lchToRgb({ ...lch, c: Math.max(0, c) }));
}

/**
 * Starts at lightness `l` in the brand's hue and moves it (up or down) until `ok` holds. Every derived token goes
 * through this, so a derived pair never fails AA: only the Owner's own colour can, and that is checked separately.
 */
function fit(base: Lch, l: number, maxChroma: number, dir: 1 | -1, ok: (hex: string) => boolean): string {
  for (let x = l; x >= 0 && x <= 1; x += dir * 0.005) {
    const hex = fromLch({ l: x, c: Math.min(base.c, maxChroma), h: base.h });
    if (ok(hex)) return hex;
  }
  return dir === 1 ? "#ffffff" : "#000000";
}

const passes = (min: number, ...others: string[]) => (hex: string) => others.every((o) => contrastRatio(hex, o) >= min);

/** Why this colour can't be the brand colour, in plain words. Undefined when it can. The form and the API share it. */
export function brandColorProblem(hex: string): string | undefined {
  if (!HEX.test(hex)) return "Enter a colour as # and six letters or digits";
  const bg = BRAND_BACKGROUNDS.light;
  const worst = Math.min(...[bg.surface, bg.ground, bg.selected].map((b) => contrastRatio(hex, b)));
  if (worst >= AA_TEXT) return undefined;
  return `This colour is too light for text and buttons: ${worst.toFixed(1)}:1 against the page, and it needs ${AA_TEXT}:1.`;
}

/** The nearest colour that passes: the same hue, darkened step by step. The colour itself when it already passes. */
export function suggestBrandColor(hex: string): string {
  if (!brandColorProblem(hex)) return hex.toLowerCase();
  const base = toLch(hex);
  const bg = BRAND_BACKGROUNDS.light;
  return fit(base, base.l, base.c, -1, passes(AA_TEXT + 0.05, bg.surface, bg.ground, bg.selected));
}

/**
 * The brand palette, light and dark, from one colour (decision #29). Expects a colour that passed
 * `brandColorProblem`; the tints, shades and dark version are searched until each text pair reaches AA.
 */
export function deriveBrandPalette(hex: string): BrandPalette {
  const base = toLch(hex);
  const L = BRAND_BACKGROUNDS.light;
  const D = BRAND_BACKGROUNDS.dark;
  const brand = hex.toLowerCase();

  const subtle = fit(base, 0.965, 0.03, 1, passes(AA_TEXT, brand, L["ink-muted"]));
  const deep = fit(base, 0.32, 0.1, -1, passes(AA_TEXT, L["on-deep"]));
  const light: BrandTokens = {
    brand,
    "brand-ink": L["on-deep"],
    "brand-subtle": subtle,
    "brand-ring": fit(base, 0.88, 0.06, 1, () => true), // a decorative edge: no contrast duty
    "brand-tint-ink": fit(base, 0.3, 0.12, -1, passes(AA_TEXT, subtle)),
    "brand-deep": deep,
    "on-deep-muted": fit(base, 0.9, 0.04, 1, passes(AA_TEXT, deep)),
    "on-deep-label": fit(base, 0.84, 0.07, 1, passes(AA_TEXT, deep)),
  };

  const dSubtle = fit(base, 0.28, 0.05, -1, passes(AA_TEXT, D["ink-muted"]));
  const dBrand = fit(base, 0.76, 0.12, 1, passes(AA_TEXT, D.surface, D.ground, D.selected, dSubtle));
  const dDeep = fit(base, 0.27, 0.09, -1, passes(AA_TEXT, D["on-deep"]));
  const dark: BrandTokens = {
    brand: dBrand,
    "brand-ink": fit(base, 0.2, 0.06, -1, passes(AA_TEXT, dBrand)), // primary buttons get dark text in dark mode
    "brand-subtle": dSubtle,
    "brand-ring": fit(base, 0.4, 0.07, 1, () => true),
    "brand-tint-ink": fit(base, 0.9, 0.05, 1, passes(AA_TEXT, dSubtle)),
    "brand-deep": dDeep,
    "on-deep-muted": fit(base, 0.9, 0.04, 1, passes(AA_TEXT, dDeep)),
    "on-deep-label": fit(base, 0.84, 0.07, 1, passes(AA_TEXT, dDeep)),
  };
  return { light, dark };
}

/** The text pairs a palette must hold in each theme, [foreground, background], all at 4.5:1. Mirrors design-tokens PAIRS. */
export const BRAND_PAIRS: [string, string][] = [
  ["brand", "surface"],
  ["brand", "ground"],
  ["brand", "selected"],
  ["brand", "brand-subtle"],
  ["brand-ink", "brand"],
  ["brand-tint-ink", "brand-subtle"],
  ["ink-muted", "brand-subtle"],
  ["on-deep", "brand-deep"],
  ["on-deep-muted", "brand-deep"],
  ["on-deep-label", "brand-deep"],
];

/** Every pair below AA, as "brand on selected (dark) 4.12:1". Empty for a usable palette. */
export function paletteFailures(p: BrandPalette): string[] {
  return (["light", "dark"] as const).flatMap((theme) => {
    const t: Record<string, string> = { ...BRAND_BACKGROUNDS[theme], ...p[theme] };
    return BRAND_PAIRS.filter(([fg, bg]) => contrastRatio(t[fg]!, t[bg]!) < AA_TEXT).map(
      ([fg, bg]) => `${fg} on ${bg} (${theme}) ${contrastRatio(t[fg]!, t[bg]!).toFixed(2)}:1`,
    );
  });
}
