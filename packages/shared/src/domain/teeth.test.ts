import { describe, expect, it } from "vitest";
import { ALL_TEETH, dentitionOf, isAnterior, surfacesFor } from "./teeth";

describe("FDI teeth", () => {
  it("has 32 permanent + 20 primary teeth", () => {
    expect(ALL_TEETH).toHaveLength(52);
  });
  it("classifies dentition", () => {
    expect(dentitionOf(11)).toBe("permanent");
    expect(dentitionOf(74)).toBe("primary");
  });
  it("rejects invalid numbers", () => {
    expect(() => dentitionOf(19)).toThrow();
    expect(() => dentitionOf(56)).toThrow();
  });
  it("uses incisal edge for anterior teeth, occlusal for posterior", () => {
    expect(isAnterior(51)).toBe(true);
    expect(surfacesFor(51)).toContain("I");
    expect(surfacesFor(84)).toContain("O");
  });
});
