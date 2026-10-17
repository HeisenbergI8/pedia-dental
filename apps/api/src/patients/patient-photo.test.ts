import { describe, expect, it } from "vitest";
import type { SpooledFile } from "../storage/multipart";
import { cleanPhoto, photoFileName } from "./patient-photo";

/** What readUpload hands over: the claimed type, the first 16 bytes, and whether it went past the limit. */
const upload = (bytes: number[] | string, claimedType = "image/jpeg", tooLarge = false): SpooledFile => {
  const head = Buffer.from(typeof bytes === "string" ? Buffer.from(bytes) : bytes).subarray(0, 16);
  return { path: "/tmp/x", bytes: head.length, claimedType, head, tooLarge };
};
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")];

describe("cleanPhoto", () => {
  it("passes JPEG, PNG and WebP bytes with their extension", () => {
    expect(cleanPhoto(upload(JPEG))).toMatchObject({ ext: "jpg" });
    expect(cleanPhoto(upload(PNG, "image/png"))).toMatchObject({ ext: "png" });
    expect(cleanPhoto(upload(WEBP, "image/webp"))).toMatchObject({ ext: "webp" });
    expect(cleanPhoto(upload(JPEG, "image/png"))).toMatchObject({ ext: "jpg" }); // the bytes decide
  });

  it("refuses what isn't one of them, with the mock's words", () => {
    const refused = { problem: "Attach an image file", status: 400 };
    expect(cleanPhoto(upload("fake-jpeg"))).toEqual(refused); // the mock test's body, declared image/jpeg
    expect(cleanPhoto(upload('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "image/svg+xml"))).toEqual(refused);
    expect(cleanPhoto(undefined)).toEqual(refused);
    expect(cleanPhoto(upload(JPEG, "text/plain"))).toEqual(refused);
    expect(cleanPhoto(upload("GIF89a", "image/gif"))).toEqual(refused);
    expect(cleanPhoto(upload("%PDF-1.4", "image/png"))).toEqual(refused); // a PDF is never a child's photo
  });

  it("refuses over 10 MB with 413", () => {
    expect(cleanPhoto(upload(JPEG, "image/jpeg", true))).toEqual({ problem: "Images must be under 10 MB", status: 413 });
  });
});

describe("photoFileName", () => {
  it("names the file after the child, never the record id", () => {
    expect(photoFileName({ lastName: "Mendoza", firstName: "Bea" })).toBe("mendoza-bea-photo.jpg");
    expect(photoFileName({ lastName: "Dela Cruz", firstName: "Ma. Luisa" })).toBe("dela-cruz-ma.-luisa-photo.jpg");
  });
});
