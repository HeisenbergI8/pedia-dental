import { deriveBrandPalette, type BrandTokens, type HeadingFont } from "@pedia/shared";

/** The CSS variable app/layout.tsx gives each shortlisted font. */
export const HEADING_FONT_VAR: Record<HeadingFont, string> = {
  nunito: "--font-nunito",
  poppins: "--font-poppins",
  lexend: "--font-lexend",
  quicksand: "--font-quicksand",
  outfit: "--font-outfit",
  fredoka: "--font-fredoka",
};

const vars = (t: BrandTokens) => Object.entries(t).map(([name, value]) => `--color-${name}:${value}`).join(";");

/**
 * The clinic's brand over globals.css (decisions #29, #30): the brand tokens in light and dark, and on Big the heading
 * font. `--font-title` is what h1/h2 and `font-title` use, so headings and the clinic name follow and body text doesn't.
 * Charts, status colours, crayons and Primolar's own logo tokens are never overridden.
 */
export function brandCss(brandColor: string, headingFont?: HeadingFont): string {
  const { light, dark } = deriveBrandPalette(brandColor);
  const title = headingFont ? `;--font-title:var(${HEADING_FONT_VAR[headingFont]}),var(--font-figtree),ui-sans-serif,system-ui,sans-serif` : "";
  return `html:root{${vars(light)}${title}}@media screen{html:root[data-theme="dark"]{${vars(dark)}}}`;
}
