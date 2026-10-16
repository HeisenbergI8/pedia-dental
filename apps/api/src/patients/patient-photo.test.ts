import { describe, expect, it } from "vitest";
import { cleanPhoto, MAX_PHOTO_BYTES, photoFileName, type PhotoUpload } from "./patient-photo";

const upload = (bytes: number[] | string, mimetype = "image/jpeg", size?: number): PhotoUpload => {
  const buffer = typeof bytes === "string" ? Buffer.from(bytes) : Buffer.from(bytes);
  return { buffer, mimetype, size: size ?? buffer.length };
};
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0];
const WEBP = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")];

describe("cleanPhoto", () => {
  it("passes JPEG, PNG and WebP bytes with their extension", () => {
    expect(cleanPhoto(upload(JPEG))).toMatchObject({ ext: "jpg" });
    expect(cleanPhoto(upload(PNG, "image/png"))).toMatchObject({ ext: "png" });
    expect(cleanPhoto(upload(WEBP, "image/webp"))).toMatchObject({ ext: "webp" });
  });

  it("refuses what isn't one of them, with the mock's words", () => {
    const refused = { problem: "Attach an image file", status: 400 };
    expect(cleanPhoto(upload("fake-jpeg"))).toEqual(refused); // the mock test's body, declared image/jpeg
    expect(cleanPhoto(upload('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>', "image/svg+xml"))).toEqual(refused);
    expect(cleanPhoto(undefined)).toEqual(refused);
    expect(cleanPhoto(upload(JPEG, "text/plain"))).toEqual(refused);
  });

  it("refuses over 10 MB with 413", () => {
    expect(cleanPhoto(upload(JPEG, "image/jpeg", MAX_PHOTO_BYTES + 1))).toEqual({ problem: "Images must be under 10 MB", status: 413 });
  });
});

describe("photoFileName", () => {
  it("names the file after the child, never the record id", () => {
    expect(photoFileName({ lastName: "Mendoza", firstName: "Bea" })).toBe("mendoza-bea-photo.jpg");
    expect(photoFileName({ lastName: "Dela Cruz", firstName: "Ma. Luisa" })).toBe("dela-cruz-ma.-luisa-photo.jpg");
  });
});
