import { describe, expect, it } from "vitest";
import { deriveBrandPalette } from "@pedia/shared";
import { brandCss } from "./brand-css";

describe("brandCss", () => {
  const css = brandCss("#1e5fb4");
  it("sets every brand token in light, and the dark set only on screen", () => {
    const { light, dark } = deriveBrandPalette("#1e5fb4");
    expect(css).toContain(`--color-brand:${light.brand}`);
    expect(css).toContain(`--color-brand-deep:${light["brand-deep"]}`);
    expect(css).toMatch(new RegExp(`@media screen\\{html:root\\[data-theme="dark"\\]\\{[^}]*--color-brand:${dark.brand}`));
  });
  it("outranks globals.css's dark block, and touches nothing but brand tokens and the title font", () => {
    expect(css).toContain('html:root[data-theme="dark"]');
    expect([...css.matchAll(/--([\w-]+):/g)].every(([, name]) => /^color-(brand|on-deep)/.test(name!))).toBe(true);
    expect(css).not.toContain("--font-title");
    expect(brandCss("#1e5fb4", "nunito")).toContain("--font-title:var(--font-nunito)");
  });
});
