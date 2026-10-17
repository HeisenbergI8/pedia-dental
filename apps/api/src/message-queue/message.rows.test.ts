import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { describe, expect, it } from "vitest";
import { messageData, toMessage, type MessageRow } from "./message.rows";

const db = seedPlatform().tenants[DEMO_CLINIC_ID]!;
const asRow = (data: ReturnType<typeof messageData>) => data as unknown as MessageRow & Record<string, unknown>;

describe("message rows ↔ the contract", () => {
  it("round-trips every seeded message", () => {
    expect(db.messages.length).toBeGreaterThan(0);
    for (const m of db.messages) expect(toMessage(asRow(messageData(m)))).toEqual(m);
  });

  it("never lets the sending columns out", () => {
    const row = { ...asRow(messageData(db.messages[0]!)), dispatchedAt: new Date(), providerRef: "123", segments: 2, greetingYear: 2026 };
    for (const key of ["dispatchedAt", "providerRef", "segments", "greetingYear", "sentAt"]) expect(toMessage(row)).not.toHaveProperty(key);
  });
});
