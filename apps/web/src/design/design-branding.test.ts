import { describe, expect, it } from "vitest";
import { BRAND_BACKGROUNDS, DEFAULT_BRAND_COLOR } from "@pedia/shared";
import { filesMatching, read } from "./source";

const CSS = read("app/globals.css");
const token = (block: string, name: string) => {
  const start = CSS.indexOf(block);
  return CSS.slice(start, CSS.indexOf("}", start)).match(new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1]?.toLowerCase();
};

describe("clinic branding (decisions #29, #31, #32)", () => {
  it("checks colours against the same neutrals globals.css paints", () => {
    for (const [theme, block] of [["light", "@theme {"], ["dark", ':root[data-theme="dark"] {']] as const) {
      for (const [name, value] of Object.entries(BRAND_BACKGROUNDS[theme])) {
        expect(token(block, name) ?? token("@theme {", name), `${theme} ${name}`).toBe(value);
      }
    }
  });

  it("defaults to Primolar's own brand colour", () => expect(token("@theme {", "brand")).toBe(DEFAULT_BRAND_COLOR));

  it("keeps Primolar's logo on sign-in and in its own loaders only", () => {
    expect(filesMatching(/<PrimolarLogo\b/)).toEqual(["features/auth/components/login-screen.tsx"]);
    expect(filesMatching(/primolar-logo\.png/)).toEqual([]);
  });
});
