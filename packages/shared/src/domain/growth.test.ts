import { describe, expect, it } from "vitest";
import { dentitionStage, habitTimeline } from "./growth";
import { deriveChart } from "./chart";
import type { ChartEntry } from "../schemas/chart";
import { HabitObservation, type GrowthRecord } from "../schemas/growth";

const record = (visitId: string, recordedAt: string, habits: GrowthRecord["habits"]): GrowthRecord => ({
  id: visitId,
  clinicId: "c1",
  patientId: "p1",
  visitId,
  habits,
  recordedAt,
});

describe("habitTimeline", () => {
  it("keeps the start date when a later visit marks the habit stopped", () => {
    const [thumb] = habitTimeline([
      record("v2", "2026-09-01T00:00:00Z", [{ habit: "thumb_sucking", stoppedOn: "2026-08-15" }]),
      record("v1", "2026-03-01T00:00:00Z", [{ habit: "thumb_sucking", startedOn: "2023-01-01" }]),
    ]);
    expect(thumb).toEqual({ habit: "thumb_sucking", startedOn: "2023-01-01", stoppedOn: "2026-08-15", visitIds: ["v1", "v2"] });
    expect(thumb?.stopInferred).toBeUndefined();
  });
  it("reads a habit unticked at a later visit as stopped by that visit", () => {
    const [thumb] = habitTimeline([
      record("v1", "2026-03-01T12:00:00Z", [{ habit: "thumb_sucking" }]),
      record("v2", "2026-09-01T12:00:00Z", []),
    ]);
    expect(thumb).toMatchObject({ stoppedOn: "2026-09-01", stopInferred: true, visitIds: ["v1"] });
  });
  it("is ongoing again when ticked after an inferred stop", () => {
    const [thumb] = habitTimeline([
      record("v1", "2026-03-01T12:00:00Z", [{ habit: "thumb_sucking" }]),
      record("v2", "2026-06-01T12:00:00Z", []),
      record("v3", "2026-09-01T12:00:00Z", [{ habit: "thumb_sucking" }]),
    ]);
    expect(thumb?.stoppedOn).toBeUndefined();
    expect(thumb?.stopInferred).toBeUndefined();
  });
});

describe("dentitionStage", () => {
  const e = (id: string, tooth: number, condition: ChartEntry["condition"]): ChartEntry => ({
    id, clinicId: "c1", patientId: "p1", visitId: "v1", recordedBy: "d1", recordedAt: `2026-01-01T00:00:0${id}Z`,
    tooth, surfaces: [], condition,
  });
  it("is mixed with primary and permanent teeth in the mouth, and lists eruption status", () => {
    const s = dentitionStage(deriveChart([e("1", 74, "sound"), e("2", 36, "erupting"), e("3", 71, "extracted"), e("4", 11, "unerupted")]));
    expect(s).toEqual({ stage: "mixed", erupting: [36], unerupted: [11], primaryLost: [71] });
  });
  it("is unknown with nothing charted", () => {
    expect(dentitionStage(new Map()).stage).toBeUndefined();
  });
});

describe("HabitObservation", () => {
  it("rejects future dates and a stop before the start", () => {
    expect(HabitObservation.safeParse({ habit: "bruxism", startedOn: "2099-01-01" }).success).toBe(false);
    expect(HabitObservation.safeParse({ habit: "bruxism", startedOn: "2026-05-01", stoppedOn: "2026-01-01" }).success).toBe(false);
    // Parents often know when a habit stopped but not when it began.
    expect(HabitObservation.safeParse({ habit: "bruxism", stoppedOn: "2026-01-01" }).success).toBe(true);
  });
});
