import { ClinicalPhoto } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import type { SpooledFile } from "../storage/multipart";
import { photoFileProblem } from "./photo-file";
import { toPhoto, type PhotoRow } from "./photo.rows";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = Buffer.from("%PDF-1.4");
const file = (head: Buffer, claimedType: string, tooLarge = false): SpooledFile => ({ path: "/tmp/x", bytes: head.length, claimedType, head, tooLarge });

describe("photoFileProblem (B10 E4)", () => {
  it("refuses the wrong type with the mock's words for the photo type", () => {
    expect(photoFileProblem("intraoral", file(Buffer.from("hi"), "text/plain"))).toEqual({ problem: "Attach an image file", status: 400 });
    expect(photoFileProblem("document", file(Buffer.from("hi"), "text/plain"))).toEqual({ problem: "Attach a photo or a PDF", status: 400 });
  });

  it("answers 413 for anything too large, keeping the mock's words", () => {
    expect(photoFileProblem("intraoral", file(JPEG, "image/jpeg", true))).toEqual({ problem: "Files must be under 10 MB", status: 413 });
    expect(photoFileProblem("intraoral", file(Buffer.from("hi"), "text/plain", true))).toEqual({ problem: "Attach an image file", status: 413 });
  });

  it("takes a PDF only where a paper document is expected, and only if its bytes are a PDF", () => {
    expect(photoFileProblem("referral", file(PDF, "application/pdf"))).toEqual({ ext: "pdf" });
    expect(photoFileProblem("intraoral", file(PDF, "application/pdf"))).toEqual({ problem: "Attach an image file", status: 400 });
    expect(photoFileProblem("document", file(PNG, "application/pdf"))).toEqual({ problem: "Attach a photo or a PDF", status: 400 });
  });

  it("lets the bytes decide an image's type, and refuses an SVG", () => {
    expect(photoFileProblem("intraoral", file(PNG, "image/jpeg"))).toEqual({ ext: "png" });
    expect(photoFileProblem("intraoral", file(Buffer.from("<svg xmlns='x'/>"), "image/jpeg"))).toEqual({ problem: "Attach an image file", status: 400 });
  });
});

describe("toPhoto", () => {
  const row: PhotoRow = {
    id: "ph1", clinicId: "c1", patientId: "p1", visitId: null, type: "document", stage: null, tooth: null, takenOn: new Date("2026-10-02T00:00:00.000Z"),
    caption: "Lab", contentType: "application/pdf", uploadedBy: "parent", createdAt: new Date("2026-10-02T01:00:00.000Z"),
  };
  it("round-trips through the contract with and without the optionals", () => {
    expect(ClinicalPhoto.parse(toPhoto(row))).toEqual({ ...toPhoto(row) });
    expect(toPhoto(row)).not.toHaveProperty("tooth");
    const full = toPhoto({ ...row, visitId: "v1", type: "intraoral", stage: "before", tooth: 74, contentType: "image/jpeg", uploadedBy: "staff" });
    expect(ClinicalPhoto.parse(full)).toMatchObject({ visitId: "v1", stage: "before", tooth: 74, takenOn: "2026-10-02" });
  });
});
