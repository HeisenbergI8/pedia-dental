import { describe, expect, it } from "vitest";
import { FILE_LINK_SECONDS, groupPhotos, photoFileName, uploadProblem } from "./photos";

const photo = (id: string, takenOn: string, type: "intraoral" | "xray" | "document", visitId?: string) => ({ id, takenOn, type, visitId });
const visitDate = (id: string) => ({ v1: "2026-03-01", v2: "2026-09-01" })[id];

describe("groupPhotos", () => {
  it("orders visits newest first and puts unlinked photos last", () => {
    const groups = groupPhotos([photo("a", "2026-03-01", "xray", "v1"), photo("b", "2026-05-02", "document"), photo("c", "2026-09-01", "intraoral", "v2")], visitDate);
    expect(groups.map((g) => g.visitId)).toEqual(["v2", "v1", undefined]);
  });
  it("splits unlinked photos by date, newest first, then by type in PhotoType order", () => {
    const [unlinked] = groupPhotos([photo("a", "2026-05-02", "document"), photo("b", "2026-06-10", "xray"), photo("c", "2026-06-10", "intraoral")], visitDate);
    expect(unlinked?.days.map((d) => d.date)).toEqual(["2026-06-10", "2026-05-02"]);
    expect(unlinked?.days[0]?.types.map((t) => t.type)).toEqual(["intraoral", "xray"]);
  });
  it("is empty for no photos", () => expect(groupPhotos([], visitDate)).toEqual([]));
});

describe("uploadProblem", () => {
  const pdf = { type: "application/pdf", size: 1000 };
  it("takes a PDF only for a medical or referral document", () => {
    expect(uploadProblem("document", pdf)).toBeUndefined();
    expect(uploadProblem("referral", pdf)).toBeUndefined();
    expect(uploadProblem("intraoral", pdf)).toBe("Attach an image file");
  });
  it("takes an image for any type, and refuses other files and anything over 10 MB", () => {
    expect(uploadProblem("xray", { type: "image/jpeg", size: 1000 })).toBeUndefined();
    expect(uploadProblem("document", { type: "text/plain", size: 10 })).toBe("Attach a photo or a PDF");
    expect(uploadProblem("document", { type: "image/jpeg", size: 11 * 1024 * 1024 })).toBe("Files must be under 10 MB");
  });
});

describe("photoFileName", () => {
  it("names a saved file by the child, the type, the tooth and the day, never the record id", () => {
    const bea = { lastName: "Mendoza", firstName: "Bea" };
    expect(photoFileName(bea, { type: "intraoral", tooth: 74, takenOn: "2026-10-02", contentType: "image/jpeg" })).toBe("mendoza-bea-intraoral-74-2026-10-02.jpg");
    expect(photoFileName(bea, { type: "xray", takenOn: "2026-10-02", contentType: "image/png" })).toBe("mendoza-bea-xray-2026-10-02.png");
    expect(photoFileName({ lastName: "dela Cruz", firstName: "Ana Mae" }, { type: "document", takenOn: "2026-10-02", contentType: "application/pdf" })).toBe(
      "dela-cruz-ana-mae-document-2026-10-02.pdf",
    );
  });

  it("gives a private link five minutes", () => expect(FILE_LINK_SECONDS).toBe(300));
});
