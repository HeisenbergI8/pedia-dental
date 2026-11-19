import { describe, expect, it } from "vitest";
import { pngOf } from "../../test/support/images";
import type { SpooledFile } from "../storage/multipart";
import { letterheadImageProblem } from "./letterhead";

const file = (head: Buffer, pixels?: { width: number; height: number }): SpooledFile => ({ path: "/tmp/x", bytes: 100, claimedType: "image/png", head, tooLarge: false, pixels });

describe("letterheadImageProblem (D11, D #30)", () => {
  it("takes a PNG up to 8000 px a side and refuses a larger one in plain words", () => {
    expect(letterheadImageProblem(file(pngOf(8000, 1200), { width: 8000, height: 1200 }))).toEqual({ ext: "png" });
    expect(letterheadImageProblem(file(pngOf(12_000, 1200), { width: 12_000, height: 1200 }))).toEqual({
      problem: "This image is 12000 × 1200 pixels. Make it at most 8000 pixels on each side, then upload it again.",
      status: 400,
    });
  });

  it("names the wrong type before the size", () => {
    expect(letterheadImageProblem(file(Buffer.from("GIF89a"), { width: 9000, height: 9000 }))).toMatchObject({ status: 400, problem: expect.not.stringMatching(/pixels/) });
  });
});
