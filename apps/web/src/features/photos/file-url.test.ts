import { describe, expect, it } from "vitest";
import { photoFileUrl } from "./api";

describe("photoFileUrl", () => {
  it("opens by default and asks for an attachment for Download", () => {
    expect(photoFileUrl("p1")).toMatch(/\/photos\/p1\/file$/);
    expect(photoFileUrl("p1", { download: true })).toMatch(/\/photos\/p1\/file\?download=1$/);
  });
});
