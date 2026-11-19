import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { jpegOf, pngOf, webpVp8Of, webpVp8lOf, webpVp8xOf } from "../../test/support/images";
import { MAX_IMAGE_SIDE, UNREADABLE, imageSize, imageSizeOfFile, pixelProblem, sniff } from "./sniff";

describe("imageSize (D #30)", () => {
  it("reads a PNG's IHDR", () => {
    expect(imageSize(pngOf(640, 480))).toEqual({ width: 640, height: 480 });
    expect(imageSize(pngOf(20_000, 1))).toEqual({ width: 20_000, height: 1 });
  });

  it("walks a JPEG's segments to its frame header, baseline or progressive, past fill bytes", () => {
    expect(imageSize(jpegOf(1024, 768))).toEqual({ width: 1024, height: 768 });
    expect(imageSize(jpegOf(9000, 300, 0xc2))).toEqual({ width: 9000, height: 300 });
    expect(imageSize(jpegOf(50, 60, 0xc0, 60_000))).toEqual({ width: 50, height: 60 }); // a large APP segment first
  });

  it("reads lossy, lossless and extended WebP", () => {
    expect(imageSize(webpVp8Of(800, 600))).toEqual({ width: 800, height: 600 });
    expect(imageSize(webpVp8lOf(16_000, 2))).toEqual({ width: 16_000, height: 2 });
    expect(imageSize(webpVp8xOf(12_345, 9_000))).toEqual({ width: 12_345, height: 9_000 });
  });

  it("says nothing for a header that doesn't state a size, or for anything that isn't an image", () => {
    expect(imageSize(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 3)]))).toBeUndefined(); // the int tests' JPEG
    expect(imageSize(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toBeUndefined(); // scan data before any frame
    expect(imageSize(pngOf(1, 1).subarray(0, 20))).toBeUndefined(); // cut short
    expect(imageSize(Buffer.from("%PDF-1.7"))).toBeUndefined();
    expect(imageSize(Buffer.from("GIF89a"))).toBeUndefined();
    expect(sniff(webpVp8xOf(1, 1))).toBe("webp");
  });
});

describe("imageSizeOfFile (D #30)", () => {
  const dirs: string[] = [];
  afterAll(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

  it("reads only the headers of a file on disk, for every format", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sniff-"));
    dirs.push(dir);
    const cases: [Buffer, number, number][] = [[pngOf(10, 20), 10, 20], [jpegOf(30, 40, 0xc2, 65_000), 30, 40], [webpVp8Of(50, 60), 50, 60], [webpVp8lOf(70, 80), 70, 80], [webpVp8xOf(90, 100), 90, 100]];
    for (const [i, [bytes, width, height]] of cases.entries()) {
      const path = join(dir, `f${i}`);
      await writeFile(path, Buffer.concat([bytes, Buffer.alloc(1024)]));
      expect(await imageSizeOfFile(path)).toEqual({ width, height });
    }
  });
});

describe("pixelProblem (D #30)", () => {
  it("passes up to 8000 px a side, refuses beyond in plain words, and passes a size it couldn't read", () => {
    expect(MAX_IMAGE_SIDE).toBe(8000);
    expect(pixelProblem({ width: 8000, height: 8000 })).toBeUndefined();
    expect(pixelProblem(undefined)).toBeUndefined();
    expect(pixelProblem({ width: 8001, height: 10 })).toBe("This image is 8001 × 10 pixels. Make it at most 8000 pixels on each side, then upload it again.");
    expect(pixelProblem({ width: 10, height: 20_000 })).toMatch(/at most 8000 pixels on each side/);
  });

  it("refuses a JPEG padded past the walk's limit instead of letting it through (verification of #30)", () => {
    const padded = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(1001, 0xff), jpegOf(65535, 65535).subarray(2)]);
    expect(imageSize(padded)).toBe(UNREADABLE);
    expect(pixelProblem(imageSize(padded))).toMatch(/couldn't read this image's size/);
  });
});
