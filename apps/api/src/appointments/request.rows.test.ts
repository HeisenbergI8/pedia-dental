import { seedPlatform } from "@pedia/seed";
import { AppointmentRequest } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { requestData, toRequest, type RequestRow } from "./request.rows";

const requests = Object.values(seedPlatform().tenants).flatMap((t) => t.appointmentRequests);
const back = (q: AppointmentRequest) => toRequest(requestData(q) as RequestRow);

describe("appointment request rows", () => {
  it("stores every seeded request so that toRequest reads back the same one", () => {
    expect(requests.length).toBeGreaterThan(0);
    for (const q of requests) expect(AppointmentRequest.parse(back(q))).toEqual(q);
  });

  it("keeps the preferred day and leaves an absent note absent", () => {
    const q = { ...requests[0]!, preferredDate: "2030-01-07" };
    delete (q as { note?: string }).note;
    expect(back(q).preferredDate).toBe("2030-01-07");
    expect(back(q)).not.toHaveProperty("note");
  });
});
